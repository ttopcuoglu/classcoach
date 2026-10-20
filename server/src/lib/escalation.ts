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
  /// Which expectation the bid is about. What makes "the same reminder
  /// again" a pattern rather than three unrelated asks.
  expectation: Expectation
  /// The teacher broke off an explanation of content to make it, and carried
  /// on with that explanation after. The model proposes it; the code only
  /// keeps it when there is teacher speech on both sides of the bid.
  interrupts: boolean
}

export const EXPECTATIONS = ['talking', 'devices', 'attention', 'work', 'movement', 'other'] as const
export type Expectation = (typeof EXPECTATIONS)[number]

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
  /// "Keeping learning on track": stretches of the lesson where reminders
  /// came as a pattern, not one at a time. Absent on reads made before it
  /// existed — the report falls back to the cluster line.
  episodes?: OnTrackEpisode[]
  /// Every ask that broke into an explanation and was followed by it
  /// resuming — including the single ones, which are routine and are shown
  /// as such rather than as a finding.
  interruptions?: { timestampSec: number; quote: string | null }[]
}

/// One stretch where the reminders were a pattern. Never carries a count:
/// within a stretch the number of bids is the part that wobbles between
/// readings, and "several" is all the copy needs.
export type OnTrackEpisode = {
  startSec: number
  endSec: number
  /// The expectation most of the stretch was about, when one was — null when
  /// the reminders were about different things.
  expectation: Expectation | null
  /// Teacher broke off an explanation to make more than one of these asks.
  interruptedExplanation: boolean
  /// Three or more asks inside 45 seconds: the first did not hold.
  quickRepeats: boolean
  climbed: boolean
  /// Her own words say she was repeating herself.
  backReference: boolean
  /// The one moment shown first; null timestamp never, quote null when the
  /// wording could not be trusted.
  lead: { quote: string | null; timestampSec: number }
  /// The other asks of the stretch, for "More evidence". Unquotable ones are
  /// dropped here — the lead already stands for the moment.
  more: { quote: string; timestampSec: number }[]
  /// The copy, written here so web and iOS say the same thing.
  title: string
  /// A short explanation of the pattern. Says when student response cannot be
  /// heard, because a recording of the teacher cannot tell whether they settled.
  pattern: string
  /// One practical next step, only when the pattern is specific enough to
  /// point at one. Null is the honest answer for the rest.
  nextStep: string | null
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

Say which EXPECTATION the bid is about:
- talking — voices, side conversations, noise, volume: "one voice", "keep it down", "shh".
- devices — phones, Chromebooks, screens used off-task: "phones away", "close your Chromebooks".
- attention — eyes, listening, facing the front: "eyes up here", "I need you listening".
- work — getting back to or staying on the task: "back to your work", "you should be on question three".
- movement — seats, standing, hands, wandering: "sit down", "back in your seat".
- other — anything else.

Say whether the bid INTERRUPTS AN EXPLANATION: look at the teacher's lines just before and just after it. Yes when the teacher was explaining or teaching content before the bid and goes straight back to that same content after it — the bid is a break inside the explanation, often in the same breath ("Gotta keep it down, everybody. So the river changed direction..."). No when the class is doing independent or group work, between activities, or when the bid starts something new.

Then say whether the bid BACK-REFERENCES an earlier ask — whether the teacher's own words show she is repeating herself: "Like I said...", "What did I say?", "Again...", "How many times...", "I already asked you". Answer yes only when the words carry it. Do not infer it from the bid merely resembling an earlier one.

Rules that matter more than finding things:
- Copy the words verbatim. A sentence the teacher did not say is dropped.
- Be exhaustive, in the order they happen. A lesson with eight bids comes back with eight, not the three clearest.
- NONE is a real answer, and is the right answer for a calm lesson. Never stretch a direction or a transition into a bid to fill the list.
- Ignore anything a student said. You are reading the teacher only.
- Do not count, compare, or draw a conclusion about the pattern. List the bids only; something else does the arithmetic.

Write nothing outside these tags:
<bids>
one per line as: sentence @ m:ss | rung | expectation | interrupts yes or no | back-reference yes or no
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
  if (!body || body.toUpperCase().includes('NONE')) return []
  const { flat, offsets } = flattenTeacherSpeech(inScopeSegments(segments))
  const bids: AttentionBid[] = []
  const seen = new Set<string>()
  for (const line of body.split('\n')) {
    if (!line.trim()) continue
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
    // Older four-column replies put back-reference third; read by position
    // only when all five came back.
    const fiveColumns = parts.length >= 5
    const expectationText = fiveColumns ? (parts[2] ?? '').trim().toLowerCase() : ''
    const expectation = EXPECTATIONS.find((e) => expectationText.includes(e)) ?? 'other'
    const claimed = match[2] ? Number(match[2]) * 60 + Number(match[3]) : 0
    const timestampSec = startSecAtOffset(offsets, offset) ?? claimed
    // One run split a single bid into two lines at the same timestamp with
    // the same rung, which inflated a cluster. Same moment, same rung, once.
    const key = `${Math.round(timestampSec)}:${rung}`
    if (seen.has(key)) continue
    seen.add(key)
    bids.push({
      quote,
      timestampSec,
      rung,
      expectation,
      interrupts: fiveColumns && /\byes\b/i.test(parts[3] ?? ''),
      backReference: /\byes\b/i.test(parts[fiveColumns ? 4 : 2] ?? ''),
    })
    if (bids.length >= MAX_BIDS) break
  }
  bids.sort((a, b) => a.timestampSec - b.timestampSec)
  return confirmInterruptions(bids, inScopeSegments(segments))
}

