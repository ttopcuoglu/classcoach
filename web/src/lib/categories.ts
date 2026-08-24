export const CATEGORIES: { label: string; value?: string }[] = [
  { label: 'All' },
  { label: 'Defiance', value: 'defiance' },
  { label: 'Disengagement', value: 'disengagement' },
  { label: 'Peer conflict', value: 'peer_conflict' },
  { label: 'Disruption', value: 'disruption' },
  { label: 'Transitions', value: 'transitions' },
  { label: 'Technology misuse', value: 'technology_misuse' },
]

export function categoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value
}
