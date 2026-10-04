// Look It Over's document types, the lenses each one is read through, and the
// detection that decides which type a teacher just dropped in.
//
// One surface replaced four tools (Get Feedback, Review a Presentation, Review
// an assignment, Review My Communication), and the thing that makes that work
// rather than becoming a four-way menu with extra steps is that the teacher
// never picks a tool: they drop the document and the app says what it thinks
// it is. So detection has to be decent, and — more importantly — being wrong
// has to cost one tap.
//
// `web/src/lib/reviewLenses.ts` mirrors the types, labels and defaults. The
// lens instructions below are prompt text and never ship to a browser.

export const DOC_TYPES = [
  'quiz',
  'homework',
  'assignment',
  'project',
  'lesson_plan',
  'presentation',
  'rubric',
  'message',
] as const

export type DocType = (typeof DOC_TYPES)[number]

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  quiz: 'Quiz or exam',
  homework: 'Homework',
  assignment: 'Assignment',
  project: 'Project',
  lesson_plan: 'Lesson plan',
  presentation: 'Presentation',
  rubric: 'Rubric',
  message: 'Message',
}

export function isDocType(value: unknown): value is DocType {
  return typeof value === 'string' && (DOC_TYPES as readonly string[]).includes(value)
}

// --- lenses ---

export type Lens = {
  key: string
  /// What the toggle says.
  label: string
  /// One line under the label, so a teacher knows what turning it on buys.
  blurb: string
  /// What the model is actually asked to look for.
  instruction: string
}

