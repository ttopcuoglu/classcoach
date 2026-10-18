// Whether a teacher's bid for the room's attention HELD, or whether she had
// to ask again and bring more force each time.
//
// Counting redirections was the wrong question. A teacher with a hard group
// redirects more than one with an easy group, and the count says which group
// she has rather than anything she did — which is why redirectionCount was
// retired from My Growth. The thing worth telling her is the shape: three
// asks inside ten seconds means the first two did not land, and a run that
// climbs from "keep it down" to naming a consequence to separating students
// is the spiral teachers describe, where each warning is worth less than the
// last and the only way to be heard is to escalate.
//
// The signal is audible in the TEACHER alone, which is what makes it
// measurable at all. Whether the room went quiet after an ask is a question
// about student noise, and a room mic cannot tell a buzzing class from a
// silent one. Whether she asked again twelve seconds later is right there in
// her own speech.
//
// Division of labour, both halves load-bearing: the model decides what is a
// bid and which rung it sits on, because phrase lists cannot — a five-rung
// phrase ladder run over all 25 real lessons put about half its hits on
// things like "close your Chromebooks" (matched "lose your") and "I also have
// the office hours" (matched "the office"). The code does every count, gap
// and comparison, because a model asked to do arithmetic over its own
// findings drifts: across five runs on one lesson it reported 11, 12, 13, 13
// and 13 bids while the clusters and the peak rung never moved.

import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import type { Segment } from './audioAnalysis.ts'
import { extractTag } from './extractTag.ts'
import {
  flattenTeacherSpeech,
  isNoneAnswer,
  normalizeForMatch,
  startSecAtOffset,
  transcriptForModel,
} from './lessonObjective.ts'
import { quoteOrNull } from './quoteSafety.ts'
import { canClaimAbsence, type CoverageSource, capturedShare, sharePct } from './transcriptCoverage.ts'

/// Ordered by force. The index IS the severity, so a climb is an index
/// comparison and nothing has to hold a separate weight.
export const RUNGS = ['attention', 'behaviour', 'named', 'consequence', 'removal'] as const
export type Rung = (typeof RUNGS)[number]

/// Two bids this close together mean the first did not hold. Started at 90s
/// and tightened: one lesson's real runs sit inside 10s and 42s, while 90s
/// manufactured a two-bid "cluster" spanning 87s on a calm lesson. A teacher
/// who asks again after a minute and a half has run a normal lesson.
const CLUSTER_WINDOW_SEC = 45

/// Three, not two. Across five runs on the same lesson every cluster of three
/// or more appeared in all five; the only two-bid one appeared in three of
/// five and vanished in the rest. Two asks is also just asking twice.
const MIN_CLUSTER_BIDS = 3

/// Lower than parseQuotedLines' 12, which is right for an objective but not
/// here: "Shh.", "Hello?" and "Excuse me?" are the attention bids this is
/// about. Shown quotes are filtered separately by quoteSafety.
const MIN_QUOTE_CHARS = 4

/// A bid is an interruption, not a paragraph. The longest genuine bid found
/// across the lessons this was built on is 91 characters ("I want you to be
/// working independently, and I want it to be silent. That is my
/// expectation."); the cap sits well above it for margin.
///
/// This is here because of a specific failure, not for tidiness. On one run
/// the model tagged a long stretch of ordinary teaching — "Alright. What did
/// I do? What did I even do to start with? That's right. We're just gonna
/// take..." — as a REMOVAL. One mislabelled line at the top rung is enough to
/// make a cluster claim it climbed to a student being separated, and to put
/// that line in front of the teacher as the moment it happened. Length is a
/// blunt test and it is the one that separates a bid from a stretch of talk.
const MAX_BID_CHARS = 140

const MAX_BIDS = 40

export type AttentionBid = {
  quote: string
  timestampSec: number
  rung: Rung
  /// The teacher's own words showing she is repeating herself — "Like I
  /// said", "What did I say?". The strongest signal in here, because it is
  /// her testimony that the earlier ask failed, and it needs no student audio
  /// and no inference about gaps.
  backReference: boolean
}

export type EscalationCluster = {
  startSec: number
  endSec: number
  /// Kept for debugging and never shown: the within-cluster count is the
  /// unstable part. MIN_CLUSTER_BIDS is the floor the copy can lean on.
  bidCount: number
  fromRung: Rung
  /// The highest rung reached, not the last — a run that went consequence →
  /// removal → consequence climbed, and comparing first to last called it
  /// flat.
  topRung: Rung
  climbed: boolean
  /// Null when the wording could not be trusted; the moment still stands.
  quote: string | null
}

export type EscalationRead = {
  /// found — at least one cluster or a back-reference.
  /// confirmed_none — nothing found, and enough of the lesson was audible to
  ///   mean it.
  /// not_measurable — nothing found, and too little was audible to tell.
  state: 'found' | 'confirmed_none' | 'not_measurable'
  reason: string | null
  peakRung: Rung | null
  clusters: EscalationCluster[]
  repeatedAsks: { timestampSec: number; quote: string | null }[]
  capturedSharePct: number | null
}

