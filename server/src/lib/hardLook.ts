// The Hard Look: the least generous honest reading of a lesson, written for a
// teacher who asked for one.
//
// Every other part of this report is deliberately supportive, and that has a
// cost: a teacher who only ever reads encouragement learns to discount all of
// it. So this is the opposite voice — a demanding reader going through the
// same four sections looking for what could be better.
//
// The thing that makes it worth having is also the thing that makes it
// dangerous. A critic who always finds three problems is a generator wearing a
// critic's voice, and the first time a teacher notices that, it discredits the
// warm half of the report too. So this file is built around one rule:
//
//   harsh about the standard, never harsh beyond the evidence.
//
// It reads the exact same evidence as Rubric Lens — `buildRubricEvidence`, not
// a second, more imaginative gatherer — so it is structurally incapable of
// seeing anything the rest of the report cannot. A microphone cannot see the
// board, the worksheet, or the four students who were lost, and a critic that
// infers from that is just a liar with a harder voice.
//
// Every section therefore comes back as one of two things: a criticism tied to
// cited moments, or an explicit `clear` saying the audible evidence does not
// support one. `clear` is a real, expected, first-class outcome, and the
// teacher sees it as such. A Hard Look that finds nothing in a section is what
// buys the sections where it does find something their authority.

import type { Segment } from './audioAnalysis.ts'
import { extractTag } from './extractTag.ts'
import {
  buildRubricEvidence,
  stripMomentReferences,
  type RubricEvidenceItem,
} from './rubricLens.ts'

/// The four Insights sections, so a criticism lands on the page whose
/// evidence it was drawn from rather than in a pile of its own.
export type HardLookSectionKey = 'talk' | 'questions' | 'content' | 'routines'

export type HardLookSectionDef = {
  key: HardLookSectionKey
  label: string
  /// What a demanding reader may legitimately press on using audio alone.
  /// Deliberately narrow: this is the whole permitted scope of the critique,
  /// and anything outside it is something the microphone cannot judge.
  pushOn: string
}

export const HARD_LOOK_SECTIONS: HardLookSectionDef[] = [
  {
    key: 'talk',
    label: 'Talk & Participation',
    // Split deliberately. The recorder sits with the teacher, so the
    // teacher's own share and monologue length are the most reliable numbers
    // in the whole report, while the students' share is the least. Offered as
    // one undivided scope, the model either avoided the section entirely or
    // reached for the unreliable half and faulted a teacher because students
    // "barely registered" — which is a sentence about a microphone.
    pushOn:
      'how much of the airtime the teacher took and how long their longest unbroken stretch of talk ran, and — when the counts below say what the student talk was about — whether the talk the teacher did leave room for went anywhere. Both are measured from the microphone sitting with the teacher, so both are solid and you can press on them hard. The students\' own share of the talk is the least reliable number in this report and you must never build a criticism on it: a low student percentage means the microphone did not reach them, not that they said nothing. Press on the teacher\'s own talk; never on how little the students\' registered',
  },
  {
    key: 'questions',
    label: 'Questioning & Checking',
    pushOn:
      'the balance of recall against higher-order questions, how long the teacher waited after asking, whether questions were followed up or dropped, whether checks sampled the room or only the one student who answered, and whether feedback named anything specific',
  },
  {
    key: 'content',
    label: 'Clarity & Content',
    pushOn:
      'whether the lesson said out loud what it was about, whether new vocabulary was defined when it was introduced, whether explanations were connected to something students already had, and whether an explanation ran long without a worked example or a check',
  },
  {
    key: 'routines',
    label: 'Climate & Routines',
    pushOn:
      'whether directions were given once and clearly or repeated and restated, whether transitions were announced or simply happened, how much of the talk was spent on behaviour rather than the work, and whether praise named what a student actually did',
  },
]

