// Shared between Audio Coaching's My Growth tab and the onboarding wizard's
// "initial focus" step — kept in one place so the two consumers can't drift.
import type { FocusMetric } from './api'

export const FOCUS_METRIC_LABELS: Record<FocusMetric, string> = {
  talkRatio: 'Talk time (Teacher, Student, Group, Silence)',
  teacherPace: 'Pace',
  higherOrderPct: 'Questions',
  cfuCount: 'Checks',
  // Retired from the picker, kept so an account that chose one still renders.
  longestMonologue: 'Longest unbroken stretch',
  waitTime2: 'Pause after an answer',
  followUpQuestionCount: 'Answers followed up',
  avgWaitTime: 'Avg. wait time',
  redirectionCount: 'Redirection language',
  toneRatio: 'Positive vs. corrective tone',
  directiveCount: 'Clear directions given',
  nameMentionCount: 'Student names used',
  feedbackSpecificity: 'Feedback specificity',
}

/// What My Growth will actually chart, in order: the Summary's numbers
/// (2026-11-02). Talk time holds the four talk shares on one chart — Teacher
/// Talk, Student Talk, Group Talk and Silence — under the talkRatio key, so no
/// stored focus changes and no installed iPhone meets a value it cannot read.
export const TRENDABLE_FOCUS_METRICS: FocusMetric[] = ['talkRatio', 'teacherPace', 'higherOrderPct', 'cfuCount']

/// Shown below the core set and never used to claim an improvement. Its
/// median across real lessons is 1 with a range of 0-7, and a model-read count
/// drifts by about 2 on identical input — so a single lesson's number is not
/// something to react to, though ten of them are worth watching.
export const SECONDARY_FOCUS_METRICS: FocusMetric[] = ['cfuCount']

/// Why each retired metric is no longer offered, so this is a decision with
/// reasons attached rather than a list that quietly shrank. Shown to a teacher
/// whose stored focus is one of these.
export const RETIRED_FOCUS_METRICS: Partial<Record<FocusMetric, string>> = {
  longestMonologue:
    'A stretch ends when a student is heard, so it needs students told apart from you — and on many lessons they are not. The Summary dropped it on 2026-11-02.',
  waitTime2:
    'The pause after an answer needs to know when a student answered, which the recording often cannot tell. The Summary dropped it on 2026-11-02.',
  followUpQuestionCount:
    'Answers followed up needs the student answers heard, which the recording often cannot tell apart from you. The Summary dropped it on 2026-11-02.',
  avgWaitTime:
    'Wait time after a question needs a detected question AND an audible answer, so it lands on about a quarter of lessons. The pause after an answer measures the neighbouring thing three times as often.',
  toneRatio:
    'Needs at least five positive or corrective phrases in one lesson, which about a quarter of lessons reach. More lessons would not change that — the limit is per lesson, not the number of them.',
  feedbackSpecificity:
    'Needs at least five feedback moments in one lesson, which fewer still reach, and the detector deliberately excludes bare acknowledgement — so the number says more about our strictness than your practice.',
  redirectionCount:
    'Rises with a hard group or a difficult period as readily as with anything you did, and we cannot yet tell those apart, because lessons are not grouped by class.',
  directiveCount: 'More directions is not better or worse — a lab has more than a seminar, so the line would track lesson type.',
  nameMentionCount:
    'A name used to credit a contribution and a name used to stop a conversation are opposite things, counted identically.',
}

export function isTrendable(metric: FocusMetric): boolean {
  return TRENDABLE_FOCUS_METRICS.includes(metric)
}

// Grouped the way the report's own sections are, so the picker reads
// consistently with the rest of the app.
export const FOCUS_METRIC_GROUPS: { category: string; metrics: FocusMetric[] }[] = [
  { category: 'Talk & Participation', metrics: ['talkRatio', 'teacherPace'] },
  { category: 'Questioning & Checking', metrics: ['higherOrderPct', 'cfuCount'] },
]