/// Every lens in the app, keyed. A lens belongs to several document types, so
/// they live in one table rather than being repeated per type.
export const LENSES: Record<string, Lens> = {
  item_purpose: {
    key: 'item_purpose',
    label: 'What each item measures',
    blurb: 'Item by item, what it actually tests.',
    instruction:
      'Go item by item and say what each one actually measures — recall, procedure, application, reasoning. Name any item that looks like it tests reading comprehension or test-wiseness rather than the content, and any two items that measure the same thing.',
  },
  reading_load: {
    key: 'reading_load',
    label: 'Reading load',
    blurb: 'How much reading stands between a student and the content.',
    instruction:
      'Judge how much reading a student has to do before they can show what they know. Flag long stems, dense directions, and vocabulary that is incidental to the content being assessed. Say which items a strong student in this content could still lose marks on purely through reading.',
  },
  answer_choices: {
    key: 'answer_choices',
    label: 'Answer choices',
    blurb: 'Distractors that give it away, or that are unfair.',
    instruction:
      'Examine the answer choices. Flag giveaways (one obviously longer or more precise option, grammatical tells, "all of the above"), two options that mean the same thing, and distractors that are not plausible enough to be useful. Say which distractors would actually diagnose a misconception and which are filler.',
  },
  standards_coverage: {
    key: 'standards_coverage',
    label: 'Standards coverage',
    blurb: 'What is covered, what is over-weighted, what is missing.',
    instruction:
      'Map the items onto what the document itself says it covers. Say what is over-represented, what is under-represented, and what the document claims to assess but does not. Never invent a standards code the document does not name.',
  },
  fits_the_period: {
    key: 'fits_the_period',
    label: 'Will it fit the period',
    blurb: 'An estimate, with the assumption it rests on.',
    instruction:
      'Estimate how long this takes a typical student in the stated grade band, and give it as a RANGE, never a single number. State the assumption the estimate rests on in the same breath — how long you assumed per item type, and that it excludes handing out, settling and collecting. Then say whether it fits the period length if the document states one, and say plainly that you do not know the period length if it does not.',
  },
  ai_risk: {
    key: 'ai_risk',
    label: 'AI completion risk',
    blurb: 'How much of this a chatbot could just do.',
    instruction:
      'Say how much of this a student could complete with a general-purpose chatbot in a few minutes, and which parts specifically. Be concrete and calm about it — not alarmed, and never implying the teacher was naive. Then name the smallest change that would make the thinking visible without making more work to grade.',
  },
  timing_realism: {
    key: 'timing_realism',
    label: 'Timing realism',
    blurb: 'Whether the minutes on the page survive a real class.',
    instruction:
      'Compare the time the plan allocates with how long each part realistically takes. Give ranges, not single numbers, and state what you assumed. Name the part most likely to overrun and the part most likely to be cut when it does.',
  },
  objective_fit: {
    key: 'objective_fit',
    label: 'Objective-to-activity fit',
    blurb: 'Whether the activities actually get to the objective.',
    instruction:
      'Take the stated objective and ask whether each activity moves a student toward it. Name any activity that is engaging but does not serve the objective, and any part of the objective no activity touches. If the objective is not clearly stated, say so rather than inferring one and reviewing against your own guess.',
  },
  where_thinking: {
    key: 'where_thinking',
    label: 'Where students do the thinking',
    blurb: 'Who is doing the cognitive work, minute by minute.',
    instruction:
      'Walk through the document and say who is doing the intellectual work at each stage — the teacher, the materials, or the student. Name the longest stretch where students are receiving rather than thinking, and the single place where a small change would hand the thinking back.',
  },
  checks_for_understanding: {
    key: 'checks_for_understanding',
    label: 'Checks for understanding',
    blurb: 'Where you would find out it is not landing.',
    instruction:
      'Find the points where the teacher would learn whether this is landing, and the stretches where they would not. Say which checks sample the whole room and which only reach the students who volunteer. Name the latest point at which a misconception could still go unnoticed.',
  },
  short_or_long: {
    key: 'short_or_long',
    label: 'If it runs short or long',
    blurb: 'What to cut, and what to have ready.',
    instruction:
      'Say what to cut first if this runs long, chosen so the objective survives — and what to have ready if it runs short, that is more than busywork. Be specific to this document, naming the actual parts.',
  },
  slide_load: {
    key: 'slide_load',
    label: 'Slide load and text density',
    blurb: 'How much is on each slide.',
    instruction:
      'Judge how much is on each slide. Name the slides carrying more than a student can take in while also listening, and the ones that are doing nothing. Say which could be split and which could go.',
  },
  grade_level_fit: {
    key: 'grade_level_fit',
    label: 'Grade-level fit',
    blurb: 'Pitched where the students actually are.',
    instruction:
      'Judge whether the language, examples and pace suit the stated grade band. Name anything that is pitched too high or too low, and say which specific wording you would change.',
  },
  legible_from_the_back: {
    key: 'legible_from_the_back',
    label: 'Legible from the back row',
    blurb: 'Whether everyone can actually read it.',
    instruction:
      'Flag anything a student at the back of a classroom could not read: small or dense text, low-contrast colour choices, tables and charts shrunk to fit, and text over images. Judge only from what the document shows; if font sizes are not knowable from the text, say which slides look dense rather than guessing point sizes.',
  },
  how_to_run_it: {
    key: 'how_to_run_it',
    label: 'How to run it',
    blurb: 'What to say and do around the slides.',
    instruction:
      'Say how to actually run this: where to stop, what to ask, what students should be doing while each part is on screen, and which slide to open on. Practical and specific — not a restatement of the content.',
  },
  what_it_asks_for: {
    key: 'what_it_asks_for',
    label: 'What it asks students to do',
    blurb: 'The task underneath the instructions.',
    instruction:
      'Say plainly what a student is actually being asked to produce, and what thinking that requires. Flag instructions that are ambiguous about the product, the length, or what "good" looks like. Name anything a conscientious student could do exactly as written and still get wrong.',
  },
  workload: {
    key: 'workload',
    label: 'Workload, theirs and yours',
    blurb: 'How long to do, and how long to grade.',
    instruction:
      'Estimate how long this takes a student and how long it takes the teacher to grade for a class of thirty. Give ranges and state your assumptions. If the grading load looks unsustainable, name the change that cuts it most without losing what is being assessed.',
  },
  scaffolding: {
    key: 'scaffolding',
    label: 'Support and access',
    blurb: 'Who can get started without help.',
    instruction:
      'Say which students could begin this unaided and which could not, based only on what the document provides. Name the specific missing support — a worked example, a sentence frame, a glossary, a checkpoint — and where it would go.',
  },
  tone_and_clarity: {
    key: 'tone_and_clarity',
    label: 'Tone and clarity',
    blurb: 'How it will land with the person reading it.',
    instruction:
      'Say how this will read to its recipient, naming the specific sentences that carry the tone. Flag anything that could be read as blaming, defensive, or evasive, and anything a worried reader could misread. Judge the tone it will land with, not the tone it intends.',
  },
  what_it_asks_of_reader: {
    key: 'what_it_asks_of_reader',
    label: 'What it asks of the reader',
    blurb: 'Whether the next step is clear.',
    instruction:
      'Say what the reader is being asked to do, by when, and whether that is unambiguous. Flag a message that describes a problem without naming a next step, or that asks for something the recipient cannot actually give.',
  },
  facts_and_record: {
    key: 'facts_and_record',
    label: 'Facts and record',
    blurb: 'Observable facts versus characterization.',
    instruction:
      'Separate observable fact from characterization and inference. Flag any sentence that states a motive, a diagnosis, or a judgment as though it were observed. Flag anything that discloses another student. Say what a reader forwarding this to an administrator would see.',
  },
  // --- Homework ---
  time_really_takes: {
    key: 'time_really_takes',
    label: "How long it'll really take",
    blurb: 'The honest estimate, not the optimistic one.',
    instruction:
      'Estimate how long this actually takes a typical student in this class, not a fast one. Count reading, thinking, writing and setup separately, state the per-part basis for your figure, and compare it to any time the document itself claims. If the gap is large, say so plainly.',
  },
  practice_or_new: {
    key: 'practice_or_new',
    label: 'Practice or new learning',
    blurb: 'Rehearsing what they know, or meeting it for the first time.',
    instruction:
      'Decide whether this asks students to practise something already taught or to learn something new on their own. Quote the parts that assume prior instruction. Homework that teaches is homework that sorts students by who has help at home — if that is what this does, say it.',
  },
  doable_at_home: {
    key: 'doable_at_home',
    label: 'Doable without help at home',
    blurb: 'What it quietly assumes a student has.',
    instruction:
      'Name everything this assumes a student can reach at home — an adult who knows the content, a printer, reliable internet, a quiet hour, a specific app or text. Say which parts stall completely without each one. Do not speculate about any particular family.',
  },
  directions_alone: {
    key: 'directions_alone',
    label: 'Are the directions clear alone',
    blurb: 'Read cold, with nobody to ask.',
    instruction:
      'Read the directions as a student would at 9pm with nobody to ask. Flag every step that depends on something said in class, every ambiguous verb, and anything that does not say what finished looks like. Quote the line and give the clearer wording.',
  },
  what_you_do_tomorrow: {
    key: 'what_you_do_tomorrow',
    label: 'What you do with it tomorrow',
    blurb: 'Whether it feeds the next lesson or just gets collected.',
    instruction:
      'Say what this work makes possible in the next lesson. If it produces nothing you could sort, discuss or teach from, say so — and name the smallest change that would make it worth collecting.',
  },

  // --- Assignment ---
  thinking_and_rigor: {
    key: 'thinking_and_rigor',
    label: 'Thinking and rigor',
    blurb: 'What cognitive work this actually asks for.',
    instruction:
      'Name the cognitive work this asks for — recall, procedure, application, analysis, judgment — and quote where. Distinguish work that looks demanding because it is long from work that is demanding because it is hard. If the hardest thinking has already been done for the student in the directions, point at it.',
  },
  learning_value: {
    key: 'learning_value',
    label: 'Learning value',
    blurb: 'What a student is better at afterwards.',
    instruction:
      'Say what a student can do afterwards that they could not do before. If the honest answer is "produced an artefact", say so. Separate the parts that build understanding from the parts that are production work — formatting, decorating, assembling — and say how much of the total each is.',
  },
  directions_and_examples: {
    key: 'directions_and_examples',
    label: 'Directions and examples',
    blurb: 'Whether a student can tell what good looks like.',
    instruction:
      'Judge whether a student could tell what a strong response looks like from this document alone. Flag missing models, exemplars or success criteria, and directions that describe the task without describing the standard. Quote what is there and say what it leaves open.',
  },

  // --- Project ---
  workload_timeline: {
    key: 'workload_timeline',
    label: 'Workload across the timeline',
    blurb: 'Where the work actually piles up.',
    instruction:
      'Map the work against the dates the document gives. Say where it bunches, which checkpoints are too far apart to catch a group that has stalled, and whether the final stretch is doable in the time left. State your per-phase estimate and its basis.',
  },
  group_accountability: {
    key: 'group_accountability',
    label: "Group work and who's accountable",
    blurb: 'Whether one student can carry it, or hide in it.',
    instruction:
      'Say whether this can be completed by one student doing most of it, and whether any student could pass without contributing. Name which deliverables are individually attributable and which are not. Suggest the smallest structural change that makes each member visible.',
  },
  success_criteria: {
    key: 'success_criteria',
    label: 'Rubric and success criteria',
    blurb: 'Whether the target is stated or implied.',
    instruction:
      'Check whether the document states how the work will be judged, in terms a student could act on before starting. Flag criteria that describe effort or compliance rather than quality. If a rubric is included, check it matches what the directions actually ask for.',
  },

  // --- Lesson plan ---
  materials_prep: {
    key: 'materials_prep',
    label: 'Materials and prep',
    blurb: 'What has to exist before the bell.',
    instruction:
      'List everything that must be made, copied, booked or set up before this runs, including anything implied but not named. Flag whatever has to be ready and is not mentioned. Keep it to what the plan itself implies — do not invent a resource list.',
  },

  // --- Presentation ---
  pacing_period: {
    key: 'pacing_period',
    label: 'Pacing against the period',
    blurb: 'Whether the deck fits the time it has.',
    instruction:
      'Estimate how long this deck takes to deliver at a realistic pace for this class, state the per-slide basis, and compare it to the period length. Say which slides are the ones to cut if it runs long, and which cannot be cut without losing the point.',
  },

  // --- Rubric ---
  criteria_distinct: {
    key: 'criteria_distinct',
    label: 'Are the criteria distinct',
    blurb: 'Whether each row judges something different.',
    instruction:
      'Check each criterion against the others. Name any two that would rise and fall together, and any that bundle several judgments into one row. Say which rows a student could score well on for reasons unrelated to what the row is named after.',
  },
  levels_differ: {
    key: 'levels_differ',
    label: 'Do the levels describe different work',
    blurb: 'Different work, or just more of it.',
    instruction:
      'Read across each row. Say whether the levels describe qualitatively different work or the same work in different amounts — "three examples" versus "two" is quantity, not quality. Quote the rows where only the adjectives change, and give better wording for one of them.',
  },
  weighting_matches: {
    key: 'weighting_matches',
    label: 'Does the weighting match what matters',
    blurb: 'Where the points are, versus where the learning is.',
    instruction:
      'Compare how the points are distributed against what the task says it is for. Flag where presentation, length or compliance carries more weight than the thinking. If no weighting is stated, say what the layout implies.',
  },
  student_readable: {
    key: 'student_readable',
    label: 'Can a student read it and know what to do',
    blurb: 'Whether it works as instructions, not just as grading.',
    instruction:
      'Read it as a student deciding what to do first. Flag teacher-facing language, vocabulary that assumes the rubric was explained aloud, and levels that only make sense once the work is finished. Quote one row and rewrite it so it would guide the work.',
  },
  matches_assignment: {
    key: 'matches_assignment',
    label: 'Does it match the assignment',
    blurb: 'Whether it judges what was actually asked for.',
    instruction:
      'If the assignment is here too, check the rubric against it: anything the directions require that no criterion judges, and any criterion judging something the directions never asked for. If only the rubric was given, say what it implies the task must require, and mark this low confidence.',
  },

  // --- Message ---
  clarity: {
    key: 'clarity',
    label: 'Clarity',
    blurb: 'Whether the point survives one read.',
    instruction:
      'Say what this message asks for and whether that survives a single quick read on a phone. Flag the point arriving late, more than one ask buried in a paragraph, and sentences carrying two ideas. Quote the line and give the shorter one.',
  },
  tone_for_reader: {
    key: 'tone_for_reader',
    label: 'Tone for this reader',
    blurb: 'How it lands on the person receiving it.',
    instruction:
      'Judge the tone as the named reader would receive it, not as the writer intends it. Flag anything that reads as blame, as a formal record, or as warmer than the situation warrants. Quote the phrase and offer one alternative. Never speculate about the reader or their home.',
  },
  invites_response: {
    key: 'invites_response',
    label: 'What it invites in response',
    blurb: 'The conversation this opens.',
    instruction:
      'Say what reply this is likely to produce, and whether that is the one the teacher wants. Flag anything inviting a defence rather than a conversation, open questions that will generate work, and closings that leave the next step with nobody.',
  },
  whats_missing: {
    key: 'whats_missing',
    label: "What's missing",
    blurb: 'What the reader will have to ask for.',
    instruction:
      'Name what a reader needs that is not here — the specific, the date, the next step, what is being asked of them. Keep to what the message itself implies is missing; do not invent circumstances.',
  },
}