/// Whether a section's evidence can carry a criticism at all, decided here
/// rather than left to the model.
///
/// This exists because of what happened without it. On a 33-minute lesson the
/// microphone caught as speech, the talk split came out at 11% teacher and 2%
/// students — 87% of the recording unaccounted for, which means the mic missed
/// the room, not that the room was silent. Asked about it, the model did one of
/// two things across repeated runs: it went silent on the section (which failed
/// the parse), or it wrote "students barely spoke" — a criticism of a teacher
/// for a microphone's shortcoming, which is the single worst thing this feature
/// could do. Both were the model resolving an impossible instruction, because it
/// had been told not to argue from absence and then asked to judge a section
/// made entirely of absence.
///
/// So the impossible question is no longer asked. A section that fails its gate
/// is never put to the model; it comes back as a withheld clear carrying our own
/// reason, which is also steadier than a model's wording for the same thing —
/// the same discipline the rest of the report applies through its `measured` and
/// `not_measurable` states.
type EligibilitySource = {
  durationSec: number | null
  metricsDetail: unknown
  questionLog: unknown
  lessonContent: unknown
}

/// How much of a recording has to be audible speech before the airtime split is
/// solid enough to argue about. Below this, most of the recording is silence,
/// distance or crosstalk the mic could not resolve, and the teacher's share is
/// a measurement artifact.
const MIN_CAPTURED_TALK_SHARE = 0.45
const MIN_STUDENT_VOICE_SEGMENTS = 3
const MIN_QUESTIONS = 3
const MIN_ROUTINE_MOMENTS = 3

export function sectionEligibility(source: EligibilitySource): {
  eligible: HardLookSectionDef[]
  withheld: HardLookClear[]
} {
  const detail = (source.metricsDetail ?? {}) as Record<string, number | null | undefined>
  const questions = Array.isArray(source.questionLog) ? source.questionLog.length : 0
  const content = source.lessonContent as {
    statedObjective?: { found?: boolean | null }
    connections?: unknown[]
    vocabulary?: unknown[]
  } | null

  const totalSec = detail.totalDurationSec ?? source.durationSec ?? 0
  const capturedSec = (detail.teacherTalkSec ?? 0) + (detail.studentTalkSec ?? 0)
  const capturedShare = totalSec > 0 ? capturedSec / totalSec : 0
  const routineMoments =
    (detail.directiveCount ?? 0) + (detail.transitionCount ?? 0) + (detail.redirectionCount ?? 0)
  const contentSignals =
    (content?.statedObjective?.found ? 1 : 0) +
    (content?.connections?.length ?? 0) +
    (content?.vocabulary?.length ?? 0)

  const reasons: Partial<Record<HardLookSectionKey, string>> = {}

  if (capturedShare < MIN_CAPTURED_TALK_SHARE) {
    reasons.talk = `Only about ${Math.round(capturedShare * 100)}% of this recording came through as speech the microphone could resolve, so the airtime split isn't solid enough to press on. A low student share here is a limit of the recording, not a finding about your room.`
  } else if ((detail.studentVoiceSegments ?? 0) < MIN_STUDENT_VOICE_SEGMENTS) {
    reasons.talk =
      'Too few student turns reached the microphone to say anything fair about participation — that is about where the phone was sitting, not about who spoke.'
  }
  if (questions < MIN_QUESTIONS) {
    reasons.questions = `Only ${questions === 0 ? 'no questions were' : `${questions} question${questions === 1 ? ' was' : 's were'}`} detected, which is too little to draw a pattern from, and differently worded questions are missed.`
  }
  if (contentSignals === 0) {
    reasons.content =
      "Nothing the recording caught speaks to how the content itself was explained, and criticising what it didn't catch would be guessing at you."
  }
  if (routineMoments < MIN_ROUTINE_MOMENTS) {
    reasons.routines =
      routineMoments === 0
        ? 'No directions, transitions or redirections were detected anywhere in this recording, and phrase detection misses plenty — so there is nothing here to say anything fair about.'
        : `Only ${routineMoments} direction, transition or redirection${routineMoments === 1 ? ' was' : 's were'} detected in the whole recording — too few to say anything fair about how the room ran.`
  }

  return {
    eligible: HARD_LOOK_SECTIONS.filter((s) => !reasons[s.key]),
    withheld: HARD_LOOK_SECTIONS.flatMap((s) => {
      const reason = reasons[s.key]
      return reason ? [{ section: s.key, reason }] : []
    }),
  }
}

