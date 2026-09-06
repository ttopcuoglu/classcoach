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

// One small field per assignment type — the intake step renders only the
// fields for the selected type (progressive disclosure), never all of
// them. Every field is optional free text; a teacher who skips them still
// gets a working coach.
export const TYPE_FIELDS: Record<AssignmentType, { key: string; label: string; placeholder?: string }[]> = {
  classwork: [
    { key: 'availableTime', label: 'Available class time' },
    { key: 'format', label: 'Individual, partner, group, or mixed?' },
    { key: 'checkpoints', label: 'Teacher support and checkpoints' },
    { key: 'materials', label: 'Materials or technology' },
    { key: 'exitCriteria', label: 'What should students complete before leaving?' },
  ],
  homework: [
    { key: 'completionTime', label: 'Expected completion time' },
    { key: 'techRequired', label: 'Is technology required?' },
    { key: 'independentCompletion', label: 'Can students complete it independently?' },
    { key: 'purpose', label: 'Practice, preparation, application, or extension?' },
    { key: 'resourceAccess', label: 'Access to resources outside school' },
  ],
  project: [
    { key: 'duration', label: 'Project duration' },
    { key: 'format', label: 'Individual or collaborative?' },
    { key: 'finalProduct', label: 'Final product' },
    { key: 'milestones', label: 'Milestones and checkpoints' },
    { key: 'studentChoice', label: 'Student choice' },
    { key: 'presentation', label: 'Presentation or reflection requirements' },
  ],
  assessment: [
    { key: 'purpose', label: 'Formative or summative?' },
    { key: 'timeAvailable', label: 'Time available' },
    { key: 'evidenceTypes', label: 'Types of questions or performance evidence' },
    { key: 'accommodations', label: 'Accommodations' },
    { key: 'permittedResources', label: 'Permitted resources' },
    { key: 'aiPolicy', label: 'Is AI prohibited, limited, or intentionally included?' },
  ],
  group_task: [
    { key: 'groupSize', label: 'Group size' },
    { key: 'roles', label: 'Student roles' },
    { key: 'accountability', label: 'Individual accountability' },
    { key: 'product', label: 'Collaborative product' },
    { key: 'participationTracking', label: 'How will participation be documented?' },
  ],
  exit_ticket: [
    { key: 'learningTarget', label: 'Learning target' },
    { key: 'completionTime', label: 'Completion time' },
    { key: 'responseType', label: 'Type of response' },
    { key: 'intendedUse', label: 'How will you use the results?' },
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
