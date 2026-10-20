// Repeated redirections: did the teacher repeatedly address the same
// behavior? A narrow, observable question, read from the teacher's voice.
//
// What it does not claim, by design: that a correction failed (a second
// reminder may be for a different student or a separate incident), that the
// teacher was losing control, or anything about how students responded. It
// reports that the same expectation came up again and again, with the
// teacher's own words and times.
//
// Division of labour, as in escalation.ts: the model finds each behavior
// correction in context and files it under one expectation — no phrase list
// anywhere, including for deciding which lines are the teacher's. The code
// verifies every quote against the transcript, counts only teacher-labelled
// lines whose wording can be trusted, merges asks made within seconds of each
// other into one moment, and decides what is a pattern.
//
// Dry-run on 12 real lessons, three readings each (2026-10-20): the ten calm
// lessons said "none" every time; Oct 8's talking pattern and Oct 9's were
// found in every reading whose reply came back intact. A few readings came
// back empty on lessons full of corrections — see readRepeatedRedirections.

import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import type { Segment } from './audioAnalysis.ts'
import { extractTag } from './extractTag.ts'
import { normalizeForMatch } from './lessonObjective.ts'
import { quoteOrNull, trustworthyWording } from './quoteSafety.ts'

export const REDIRECT_EXPECTATIONS = ['talking', 'work', 'devices', 'seats', 'materials', 'attention'] as const
export type RedirectExpectation = (typeof REDIRECT_EXPECTATIONS)[number]

/// Label on each listed correction, and the words for a finding.
const WORDS: Record<RedirectExpectation, { label: string; title: string; asking: string }> = {
  talking: { label: 'Talking', title: 'talking', asking: 'asking students to stop talking' },
  work: { label: 'Getting back to work', title: 'getting back to work', asking: 'asking students to start or get back to work' },
  devices: { label: 'Phones and devices', title: 'phones and devices', asking: 'asking students to put phones or devices away' },
  seats: { label: 'Staying in seats', title: 'staying in seats', asking: 'asking students to stay in their seats' },
  materials: { label: 'Materials', title: 'materials', asking: 'asking students to leave materials alone or put them away' },
  attention: { label: 'Attention', title: 'attention', asking: 'asking students for their attention' },
}

/// Three separate moments make "repeatedly". Two is asking twice, and in
/// earlier dry runs two-ask groups came and went between readings.
const MIN_MOMENTS = 3
/// Asks about the same thing this close together are one moment: "Listen
/// up... listen up real fast... listen, please" inside five seconds is one
/// call for the room. Also what keeps "shh, shh, shh" split across lines at one.
const SAME_MOMENT_SEC = 15
/// Moments further apart than this belong to different stretches.
const STRETCH_GAP_SEC = 120
/// A stretch with no words from anyone this long is a gap in what was heard.
const SILENT_STRETCH_SEC = 120
/// Above this share of silent stretches the lesson cannot be read at all.
const MAX_SILENT_SHARE = 0.5

const MAX_TRANSCRIPT_CHARS = 90_000

export type RepeatedRedirectionFinding = {
  expectation: RedirectExpectation
  /// stretch — the moments came within a few minutes; recurring — the same
  /// expectation came back across the lesson.
  kind: 'stretch' | 'recurring'
  startSec: number
  endSec: number
  title: string
  pattern: string
  /// Quote null when no moment in the finding is long and clear enough to
  /// show on its own; the finding still stands.
  lead: { quote: string | null; timestampSec: number }
  more: { quote: string; timestampSec: number }[]
}

export type RepeatedRedirections = {
  /// found — at least one pattern. none — no pattern in what was captured.
  /// not_measurable — too little of the lesson had any words to tell.
  /// unread — the model's reply could not be used; say nothing either way.
  state: 'found' | 'none' | 'not_measurable' | 'unread'
  /// The finding or empty-state line, written here so every surface says it
  /// the same way.
  headline: string | null
  /// Whether the teacher's voice came through, in plain words: heard
  /// throughout, or where nothing was captured.
  coverageNote: string | null
  heardThroughout: boolean
  silentStretches: { startSec: number; endSec: number }[]
  findings: RepeatedRedirectionFinding[]
  /// Every counted correction, in lesson order, for the list under the
  /// findings. Quote null when it is too short or unclear to show alone.
  corrections: { quote: string | null; timestampSec: number; expectation: RedirectExpectation; label: string }[]
}