const SYSTEM_PROMPT = `You are reading the teacher's side of a classroom recording. Find every ATTENTION BID: a moment where the teacher interrupts the lesson to ask the class, or a student, to attend, settle, stop talking, or get back to the work.

An attention bid is about attention or behaviour. It is NOT:
- a task instruction about the content ("answer one through six", "put your name at the top") — that is a direction, not a bid;
- a transition between activities ("alright, let's come back together");
- a content question, however sharply phrased;
- a polite request for help ("can you get the light for me?");
- the teacher narrating or asking about herself ("what did I even do to start with?").

Short ones count, and are often the most important: "Shh.", "Hello?", "Excuse me?", "Eyes up front." Copy the teacher's words EXACTLY as they appear, and give the timestamp of the line they came from.

For each bid, say which RUNG it sits on — how much force the teacher has brought to bear:
- attention — asking the room to attend, with no consequence attached: "eyes up here", "listen up", "shh", "I need everyone quiet".
- behaviour — telling the room or a group what to stop or start doing: "stop talking", "keep it down", "we're working on the questions, not talking", "back to work".
- named — the same, but directed at a named student or named students: "Eyes up front, River."
- consequence — a stated or threatened consequence: "if I have to talk to you guys again it's going to be a DBS", "that's a warning", "I'll be calling home", "you're moving seats".
- removal — a student is actually separated or sent out: "step outside", "go to the office", "we're not working together today".

Then say whether the bid BACK-REFERENCES an earlier ask — whether the teacher's own words show she is repeating herself: "Like I said...", "What did I say?", "Again...", "How many times...", "I already asked you". Answer yes only when the words carry it. Do not infer it from the bid merely resembling an earlier one.

Rules that matter more than finding things:
- Copy the words verbatim. A sentence the teacher did not say is dropped.
- Be exhaustive, in the order they happen. A lesson with eight bids comes back with eight, not the three clearest.
- NONE is a real answer, and is the right answer for a calm lesson. Never stretch a direction or a transition into a bid to fill the list.
- Ignore anything a student said. You are reading the teacher only.
- Do not count, compare, or draw a conclusion about the pattern. List the bids only; something else does the arithmetic.

Write nothing outside these tags:
<bids>
one per line as: sentence @ m:ss | rung | back-reference yes or no
</bids>`

/// Management language no student produces. Narrow on purpose: every entry
/// here has to be something that, heard from a classroom, can only be the
/// teacher.
const TEACHER_REGISTER = [
  'eyes up here', 'eyes on me', 'eyes up front', 'listen up', 'i need everyone',
  'voices off', 'settle down', 'quiet please', 'keep it down', 'stop talking',
  'back to work', 'pencils down', 'hands down', "i'm waiting", 'last warning',
  "that's a warning", 'no talking',
]

/// Which segments this read is allowed to look at.
///
/// Teacher-labelled speech, plus anything in unmistakable teacher register
/// whatever the diarizer called it. Escalation happens during group work, and
/// group work is exactly when the teacher walks away from the phone and her
/// voice picks up a second speaker tag: on one lesson the circulating teacher
/// was labelled "Student" for a whole stretch that included "Tell me why you
/// think it's a or b." Reading only Teacher segments means the detector goes
/// blind in the conditions it exists for.
///
/// The recovered segments are relabelled rather than handled separately, so
/// transcriptForModel and flattenTeacherSpeech — which both filter on the
/// label — stay the single implementation for the prompt and for quote
/// verification.
export function inScopeSegments(segments: Segment[]): Segment[] {
  return segments
    .filter((s) => {
      if (s.speakerLabel === 'Teacher') return true
      const low = s.text.toLowerCase()
      return TEACHER_REGISTER.some((phrase) => low.includes(phrase))
    })
    .map((s) => (s.speakerLabel === 'Teacher' ? s : { ...s, speakerLabel: 'Teacher' }))
}