/// The lenses a type is read through, in the order they appear, with whether
/// each one starts on.
///
/// The on/off defaults are the whole argument for lenses being toggleable:
/// AI-completion risk is the right first question for homework a student takes
/// away, and the wrong one for a quiz sat in the room under supervision —
/// turning it on there would answer a question nobody asked and imply a
/// suspicion the teacher does not have.
export const LENSES_BY_TYPE: Record<DocType, { key: string; on: boolean }[]> = {
  // Each row is the spec's lens table. Order is the order they are shown; a
  // lens marked off is a default, not a restriction — every one is
  // individually toggleable.
  quiz: [
    { key: 'item_purpose', on: true },
    { key: 'reading_load', on: true },
    { key: 'answer_choices', on: true },
    { key: 'standards_coverage', on: true },
    { key: 'fits_the_period', on: true },
    // Off by design: a quiz is sat in the room.
    { key: 'ai_risk', on: false },
  ],
  homework: [
    { key: 'time_really_takes', on: true },
    { key: 'practice_or_new', on: true },
    { key: 'doable_at_home', on: true },
    { key: 'directions_alone', on: true },
    { key: 'what_you_do_tomorrow', on: true },
    { key: 'ai_risk', on: true },
  ],
  assignment: [
    { key: 'grade_level_fit', on: true },
    { key: 'thinking_and_rigor', on: true },
    { key: 'learning_value', on: true },
    { key: 'workload', on: true },
    { key: 'directions_and_examples', on: true },
    { key: 'ai_risk', on: true },
  ],
  project: [
    { key: 'grade_level_fit', on: true },
    { key: 'where_thinking', on: true },
    { key: 'workload_timeline', on: true },
    { key: 'group_accountability', on: true },
    { key: 'success_criteria', on: true },
    { key: 'ai_risk', on: true },
  ],
  lesson_plan: [
    { key: 'timing_realism', on: true },
    { key: 'objective_fit', on: true },
    { key: 'where_thinking', on: true },
    { key: 'checks_for_understanding', on: true },
    { key: 'short_or_long', on: true },
    { key: 'materials_prep', on: false },
  ],
  presentation: [
    { key: 'slide_load', on: true },
    { key: 'where_thinking', on: true },
    { key: 'grade_level_fit', on: true },
    { key: 'legible_from_the_back', on: true },
    { key: 'how_to_run_it', on: true },
    { key: 'pacing_period', on: false },
  ],
  rubric: [
    { key: 'criteria_distinct', on: true },
    { key: 'levels_differ', on: true },
    { key: 'weighting_matches', on: true },
    { key: 'student_readable', on: true },
    { key: 'matches_assignment', on: true },
  ],
  message: [
    { key: 'clarity', on: true },
    { key: 'tone_for_reader', on: true },
    { key: 'invites_response', on: true },
    { key: 'whats_missing', on: true },
  ],
}