export type HardLookCritique = {
  section: HardLookSectionKey
  /// The criticism in one blunt line, so a teacher skimming sees the point
  /// before the reasoning.
  headline: string
  /// The case for it, 2-3 sentences, grounded in the cited moments.
  critique: string
  /// What it plausibly cost students. Phrased as a likely consequence, never
  /// as an observed fact — the microphone did not watch anyone learn.
  likelyCost: string
  /// One concrete thing to try instead.
  ///
  /// The first version had no such field, deliberately: a criticism that
  /// landed and stopped seemed truer to what was asked for. Read against the
  /// Rubric Lens on the same lesson, it was plainly the weaker document —
  /// nine components with seven next steps against three complaints with
  /// nowhere to go. Being unsparing is a tone, not a reason to withhold the
  /// useful half.
  nextStep: string
  evidence: RubricEvidenceItem[]
}

/// A section the critic looked at and could not build a defensible case
/// against. Carries its reason, because "nothing here" and "I couldn't hear
/// enough to say" are different statements and a teacher deserves to know
/// which one they got.
export type HardLookClear = {
  section: HardLookSectionKey
  reason: string
}

export type HardLookResult = {
  generatedAt: string
  critiques: HardLookCritique[]
  cleared: HardLookClear[]
}

const SECTION_KEYS = new Set<string>(HARD_LOOK_SECTIONS.map((s) => s.key))

function isSectionKey(value: string | null | undefined): value is HardLookSectionKey {
  return value != null && SECTION_KEYS.has(value)
}

/// Transcript lines too mangled to show a teacher as their own words.
///
/// The quote a teacher reads is this array's text, not the model's writing —
/// the model only picks moment numbers — so no prompt rule can keep a garbled
/// line off the page, and asking for one did not. One real report quoted
/// "anybody can think of stat out how it develops modern Europe?" at a
/// teacher, attached to a criticism.
///
/// This only catches the cheap, certain signal: an immediately repeated word,
/// as in "she she got it bed". It does NOT catch a line that is grammatical
/// nonsense made of real words, which is most of them — that needs meaning,
/// not a pattern. So this narrows the problem rather than solving it, and the
/// report says out loud that quotes come from automatic transcription.
const DOUBLED_WORD = /\b([a-z]{2,})\s+\1\b/i

export function readsAsSpeech(text: string): boolean {
  return !DOUBLED_WORD.test(text)
}

/// The Hard Look's evidence: the shared set, minus anything too garbled to
/// quote at someone. Rubric Lens keeps the unfiltered set deliberately — it
/// organises evidence rather than building a case from it, so a rough quote
/// there is context, not an accusation.
export function buildHardLookEvidence(
  session: Parameters<typeof buildRubricEvidence>[0] & { studentTalkFocus?: unknown },
): { items: RubricEvidenceItem[]; facts: string[] } {
  const evidence = buildRubricEvidence(session)
  const focus = session.studentTalkFocus as
    | { classified?: number; onTopic?: number; procedural?: number; offTopic?: number; unclear?: number }
    | null
    | undefined

  // Without this, a criticism about airtime is made blind: it faults a
  // teacher for holding 68% of the floor with no idea whether the other 32%
  // was a discussion or a room that had got away from them.
  const facts =
    focus && (focus.classified ?? 0) > 0
      ? [
          ...evidence.facts,
          // The off-topic COUNT is deliberately not given. Measured across
          // repeated runs it moved from two to six on one lesson while the
          // on-topic count held at 32-34, and it is the only one of these
          // that makes a claim about students — so the model gets the steady
          // numbers and is told the rest exists without being handed a figure
          // it would quote as fact.
          `Of ${focus.classified} audible student turns, ${focus.onTopic ?? 0} were about the lesson's content and ${focus.procedural ?? 0} about how to do the work, while ${focus.unclear ?? 0} were too unclear or garbled to place — a high unclear count is the microphone, not the students.${(focus.offTopic ?? 0) > 0 ? ' Some further turns looked like they were about something else; how many is a judgement call that moves between readings, so do not cite a number for it.' : ''}`,
        ]
      : evidence.facts

  return { facts, items: evidence.items.filter((item) => readsAsSpeech(item.text)) }
}