export function parseBids(text: string, segments: Segment[]): AttentionBid[] {
  const body = extractTag(text, 'bids')
  if (!body) return []
  const { flat, offsets } = flattenTeacherSpeech(inScopeSegments(segments))
  const bids: AttentionBid[] = []
  const seen = new Set<string>()
  for (const line of body.split('\n')) {
    if (!line.trim() || isNoneAnswer(line)) continue
    const parts = line.split('|')
    const match = (parts[0] ?? '').match(/^(.*?)(?:\s*@\s*(\d+):(\d{1,2}))?\s*$/)
    if (!match) continue
    const quote = match[1].trim().replace(/^[-•*\d.\s]+/, '').replace(/^["']|["']$/g, '')
    if (quote.length < MIN_QUOTE_CHARS || quote.length > MAX_BID_CHARS) continue
    // The transcript decides whether it was said, as everywhere else.
    const offset = flat.indexOf(normalizeForMatch(quote))
    if (offset === -1) continue
    const rungText = (parts[1] ?? '').trim().toLowerCase()
    const rung = RUNGS.find((r) => rungText.includes(r)) ?? 'attention'
    const claimed = match[2] ? Number(match[2]) * 60 + Number(match[3]) : 0
    const timestampSec = startSecAtOffset(offsets, offset) ?? claimed
    // One run split a single bid into two lines at the same timestamp with
    // the same rung, which inflated a cluster. Same moment, same rung, once.
    const key = `${Math.round(timestampSec)}:${rung}`
    if (seen.has(key)) continue
    seen.add(key)
    bids.push({ quote, timestampSec, rung, backReference: /\byes\b/i.test(parts[2] ?? '') })
    if (bids.length >= MAX_BIDS) break
  }
  return bids.sort((a, b) => a.timestampSec - b.timestampSec)
}

export function findClusters(bids: AttentionBid[]): EscalationCluster[] {
  const runs: AttentionBid[][] = []
  let current: AttentionBid[] = []
  for (const bid of bids) {
    const last = current[current.length - 1]
    if (!last || bid.timestampSec - last.timestampSec <= CLUSTER_WINDOW_SEC) {
      current.push(bid)
    } else {
      if (current.length >= MIN_CLUSTER_BIDS) runs.push(current)
      current = [bid]
    }
  }
  if (current.length >= MIN_CLUSTER_BIDS) runs.push(current)

  const clusters = runs.map((run) => {
    const top = run.reduce((a, b) => (RUNGS.indexOf(b.rung) > RUNGS.indexOf(a.rung) ? b : a))
    // The quote shown is the one at the highest rung — the most telling
    // moment of the run — falling back to any that can be quoted at all.
    const quote = quoteOrNull(top.quote) ?? run.map((b) => quoteOrNull(b.quote)).find((q) => q) ?? null
    return {
      startSec: run[0].timestampSec,
      endSec: run[run.length - 1].timestampSec,
      bidCount: run.length,
      fromRung: run[0].rung,
      topRung: top.rung,
      climbed: RUNGS.indexOf(top.rung) > RUNGS.indexOf(run[0].rung),
      quote,
    }
  })

  // Most severe first, because the report shows the strongest one and not the
  // list. Across repeated runs on the same lesson the hardest cluster came
  // back identically every time — consequence to removal at 13:14, same quote
  // — while a marginal three-bid run at 9:47 appeared in two of three and
  // changed its rung when it did. Enumerating every cluster would put that
  // wobble in front of a teacher as though it were equally certain.
  return clusters.sort(
    (a, b) =>
      RUNGS.indexOf(b.topRung) - RUNGS.indexOf(a.topRung) ||
      b.bidCount - a.bidCount ||
      a.startSec - b.startSec,
  )
}

function peakRung(bids: AttentionBid[]): Rung | null {
  return RUNGS.filter((r) => bids.some((b) => b.rung === r)).pop() ?? null
}

/// Best-effort like every other model read in the analysis path: a failure
/// returns null, and the report says nothing rather than guessing.
export async function readEscalation(
  segments: Segment[],
  metricsDetail: CoverageSource | null | undefined,
  durationSec?: number | null,
): Promise<EscalationRead | null> {
  const transcript = transcriptForModel(inScopeSegments(segments))
  const share = capturedShare(metricsDetail, durationSec)
  const pct = sharePct(share)

  // A transcript this thin cannot support a finding OR an absence. Said
  // before the model call, because there is nothing to ask about.
  if (transcript.length < 400) {
    return {
      state: 'not_measurable',
      reason: notMeasurableReason(pct),
      peakRung: null,
      clusters: [],
      repeatedAsks: [],
      capturedSharePct: pct,
    }
  }

  let bids: AttentionBid[]
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      // Adaptive thinking draws from this budget and can return a reply with
      // no text blocks at all — see lessonObjective's note.
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    })
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    bids = parseBids(text, segments)
  } catch (error) {
    console.error('[escalation] read failed:', error)
    return null
  }

  const clusters = findClusters(bids)
  const repeats = bids.filter((b) => b.backReference)
  const found = clusters.length > 0 || repeats.length > 0

  if (!found) {
    // The asymmetry that matters: finding a pattern survives a patchy
    // recording, because a cluster that is there is there. Saying there was
    // no pattern is a claim about the stretches that produced no words, and
    // on one real lesson those stretches were 85% of it — the teacher
    // remembered redirecting the class around ten times in a window the
    // transcript has nothing in at all.
    return {
      state: canClaimAbsence(share) ? 'confirmed_none' : 'not_measurable',
      reason: canClaimAbsence(share) ? null : notMeasurableReason(pct),
      peakRung: peakRung(bids),
      clusters: [],
      repeatedAsks: [],
      capturedSharePct: pct,
    }
  }

  return {
    state: 'found',
    reason: null,
    peakRung: peakRung(bids),
    clusters,
    repeatedAsks: repeats.map((b) => ({ timestampSec: b.timestampSec, quote: quoteOrNull(b.quote) })),
    capturedSharePct: pct,
  }
}

function notMeasurableReason(pct: number | null): string {
  const heard = pct == null ? 'Too little of this recording' : `Only about ${pct}% of this recording`
  return `${heard} came through as speech the microphone could resolve, so this can't tell you whether attention held. A quiet transcript here means the mic lost the room — group work, distance, voices over each other — not that the room was quiet.`
}
