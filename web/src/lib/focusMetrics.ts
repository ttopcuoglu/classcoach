// Shared between Audio Coaching's My Growth tab and the onboarding wizard's
// "initial focus" step — kept in one place so a 10-entry categorized
// structure can't silently drift between the two consumers.
import type { FocusMetric } from './api'

export const FOCUS_METRIC_LABELS: Record<FocusMetric, string> = {
  talkRatio: 'Talk ratio',
  higherOrderPct: 'Higher-order questions',
  avgWaitTime: 'Avg. wait time',
  cfuCount: 'Checks for understanding',
  followUpQuestionCount: 'Follow-up questions',
  redirectionCount: 'Redirection language',
  toneRatio: 'Positive vs. corrective tone',
  directiveCount: 'Clear directions given',
  nameMentionCount: 'Student names used',
  feedbackSpecificity: 'Feedback specificity',
}

// Reuses the report's own existing category names (CategorySection /
// ClimateRoutinesTab) so the dropdown reads consistently with the rest of
// the app, rather than inventing a parallel taxonomy.
export const FOCUS_METRIC_GROUPS: { category: string; metrics: FocusMetric[] }[] = [
  { category: 'Talk & Participation', metrics: ['talkRatio'] },
  { category: 'Questioning & Thinking', metrics: ['higherOrderPct', 'avgWaitTime', 'followUpQuestionCount'] },
  { category: 'Checking Understanding', metrics: ['cfuCount', 'feedbackSpecificity'] },
  { category: 'Climate & Tone', metrics: ['redirectionCount', 'toneRatio', 'nameMentionCount'] },
  { category: 'Routines', metrics: ['directiveCount'] },
]