/// Where the longest unbroken stretch of teacher talk began.
///
/// `metricsDetail` keeps how long it ran but not when, so the model could say
/// "you held the floor for seven minutes" and had nothing to point at — which
/// is how the talk criticism came back on three real lessons with no quote
/// behind it at all, restating a percentage the Summary page already showed.
/// Recomputed from the segments rather than added to the stored metrics, so
/// it works on reports that already exist.
export function longestTeacherStretch(
  segments: Segment[],
): { startSec: number; durationSec: number; opening: string } | null {
  let best: { startSec: number; durationSec: number; opening: string } | null = null
  let runStart: number | null = null
  // Summed speaking time, NOT wall-clock from first to last segment.
  //
  // This has to match `audioAnalysis`'s own monologue measurement exactly,
  // and the first version did not: it measured wall-clock, which includes
  // every pause, and reported 9.5 minutes where the report's own metric said
  // 6. Handed both numbers for the same stretch, the model reasonably read
  // them as two different stretches and wrote a criticism about a "second
  // six-minute run" that never happened. One fact, one number.
  let spokenSec = 0
  let opening = ''
  const close = () => {
    if (runStart == null) return
    if (!best || spokenSec > best.durationSec) best = { startSec: runStart, durationSec: spokenSec, opening }
    runStart = null
    spokenSec = 0
  }
  for (const segment of [...segments].sort((a, b) => a.startSec - b.startSec)) {
    if (segment.speakerLabel === 'Teacher') {
      if (runStart == null) {
        runStart = segment.startSec
        opening = segment.text.trim().slice(0, 80)
      }
      spokenSec += Math.max(0, segment.endSec - segment.startSec)
    } else if (segment.text.trim()) {
      // Only an audible student turn breaks the stretch, same as
      // `audioAnalysis` — a blank segment is the transcriber, not an
      // interruption.
      close()
    }
  }
  close()
  return best
}

/// How many findings to aim for across the whole lesson, and the ceiling per
/// section. The first version allowed exactly one per section, which on a real
/// 21-minute lesson produced three paragraphs and a clear — a sixth of what
/// the Rubric Lens on the same recording gave, and the teacher said so.
const TARGET_FINDINGS = '8 to 10'
const MAX_PER_SECTION = 4