/// The lens list a fresh review of this type starts with.
export function defaultLensesFor(docType: DocType): { key: string; on: boolean }[] {
  return LENSES_BY_TYPE[docType].map((l) => ({ ...l }))
}

/// Keeps only lens keys that belong to this type, so a client cannot turn on a
/// lens the type has no business being read through.
export function allowedLensKeys(docType: DocType): string[] {
  return LENSES_BY_TYPE[docType].map((l) => l.key)
}

// --- detection ---

/// What a filename extension implies on its own, before the text is read.
const EXTENSION_HINTS: Record<string, DocType> = {
  '.pptx': 'presentation',
}

type Signal = {
  type: DocType
  pattern: RegExp
  weight: number
  /// What this signal saw, in a teacher's words, for "Numbered items and an
  /// answer key. Tap any to correct me." A noun phrase, lowercase, so it can
  /// be joined with another and capitalised as a sentence.
  says: string
}

/// Deliberately a keyword heuristic rather than a model call.
///
/// Detection runs the instant a file lands, before the teacher has done
/// anything, and a round trip there would turn a drop into a wait. It is also
/// allowed to be wrong: the result is shown as "Looks like a quiz — right?"
/// with chips, so the cost of a miss is one tap, and the cost of a model call
/// on every drop is paid by everyone every time.
const SIGNALS: Signal[] = [
  // Message — strongest signals in the app, because an email looks nothing
  // like a classroom document.
  { type: 'message', pattern: /^\s*(dear|hi|hello|good (morning|afternoon|evening))\b/i, weight: 5 , says: 'a greeting' },
  { type: 'message', pattern: /\b(subject|re|fw|fwd)\s*:/i, weight: 3 , says: 'a subject line' },
  { type: 'message', pattern: /\b(best regards|kind regards|sincerely|thanks so much|warmly)\b/i, weight: 3 , says: 'a sign-off' },
  { type: 'message', pattern: /\b(your (son|daughter|child)|mr\.|mrs\.|ms\.)\b/i, weight: 2 , says: 'a parent addressed directly' },

  // Lesson plan.
  { type: 'lesson_plan', pattern: /\b(lesson plan|do now|warm.?up|bell.?ringer)\b/i, weight: 4 , says: 'lesson-plan headings' },
  { type: 'lesson_plan', pattern: /\b(swbat|students will be able to|learning (objective|target))\b/i, weight: 4 , says: 'a learning objective' },
  { type: 'lesson_plan', pattern: /\b(i do|we do|you do|gradual release|exit ticket|closure)\b/i, weight: 3 , says: 'a gradual-release structure' },
  { type: 'lesson_plan', pattern: /\b(\d+\s*min(ute)?s?\b.*){3,}/is, weight: 2 , says: 'timings running through it' },
  { type: 'lesson_plan', pattern: /\b(materials|agenda|essential question)\b\s*:/i, weight: 2 , says: 'a materials or agenda list' },

  // Quiz or exam.
  { type: 'quiz', pattern: /\b(quiz|exam|test|midterm|final)\b/i, weight: 3 , says: 'the words quiz or exam' },
  { type: 'quiz', pattern: /\b(multiple choice|circle the (correct|best)|select the best answer)\b/i, weight: 4 , says: 'multiple-choice wording' },
  // Numbered lines are the weakest discriminator in the app — homework,
  // assignments, projects and quizzes all have them — so this leans toward a
  // quiz without ever outvoting a document that says what it is. At weight 2
  // it beat "Homework — Problem Set 3" on the strength of three numbered
  // questions, which is exactly backwards.
  { type: 'quiz', pattern: /(^|\n)\s*\d+[.)]\s/g, weight: 1 , says: 'numbered items' },
  { type: 'quiz', pattern: /(^|\n)\s*[a-dA-D][.)]\s/g, weight: 3 , says: 'lettered options' },
  { type: 'quiz', pattern: /\b(points?|pts|marks?)\b\s*[:)]/i, weight: 2 , says: 'point values' },
  { type: 'quiz', pattern: /\b(name|date|period)\s*:?\s*_{3,}/i, weight: 3 , says: 'a name and date line' },

  // Homework.
  { type: 'homework', pattern: /\b(homework|hw|practice set|problem set)\b/i, weight: 4 , says: 'the word homework' },
  { type: 'homework', pattern: /\b(due (tomorrow|monday|tuesday|wednesday|thursday|friday|next))\b/i, weight: 2 , says: 'a due date' },

  // Project.
  { type: 'project', pattern: /\b(project|capstone|presentation project|group project)\b/i, weight: 4 , says: 'the word project' },
  { type: 'project', pattern: /\b(rubric|milestones?|checkpoints?|deliverables?|group roles?)\b/i, weight: 2 , says: 'a rubric or milestones' },
  { type: 'project', pattern: /\b(weeks?|phases?)\s*\d/i, weight: 2 , says: 'phases over weeks' },

  // Assignment — the catch-all, so its signals are weaker on purpose.
  { type: 'assignment', pattern: /\b(assignment|task|worksheet|activity)\b/i, weight: 3 , says: 'the word assignment' },
  { type: 'assignment', pattern: /\b(instructions|directions)\b\s*:/i, weight: 2 , says: 'an instructions heading' },

  // Rubric — a criteria x performance-levels grid. Named levels are the
  // giveaway, because nothing else a teacher makes has four of them in a row.
  { type: 'rubric', pattern: /\b(rubric|scoring guide|criteria)\b/i, weight: 4, says: 'the word rubric' },
  { type: 'rubric', pattern: /\b(exceeds|meets|approaching|beginning|emerging|proficient|developing)\b/gi, weight: 3, says: 'named performance levels' },
  { type: 'rubric', pattern: /\b(4\s*[-–]\s*3\s*[-–]\s*2\s*[-–]\s*1|excellent.*good.*fair.*poor)\b/i, weight: 3, says: 'a four-point scale' },

  // Presentation.
  { type: 'presentation', pattern: /\b(slide|slides)\b/i, weight: 3 , says: 'slides' },
  { type: 'presentation', pattern: /^\s*slide\s*\d+/im, weight: 5 , says: 'numbered slides' },
]

