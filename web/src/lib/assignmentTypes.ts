import type { AssignmentType } from './api'

export const ASSIGNMENT_TYPES: { value: AssignmentType; label: string }[] = [
  { value: 'classwork', label: 'Classwork' },
  { value: 'homework', label: 'Homework' },
  { value: 'project', label: 'Project' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'group_task', label: 'Group task' },
  { value: 'exit_ticket', label: 'Exit ticket' },
  { value: 'other', label: 'Other' },
]

export function assignmentTypeLabel(value: AssignmentType | null): string {
  if (!value) return 'Assignment'
  return ASSIGNMENT_TYPES.find((t) => t.value === value)?.label ?? value
}

export const ESTIMATED_TIME_OPTIONS = [
  '10 min',
  '20 min',
  '30 min',
  '45-60 min',
  '1-2 class periods',
  '1 week',
  '2 weeks',
  '3-4 weeks',
  'Other',
]

// One small field per assignment type — the intake step renders only the
// fields for the selected type (progressive disclosure), never all of
// them. `options`, when present, renders a dropdown (plus a trailing
// "Other" choice that reveals a one-line text input) instead of free
// text — used wherever there's a natural small set of answers. Every
// field is optional; a teacher who skips them still gets a working coach.
export const TYPE_FIELDS: Record<AssignmentType, { key: string; label: string; options?: string[] }[]> = {
  classwork: [
    { key: 'availableTime', label: 'Available class time', options: ['10 min', '20 min', '30 min', '45 min', 'A full class period'] },
    { key: 'format', label: 'Individual, partner, group, or mixed?', options: ['Individual', 'Partner', 'Small group', 'Whole class / mixed'] },
    { key: 'checkpoints', label: 'Teacher support and checkpoints', options: ["I'll check in partway through", 'Students work independently start to finish', "I'll circulate throughout"] },
    { key: 'materials', label: 'Materials or technology' },
    { key: 'exitCriteria', label: 'What should students complete before leaving?' },
  ],
  homework: [
    { key: 'completionTime', label: 'Expected completion time', options: ['10 min', '20 min', '30 min', '45-60 min'] },
    { key: 'techRequired', label: 'Is technology required?', options: ['Yes', 'No', 'Optional'] },
    { key: 'independentCompletion', label: 'Can students complete it independently?', options: ['Yes, fully independent', 'Mostly, with minor help', 'No, needs support at home'] },
    { key: 'purpose', label: 'Practice, preparation, application, or extension?', options: ['Practice', 'Preparation for next class', 'Application', 'Extension'] },
    { key: 'resourceAccess', label: 'Access to resources outside school', options: ['All students have what they need', 'Some students may not', 'Not sure'] },
  ],
  project: [
    { key: 'duration', label: 'Project duration', options: ['1 class period', 'A few days', '1 week', '2 weeks', '3-4 weeks', 'A full unit'] },
    { key: 'format', label: 'Individual or collaborative?', options: ['Individual', 'Pairs', 'Small groups (3-4)', 'Whole class'] },
    { key: 'finalProduct', label: 'Final product' },
    { key: 'milestones', label: 'Milestones and checkpoints' },
    { key: 'studentChoice', label: 'Student choice', options: ['Full choice of topic', 'Choice within a set list', 'No choice — same task for all'] },
    { key: 'presentation', label: 'Presentation or reflection requirements', options: ['Presented to the class', 'Presented to an outside audience', 'Written reflection only', 'None'] },
  ],
  assessment: [
    { key: 'purpose', label: 'Formative or summative?', options: ['Formative', 'Summative'] },
    { key: 'timeAvailable', label: 'Time available', options: ['15 min', '30 min', '45 min', 'A full class period', 'Take-home'] },
    { key: 'evidenceTypes', label: 'Types of questions or performance evidence', options: ['Multiple choice / short answer', 'Written response', 'Performance task', 'Mixed'] },
    { key: 'accommodations', label: 'Accommodations' },
    { key: 'permittedResources', label: 'Permitted resources', options: ['Closed — no notes or resources', 'Notes allowed', 'Open resource'] },
    { key: 'aiPolicy', label: 'Is AI prohibited, limited, or intentionally included?', options: ['Prohibited', 'Limited', 'Intentionally included', 'Not sure yet'] },
  ],
  group_task: [
    { key: 'groupSize', label: 'Group size', options: ['2', '3', '4', '5+'] },
    { key: 'roles', label: 'Student roles', options: ["I'll assign roles", 'Students choose roles', 'No formal roles'] },
    { key: 'accountability', label: 'Individual accountability', options: ['Individual quiz or reflection alongside group work', 'Peer evaluation', 'Group grade only', 'Not sure yet'] },
    { key: 'product', label: 'Collaborative product' },
    { key: 'participationTracking', label: 'How will participation be documented?', options: ['Observation during work time', 'Individual check-ins', 'Peer feedback forms', 'Not tracked formally'] },
  ],
  exit_ticket: [
    { key: 'learningTarget', label: 'Learning target' },
    { key: 'completionTime', label: 'Completion time', options: ['2 min', '5 min', '10 min'] },
    { key: 'responseType', label: 'Type of response', options: ['Multiple choice', 'Short written response', 'Thumbs up/down + why', 'Quick sketch or diagram'] },
    { key: 'intendedUse', label: 'How will you use the results?', options: ["Adjust tomorrow's lesson", 'Group students for reteaching', 'Just a quick pulse check'] },
  ],
  other: [],
}

export const ASSIGNMENT_SUBJECTS = [
  'Math',
  'English / ELA',
  'Science',
  'Social Studies',
  'World Language',
  'Arts',
  'PE / Health',
  'CTE / Elective',
  'Other',
]
