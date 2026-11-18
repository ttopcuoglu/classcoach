import { RUBRIC_LEVEL_NAMES } from '../lib/api'

// What each Danielson component looks at, in our own plain words (the
// framework's descriptors are licensed, so they are not reproduced). Keyed by
// code, so lenses saved before this existed show it too. Mirrors
// RubricLensTab.swift componentAbout.
export const RUBRIC_COMPONENT_ABOUT: Record<string, string> = {
  '1a': 'Whether the plan shows a sound grasp of the content and of how this content is best taught.',
  '1b': 'Whether the plan takes these particular students into account: what they already know, what they need, and who they are.',
  '1c': 'How clearly the plan says what students will learn and be able to do, and whether that asks for real thinking.',
  '1d': 'Whether the materials, texts and tools chosen serve what students are meant to learn.',
  '1e': 'Whether the activities, grouping and timing build step by step toward the learning goals.',
  '1f': 'How the plan checks what students learned, what counts as success, and how results would shape what comes next.',
  '2a': 'How the teacher and students treat each other: warmth, respect, and every student feeling they belong.',
  '2b': 'Whether the room treats the work as important and worth the effort: high expectations, persistence, and pride in getting it right.',
  '2c': 'How smoothly routines, transitions and group work run, so little time is lost and students know what to do.',
  '2d': 'Whether expectations for behavior are clear and held consistently, and how respectfully the teacher responds when they are not met.',
  '2e': 'How the room, furniture and materials are arranged so every student can learn safely and reach what they need.',
  '3a': 'How clearly the teacher explains what students are learning and why, gives directions, and presents the content accurately.',
  '3b': 'Whether questions ask students to think and explain, and whether discussion lets students build on each other’s ideas.',
  '3c': 'Whether the tasks ask every student to think hard about the content, at a pace that keeps them working.',
  '3d': 'How the teacher checks what students understand during the lesson and gives feedback that helps them improve.',
  '3e': 'How the teacher adjusts in the moment when students are confused, ready for more, or need another way in.',
}

// What each level looks like for each component, Level 1 to 4, also in our own
// words (not the licensed descriptors). A report shows the level given and the
// one above it, so a teacher sees both where they are and the next step.
// Mirrors AudioSession.swift AudioRubricComponent.levelLooksLike.
export const RUBRIC_LEVEL_LOOKS_LIKE: Record<string, [string, string, string, string]> = {
  '1a': [
    "The plan shows gaps or errors in the content, or little thought about how this content is best taught.",
    "The content is mostly sound, but the plan teaches it one way without anticipating where students may stumble.",
    "The content is accurate, and the plan uses approaches suited to it, with likely misconceptions in mind.",
    "The plan links the content to what comes before and after, and meets likely misconceptions with specific moves.",
  ],
  '1b': [
    "The plan could be for any class; it doesn't draw on what these students know or need.",
    "The plan speaks to the class as a whole, but not to differences among students.",
    "The plan builds on what these students already know and makes room for those who need something different.",
    "The plan names individual students' needs and interests and shapes the lesson around them.",
  ],
  '1c': [
    "There is no clear learning goal, or the goal describes an activity rather than learning.",
    "A goal is stated, but it is vague or asks only for recall.",
    "Clear goals say what students will learn, ask for real thinking, and can be checked.",
    "Goals are clear and demanding, fit a larger sequence, and allow for different students.",
  ],
  '1d': [
    "Materials are missing, or they don't fit the learning goal.",
    "Materials fit the topic, but few were chosen for this goal or these students.",
    "Materials were chosen to serve the goal and suit most students.",
    "Materials are varied, matched to different students, and some let students go further on their own.",
  ],
  '1e': [
    "Activities don't connect to the goal or to each other, and the timing is unrealistic.",
    "Activities relate to the goal, but the sequence is uneven or relies on one kind of task.",
    "Activities build step by step toward the goal, with sensible grouping and timing.",
    "The sequence builds toward the goal, gives students real choices, and adjusts for different needs.",
  ],
  '1f': [
    "The plan has no way to check what students learned.",
    "A check is planned, but it doesn't fully match the goal or say what success looks like.",
    "The check matches the goal, success is clear, and the plan says how the results will be used.",
    "Students help judge their own work, and results shape what comes next for groups or individuals.",
  ],
  '2a': [
    "Talk between teacher and students, or among students, is often sharp, dismissive or unkind.",
    "Interactions are polite but flat, or the warmth reaches only some students.",
    "Talk is warm and respectful, and students treat each other well.",
    "Students show real care for one another, and the teacher responds to them as individuals.",
  ],
  '2b': [
    "The work is treated as something to get through, and little effort is expected.",
    "The teacher says the work matters, but expectations are uneven or effort is modest.",
    "The teacher expects quality and persistence, and most students work to get it right.",
    "Students hold themselves to high standards, push each other, and take pride in their work.",
  ],
  '2c': [
    "Routines are unclear, and a lot of time is lost in transitions and handing out materials.",
    "Some routines work, but transitions often need the teacher's direction and time slips away.",
    "Routines and transitions run smoothly with little lost time, and students know what to do.",
    "Students run many routines themselves, and almost no learning time is lost.",
  ],
  '2d': [
    "Expectations are unclear, and misbehavior goes unaddressed or meets a harsh response.",
    "Expectations exist, but responses to them are inconsistent.",
    "Expectations are clear and held consistently, and responses are calm and respectful.",
    "Students largely manage their own behavior and remind each other; the teacher's responses are quiet and respectful.",
  ],
  '2e': [
    "The room's arrangement gets in the way of learning or safety.",
    "The room is safe, but the layout only partly supports the lesson.",
    "The room is safe and arranged for the activity, and students can reach what they need.",
    "Students help shape the space and use its tools and resources on their own.",
  ],
  '3a': [
    "The purpose is unclear, directions confuse students, or the content has errors.",
    "The purpose is stated, but explanations or directions need repeating and some students are lost.",
    "The purpose, directions and explanations are clear and accurate, in language that suits the students.",
    "Students can say what they are learning and why, and explanations connect to their own interests.",
  ],
  '3b': [
    "Questions mostly ask for recall, and the teacher does most of the talking.",
    "Some questions ask for thinking, but talk runs back and forth through the teacher and few students join in.",
    "Most questions ask students to explain their thinking, and many students respond, sometimes to each other.",
    "Students ask many of the questions and build on each other's ideas with little steering.",
  ],
  '3c': [
    "Few students are thinking hard about the content; the tasks mostly ask for compliance.",
    "Some students are engaged, but the tasks ask for little thinking or the pace drags or rushes.",
    "Most students do tasks that ask for real thinking, at a pace that keeps them working.",
    "Nearly every student is thinking hard, and some extend the work or choose how to do it.",
  ],
  '3d': [
    "There is little checking for understanding, and feedback is missing or vague.",
    "The teacher checks with a few students or the whole class at once, and feedback is general.",
    "The teacher checks most students' understanding during the lesson and gives specific feedback.",
    "Checking is steady and reaches individuals, and students check their own and each other's work.",
  ],
  '3e': [
    "The teacher sticks to the plan even when students are confused or finished.",
    "The teacher notices confusion but repeats the same explanation or moves on.",
    "The teacher adjusts when students struggle or are ready for more, trying another way in.",
    "The teacher adjusts smoothly in the moment, drawing on students' questions and interests.",
  ],
}