export function buildHardLookSystemPrompt(
  evidence: { items: RubricEvidenceItem[]; facts: string[] },
  /// Only the sections whose evidence can carry an answer — see
  /// `sectionEligibility`. The others are never put to the model at all.
  sections: HardLookSectionDef[],
  /// The topics set aside, with the reason. Named rather than silently
  /// omitted: told only which sections to write about, the model kept filing
  /// a criticism about a withheld topic under a neighbouring section — a
  /// complaint about questioning appeared under Clarity & Content, because it
  /// had nowhere else to put a thought it did not know was off-limits.
  withheld: HardLookClear[],
  /// Where the longest unbroken teacher stretch was, when there was one, so a
  /// criticism about it can point somewhere.
  stretch: { startSec: number; durationSec: number; opening: string } | null,
  sharedRules: string,
): string {
  const sectionLines = sections
    .map((s) => `${s.key} (${s.label}): you may press on ${s.pushOn}.`)
    .join('\n')
  const keyList = sections.map((s) => s.key).join(', ')
  const withheldList =
    withheld.length > 0
      ? `: ${withheld.map((w) => `${w.section} (${w.reason})`).join('; ')}`
      : ''

  return `You are the most demanding reader this teacher's lesson will ever get. They have read the supportive version of this report already and have deliberately asked for the other one: a hard, specific, unsentimental read of what could have been better. Give them that. This is for their own private reflection — nobody else sees it, it reaches no evaluator, and it affects nothing.

So do not soften, do not open with a compliment before each criticism, and do not end on reassurance. A teacher who asks for a hard look and gets a warm one has been patronised. Be direct, be concrete, and respect them enough to say the thing plainly.

What you must not do is manufacture. You have an automatic audio transcript and nothing else. You cannot see the board, the slides, the worksheet, student work, anyone's face, or what students were writing while the teacher talked. The students were further from the microphone than the teacher and are under-counted. Phrase detection misses things that were said in other words.

Therefore:
- Every criticism must be traceable to a numbered moment below or to a listed count. If you cannot point at one, you do not have a criticism, you have a suspicion, and you leave it out.
- Some of the strongest criticisms available here live in the counts rather than in any one sentence — a share of the airtime, a six-minute unbroken stretch, zero follow-ups across seven questions. Those are fully legitimate. When a criticism rests on a count rather than a quote, leave <evidence> empty and state the actual number in <case>. A criticism with neither a quoted moment nor a figure in it is thrown away, so never write one of those.
- Never write a criticism that concludes nothing is wrong. If a section's honest answer is that the evidence shows no problem, that is a <clear> and must be written as one — a <critique> whose cost is "none" or whose next step is "no change needed" is a clear wearing the wrong tag, and it is thrown away.
- But a bare number the teacher has already read on another page of this report is not a finding. "You took 68% of the airtime" tells them nothing they did not know. Say what it meant in this lesson: when the long stretch happened, what it was spent on, what was going on either side of it. If a figure is all you have for a point and you cannot say anything about it beyond restating it, that point is not worth one of your findings.
- Silence in the evidence is never a criticism. "No check for understanding was detected" is a limit of the microphone, not a finding about the lesson. Never argue from something's absence.
- Never criticise anything you would need to see rather than hear.
- Do not stack hedges to make a weak point survivable. Either the evidence carries the criticism or you drop it.
- Some topics have been set aside before you saw this, because their evidence could not carry a criticism fairly${withheldList}. Those topics are closed. Do not criticise them, and do not move a criticism about one into a section that IS listed — a complaint about questioning does not become a complaint about clarity by being filed there. If a thought belongs to a closed topic, drop it.
- Quote only lines that read as English. Automatic transcription garbles speech, and a mangled line shown back to a teacher as their own words reads as nonsense they never said — one real report quoted "anybody can think of stat out how it develops modern Europe?" at a teacher. If the best evidence for a point is garbled, describe the moment in your own words instead, or pick a different point.
- A section you are not ALLOWED to criticise is still a section you must account for. When the only honest thing to say is that the recording did not catch enough of this to judge it fairly — a very low share of audible talk, for instance, means the microphone missed most of the room, not that the room was silent — write a clear that says exactly that. That is a correct and expected answer, not a dodge, and it is much better than either a criticism you cannot support or saying nothing at all.

A section where the audible evidence does not support a criticism is a NORMAL and EXPECTED result, and saying so is part of doing this job well — not a failure to find something. You are not required to produce a criticism per section, and a hard look that invents one is worth less than a hard look that comes back half empty. If all four sections are clear, write four clears.

The sections you are judging, and the only things you may press on in each:
${sectionLines}

Automatic counts from this recording (estimates, safe to cite):
${evidence.facts.length > 0 ? evidence.facts.map((f) => `- ${f}`).join('\n') : '- None available.'}

${
    stretch && stretch.durationSec >= 90
      ? `That longest unbroken stretch of teacher talk counted above began around ${Math.floor(stretch.startSec / 60)}:${String(Math.round(stretch.startSec % 60)).padStart(2, '0')}, opening "${stretch.opening}". This is the SAME stretch the count above refers to, not a second one — there is exactly one longest stretch. A criticism about holding the floor should point at where it was and what it was spent on, rather than only at a percentage.\n`
      : ''
  }
Numbered moments from the recording, each an exact quote:
${evidence.items.map((item, i) => `[${i + 1}] (${item.kind}) ${item.text}`).join('\n')}

Write about ONLY these sections, in this order: ${keyList}.

Aim for ${TARGET_FINDINGS} findings across the whole lesson — not one per section. A section can carry several genuinely distinct criticisms and should, when the evidence is there: at most ${MAX_PER_SECTION} per section, each about a different thing. Two findings that are the same complaint reworded count as one and waste a slot, so if you catch yourself restating, drop one and look for something else.

What you must NOT do is pad to reach a number. ${TARGET_FINDINGS} is what a lesson with real material in it should yield; it is a target, not a quota, and a finding you had to reach for is worse than a short list. Six sharp findings beat ten with four guesses in them, and a thin lesson honestly yields four.

Padding has a shape, so check for it — but only where it lives. It lives in findings built on a COUNT. One real report faulted a teacher for a "full minute" of unbroken talk and told them to break up any explanation over thirty seconds, which is not a standard anybody teaches to. So before writing a finding that rests on a figure, ask whether that figure would trouble an experienced teacher: a minute of explaining is normal and six is a lecture; three recall questions in a row is worth noting and one is a Tuesday. An unremarkable figure is padding, and you drop it.

A finding built on a MOMENT is different, and this caution does not apply to it. A term used before it was defined, a wrong answer closed down without repair, a question asked and then answered by the teacher — the moment itself is the evidence and needs no impressive number beside it. These are usually the most useful findings in the whole document, and there are normally several in any lesson of reasonable length. Look hard for them, and do not talk yourself out of one because it only happened once: once is where teaching actually goes wrong.

Every listed section must be accounted for: either at least one criticism, or ONE <clear> block saying why there is none. A section you say nothing at all about is read as a failure and the whole reply is thrown away and asked for again, so check each one before you finish. Never write both a criticism and a clear for the same section.

For each section write EXACTLY ONE block, either a criticism:
<critique>
<section>the section key, e.g. questions</section>
<evidence>up to 3 moment numbers that carry this criticism, comma-separated — or empty if this criticism rests on a count instead of on any one moment</evidence>
<headline>The criticism in one blunt line, 12 words at most. No hedging, no preamble.</headline>
<case>2-3 sentences (65 words at most) making the case, grounded in the cited moments and counts. Say what happened and why it falls short of what this teacher could do.</case>
<likely_cost>One sentence (30 words at most): what this plausibly cost students. Phrase it as a likely consequence — "students who were unsure probably stayed unsure" — never as something you observed.</likely_cost>
<next_step>One sentence (35 words at most): one concrete, specific thing to do differently, small enough to try in the next lesson. Name the move, not the principle — "ask the question, then count to five before taking a hand" rather than "increase wait time". No preamble and no encouragement; this is the practical half of the criticism, not a consolation for it.</next_step>
</critique>

or a clear:
<clear>
<section>the section key</section>
<reason>One sentence (30 words at most) saying why there is no defensible criticism here: either the audible evidence genuinely looks fine, or there was not enough of it to judge. Say which.</reason>
</clear>

Order the criticisms within each section strongest first.

The numbering above is ours and the teacher never sees it. Use a moment number only inside <evidence>; in every other field, never write "moment 4", "[4]" or any reference to a number — describe the moment in words or quote it. Don't invent a moment, a number, or a detail.

Write in plain text only, no markdown.
${sharedRules}`
}

