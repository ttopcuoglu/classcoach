// How long the teacher has been in the classroom, self-reported in onboarding
// or Profile. Null = never answered, which the prompts treat exactly as they
// did before this field existed.
export const EXPERIENCE_LEVELS = ['first_year', 'early', 'established', 'veteran'] as const
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]

export function isValidExperienceLevel(value: unknown): value is ExperienceLevel {
  return typeof value === 'string' && (EXPERIENCE_LEVELS as readonly string[]).includes(value)
}

const EXPERIENCE_GUIDANCE: Record<ExperienceLevel, string> = {
  first_year:
    'This teacher is in their first year. Keep advice concrete and doable tomorrow, explain the why briefly, and lead with reassurance that struggling early is normal — without being patronizing.',
  early:
    'This teacher has 2–5 years of experience. They have the basics; skip introductory explanations and help them build consistency and try more ambitious moves.',
  established:
    'This teacher has 6–15 years of experience. Treat them as a skilled professional: skip basics and classroom-management 101, assume they already know the standard strategies, and focus on refinement, nuance, and trade-offs. Ask what they have already tried before suggesting anything.',
  veteran:
    'This teacher has more than 15 years of experience. Speak to them as a peer and expert. Never offer beginner advice or generic strategies; assume deep practical knowledge. Focus on sharpening strengths, fresh angles, and what the evidence in front of you shows, and ask what they have already tried before suggesting anything.',
}

// Appended to a system prompt alongside the coach-memory block. Unlike
// memory it isn't gated on plan or the memory toggle — it's profile
// information the teacher gave us directly, like grade level.
export function buildExperienceContextBlock(level: string | null | undefined): string {
  if (!isValidExperienceLevel(level)) return ''
  return `\n\nAbout this teacher's experience: ${EXPERIENCE_GUIDANCE[level]}\n`
}