export function RubricComponentAbout({ code }: { code: string }) {
  const about = RUBRIC_COMPONENT_ABOUT[code]
  if (!about) return null
  return <p className="mt-1.5 text-xs italic text-ink-soft">{about}</p>
}

const RUBRIC_LEVEL_FILL: Record<1 | 2 | 3 | 4, string> = {
  1: 'bg-terracotta',
  2: 'bg-gold',
  3: 'bg-brand-400',
  4: 'bg-forest',
}

// Four steps, filled up to the level, with the framework's name beside it —
// or a dashed "not enough evidence" when the recording couldn't place it.
export function RubricLevelBadge({
  level,
  source = 'recording',
  code,
}: {
  level: 1 | 2 | 3 | 4 | null
  source?: 'recording' | 'plan'
  /** When given, a closed "What this level looks like" follows the badge. */
  code?: string
}) {
  if (level == null) {
    return (
      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-dashed border-hairline px-3 py-1 text-xs font-semibold text-ink-soft">
        {source === 'plan' ? 'Not enough evidence in the plan' : 'Not enough evidence in this recording'}
      </div>
    )
  }
  return (
    <>
    <div className="mt-3 flex items-center gap-3" aria-label={`Level ${level} of 4: ${RUBRIC_LEVEL_NAMES[level]}`}>
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={`h-2.5 w-7 rounded-full ${step <= level ? RUBRIC_LEVEL_FILL[level] : 'bg-hairline'}`}
          />
        ))}
      </div>
      <span className="text-sm font-bold text-forest">
        Level {level} · {RUBRIC_LEVEL_NAMES[level]}
      </span>
    </div>
    {code && <RubricLevelGuide code={code} level={level} />}
    </>
  )
}

function RubricLevelGuide({ code, level }: { code: string; level: 1 | 2 | 3 | 4 }) {
  const looks = RUBRIC_LEVEL_LOOKS_LIKE[code]
  if (!looks) return null
  const next = level < 4 ? ((level + 1) as 2 | 3 | 4) : null
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-forest">What this level looks like</summary>
      <div className="mt-2 flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-hairline">
        <div>
          <p className="text-xs font-semibold text-ink-soft">
            Level {level} · {RUBRIC_LEVEL_NAMES[level]}
          </p>
          <p className="mt-0.5 text-ink">{looks[level - 1]}</p>
        </div>
        {next && (
          <div>
            <p className="text-xs font-semibold text-ink-soft">
              Next step up: Level {next} · {RUBRIC_LEVEL_NAMES[next]}
            </p>
            <p className="mt-0.5 text-ink">{looks[next - 1]}</p>
          </div>
        )}
      </div>
    </details>
  )
}

