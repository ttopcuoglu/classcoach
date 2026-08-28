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
    description: 'Try a beginner-level defiance scenario in Coach Chat to build a starting playbook.',
    linkTo: '/coach-chat',
    linkLabel: 'Go to Coach Chat',
    suggestedCategory: 'defiance',
  },
  {
    id: 'practice-peer-conflict',
    title: 'Practice a peer conflict scenario',
    description: 'Two students arguing is one of the most common first-month moments — get a rep in now.',
    linkTo: '/coach-chat',
    linkLabel: 'Go to Coach Chat',
    suggestedCategory: 'peer_conflict',
  },
  {
    id: 'first-parent-message',
    title: 'Draft your first parent message',
    description: 'Practice drafting a message before you need one for real.',
    linkTo: '/communications?tool=write',
    linkLabel: 'Go to Communications',
  },
  {
    id: 'practice-disengagement',
    title: 'Practice a disengagement scenario',
    description: 'A student who checks out is a different challenge than one who acts out — practice both.',
    linkTo: '/coach-chat',
    linkLabel: 'Go to Coach Chat',
    suggestedCategory: 'disengagement',
  },
  {
    id: 'first-debrief',
    title: 'Ask about your first real moment',
    description: 'Once something real happens, use the Ask tab in Coach Chat to reflect on it.',
    linkTo: '/coach-chat?tab=ask',
    linkLabel: 'Go to Coach Chat',
  },
  {
    id: 'review-cheat-sheet',
    title: 'Review your cheat sheet',
    description: 'Check in on the go-to phrases you\'ve built up so far.',
    linkTo: '/cheat-sheet',
    linkLabel: 'View Cheat Sheet',
  },
]
