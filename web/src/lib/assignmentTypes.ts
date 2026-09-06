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