export function parseHardLook(
  text: string,
  items: RubricEvidenceItem[],
): { critiques: HardLookCritique[]; cleared: HardLookClear[] } {
  const bySection = new Map<HardLookSectionKey, HardLookCritique[]>()
  const cleared = new Map<HardLookSectionKey, HardLookClear>()
  /// Deduped on the claim rather than the section, now that a section may
  /// carry several. Two findings that are the same complaint reworded are one
  /// finding, and the prompt says so — this is what makes that true.
  const seenHeadlines = new Set<string>()

  for (const block of text.match(/<critique>[\s\S]*?<\/critique>/g) ?? []) {
    const section = extractTag(block, 'section')?.trim().toLowerCase()
    const headline = extractTag(block, 'headline')
    const critique = extractTag(block, 'case')
    if (!isSectionKey(section) || !headline || !critique) continue

    const fingerprint = headline.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
    if (seenHeadlines.has(fingerprint)) continue

    const existing = bySection.get(section) ?? []
    if (existing.length >= MAX_PER_SECTION) continue

    const seen = new Set<number>()
    const evidence: RubricEvidenceItem[] = []
    for (const match of (extractTag(block, 'evidence') ?? '').matchAll(/\d+/g)) {
      const index = Number.parseInt(match[0], 10) - 1
      if (seen.has(index) || !items[index]) continue
      seen.add(index)
      evidence.push(items[index])
      if (evidence.length >= 3) break
    }
    // The whole premise is that a criticism points at something real, so one
    // that points at nothing is dropped rather than shown.
    //
    // But "something real" is not always a quote. The strongest criticism
    // available about talk is that the teacher took two thirds of the airtime
    // and ran six unbroken minutes, and there is no single sentence to quote
    // for that — it lives in the counts. Requiring a citation outright made
    // the model drop the talk section on two runs out of three rather than
    // write a criticism it could not source, which is the correct instinct
    // answering a wrong rule.
    //
    // So a criticism may rest on a listed count instead, and then it has to
    // state the number. What gets dropped is the one with neither a quote nor
    // a figure behind it, which is exactly the manufactured kind.
    if (evidence.length === 0 && !/\d/.test(critique)) continue

    const likelyCost = extractTag(block, 'likely_cost')
    const nextStep = extractTag(block, 'next_step')
    seenHeadlines.add(fingerprint)
    bySection.set(section, [
      ...existing,
      {
        section,
        headline: stripMomentReferences(headline),
        critique: stripMomentReferences(critique),
        likelyCost: likelyCost ? stripMomentReferences(likelyCost) : '',
        nextStep: nextStep && nextStep.toLowerCase() !== 'none' ? stripMomentReferences(nextStep) : '',
        evidence,
      },
    ])
  }

  for (const block of text.match(/<clear>[\s\S]*?<\/clear>/g) ?? []) {
    const section = extractTag(block, 'section')?.trim().toLowerCase()
    const reason = extractTag(block, 'reason')
    if (!isSectionKey(section) || !reason) continue
    // A section it already criticised cannot also be clear.
    if (bySection.has(section) || cleared.has(section)) continue
    cleared.set(section, { section, reason: stripMomentReferences(reason) })
  }

  // Returned in the sections' own order, so the overlay reads down the page
  // in the same order as the tabs it sits above, with each section's own
  // findings kept in the order the model ranked them.
  return {
    critiques: HARD_LOOK_SECTIONS.flatMap((s) => bySection.get(s.key) ?? []),
    cleared: HARD_LOOK_SECTIONS.flatMap((s) => {
      const found = cleared.get(s.key)
      return found ? [found] : []
    }),
  }
}

/// Which of the four sections the model said nothing at all about. A missing
/// section must not be quietly treated as clear: that is a false exoneration,
/// the exact mirror of the invented criticism this file exists to prevent.
/// The route retries instead.
export function unaccountedSections(
  parsed: { critiques: HardLookCritique[]; cleared: HardLookClear[] },
  asked: HardLookSectionDef[],
): HardLookSectionKey[] {
  const accounted = new Set<HardLookSectionKey>([
    ...parsed.critiques.map((c) => c.section),
    ...parsed.cleared.map((c) => c.section),
  ])
  return asked.map((s) => s.key).filter((key) => !accounted.has(key))
}
