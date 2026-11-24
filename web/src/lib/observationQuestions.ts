// The five observation questions (the user's, 2026-11-24), each about what a
// recording can't capture, every one with "Not observed". Mirrors
// server/src/lib/observationReport.ts OBSERVATION_QUESTIONS — the server only
// accepts these ids and option keys. Classroom management speaks to 2c and 2d.

export type ObservationQuestion = { id: string; codes: string[]; title: string; text: string; options: { key: string; label: string }[] }

const NOT_OBSERVED = { key: 'not_observed', label: 'Not observed' }

export const OBSERVATION_QUESTIONS: ObservationQuestion[] = [
  {
    id: 'management',
    codes: ['2c', '2d'],
    title: 'Classroom management',
    text: 'How smoothly did routines, transitions, and student behavior support learning?',
    options: [{ key: 'smooth', label: 'Smoothly' }, { key: 'some', label: 'Some interruptions' }, { key: 'frequent', label: 'Frequent interruptions' }, NOT_OBSERVED],
  },
  {
    id: 'climate',
    codes: ['2a'],
    title: 'Classroom climate',
    text: 'How respectful and supportive were interactions among students and with the teacher?',
    options: [{ key: 'warm', label: 'Warm and respectful' }, { key: 'mostly', label: 'Mostly respectful' }, { key: 'unkind', label: 'Some unkind or dismissive interactions' }, NOT_OBSERVED],
  },
  {
    id: 'understanding',
    codes: ['3d'],
    title: 'Student understanding',
    text: 'Among the students whose work or responses you checked, how many showed understanding of the lesson?',
    options: [{ key: 'most', label: 'Most' }, { key: 'some', label: 'Some' }, { key: 'few', label: 'Few' }, NOT_OBSERVED],
  },
  {
    id: 'physical',
    codes: ['2e'],
    title: 'Physical organization',
    text: 'Did the room layout, visibility, and access to materials support student participation?',
    options: [{ key: 'yes', label: 'Yes' }, { key: 'partly', label: 'Partly' }, { key: 'no', label: 'No' }, NOT_OBSERVED],
  },
  {
    id: 'engagement',
    codes: ['3c'],
    title: 'Student engagement',
    text: 'About how many students were actively participating in the learning task?',
    options: [{ key: 'all', label: 'All or almost all' }, { key: 'most', label: 'Most' }, { key: 'half', label: 'About half' }, { key: 'few', label: 'Few' }, NOT_OBSERVED],
  },
]

/// Plain names for tagging a note with a component, in Danielson order.
export const NOTE_TAGS: { code: string; label: string }[] = [
  { code: '2a', label: 'Classroom climate' },
  { code: '2b', label: 'Effort and persistence' },
  { code: '2c', label: 'Routines and transitions' },
  { code: '2d', label: 'Student behavior' },
  { code: '2e', label: 'Physical organization' },
  { code: '3a', label: 'What students are learning' },
  { code: '3b', label: 'Student discussion' },
  { code: '3c', label: 'Student engagement' },
  { code: '3d', label: 'Student understanding' },
  { code: '3e', label: 'Help for students who need it' },
]

/// Note starters for what the five questions don't ask. Each starts a note
/// already tagged with its component.
export const NOTE_PROMPTS: { code: string; label: string; placeholder: string }[] = [
  { code: '2b', label: 'Effort and persistence', placeholder: 'Did students stick with hard parts, revise, care about getting it right?' },
  { code: '3a', label: 'What students said they were learning', placeholder: 'What did students say when you asked what they were learning and why?' },
  { code: '3b', label: 'Pair and group discussion', placeholder: 'Were pairs or groups discussing the content? How many?' },
  { code: '3e', label: 'Help for students who struggled or finished early', placeholder: 'What happened when students got stuck or finished early?' },
]