const SYSTEM_PROMPT = `You are reading the transcript of a classroom recording. Each line has a time and a speaker label. The labels are unreliable: when the teacher walks around the room their voice is often labelled Student. Decide from the words and the context whether a line is the teacher speaking.

Find every BEHAVIOR CORRECTION the teacher makes: a moment where the teacher asks a student, a group or the class to stop or change a behavior. Calm and polite corrections count exactly as much as sharp ones; consequences or raised language are not required.

File each one under the expectation it is about:
- talking — stop talking, lower voices, side conversations, quiet, "shh" or "hush" when it appears in the transcript
- work — start the work, return to it, stay on it
- devices — phones, Chromebooks, screens used off-task
- seats — sitting down, staying in seats, standing, moving around, turning around
- materials — putting things away, not touching or playing with materials
- attention — eyes, facing the front, listening — ONLY when the context shows it is correcting behavior, not a routine cue to start or move on

NOT a correction:
- a single routine cue that opens a transition or an explanation ("eyes on me", "okay, listen up, here's what we're doing");
- explaining or re-explaining the assignment, directions, or how to do the work;
- academic corrections ("no, combine like terms first");
- "listen", "okay", "alright" with no clear behavior context;
- anything a student says.

Rules:
- Copy the teacher's words EXACTLY as they appear in the transcript, from one line, and give that line's time.
- A line that repeats the same correction ("shh, shh, shh", "quiet, quiet") is ONE correction.
- Be exhaustive and in order. NONE is a real answer for a lesson with no corrections.
- Do not judge whether a correction worked, and do not count or summarise. List only.

Write nothing outside these tags:
<corrections>
one per line as: exact words @ m:ss | expectation
</corrections>`

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

export type ParsedCorrection = { quote: string; timestampSec: number; segIndex: number; expectation: RedirectExpectation; teacherLabelled: boolean }

