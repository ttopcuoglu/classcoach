// The Insights tab as data: five sections, each a list of findings, each
// finding the teacher's own lines behind it.
//
// One place decides every number on the page, from the same list it shows as
// evidence — so a count and its "Show all" can never disagree, which is how
// "15 questions" sat beside "What your questions asked for (16)". Pure, so it
// is tested rather than looked at.
//
// Reads the lesson through teacherVoiceView (lib/teacherVoice.ts): nothing
// here can reach a student-derived value while student metrics are off.

import type {
  AudioDirectionPart,
  AudioMoveQuote,
  AudioQuestionLogEntry,
  AudioSessionWithSegments,
  TranscriptSegment,
} from './api'
import { safeToQuote } from './quoteSafety.ts'
import { pauseAfterQuestionsMetric } from './teacherVoice.ts'
import { resolveVerbatim, teacherRuns } from './verbatim.ts'

/// Three states, never a zero standing in for "we could not tell".
export type FindingState = 'measured' | 'confirmed_none' | 'unavailable'

export type Polarity = 'strength' | 'growth' | 'neutral'

export type ElementTag = { label: string; on: boolean }

export type Evidence = {
  id: string
  /// The line as shown: an exact substring of what was stored, cut to a
  /// sentence or clause boundary when long. `full` is the whole stored line.
  quote: string
  full: string
  timestampSec: number
  tag: string
  polarity: Polarity
  elements?: ElementTag[]
  /// The transcript line the words start in and end in. Absent when the
  /// quote could not be found in the teacher's own speech.
  segmentId?: string
  endSegmentId?: string
  /// Shown instead of the words: 'unsafe' when they are not words to put in
  /// a teacher's mouth on a room microphone's say-so, 'unmatched' when they
  /// could not be found word for word in one stretch of the teacher's speech.
  withheld?: 'unsafe' | 'unmatched'
  /// One line on why the moment matters, when a reading supplies one.
  why?: string
}

export type Finding = {
  key: string
  label: string
  state: FindingState
  /// What the value pill says: "6 of 15", "2", "210 wpm". Null when the
  /// finding is only a caveat.
  value: string | null
  caveat?: string
  /// Why it is unavailable, or what none means here.
  note?: string
  /// Strengths first, then growth, each in lesson order.
  evidence: Evidence[]
  featured: Evidence | null
  /// "Show all N" label; absent when there is one item or none.
  showAllLabel?: string
  /// Optional grouping for the full list, in display order.
  groups?: { label: string; items: Evidence[] }[]
}

export type CoachText = { lead: string; more: string | null } | null

export type KeepTry = {
  keep: { text: string; line: Evidence | null } | null
  /// `rewrite` is the line as it could be said next time, from the coach
  /// notes; absent until they are written.
  tryNext: { text: string; line: Evidence | null; rewrite?: string } | null
}

export type TimelineModel = {
  durationSec: number
  /// Spans attributed to the teacher.
  speech: { startSec: number; endSec: number }[]
  fast: { startSec: number; endSec: number; wpm: number }[]
  invitations: number[]
  checks: number[]
}

export type QuestionSquare = { timestampSec: number; higherOrder: boolean; selfAnswered: boolean; text: string }

export type DirectionRow = { timestampSec: number; parts: AudioDirectionPart[] }

export type SectionKey = 'talk_pace' | 'questioning' | 'clarity' | 'climate' | 'content_lens'

export type SectionModel = {
  key: SectionKey
  coach: CoachText
  findings: Finding[]
  keepTry: KeepTry
}

export type InsightsModel = {
  talk: SectionModel & {
    talkPct: number | null
    wpm: number | null
    timeline: TimelineModel | null
  }
  questioning: SectionModel & { squares: QuestionSquare[]; total: number | null }
  clarity: SectionModel & { directions: DirectionRow[] }
  climate: SectionModel
  content: SectionModel & {
    state: FindingState
    topic: string | null
    terms: { term: string; count: number }[]
    leanedOn: string[]
    guidance: { stuck: string[]; waysIn: string[] }
    notesGenerated: boolean
  }
}

