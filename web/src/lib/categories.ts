export const CATEGORIES: { label: string; value?: string }[] = [
  { label: 'All' },
  { label: 'Responding to resistance', value: 'defiance' },
  { label: 'Engagement & participation', value: 'disengagement' },
  { label: 'Conflict & repair', value: 'peer_conflict' },
  { label: 'Interruptions & redirection', value: 'disruption' },
  { label: 'Routines & transitions', value: 'transitions' },
  { label: 'Devices & digital routines', value: 'technology_misuse' },
]

export function categoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value
}