/// How near the explanation has to be on each side of the bid for "stopped
/// to address behavior, then resumed" to be something the transcript shows.
const RESUME_WINDOW_SEC = 30
/// Enough words to be teaching rather than another short ask.
const MIN_EXPLANATION_WORDS = 6

/// Keeps the model's "interrupts" only where the teacher can be heard
/// talking on both sides of the ask. The model judges whether that talk is
/// an explanation; the code checks that there is any talk there at all,
/// which is the half a model gets wrong by imagining it.
export function confirmInterruptions(bids: AttentionBid[], teacherSegments: Segment[]): AttentionBid[] {
  const bidQuotes = bids.map((b) => normalizeForMatch(b.quote))
  const remainder = (s: Segment) => {
    let text = normalizeForMatch(s.text)
    for (const q of bidQuotes) if (q) text = text.split(q).join(' ')
    return text
  }
  const words = (text: string) => text.split(/\s+/).filter((w) => /[a-z0-9]/.test(w)).length
  return bids.map((bid) => {
    if (!bid.interrupts) return bid
    const own = teacherSegments.find((s) => Math.abs(s.startSec - bid.timestampSec) < 0.01)
    let before = false
    let after = false
    if (own) {
      // "Gotta keep it down, everybody. So climate change basically caused
      // the people to move." — the resumption is in the same segment.
      const full = normalizeForMatch(own.text)
      const at = full.indexOf(normalizeForMatch(bid.quote))
      if (at > -1) {
        before = words(full.slice(0, at)) >= MIN_EXPLANATION_WORDS
        after = words(full.slice(at + normalizeForMatch(bid.quote).length)) >= MIN_EXPLANATION_WORDS
      }
    }
    for (const s of teacherSegments) {
      if (s === own) continue
      if (words(remainder(s)) < MIN_EXPLANATION_WORDS) continue
      if (s.startSec < bid.timestampSec && s.startSec >= bid.timestampSec - RESUME_WINDOW_SEC) before = true
      if (s.startSec > bid.timestampSec && s.startSec <= bid.timestampSec + RESUME_WINDOW_SEC) after = true
    }
    return before && after ? bid : { ...bid, interrupts: false }
  })
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

/// Asks this close together belong to one stretch of the lesson. Wider than
/// CLUSTER_WINDOW_SEC on purpose: that asks "did the first ask hold", this
/// asks "was the same thing coming back", and a reminder about talking two
/// minutes after the last one is the same thing coming back.
const EPISODE_GAP_SEC = 120

/// Two interruptions to the same explanation are a pattern. One is a
/// teacher dealing with something and carrying on, which is routine.
const MIN_INTERRUPTIONS = 2

/// How far back "Like I said" can reach for the ask it is repeating. One real
/// lesson: "I want it to be silent" at 12:15, "Like I said, independent and
/// silent" at 16:50.
const BACK_REFERENCE_REACH_SEC = 600

/// "Keeping learning on track": the stretches where reminders came as a
/// pattern. A stretch counts when it has three or more asks about the same
/// expectation, an ask that needed repeating within seconds, or more than one
/// break in an explanation. Everything else is a routine reminder, and the
/// report says so rather than making a finding of it.
export function findEpisodes(bids: AttentionBid[]): OnTrackEpisode[] {
  const runs: AttentionBid[][] = []
  let current: AttentionBid[] = []
  for (const bid of bids) {
    const last = current[current.length - 1]
    if (last && bid.timestampSec - last.timestampSec > EPISODE_GAP_SEC) {
      runs.push(current)
      current = []
    }
    current.push(bid)
  }
  if (current.length) runs.push(current)

  const episodes: OnTrackEpisode[] = []
  for (const run of runs) {
    const counts = new Map<Expectation, number>()
    for (const b of run) if (b.expectation !== 'other') counts.set(b.expectation, (counts.get(b.expectation) ?? 0) + 1)
    const [topExpectation, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
    const sameExpectation = topCount >= MIN_CLUSTER_BIDS
    const interruptions = run.filter((b) => b.interrupts)
    const interruptedExplanation = interruptions.length >= MIN_INTERRUPTIONS
    const quickRepeats = findClusters(run).length > 0
    if (!sameExpectation && !interruptedExplanation && !quickRepeats) continue

    // The moment shown first is the one that carries the pattern: an
    // interruption if that is the pattern, else an ask about the shared
    // expectation, else the highest rung — and quotable if any is.
    const pool = interruptedExplanation
      ? interruptions
      : sameExpectation
        ? run.filter((b) => b.expectation === topExpectation)
        : run
    const byForce = [...pool].sort((a, b) => RUNGS.indexOf(b.rung) - RUNGS.indexOf(a.rung) || a.timestampSec - b.timestampSec)
    const leadBid = byForce.find((b) => quoteOrNull(b.quote)) ?? byForce[0]
    const top = run.reduce((a, b) => (RUNGS.indexOf(b.rung) > RUNGS.indexOf(a.rung) ? b : a))

    episodes.push(withCopy({
      startSec: run[0].timestampSec,
      endSec: run[run.length - 1].timestampSec,
      expectation: sameExpectation ? topExpectation : null,
      interruptedExplanation,
      quickRepeats,
      climbed: RUNGS.indexOf(top.rung) > RUNGS.indexOf(run[0].rung),
      backReference: run.some((b) => b.backReference),
      lead: { quote: quoteOrNull(leadBid.quote), timestampSec: leadBid.timestampSec },
      more: run
        .filter((b) => b !== leadBid)
        .map((b) => ({ quote: quoteOrNull(b.quote), timestampSec: b.timestampSec }))
        .filter((m): m is { quote: string; timestampSec: number } => m.quote != null),
    }))
  }

  // "Like I said..." is her own testimony that an earlier ask did not hold,
  // and the earlier ask is often minutes back — further than one stretch
  // reaches. Joined to the last earlier ask about the same thing, that pair is
  // a finding even when nothing else is.
  const covered = (b: AttentionBid) => episodes.some((e) => b.timestampSec >= e.startSec && b.timestampSec <= e.endSec)
  for (const repeat of bids) {
    if (!repeat.backReference || repeat.expectation === 'other' || covered(repeat)) continue
    const earlier = bids.filter(
      (b) =>
        b !== repeat &&
        b.expectation === repeat.expectation &&
        b.timestampSec < repeat.timestampSec &&
        repeat.timestampSec - b.timestampSec <= BACK_REFERENCE_REACH_SEC,
    )
    if (earlier.length === 0) continue
    episodes.push(withCopy({
      startSec: earlier[0].timestampSec,
      endSec: repeat.timestampSec,
      expectation: repeat.expectation,
      interruptedExplanation: false,
      quickRepeats: false,
      climbed: false,
      backReference: true,
      lead: { quote: quoteOrNull(repeat.quote), timestampSec: repeat.timestampSec },
      more: earlier
        .map((b) => ({ quote: quoteOrNull(b.quote), timestampSec: b.timestampSec }))
        .filter((m): m is { quote: string; timestampSec: number } => m.quote != null),
    }))
  }

  // Strongest first: the pattern the brief calls most useful — the same
  // reminder breaking into an explanation — then any break in explanation,
  // then the rest in lesson order.
  const weight = (e: OnTrackEpisode) =>
    (e.interruptedExplanation ? 4 : 0) + (e.expectation ? 2 : 0) + (e.quickRepeats ? 1 : 0) + (e.backReference ? 1 : 0)
  return episodes.sort((a, b) => weight(b) - weight(a) || a.startSec - b.startSec)
}

const EXPECTATION_PHRASE: Record<Exclude<Expectation, 'other'>, string> = {
  talking: 'talking',
  devices: 'phones and devices',
  attention: 'paying attention',
  work: 'getting back to the work',
  movement: 'staying in seats',
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

type EpisodeFacts = Omit<OnTrackEpisode, 'title' | 'pattern' | 'nextStep'>

/// Title, explanation and next step from the episode's facts. No counts, ever
/// — "several" is what the evidence can carry — and a next step only where the
/// pattern names what to change.
export function withCopy(e: EpisodeFacts): OnTrackEpisode {
  const phrase = e.expectation && e.expectation !== 'other' ? EXPECTATION_PHRASE[e.expectation] : null
  const span = Math.round(e.startSec) === Math.round(e.endSec) ? `At ${mmss(e.startSec)}` : `Between ${mmss(e.startSec)} and ${mmss(e.endSec)}`
  const unheard = 'Whether students settled each time can’t be heard on the recording.'

  let title: string
  let pattern: string
  let nextStep: string | null = null
  if (e.interruptedExplanation) {
    title = phrase ? `Reminders about ${phrase} broke into your explanation` : 'Your explanation kept stopping for behavior'
    pattern = `${span} you stopped your explanation more than once to address behavior${phrase ? ` (mostly ${phrase})` : ''}, then picked it back up. ${unheard}`
    nextStep =
      e.expectation === 'talking'
        ? 'Before the next explanation, set the voice level once and wait for it to hold before you start, so it doesn’t need saying mid-sentence.'
        : 'Before you start explaining, wait until the room is with you. A pause before the explanation costs less than breaks in the middle of it.'
  } else if (e.quickRepeats) {
    title = 'It took several asks to get the room back'
    pattern = `${span} you asked several times in quick succession${phrase ? ` about ${phrase}` : ''}: the first ask didn’t hold${
      e.climbed ? ', and the asks grew firmer as they went' : ''
    }. ${unheard}`
    nextStep = e.climbed
      ? 'Decide ahead of time what follows a second reminder, so a third ask doesn’t have to carry more force.'
      : 'Give one attention cue, then wait in silence until it holds before you say it again.'
  } else if (e.backReference && phrase) {
    title = `The same ask about ${phrase} came back`
    pattern = `${span} an expectation about ${phrase} needed saying again, and your own words said so.`
    nextStep = 'The second time an expectation needs saying, describe what it looks like right now (“pens moving, no voices”) rather than repeating it.'
  } else {
    title = phrase ? `Reminders about ${phrase} kept coming back` : 'Reminders kept coming back'
    pattern = `${span} reminders${phrase ? ` about ${phrase}` : ''} came back several times within a few minutes — a possible sign the expectation was hard to hold in that part of the lesson.`
  }
  if (e.backReference && !pattern.includes('your own words')) pattern += ' Your own words said you were repeating an earlier ask.'
  return { ...e, title, pattern, nextStep }
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
  /// For tryEscalation's --bids: every bid the read kept, before grouping.
  onBids?: (bids: AttentionBid[]) => void,
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
    onBids?.(bids)
  } catch (error) {
    console.error('[escalation] read failed:', error)
    return null
  }

  const clusters = findClusters(bids)
  const repeats = bids.filter((b) => b.backReference)
  const episodes = findEpisodes(bids)
  const found = clusters.length > 0 || repeats.length > 0 || episodes.length > 0

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
      episodes: [],
      interruptions: bids.filter((b) => b.interrupts).map((b) => ({ timestampSec: b.timestampSec, quote: quoteOrNull(b.quote) })),
    }
  }

  return {
    state: 'found',
    reason: null,
    peakRung: peakRung(bids),
    clusters,
    repeatedAsks: repeats.map((b) => ({ timestampSec: b.timestampSec, quote: quoteOrNull(b.quote) })),
    capturedSharePct: pct,
    episodes,
    interruptions: bids.filter((b) => b.interrupts).map((b) => ({ timestampSec: b.timestampSec, quote: quoteOrNull(b.quote) })),
  }
}

function notMeasurableReason(pct: number | null): string {
  const heard = pct == null ? 'Too little of this recording' : `Only about ${pct}% of this recording`
  return `${heard} came through as speech the microphone could resolve, so this can't tell you whether attention held. A quiet transcript here means the mic lost the room — group work, distance, voices over each other — not that the room was quiet.`
}