/// A timestamp as the page shows it: 7:05, 13:40.
export function mmss(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// --- quotes ---------------------------------------------------------------

/// The longest a featured quote runs. Longer lines are cut, and the whole
/// line stays one click away under "Show context".
export const MAX_QUOTE_WORDS = 30

/// A line cut to at most MAX_QUOTE_WORDS words, ending where a sentence or a
/// clause ends. Always an exact prefix of the input, so the quote stays the
/// teacher's words — never stitched, never tidied. Lines with no boundary in
/// reach are cut at a word and marked `cut` so the card can say so.
export function trimQuote(text: string): { quote: string; cut: boolean } {
  const clean = text.trim()
  const words = clean.split(/\s+/)
  if (words.length <= MAX_QUOTE_WORDS) return { quote: clean, cut: false }
  // The prefix that holds the first MAX_QUOTE_WORDS words.
  let end = 0
  for (let i = 0; i < MAX_QUOTE_WORDS; i++) {
    end = clean.indexOf(words[i], end) + words[i].length
  }
  const head = clean.slice(0, end)
  const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '))
  if (sentence > head.length / 3) return { quote: head.slice(0, sentence + 1), cut: false }
  const lastChar = head[head.length - 1]
  if (lastChar === '.' || lastChar === '?' || lastChar === '!') return { quote: head, cut: false }
  const clause = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '), head.lastIndexOf(' — '))
  if (clause > head.length / 3) return { quote: head.slice(0, clause), cut: false }
  return { quote: head, cut: true }
}

/// Evidence from a stored quote, in the transcript's exact words.
///
/// The stored string is what a model wrote, matched to the speech loosely; the
/// words shown are the transcript's own characters for that match
/// (lib/verbatim.ts). A quote that cannot be found that way is still counted —
/// the moment was read — but its wording is withheld rather than shown in
/// someone else's spelling of it.
function makeEvidence(segments: TranscriptSegment[]) {
  const runs = teacherRuns(segments)
  return (id: string, item: AudioMoveQuote, tag: string, polarity: Polarity, elements?: ElementTag[]): Evidence => {
    const found = resolveVerbatim(runs, item.quote, item.timestampSec)
    if (!found) {
      console.warn(`[insights] not shown: no exact match in the teacher's speech for ${JSON.stringify(item.quote)}`)
    }
    const full = found?.text ?? item.quote.trim()
    return {
      id,
      quote: trimQuote(full).quote,
      full,
      timestampSec: item.timestampSec,
      tag,
      polarity,
      ...(found ? { segmentId: found.segmentId, endSegmentId: found.endSegmentId } : {}),
      ...(elements ? { elements } : {}),
      ...(!found ? { withheld: 'unmatched' as const } : !safeToQuote(full) ? { withheld: 'unsafe' as const } : {}),
    }
  }
}

const POLARITY_ORDER: Record<Polarity, number> = { strength: 0, neutral: 1, growth: 2 }

function ordered(evidence: Evidence[]): Evidence[] {
  return [...evidence].sort(
    (a, b) => POLARITY_ORDER[a.polarity] - POLARITY_ORDER[b.polarity] || a.timestampSec - b.timestampSec,
  )
}

/// The clearest instance: one that can be quoted, short enough to read at a
/// glance, preferring the wanted polarity.
function pickFeatured(evidence: Evidence[], prefer: Polarity = 'strength'): Evidence | null {
  const quotable = evidence.filter((e) => !e.withheld)
  const pool = quotable.filter((e) => e.polarity === prefer)
  const from = pool.length > 0 ? pool : quotable
  if (from.length === 0) return evidence[0] ?? null
  return [...from].sort((a, b) => a.quote.split(/\s+/).length - b.quote.split(/\s+/).length)[0]
}

function finding(
  base: Omit<Finding, 'featured' | 'evidence' | 'showAllLabel'> & { evidence: Evidence[]; prefer?: Polarity; allNoun?: string },
): Finding {
  const { prefer, allNoun, ...rest } = base
  const evidence = ordered(base.evidence)
  return {
    ...rest,
    evidence,
    featured: base.state === 'measured' ? pickFeatured(evidence, prefer) : null,
    ...(evidence.length > 1 ? { showAllLabel: `Show all ${evidence.length}${allNoun ? ` ${allNoun}` : ''}` } : {}),
  }
}

/// A read that never ran is unavailable; one that ran and found nothing is a
/// confirmed none.
function listState<T>(list: T[] | undefined | null, readRan: boolean): FindingState {
  if (!readRan || list == null) return 'unavailable'
  return list.length > 0 ? 'measured' : 'confirmed_none'
}

/// The coach paragraph split into a lead that is always shown and the rest
/// behind "Read more".
export function splitCoachNote(text: string | null | undefined): CoachText {
  const clean = text?.trim()
  if (!clean) return null
  const match = clean.match(/^(.+?[.!?])(\s+)([\s\S]+)$/)
  if (!match) return { lead: clean, more: null }
  return { lead: match[1], more: match[3].trim() || null }
}

// --- context lines ----------------------------------------------------------

/// The teacher's line before and after the one quoted, for "Show context".
/// Teacher lines only: a neighbouring line attributed to a student is the
/// attribution this report does not trust.
export function contextLines(
  segments: TranscriptSegment[],
  evidence: Pick<Evidence, 'segmentId' | 'endSegmentId'>,
): { before: TranscriptSegment | null; lines: TranscriptSegment[]; after: TranscriptSegment | null } {
  const teacher = segments.filter((s) => s.speakerLabel === 'Teacher').sort((a, b) => a.startSec - b.startSec)
  const first = teacher.findIndex((s) => s.id === evidence.segmentId)
  const last = teacher.findIndex((s) => s.id === (evidence.endSegmentId ?? evidence.segmentId))
  if (first === -1 || last === -1) return { before: null, lines: [], after: null }
  return { before: teacher[first - 1] ?? null, lines: teacher.slice(first, last + 1), after: teacher[last + 1] ?? null }
}

// --- fast stretches ----------------------------------------------------------

/// Faster than this, held for at least FAST_MIN_SEC, is a fast stretch.
export const FAST_WPM = 180
export const FAST_MIN_SEC = 30
/// Teacher lines this close together are one stretch of talk.
const STRETCH_JOIN_SEC = 1.5

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function fastStretches(
  segments: TranscriptSegment[],
): { startSec: number; endSec: number; wpm: number; line: TranscriptSegment }[] {
  const teacher = segments
    .filter((s) => s.speakerLabel === 'Teacher' && s.text.trim())
    .sort((a, b) => a.startSec - b.startSec)
  const runs: TranscriptSegment[][] = []
  for (const s of teacher) {
    const run = runs[runs.length - 1]
    if (run && s.startSec - run[run.length - 1].endSec <= STRETCH_JOIN_SEC) run.push(s)
    else runs.push([s])
  }
  return runs
    .map((run) => {
      const startSec = run[0].startSec
      const endSec = run[run.length - 1].endSec
      const spoken = run.reduce((sum, s) => sum + Math.max(0, s.endSec - s.startSec), 0)
      const words = run.reduce((sum, s) => sum + wordCount(s.text), 0)
      const wpm = spoken > 0 ? Math.round((words / spoken) * 60) : 0
      // The run's longest line stands for it: the quote has to be one line,
      // never stitched across two.
      const line = [...run].sort((a, b) => b.endSec - b.startSec - (a.endSec - a.startSec))[0]
      return { startSec, endSec, wpm, line }
    })
    .filter((r) => r.endSec - r.startSec >= FAST_MIN_SEC && r.wpm > FAST_WPM)
    .sort((a, b) => b.wpm - a.wpm)
}

// --- the sections -----------------------------------------------------------

const DIRECTION_PARTS: AudioDirectionPart[] = ['task', 'steps', 'time', 'product']
const PART_LABEL: Record<AudioDirectionPart, string> = { task: 'Task', steps: 'Steps', time: 'Time', product: 'Product' }
const CONNECTION_LABEL = { prior: 'Prior learning', purpose: 'Why it matters', closing: 'Closing summary' } as const

/// Within this many seconds, a self-answered moment and a question are the
/// same moment — the two come from different reads of the transcript.
const SAME_MOMENT_SEC = 4

export function buildInsightsModel(report: AudioSessionWithSegments): InsightsModel {
  const moves = report.teachingMoves ?? null
  const movesRan = moves != null
  const segments = report.segments ?? []
  const evidenceFrom = makeEvidence(segments)
  const detail = report.metricsDetail ?? {}

  // ---- 1. Talk & Pace
  const invitations = (moves?.invitations ?? []).map((q, i) => evidenceFrom(`inv-${i}`, q, 'Opened the floor', 'strength'))
  const fast = fastStretches(segments)
  const fastEvidence = fast.map((r, i) =>
    evidenceFrom(`fast-${i}`, { quote: r.line.text, timestampSec: r.line.startSec }, `${r.wpm} words a minute`, 'growth'),
  )
  const wpm = typeof detail.teacherWordsPerMinute === 'number' ? detail.teacherWordsPerMinute : null
  const talkFindings: Finding[] = [
    finding({
      key: 'invitations',
      label: 'Invitations to participate',
      state: listState(moves?.invitations, movesRan),
      value: movesRan ? String(invitations.length) : null,
      note: !movesRan ? 'This lesson was analyzed before invitations were read.' : invitations.length === 0 ? 'None heard in this lesson.' : undefined,
      evidence: invitations,
      allNoun: 'invitations',
    }),
    finding({
      key: 'fast_stretches',
      label: 'Fast stretches',
      state: segments.length === 0 ? 'unavailable' : fast.length > 0 ? 'measured' : 'confirmed_none',
      value: segments.length === 0 ? null : String(fast.length),
      caveat: `Over ${FAST_WPM} words a minute for ${FAST_MIN_SEC}s or more`,
      note: fast.length === 0 ? `No stretch ran over ${FAST_WPM} words a minute for ${FAST_MIN_SEC} seconds.` : undefined,
      evidence: fastEvidence,
      prefer: 'growth',
      allNoun: 'stretches',
    }),
  ]
  const talkKeep = pickFeatured(invitations)
  const talkTryLine = pickFeatured(fastEvidence, 'growth')
  const talk: InsightsModel['talk'] = {
    key: 'talk_pace',
    coach: splitCoachNote(report.talkNarrative),
    findings: talkFindings,
    keepTry: {
      keep: talkKeep ? { text: 'You opened the floor here.', line: talkKeep } : null,
      tryNext: report.nextSteps?.talk ? { text: report.nextSteps.talk, line: talkTryLine } : null,
    },
    talkPct: report.teacherTalkPct,
    wpm,
    timeline:
      report.durationSec && segments.length > 0
        ? {
            durationSec: report.durationSec,
            speech: segments.filter((s) => s.speakerLabel === 'Teacher').map((s) => ({ startSec: s.startSec, endSec: s.endSec })),
            fast: fast.map(({ startSec, endSec, wpm: w }) => ({ startSec, endSec, wpm: w })),
            invitations: invitations.map((e) => e.timestampSec),
            checks: (report.cfuLog ?? []).map((c) => c.timestampSec),
          }
        : null,
  }

  // ---- 2. Questioning & Checking
  const log: AudioQuestionLogEntry[] = report.questionLog ?? []
  const selfAnswered = moves?.selfAnswered ?? []
  const answeredNear = (sec: number) => selfAnswered.some((s) => Math.abs(s.timestampSec - sec) <= SAME_MOMENT_SEC)
  const squares: QuestionSquare[] = log.map((q) => ({
    timestampSec: q.timestampSec,
    higherOrder: q.type === 'higher_order',
    selfAnswered: answeredNear(q.timestampSec),
    text: q.text,
  }))
  // One count: the questions listed are the questions counted.
  const total = report.questionLog ? log.length : null
  const questionEvidence = log.map((q, i) =>
    evidenceFrom(
      `q-${i}`,
      { quote: q.text, timestampSec: q.timestampSec },
      q.type === 'higher_order' ? 'Higher-order' : 'Recall',
      q.type === 'higher_order' ? 'strength' : 'neutral',
    ),
  )
  const higher = questionEvidence.filter((e) => e.polarity === 'strength')
  const selfEvidence = selfAnswered.map((q, i) => evidenceFrom(`sa-${i}`, q, 'You answered it', 'growth'))
  const checks = (report.cfuLog ?? []).map((c, i) =>
    evidenceFrom(`cfu-${i}`, { quote: c.text, timestampSec: c.timestampSec }, 'Spoken check', 'strength'),
  )
  const pause = pauseAfterQuestionsMetric(report.questionLog)
  const questioningFindings: Finding[] = [
    {
      ...finding({
        key: 'higher_order_questions',
        label: 'Higher-order questions',
        state: total == null ? 'unavailable' : total === 0 ? 'confirmed_none' : 'measured',
        value: total == null ? null : `${higher.length} of ${total}`,
        note: total === 0 ? 'No questions were heard in this lesson.' : total == null ? 'Questions were not read for this lesson.' : undefined,
        evidence: questionEvidence,
        allNoun: 'questions',
      }),
      groups: [
        { label: `Higher-order · ${higher.length}`, items: higher },
        { label: `Recall · ${questionEvidence.length - higher.length}`, items: questionEvidence.filter((e) => e.polarity !== 'strength') },
      ],
    },
    finding({
      key: 'self_answered',
      label: 'Questions you answered yourself',
      state: listState(moves?.selfAnswered, movesRan),
      value: movesRan ? String(selfEvidence.length) : null,
      note: !movesRan ? 'This lesson was analyzed before this was read.' : selfEvidence.length === 0 ? 'None heard in this lesson.' : undefined,
      evidence: selfEvidence,
      prefer: 'growth',
    }),
    finding({
      key: 'spoken_checks',
      label: 'Spoken checks for understanding',
      state: report.cfuLog == null ? 'unavailable' : checks.length > 0 ? 'measured' : 'confirmed_none',
      value: report.cfuLog == null ? null : String(checks.length),
      caveat: 'Spoken checks only — hand signals and written work leave no trace',
      note: report.cfuLog != null && checks.length === 0 ? 'No spoken check was heard.' : undefined,
      evidence: checks,
      allNoun: 'checks',
    }),
    {
      key: 'pause_after_question',
      label: 'Pause before you spoke again',
      state: pause.state === 'measured' ? 'measured' : pause.state === 'confirmed_none' ? 'confirmed_none' : 'unavailable',
      value: null,
      caveat:
        pause.timed > 0
          ? `${pause.long} of ${pause.timed} had 3s+ · may include student answers`
          : (pause.reason ?? 'Not timed for this lesson'),
      evidence: [],
      featured: null,
    },
  ]
  const questionKeep = pickFeatured(higher)
  const questionTryLine = pickFeatured(selfEvidence, 'growth')
  const questioning: InsightsModel['questioning'] = {
    key: 'questioning',
    coach: splitCoachNote(report.questionsNarrative),
    findings: questioningFindings,
    keepTry: {
      keep: questionKeep ? { text: 'This question asked students to think, not just recall.', line: questionKeep } : null,
      tryNext: report.nextSteps?.questions ? { text: report.nextSteps.questions, line: questionTryLine } : null,
    },
    squares,
    total,
  }

  // ---- 3. Clarity
  const directions = moves?.directions ?? []
  const directionEvidence = directions.map((d, i) =>
    evidenceFrom(
      `dir-${i}`,
      d,
      d.parts.length === 4 ? 'Named all four' : `Missing ${DIRECTION_PARTS.filter((p) => !d.parts.includes(p)).map((p) => PART_LABEL[p].toLowerCase()).join(', ')}`,
      d.parts.length === 4 ? 'strength' : 'growth',
      DIRECTION_PARTS.map((p) => ({ label: PART_LABEL[p], on: d.parts.includes(p) })),
    ),
  )
  const complete = directionEvidence.filter((e) => e.polarity === 'strength')
  const connections = moves?.connections ?? []
  const objective = report.lessonContent?.statedObjective
  const objectiveHeard = !!(objective?.found && objective.quote && objective.timestampSec != null)
  const connectionEvidence: Evidence[] = [
    ...(objectiveHeard ? [evidenceFrom('obj', { quote: objective!.quote!, timestampSec: objective!.timestampSec! }, 'Objective', 'strength')] : []),
    ...connections.map((c, i) =>
      evidenceFrom(`con-${i}`, c, CONNECTION_LABEL[c.kind], 'strength'),
    ),
  ]
  const connectionKinds = [
    { label: 'Objective', heard: objectiveHeard, read: objective != null },
    { label: 'Prior learning', heard: connections.some((c) => c.kind === 'prior'), read: movesRan },
    { label: 'Why it matters', heard: connections.some((c) => c.kind === 'purpose'), read: movesRan },
    { label: 'Closing summary', heard: connections.some((c) => c.kind === 'closing'), read: movesRan },
  ]
  const connectionsRead = connectionKinds.every((k) => k.read)
  const clarityFindings: Finding[] = [
    {
      ...finding({
        key: 'directions',
        label: 'Directions',
        state: listState(moves?.directions, movesRan),
        value: movesRan ? `${complete.length} of ${directionEvidence.length} complete` : null,
        caveat: 'Complete means it named the task, steps, time and product',
        note: !movesRan ? 'This lesson was analyzed before directions were read.' : directions.length === 0 ? 'No directions were heard.' : undefined,
        evidence: directionEvidence,
        allNoun: 'directions',
      }),
      groups: [
        { label: `Named all four · ${complete.length}`, items: complete },
        { label: `Missing a part · ${directionEvidence.length - complete.length}`, items: directionEvidence.filter((e) => e.polarity === 'growth') },
      ],
    },
    {
      ...finding({
        key: 'lesson_connections',
        label: 'Lesson connections',
        state: !connectionsRead ? 'unavailable' : connectionEvidence.length > 0 ? 'measured' : 'confirmed_none',
        value: connectionsRead ? `${connectionKinds.filter((k) => k.heard).length} of 4` : null,
        note: !connectionsRead ? 'This lesson was analyzed before connections were read.' : undefined,
        evidence: connectionEvidence,
      }),
      // Each of the four said once, heard or not — a missing closing is
      // a finding, not a gap.
      groups: connectionKinds.map((k) => ({
        label: `${k.label} · ${!k.read ? 'not read' : k.heard ? 'heard' : 'none heard'}`,
        items: connectionEvidence.filter((e) => e.tag === k.label),
      })),
    },
  ]
  const clarityKeep = pickFeatured(complete)
  // The direction missing the most, and what it missed. Built from the
  // read, not written: there is no model-written suggestion for this section.
  const leastComplete = [...directionEvidence]
    .filter((e) => e.polarity === 'growth' && !e.withheld)
    .sort((a, b) => (a.elements?.filter((x) => x.on).length ?? 0) - (b.elements?.filter((x) => x.on).length ?? 0))[0]
  const missing = leastComplete?.elements?.filter((x) => !x.on).map((x) => x.label.toLowerCase()) ?? []
  const clarity: InsightsModel['clarity'] = {
    key: 'clarity',
    coach: null,
    findings: clarityFindings,
    keepTry: {
      keep: clarityKeep ? { text: 'One line told students the task, the steps, the time and the product.', line: clarityKeep } : null,
      tryNext: leastComplete
        ? {
            text: `Add the ${new Intl.ListFormat('en', { type: 'conjunction' }).format(missing)} to quick directions like this one.`,
            line: leastComplete,
          }
        : null,
    },
    directions: directions.map((d) => ({ timestampSec: d.timestampSec, parts: d.parts })),
  }

  // ---- 4. Climate & Routines
  const feedback = report.feedbackLog ?? []
  const feedbackEvidence = feedback.map((f, i) =>
    evidenceFrom(
      `fb-${i}`,
      { quote: f.text, timestampSec: f.timestampSec },
      f.kind === 'specific' ? 'Named what worked' : 'General',
      f.kind === 'specific' ? 'strength' : 'growth',
    ),
  )
  const specific = feedbackEvidence.filter((e) => e.polarity === 'strength')
  const redirections = moves?.redirections
  const redirectionEvidence = (redirections ?? []).map((r, i) =>
    evidenceFrom(
      `red-${i}`,
      r,
      r.clarity === 'actionable' ? 'Said what to do' : 'Named only what to stop',
      r.clarity === 'actionable' ? 'strength' : 'growth',
      [{ label: 'What to do', on: r.clarity === 'actionable' }],
    ),
  )
  const climateFindings: Finding[] = [
    {
      ...finding({
        key: 'specific_feedback',
        label: 'Specific feedback',
        state: report.feedbackLog == null ? 'unavailable' : feedback.length > 0 ? 'measured' : 'confirmed_none',
        value: report.feedbackLog == null ? null : `${specific.length} of ${feedback.length}`,
        note: report.feedbackLog != null && feedback.length === 0 ? 'No feedback moments were heard.' : undefined,
        evidence: feedbackEvidence,
      }),
      groups: [
        { label: `Specific · ${specific.length}`, items: specific },
        { label: `General · ${feedback.length - specific.length}`, items: feedbackEvidence.filter((e) => e.polarity === 'growth') },
      ],
    },
    finding({
      key: 'redirections',
      label: 'Redirections',
      state: listState(redirections, movesRan),
      value: movesRan ? String(redirectionEvidence.length) : null,
      note: !movesRan ? 'This lesson was analyzed before redirections were read.' : redirectionEvidence.length === 0 ? 'No redirections were heard.' : undefined,
      evidence: redirectionEvidence,
    }),
  ]
  const climateKeep = pickFeatured(specific)
  const climateTryLine = pickFeatured(feedbackEvidence.filter((e) => e.polarity === 'growth'), 'growth')
  const climate: SectionModel = {
    key: 'climate',
    coach: splitCoachNote(report.climateNarrative),
    findings: climateFindings,
    keepTry: {
      keep: climateKeep ? { text: 'Your feedback named what was working.', line: climateKeep } : null,
      tryNext: report.nextSteps?.climate ? { text: report.nextSteps.climate, line: climateTryLine } : null,
    },
  }

  // ---- 5. Content Lens
  const lc = report.lessonContent
  const notes = report.contentNotes?.notes ?? []
  const noteEvidence = (label: string, polarity: Polarity) =>
    notes
      .filter((n) => n.label === label)
      .map((n) =>
        // The note's text is the reading; the excerpt is the teacher's line.
        ({ ...evidenceFrom(`note-${n.id}`, { quote: n.excerpt, timestampSec: n.timestampSec }, label, polarity), why: n.text }),
      )
  const worked = noteEvidence('What worked', 'strength')
  const further = noteEvidence('Where it could go further', 'growth')
  const explanations = (moves?.explanations ?? []).map((e, i) =>
    evidenceFrom(`exp-${i}`, e, { example: 'Example', analogy: 'Analogy', vocabulary: 'Definition', modeling: 'Thinking aloud' }[e.kind], 'strength'),
  )
  const notesGenerated = report.contentNotes != null
  const contentFindings: Finding[] = [
    finding({
      key: 'what_worked',
      label: 'What worked',
      state: !notesGenerated ? 'unavailable' : worked.length > 0 ? 'measured' : 'confirmed_none',
      value: notesGenerated ? String(worked.length) : null,
      note: !notesGenerated ? 'Specialist notes have not been written for this lesson.' : worked.length === 0 ? 'No note named something that worked.' : undefined,
      evidence: worked,
    }),
    finding({
      key: 'take_it_further',
      label: 'Take it further',
      state: !notesGenerated ? 'unavailable' : further.length > 0 ? 'measured' : 'confirmed_none',
      value: notesGenerated ? String(further.length) : null,
      note: !notesGenerated ? undefined : further.length === 0 ? 'No note suggested a next step.' : undefined,
      evidence: further,
      prefer: 'growth',
    }),
    {
      ...finding({
        key: 'explanations',
        label: 'How you explained it',
        state: listState(moves?.explanations, movesRan),
        value: movesRan ? String(explanations.length) : null,
        note: !movesRan ? 'This lesson was analyzed before explanations were read.' : explanations.length === 0 ? 'None heard.' : undefined,
        evidence: explanations,
      }),
      groups: (['Definition', 'Example', 'Analogy', 'Thinking aloud'] as const)
        .map((tag) => ({ label: tag, items: explanations.filter((e) => e.tag === tag) }))
        .filter((g) => g.items.length > 0)
        .map((g) => ({ ...g, label: `${g.label}s · ${g.items.length}`.replace('Thinking alouds', 'Thinking aloud') })),
    },
  ]
  const terms = [...(lc?.keyTerms ?? [])]
    .filter((t) => t.teacherCount > 0)
    .sort((a, b) => b.teacherCount - a.teacherCount)
    .map((t) => ({ term: t.term, count: t.teacherCount }))
  const topic = lc?.summary?.trim() || lc?.subject || report.contentNotes?.subject || null
  const content: InsightsModel['content'] = {
    key: 'content_lens',
    coach: splitCoachNote(report.contentNarrative),
    findings: contentFindings,
    // Not yet: a Content Lens Keep / Try has to say something the notes
    // above do not, with a rewrite of the line, and nothing writes that yet.
    keepTry: { keep: null, tryNext: null },
    // No topic means the lesson's subject could not be read from the
    // teacher's speech: the section says so rather than guessing one.
    state: topic ? 'measured' : 'unavailable',
    topic,
    terms,
    leanedOn: terms.filter((t) => t.count >= 3).slice(0, 2).map((t) => t.term),
    guidance: {
      stuck: report.contentNotes?.misconceptions ?? [],
      waysIn: lc?.connectionIdeas ?? report.contentNotes?.connectionIdeas ?? [],
    },
    notesGenerated,
  }

  for (const section of [talk, questioning, clarity, climate, content]) featureOnce(section)
  return { talk, questioning, clarity, climate, content }
}

// --- what the coach notes are written from ------------------------------------

/// Lines per finding the notes see: the featured one first, then the rest.
const NOTES_EVIDENCE_PER_FINDING = 8

const SECTION_TITLE: Record<SectionKey, string> = {
  talk_pace: 'Talk & Pace',
  questioning: 'Questioning & Checking',
  clarity: 'Clarity',
  climate: 'Climate & Routines',
  content_lens: 'Content Lens',
}

/// The findings and their quotes, and nothing else, for the server to write
/// the coach notes from (server lib/insightsNotes.ts). Withheld lines are left
/// out: what a note can quote is what the page can show.
export function buildNotesInput(model: InsightsModel) {
  const findingFor = (f: Finding, forceUnavailable = false) => ({
    key: f.key,
    label: f.label,
    state: forceUnavailable ? ('unavailable' as const) : f.state,
    value: f.value,
    ...(f.caveat ? { caveat: f.caveat } : {}),
    evidence: [...(f.featured ? [f.featured] : []), ...f.evidence.filter((e) => e !== f.featured)]
      .filter((e) => !e.withheld)
      .slice(0, NOTES_EVIDENCE_PER_FINDING)
      .map((e) => ({
        id: e.id,
        tag: e.tag,
        polarity: e.polarity,
        quote: e.quote,
        time: mmss(e.timestampSec),
        ...(e.why ? { why: e.why } : {}),
      })),
  })
  const plain = (key: string, label: string, value: string) => ({ key, label, state: 'measured' as const, value, evidence: [] })
  const { talk, questioning, clarity, climate, content } = model
  return {
    sections: [
      {
        key: 'talk_pace' as const,
        title: SECTION_TITLE.talk_pace,
        findings: [
          ...(talk.talkPct != null ? [plain('talk_share', 'Your share of the recording', `${Math.round(talk.talkPct)}%`)] : []),
          ...(talk.wpm != null ? [plain('pace', 'Your pace', `${talk.wpm} words a minute`)] : []),
          ...talk.findings.map((f) => findingFor(f)),
        ],
      },
      { key: 'questioning' as const, title: SECTION_TITLE.questioning, findings: questioning.findings.map((f) => findingFor(f)) },
      { key: 'clarity' as const, title: SECTION_TITLE.clarity, findings: clarity.findings.map((f) => findingFor(f)) },
      { key: 'climate' as const, title: SECTION_TITLE.climate, findings: climate.findings.map((f) => findingFor(f)) },
      {
        key: 'content_lens' as const,
        title: SECTION_TITLE.content_lens,
        ...(content.topic ? { context: `Topic, read from the teacher's speech: ${content.topic}` } : {}),
        // No topic means no content lens: every finding goes unavailable so
        // the section gets no note rather than a guess.
        findings: content.findings.map((f) => findingFor(f, content.state === 'unavailable')),
      },
    ],
  }
}

/// Each line is featured once per section. Two findings can rest on the same
/// sentence — a question that is also a check — and featuring it under both
/// says one thing twice; the later finding shows its next-best line instead,
/// and keeps it only when it has nothing else.
function featureOnce(section: SectionModel): void {
  const used = new Set<number>()
  for (const f of section.findings) {
    if (!f.featured) continue
    if (used.has(f.featured.timestampSec)) {
      const others = f.evidence.filter((e) => !used.has(e.timestampSec))
      const next = pickFeatured(others, f.featured.polarity)
      if (next) f.featured = next
    }
    used.add(f.featured.timestampSec)
  }
}
