export type Mood = 'good' | 'okay' | 'stressed' | 'overwhelmed'

export type DailyTip = {
  text: string
  moods: Mood[] | 'any'
}

export const DAILY_TIPS: DailyTip[] = [
  {
    text: 'Consistency beats intensity. A calm, predictable response to small disruptions does more for classroom culture than an occasional dramatic one.',
    moods: 'any',
  },
  {
    text: "It's okay to end a rough day without solving everything. Pick one thing to try differently tomorrow, and let the rest go.",
    moods: ['stressed', 'overwhelmed'],
  },
  {
    text: "When you're stretched thin, lower the bar for yourself, not for your students. A shorter lesson delivered calmly beats a full one delivered frazzled.",
    moods: ['stressed', 'overwhelmed'],
  },
  {
    text: 'A two-minute check-in with a struggling student often prevents a twenty-minute disruption later.',
    moods: 'any',
  },
  {
    text: "Notice what's working today, not just what's not. Small wins compound faster than they feel like they do.",
    moods: ['good', 'okay'],
  },
  {
    text: 'Silence after a question feels longer to you than it does to your students. Give it three extra seconds before you rescue it.',
    moods: 'any',
  },
  {
    text: "You don't have to win every power struggle in the moment. Disengaging calmly and following up privately is often the stronger move.",
    moods: ['stressed', 'overwhelmed'],
  },
  {
    text: 'Relationships are built in the boring moments — a hallway greeting, a genuine question about their weekend — not just the big interventions.',
    moods: 'any',
  },
  {
    text: "Burnout often shows up as irritability before it shows up as exhaustion. If you're snapping more than usual, that's a signal to rest, not push harder.",
    moods: ['stressed', 'overwhelmed'],
  },
  {
    text: 'Momentum matters. If today went well, notice what you did differently and try to repeat it tomorrow.',
    moods: ['good'],
  },
]

export function pickDailyTip(mood: Mood | null): string {
  const pool = mood
    ? DAILY_TIPS.filter((tip) => tip.moods === 'any' || tip.moods.includes(mood))
    : DAILY_TIPS
  return pool[Math.floor(Math.random() * pool.length)].text
}
