import type { ExperienceLevel } from './api'

export const EXPERIENCE_OPTIONS: { value: ExperienceLevel; label: string }[] = [
  { value: 'first_year', label: 'First year' },
  { value: 'early', label: '2–5 years' },
  { value: 'established', label: '6–15 years' },
  { value: 'veteran', label: '15+ years' },
]

// Six or more years in. These teachers see refinement-focused starting points
// instead of the new-teacher ones, and First 30 Days is tucked away. Anyone
// who hasn't answered keeps the original experience.
export function isExperienced(level: ExperienceLevel | null | undefined): boolean {
  return level === 'established' || level === 'veteran'
}
