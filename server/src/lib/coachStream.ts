import type { Response } from 'express'
import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import { classifyModelError, logModelFailure } from './modelErrors.ts'
import { flagIfUnsafe } from './coachSafetyCheck.ts'
import { stripTag } from './extractTag.ts'
import { cacheStats, type SystemPrompt } from './promptCache.ts'
import { admitsSentence, countWords } from './replyBudget.ts'
import { reconcileTail, takeCompleteSentences, visibleSoFar } from './sentenceStream.ts'
import { prefetchSpeech } from './speechCache.ts'
import { startTiming } from './turnTiming.ts'

// A hard token cap can still cut a Talk It Through reply off mid-word if the
// model runs longer than instructed — worse for a spoken reply than a
// written one, since there's no visual "..." to signal it was cut short.
// Rather than showing (and speaking) a broken fragment, fall back to the
// last complete sentence. If there's no sentence-ending punctuation at all,
// the whole fragment is kept as-is — an unpunctuated reply is still better
// than an empty one.
export function trimIfTruncated(text: string, stopReason: string | null): string {
  if (stopReason !== 'max_tokens') return text
  const matches = [...text.matchAll(/[.!?](?:["')\]]?)(?:\s|$)/g)]
  if (matches.length === 0) return text
  const last = matches[matches.length - 1]
  return text.slice(0, (last.index ?? 0) + last[0].length).trim()
}

// ---------------------------------------------------------------------------
// Streamed coach replies
// ---------------------------------------------------------------------------
//
// The non-streaming routes stay exactly as they are — they back builds
// already in teachers' hands, and waiting for the whole reply costs nothing
// where nobody is watching the words arrive. The streaming routes
// (Talk It Through, Lesson Debrief's Reflect) get this instead, because
// there the wait IS the product: the teacher stops talking and hears
// silence — or watches a progress ring — until the LAST token is generated,
// even though the FIRST sentence could have been shown and synthesized
// seconds earlier.
//
// Shared by both surfaces rather than copied: the abandon-on-disconnect and
// word-budget rules below are the subtle part, and a second copy of them is
// a second place for the spoken reply and the saved one to drift apart.
//
// Emits newline-delimited JSON rather than Server-Sent Events: this is a
// POST with credentials, which EventSource cannot do, so the client reads
// the body stream directly either way and NDJSON is the simpler framing.
//
//   {"type":"sentence","text":"..."}   one per sentence, as it completes
//   {"type":"done","<recordKey>":{}}   the saved record, identical to the
//                                      non-streaming route's JSON body
//   {"type":"error","error":"..."}
//
// Every rejection a caller can act on (auth, turn cap, usage limit) is
// checked BEFORE the first byte goes out, because once the stream has begun
// the status code is already sent and can no longer say 429.
export type StreamOptions = {
  system: SystemPrompt
  /// Defaults to CLAUDE_MODEL. The spoken path passes SPOKEN_MODEL, which is
  /// about half a second faster to its first sentence.
  model?: string
  /// Stop sending sentences once this many words have gone out. A sentence
  /// that would cross the budget is held back, so the limit is never met by
  /// cutting one in half.
  wordBudget?: number
  maxTokens: number
  messages: { role: 'user' | 'assistant'; content: string }[]
  safetyLabel: string
  // Saves the finished reply and returns the record the client should get —
  // the same shape the non-streaming endpoint returns, so the client's state
  // handling is unchanged.
  persist: (reply: string) => Promise<unknown>
  // Which key carries that record in the `done` frame. Defaults to `debrief`
  // because that is what Talk It Through's clients already read; Reflect
  // saves an audio session, and calling it a debrief there would be a lie
  // the client has to decode around.
  recordKey?: string
  // The raw text including the hidden <memory_update> block, for callers
  // that maintain coach memory. Runs after persist, off the spoken path.
  afterPersist?: (rawText: string) => Promise<void>
  // Time already spent on lookups and limit checks before this was called.
  // Logged alongside the rest so the database work ahead of Claude stays
  // visible — it is latency the teacher waits through just the same, and it
  // is invisible in a timer that only starts once the reply does.
  gateMs?: number
  // Present when this reply will be spoken aloud: start synthesizing the
  // first sentence as soon as it exists. Absent means nobody is listening
  // (a typed turn, where the sentences are read rather than heard).
  //
  // `voice` is undefined for a teacher who has never chosen one, which is
  // most of them — the same undefined the client sends to /api/tts, so the
  // prefetch and the request that collects it agree on the key.
  speak?: { voice: string | undefined }
}

// Enough to tell the app from the browser in a log line, and nothing more:
// no versions, no device, nothing that identifies a teacher.
function clientTag(req: { headers: Record<string, unknown> }): string {
  const agent = String(req.headers['user-agent'] ?? '')
  if (/ClassCoach|Wivoza|CFNetwork|Darwin/i.test(agent)) return 'ios'
  if (/Mozilla/i.test(agent)) return 'web'
  return 'other'
}

export async function streamCoachReply(res: Response, label: string, opts: StreamOptions) {
  const timing = startTiming(label)
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  // Render's proxy would otherwise sit on a response this small until enough
  // accumulated, which undoes the entire point of streaming it.
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (obj: unknown) => res.write(JSON.stringify(obj) + '\n')

  let raw = ''
  // How far into the visible (memory-tag-free) text has already been sent.
  let consumed = 0
  const spoken: string[] = []
  let wordsSent = 0
  // Set when the word budget stopped a sentence from going out, which means
  // the saved reply must be the sentences the teacher actually heard rather
  // than everything Claude wrote.
  let capped = false

  // Talk It Through ends a turn on a short silence, and sometimes guesses
  // wrong: the teacher was drawing breath, carries on talking, and the
  // client aborts this request (see watchForResume in useVoiceTurn). Their
  // next request carries the whole thought, so this half of it must leave
  // nothing behind — no saved turn, no memory update, and no Claude call
  // still running and being billed for a reply nobody will hear.
  let abandoned = false

  try {
    const stream = anthropic.messages.stream({
      model: opts.model ?? CLAUDE_MODEL,
      max_tokens: opts.maxTokens,
      thinking: { type: 'disabled' },
      system: opts.system,
      messages: opts.messages,
    })

    res.on('close', () => {
      if (res.writableEnded) return
      abandoned = true
      stream.abort()
      // Which client dropped matters: the browser abandons a turn on purpose
      // (a speculative reply the teacher talked past), while the iOS app
      // never does — so an abandoned turn from the app is a connection that
      // died mid-reply, and the teacher saw "Could not reach Coach".
      timing.end({ abandoned: 'true', client: clientTag(res.req), sentences: spoken.length })
    })

    stream.on('text', (delta) => {
      raw += delta
      const visible = visibleSoFar(raw)
      const { sentences, rest } = takeCompleteSentences(visible.slice(consumed))
      if (sentences.length === 0) return
      if (spoken.length === 0) timing.mark('first_sentence')
      for (const sentence of sentences) {
        if (capped) break
        // A sentence that would take the reply past the budget is dropped
        // whole — except the very first one, since a reply has to say
        // something even when the model opens with a run-on.
        if (!admitsSentence(wordsSent, sentence, opts.wordBudget)) {
          capped = true
          break
        }
        // Only the first one: every later sentence is already being
        // prefetched by the client while the ones ahead of it play.
        if (spoken.length === 0 && opts.speak) prefetchSpeech(sentence, opts.speak.voice)
        spoken.push(sentence)
        wordsSent += countWords(sentence)
        send({ type: 'sentence', text: sentence })
      }
      consumed = visible.length - rest.length
    })

    const message = await stream.finalMessage()
    if (abandoned) return
    timing.mark('claude_done')

    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(text, opts.safetyLabel)
    const reply = trimIfTruncated(stripTag(text, 'memory_update'), message.stop_reason)

    if (!reply) {
      // A reply that came back empty rather than a call that failed, so this
      // one really is worth retrying.
      send({ type: 'error', error: 'Could not reach Coach. Please try again.' })
      res.end()
      return
    }

    // The spoken reply and the saved one must be the same words. Sentence
    // boundaries need a following character to be recognised, so the last
    // sentence of a reply never streams out — it is sent here, along with
    // anything else the boundary rule did not catch.
    //
    // Unless the budget stopped the reply early, in which case there is
    // deliberately more text than was spoken and none of it should be sent
    // or saved: what Coach said is what Coach is remembered as having said.
    const tail = capped ? '' : reconcileTail(spoken, reply)
    if (tail) {
      if (spoken.length === 0) timing.mark('first_sentence')
      // A reply short enough to be one sentence never passed through the
      // boundary check above, so this is its first sentence too.
      if (spoken.length === 0 && opts.speak) prefetchSpeech(tail, opts.speak.voice)
      send({ type: 'sentence', text: tail })
    }

    // Checked again here, not just after the stream: the teacher can carry
    // on talking in the gap between Claude finishing and this write, and a
    // turn saved then would be a turn they never heard.
    if (abandoned) return
    // What was spoken is what gets saved. When the budget cut the reply
    // short, the words Claude wrote after that point were never sent to the
    // client and must not end up in the conversation either — otherwise
    // Coach's next turn builds on advice the teacher never heard, which is
    // the same bug as a barged-in reply being saved in full.
    const heard = capped ? spoken.join(' ') : reply
    const record = await opts.persist(heard)
    timing.mark('persist')
    send({ type: 'done', [opts.recordKey ?? 'debrief']: record })
    res.end()
    timing.end({
      gate: `${opts.gateMs ?? 0}ms`,
      client: clientTag(res.req),
      sentences: spoken.length + (tail ? 1 : 0),
      chars: heard.length,
      words: wordsSent,
      capped: String(capped),
      ...cacheStats(message.usage),
    })

    // Deliberately after res.end(): memory is bookkeeping for the NEXT turn,
    // so making this turn wait on another write would be pure added latency.
    if (opts.afterPersist && !abandoned) await opts.afterPersist(text)
  } catch (error) {
    // An aborted stream throws on the way out; that is this turn being
    // withdrawn, not a failure worth logging or answering.
    if (abandoned) return
    // Headers are long gone, so this cannot carry a status — the client
    // treats a terminal error frame the same way it treats a failed request,
    // which is exactly why the frame has to carry honest words. A spoken
    // Coach telling a teacher in a car to try again, over and over, while
    // the account is the thing that's broken, is the worst version of this.
    const failure = classifyModelError(error, 'Could not reach Coach')
    logModelFailure(`[coach-stream] ${label} failed:`, failure, error)
    send({ type: 'error', error: failure.message })
    res.end()
  }
}
