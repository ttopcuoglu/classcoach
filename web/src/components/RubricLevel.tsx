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
export function RubricLevelBadge({ level, source = 'recording' }: { level: 1 | 2 | 3 | 4 | null; source?: 'recording' | 'plan' }) {
  if (level == null) {
    return (
      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-dashed border-hairline px-3 py-1 text-xs font-semibold text-ink-soft">
        {source === 'plan' ? 'Not enough evidence in the plan' : 'Not enough evidence in this recording'}
      </div>
    )
  }
  return (
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
  )
}

