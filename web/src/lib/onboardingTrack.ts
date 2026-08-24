export type OnboardingStep = {
  id: string
  title: string
  description: string
  linkTo?: string
  linkLabel?: string
  suggestedCategory?: string
}

export const ONBOARDING_TRACK: OnboardingStep[] = [
  {
    id: 'day-one-expectations',
    title: 'Write your day-one expectations',
    description:
      'Before students arrive, write down 3-5 clear, positively-framed expectations you\'ll introduce on day one.',
  },
  {
    id: 'practice-defiance',
    title: 'Practice a defiance scenario',
    description: 'Try a beginner-level defiance scenario in Try It Out to build a starting playbook.',
    linkTo: '/try-it-out',
    linkLabel: 'Go to Try It Out',
    suggestedCategory: 'defiance',
  },
  {
    id: 'practice-peer-conflict',
    title: 'Practice a peer conflict scenario',
    description: 'Two students arguing is one of the most common first-month moments — get a rep in now.',
    linkTo: '/try-it-out',
    linkLabel: 'Go to Try It Out',
    suggestedCategory: 'peer_conflict',
  },
  {
    id: 'first-parent-message',
    title: 'Draft your first parent message',
    description:
      'Use the Parent Message tab in Ask an Expert to practice drafting a message before you need one for real.',
    linkTo: '/ask-an-expert',
    linkLabel: 'Go to Ask an Expert',
  },
  {
    id: 'practice-disengagement',
    title: 'Practice a disengagement scenario',
    description: 'A student who checks out is a different challenge than one who acts out — practice both.',
    linkTo: '/try-it-out',
    linkLabel: 'Go to Try It Out',
    suggestedCategory: 'disengagement',
  },
  {
    id: 'first-debrief',
    title: 'Debrief your first real moment',
    description:
      'Once something real happens, use the "Debrief a Real Moment" tab in Try It Out to reflect on it.',
    linkTo: '/try-it-out',
    linkLabel: 'Go to Try It Out',
  },
  {
    id: 'review-cheat-sheet',
    title: 'Review your cheat sheet',
    description: 'Check in on the go-to phrases you\'ve built up so far.',
    linkTo: '/cheat-sheet',
    linkLabel: 'View Cheat Sheet',
  },
]
