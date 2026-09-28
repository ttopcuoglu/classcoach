import { FOCUS_AREAS } from './focusAreas'

// Category is the second level of the Ask & Practice taxonomy: every value
// belongs to exactly one focus area (see focusAreas.ts). This flat list exists
// so `categoryLabel` can name any stored category — including the six original
// behavior values, which are now Classroom Management's sub-categories — without
// the caller having to know which area it came from.
export const CATEGORIES: { label: string; value?: string }[] = [
  { label: 'All' },
  ...FOCUS_AREAS.flatMap((a) => a.subCategories.map((c) => ({ label: c.label, value: c.value }))),
]

export function categoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value
}