/// Tie-break order, most specific first.
const TIE_BREAK: readonly DocType[] = [
  'message',
  'presentation',
  'lesson_plan',
  'quiz',
  'project',
  'homework',
  'rubric',
  'assignment',
]

/// Lenses no type offers any more.
///
/// Kept defined, not deleted: a review run before the sets were rewritten
/// stored these keys, and dropping them would make an old result render bare
/// keys where its findings used to have names. Nothing may offer them again —
/// a type wanting one of these should say so in its own words instead.
export const RETIRED_LENS_KEYS: readonly string[] = [
  'what_it_asks_for',
  'scaffolding',
  'tone_and_clarity',
  'what_it_asks_of_reader',
  'facts_and_record',
]

export type Detection = {
  docType: DocType
  /// What in the document pointed at this type, strongest first, at most two.
  /// The question "Looks like a quiz — right?" is easier to answer when it
  /// says what it saw — and showing the reasons is also what makes a wrong
  /// guess obviously wrong rather than mysteriously wrong.
  evidence: string[]
  /// True when the signals were strong and clearly ahead of the runner-up.
  /// A low-confidence detection is still shown as a question, just with the
  /// chips already open.
  confident: boolean
}

/// Best guess at what this document is.
///
/// Falls back to `assignment` rather than refusing to guess: the confirmation
/// strip asks either way, and "Looks like an assignment — right?" is a better
/// opening than "What is this?", which is the interrogation the brief rules
/// out. `confident: false` is how the UI knows to show the chips expanded.
export function detectDocType(text: string, fileName?: string | null): Detection {
  const hinted = fileName ? EXTENSION_HINTS[extensionOf(fileName)] : undefined

  const scores = new Map<DocType, number>()
  const head = text.slice(0, 4000)
  for (const { type, pattern, weight } of SIGNALS) {
    const matches = pattern.flags.includes('g') ? head.match(pattern)?.length ?? 0 : pattern.test(head) ? 1 : 0
    if (matches === 0) continue
    // A repeated structural signal (numbered items, lettered options) counts
    // more than once, but with diminishing returns — twelve numbered lines
    // say "quiz" more loudly than two, and not six times more loudly.
    const scored = weight * Math.min(matches, 3)
    scores.set(type, (scores.get(type) ?? 0) + scored)
  }
  // A .pptx is a presentation whatever its words say — the file format is a
  // fact, not a signal.
  if (hinted) scores.set(hinted, (scores.get(hinted) ?? 0) + 12)

  // Ties broken by how specific a type is rather than by Map insertion order,
  // which would otherwise make the answer depend on the order the signals
  // happen to be written in. `assignment` sits last because it is the
  // catch-all: anything that could be something more specific should be.
  const ranked = [...scores.entries()].sort(
    (a, b) => b[1] - a[1] || TIE_BREAK.indexOf(a[0]) - TIE_BREAK.indexOf(b[0]),
  )
  if (ranked.length === 0) return { docType: 'assignment', evidence: [], confident: false }

  const [topType, topScore] = ranked[0]
  const runnerUp = ranked[1]?.[1] ?? 0
  return {
    docType: topType,
    evidence: evidenceFor(text, topType),
    confident: topScore >= 6 && topScore >= runnerUp * 1.6,
  }
}

/// What in the document points at one particular type, strongest signal
/// first, at most two.
///
/// Takes the type as an argument rather than always explaining the winner,
/// because a teacher who corrects the guess should see why their answer fits,
/// not why the machine's did.
export function evidenceFor(text: string, type: DocType): string[] {
  const head = text.slice(0, 4000)
  return SIGNALS.filter((signal) => signal.type === type)
    .filter((signal) =>
      signal.pattern.flags.includes('g') ? (head.match(signal.pattern)?.length ?? 0) > 0 : signal.pattern.test(head),
    )
    .sort((a, b) => b.weight - a.weight)
    .map((signal) => signal.says)
    .slice(0, 2)
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot < 0 ? '' : fileName.slice(dot).toLowerCase()
}

// --- the limits, stated plainly ---

/// Shown in the footer of every result. The honest boundary of a document
/// review, in the words a teacher would use — not hedging, and not a
/// disclaimer about the model.
export const REVIEW_LIMITS =
  'This read the document only. It has not met your students, it does not know how last week went, and it cannot hear what you will say out loud while you run it. Where those matter more than the page, trust yourself over this.'
