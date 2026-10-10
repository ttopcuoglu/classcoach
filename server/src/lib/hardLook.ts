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
      'how much of the airtime the teacher took and how long their longest unbroken stretch of talk ran. Both are measured from the microphone sitting with the teacher, so both are solid and you can press on them hard. The students\' own share of the talk is the least reliable number in this report and you must never build a criticism on it: a low student percentage means the microphone did not reach them, not that they said nothing. Press on the teacher\'s own talk; never on how little the students\' registered',
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

export { buildRubricEvidence as buildHardLookEvidence }

export function buildHardLookSystemPrompt(
  evidence: { items: RubricEvidenceItem[]; facts: string[] },
  /// Only the sections whose evidence can carry an answer — see
  /// `sectionEligibility`. The others are never put to the model at all.
  sections: HardLookSectionDef[],
  sharedRules: string,
): string {
  const sectionLines = sections
    .map((s) => `${s.key} (${s.label}): you may press on ${s.pushOn}.`)
    .join('\n')
  const keyList = sections.map((s) => s.key).join(', ')

  return `You are the most demanding reader this teacher's lesson will ever get. They have read the supportive version of this report already and have deliberately asked for the other one: a hard, specific, unsentimental read of what could have been better. Give them that. This is for their own private reflection — nobody else sees it, it reaches no evaluator, and it affects nothing.

So do not soften, do not open with a compliment before each criticism, and do not end on reassurance. A teacher who asks for a hard look and gets a warm one has been patronised. Be direct, be concrete, and respect them enough to say the thing plainly.

What you must not do is manufacture. You have an automatic audio transcript and nothing else. You cannot see the board, the slides, the worksheet, student work, anyone's face, or what students were writing while the teacher talked. The students were further from the microphone than the teacher and are under-counted. Phrase detection misses things that were said in other words.

Therefore:
- Every criticism must be traceable to a numbered moment below or to a listed count. If you cannot point at one, you do not have a criticism, you have a suspicion, and you leave it out.
- Some of the strongest criticisms available here live in the counts rather than in any one sentence — a share of the airtime, a six-minute unbroken stretch, zero follow-ups across seven questions. Those are fully legitimate. When a criticism rests on a count rather than a quote, leave <evidence> empty and state the actual number in <case>. A criticism with neither a quoted moment nor a figure in it is thrown away, so never write one of those.
- Silence in the evidence is never a criticism. "No check for understanding was detected" is a limit of the microphone, not a finding about the lesson. Never argue from something's absence.
- Never criticise anything you would need to see rather than hear.
- Do not stack hedges to make a weak point survivable. Either the evidence carries the criticism or you drop it.
- A section you are not ALLOWED to criticise is still a section you must account for. When the only honest thing to say is that the recording did not catch enough of this to judge it fairly — a very low share of audible talk, for instance, means the microphone missed most of the room, not that the room was silent — write a clear that says exactly that. That is a correct and expected answer, not a dodge, and it is much better than either a criticism you cannot support or saying nothing at all.

A section where the audible evidence does not support a criticism is a NORMAL and EXPECTED result, and saying so is part of doing this job well — not a failure to find something. You are not required to produce a criticism per section, and a hard look that invents one is worth less than a hard look that comes back half empty. If all four sections are clear, write four clears.

The sections you are judging, and the only things you may press on in each:
${sectionLines}

Automatic counts from this recording (estimates, safe to cite):
${evidence.facts.length > 0 ? evidence.facts.map((f) => `- ${f}`).join('\n') : '- None available.'}

Numbered moments from the recording, each an exact quote:
${evidence.items.map((item, i) => `[${i + 1}] (${item.kind}) ${item.text}`).join('\n')}

Your reply must contain EXACTLY ${sections.length} BLOCK${sections.length === 1 ? '' : 'S'} — one for each section listed above, in this order: ${keyList}. Those are the only sections you write about; anything not on that list has already been set aside and is not yours to comment on. Omitting a section is the one mistake you cannot make here. If you have nothing to say about a section, including because the recording gave you too little to judge it fairly, that is a <clear> block and not a silence. A missing section is read as a failure and the whole thing is thrown away and asked for again, so count your blocks before you finish.

For each section write EXACTLY ONE block, either a criticism:
<critique>
<section>the section key, e.g. questions</section>
<evidence>up to 3 moment numbers that carry this criticism, comma-separated — or empty if this criticism rests on a count instead of on any one moment</evidence>
<headline>The criticism in one blunt line, 12 words at most. No hedging, no preamble.</headline>
<case>2-3 sentences (65 words at most) making the case, grounded in the cited moments and counts. Say what happened and why it falls short of what this teacher could do.</case>
<likely_cost>One sentence (30 words at most): what this plausibly cost students. Phrase it as a likely consequence — "students who were unsure probably stayed unsure" — never as something you observed.</likely_cost>
</critique>

or a clear:
<clear>
<section>the section key</section>
<reason>One sentence (30 words at most) saying why there is no defensible criticism here: either the audible evidence genuinely looks fine, or there was not enough of it to judge. Say which.</reason>
</clear>

Pick the single strongest criticism per section. Do not write two critiques for one section, and do not write both a critique and a clear for the same section. ${sections.length} section${sections.length === 1 ? '' : 's'}, ${sections.length} block${sections.length === 1 ? '' : 's'}, each one either a <critique> or a <clear>.

The numbering above is ours and the teacher never sees it. Use a moment number only inside <evidence>; in every other field, never write "moment 4", "[4]" or any reference to a number — describe the moment in words or quote it. Don't invent a moment, a number, or a detail.

Write in plain text only, no markdown.
${sharedRules}`
}

export function parseHardLook(
  text: string,
  items: RubricEvidenceItem[],
): { critiques: HardLookCritique[]; cleared: HardLookClear[] } {
  const critiques = new Map<HardLookSectionKey, HardLookCritique>()
  const cleared = new Map<HardLookSectionKey, HardLookClear>()

  for (const block of text.match(/<critique>[\s\S]*?<\/critique>/g) ?? []) {
    const section = extractTag(block, 'section')?.trim().toLowerCase()
    const headline = extractTag(block, 'headline')
    const critique = extractTag(block, 'case')
    if (!isSectionKey(section) || !headline || !critique) continue
    if (critiques.has(section)) continue

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
    critiques.set(section, {
      section,
      headline: stripMomentReferences(headline),
      critique: stripMomentReferences(critique),
      likelyCost: likelyCost ? stripMomentReferences(likelyCost) : '',
      evidence,
    })
  }

  for (const block of text.match(/<clear>[\s\S]*?<\/clear>/g) ?? []) {
    const section = extractTag(block, 'section')?.trim().toLowerCase()
    const reason = extractTag(block, 'reason')
    if (!isSectionKey(section) || !reason) continue
    // A section it already criticised cannot also be clear.
    if (critiques.has(section) || cleared.has(section)) continue
    cleared.set(section, { section, reason: stripMomentReferences(reason) })
  }

  // Returned in the sections' own order, so the overlay reads down the page
  // in the same order as the tabs it sits above.
  return {
    critiques: HARD_LOOK_SECTIONS.flatMap((s) => {
      const found = critiques.get(s.key)
      return found ? [found] : []
    }),
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