/// Null when the reply has no <corrections> tag at all — a broken reply, not
/// an answer. [] is the model saying NONE, or nothing that checked out.
export function parseCorrections(reply: string, segments: Segment[]): ParsedCorrection[] | null {
  const body = extractTag(reply, 'corrections')
  if (body == null) return null
  if (/^\s*NONE\s*$/i.test(body)) return []
  const norm = segments.map((s) => normalizeForMatch(s.text))
  const out: ParsedCorrection[] = []
  const seen = new Set<string>()
  for (const line of body.split('\n')) {
    const [left, right] = line.split('|')
    const m = (left ?? '').match(/^(.*?)\s*@\s*(\d+):(\d{1,2})\s*$/)
    if (!m) continue
    const quote = m[1].trim().replace(/^[-•*\s]+/, '').replace(/^["“']|["”']$/g, '')
    const q = normalizeForMatch(quote)
    if (q.length < 2) continue
    const claimed = Number(m[2]) * 60 + Number(m[3])
    // The transcript decides whether it was said and when; the nearest line
    // carrying the words wins. The transcriber often splits one sentence
    // across lines ("Don't" / "don't feel comfortable." / "Can you get your
    // Chromebook up…") and the model quotes it whole, so up to three
    // consecutive lines are tried together, timed from the first.
    let best = -1
    for (let span = 1; span <= 3 && best === -1; span++) {
      for (let i = 0; i + span <= segments.length; i++) {
        const joined = span === 1 ? norm[i] : norm.slice(i, i + span).join(' ')
        if (joined.includes(q) && (best === -1 || Math.abs(segments[i].startSec - claimed) < Math.abs(segments[best].startSec - claimed))) best = i
      }
    }
    if (best === -1) continue
    const expectation = REDIRECT_EXPECTATIONS.find((e) => (right ?? '').toLowerCase().includes(e))
    if (!expectation) continue
    // One correction per expectation per line: "shh, shh, shh" is one.
    const key = `${best}:${expectation}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ quote, timestampSec: segments[best].startSec, segIndex: best, expectation, teacherLabelled: segments[best].speakerLabel === 'Teacher' })
  }
  return out.sort((a, b) => a.timestampSec - b.timestampSec)
}

/// The corrections that count: the teacher's voice, wording that can be
/// trusted, and asks within seconds of each other about the same thing kept
/// as one moment.
export function countedMoments(corrections: ParsedCorrection[]): ParsedCorrection[] {
  const kept = corrections.filter((c) => c.teacherLabelled && trustworthyWording(c.quote))
  const out: ParsedCorrection[] = []
  for (const c of kept) {
    const last = [...out].reverse().find((o) => o.expectation === c.expectation)
    if (last && c.timestampSec - last.timestampSec <= SAME_MOMENT_SEC) continue
    out.push(c)
  }
  return out
}

export function findPatterns(moments: ParsedCorrection[]): RepeatedRedirectionFinding[] {
  const findings: RepeatedRedirectionFinding[] = []
  for (const e of REDIRECT_EXPECTATIONS) {
    const list = moments.filter((m) => m.expectation === e)
    if (list.length < MIN_MOMENTS) continue
    const runs: ParsedCorrection[][] = []
    let cur: ParsedCorrection[] = []
    for (const m of list) {
      if (cur.length && m.timestampSec - cur[cur.length - 1].timestampSec > STRETCH_GAP_SEC) {
        runs.push(cur)
        cur = []
      }
      cur.push(m)
    }
    runs.push(cur)
    // All of them inside one stretch, or spread across the lesson. One
    // finding per expectation either way: the teacher reads one card about
    // talking, not two.
    const group = runs.length === 1 ? runs[0] : list
    findings.push(withCopy(e, runs.length === 1 ? 'stretch' : 'recurring', group))
  }
  // Most moments first; ties in lesson order.
  return findings.sort((a, b) => b.more.length - a.more.length || a.startSec - b.startSec)
}

function withCopy(e: RedirectExpectation, kind: 'stretch' | 'recurring', group: ParsedCorrection[]): RepeatedRedirectionFinding {
  const start = group[0].timestampSec
  const end = group[group.length - 1].timestampSec
  const leadMoment = group.find((m) => quoteOrNull(m.quote)) ?? group[0]
  const when = kind === 'stretch' ? `Within a few minutes, between ${mmss(start)} and ${mmss(end)}` : `Across the lesson, from ${mmss(start)} to ${mmss(end)}`
  return {
    expectation: e,
    kind,
    startSec: start,
    endSec: end,
    title: `Repeated reminders about ${WORDS[e].title}`,
    pattern: `${when}, you returned several times to ${WORDS[e].asking}.`,
    lead: { quote: quoteOrNull(leadMoment.quote), timestampSec: leadMoment.timestampSec },
    more: group
      .filter((m) => m !== leadMoment)
      .map((m) => ({ quote: quoteOrNull(m.quote), timestampSec: m.timestampSec }))
      .filter((m): m is { quote: string; timestampSec: number } => m.quote != null),
  }
}

/// Stretches of two minutes or more with no words from anyone. Some are
/// quiet independent work; the recording cannot tell, so they are named, not
/// interpreted.
export function silentStretches(segments: Segment[], durationSec: number): { startSec: number; endSec: number }[] {
  const out: { startSec: number; endSec: number }[] = []
  let last = 0
  for (const s of segments) {
    if (s.startSec - last >= SILENT_STRETCH_SEC) out.push({ startSec: last, endSec: s.startSec })
    last = Math.max(last, s.endSec)
  }
  if (durationSec - last >= SILENT_STRETCH_SEC) out.push({ startSec: last, endSec: durationSec })
  return out
}

function coverageNote(stretches: { startSec: number; endSec: number }[]): string {
  if (stretches.length === 0) return 'Your voice was heard throughout this recording.'
  const shown = stretches.slice(0, 3).map((s) => `${mmss(s.startSec)} to ${mmss(s.endSec)}`)
  const list = shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
  return `No speech was captured from ${list}${stretches.length > 3 ? ', and other stretches' : ''}.`
}

export function decide(
  moments: ParsedCorrection[] | null,
  segments: Segment[],
  durationSec: number,
): RepeatedRedirections {
  const stretches = silentStretches(segments, durationSec)
  const silentShare = durationSec > 0 ? stretches.reduce((a, s) => a + s.endSec - s.startSec, 0) / durationSec : 1
  const base = {
    heardThroughout: stretches.length === 0,
    silentStretches: stretches,
    coverageNote: coverageNote(stretches),
  }
  if (moments == null) {
    return { ...base, state: 'unread', headline: null, coverageNote: null, findings: [], corrections: [] }
  }
  const corrections = moments.map((m) => ({
    quote: quoteOrNull(m.quote),
    timestampSec: m.timestampSec,
    expectation: m.expectation,
    label: WORDS[m.expectation].label,
  }))
  const findings = findPatterns(moments)
  if (findings.length > 0) {
    return { ...base, state: 'found', headline: null, findings, corrections }
  }
  // A pattern that is there survives a patchy recording; "none" does not.
  if (silentShare >= MAX_SILENT_SHARE) {
    return {
      ...base,
      state: 'not_measurable',
      headline: 'Too little of your voice was captured to tell whether any redirections repeated.',
      findings: [],
      corrections,
    }
  }
  return {
    ...base,
    state: 'none',
    headline: 'No repeated redirection pattern detected in the captured speech.',
    findings: [],
    corrections,
  }
}

function transcript(segments: Segment[]): string {
  return segments
    .map((s) => `[${mmss(s.startSec)}] ${s.speakerLabel}: ${s.text.trim()}`)
    .join('\n')
    .slice(0, MAX_TRANSCRIPT_CHARS)
}

/// Best-effort like every other read in the analysis path. Two failure
/// shapes were seen in dry runs and both get one more ask: a broken reply
/// (no tag), and — rarer — a reading that answers NONE on a lesson other
/// readings found eight or nine corrections in. Calm lessons pay one extra
/// call for that; a false "none" now needs two bad readings in a row. A
/// reply that is still broken is "unread", never "none".
export async function readRepeatedRedirections(segments: Segment[], durationSec: number): Promise<RepeatedRedirections> {
  const text = transcript(segments)
  if (text.length < 400) return decide([], segments, durationSec)
  let parsed: ParsedCorrection[] | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 3000,
        thinking: { type: 'disabled' },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: text }],
      })
      const reply = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
      const next = parseCorrections(reply, segments)
      if (next != null && (parsed == null || next.length > parsed.length)) parsed = next
    } catch (error) {
      console.error('[repeatedRedirections] read failed:', error)
    }
    if (parsed != null && parsed.length > 0) break
  }
  return decide(parsed == null ? null : countedMoments(parsed), segments, durationSec)
}
