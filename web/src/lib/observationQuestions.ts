// The ten observation questions, one per component of Danielson Domains 2 and
// 3, each about what a recording can't capture. Mirrors
// server/src/lib/observationReport.ts OBSERVATION_QUESTIONS — the server only
// accepts these codes and option keys.

export type ObservationQuestion = { code: string; component: string; text: string; options: { key: string; label: string }[] }

export const OBSERVATION_QUESTIONS: ObservationQuestion[] = [
  {
    code: '2a',
    component: 'Respect and rapport',
    text: 'How did students treat each other and the teacher, including body language and pair work?',
    options: [
      { key: 'warm', label: 'Warm and respectful' },
      { key: 'mostly', label: 'Mostly respectful' },
      { key: 'unkind', label: 'Some unkind or dismissive moments' },
    ],
  },
  {
    code: '2b',
    component: 'Culture for learning',
    text: 'Did students show effort and care about getting it right (sticking with hard parts, revising work)?',
    options: [
      { key: 'most', label: 'Most students' },
      { key: 'some', label: 'Some students' },
      { key: 'few', label: 'Few students' },
    ],
  },
  {
    code: '2c',
    component: 'Classroom routines',
    text: 'How did routines, transitions and materials run?',
    options: [
      { key: 'smooth', label: 'Smoothly, students ran them' },
      { key: 'mostly', label: 'Mostly smooth, some lost time' },
      { key: 'lost', label: 'Frequent lost time' },
    ],
  },
  {
    code: '2d',
    component: 'Student behavior',
    text: 'How did students respond to expectations, including nonverbal cues?',
    options: [
      { key: 'self', label: 'Students managed themselves' },
      { key: 'cues', label: 'Responded quickly to cues' },
      { key: 'repeated', label: 'Needed repeated redirection' },
    ],
  },
  {
    code: '2e',
    component: 'Physical space',
    text: 'Did the room support the lesson (layout, visibility, access to materials, walls)?',
    options: [
      { key: 'yes', label: 'Yes, clearly' },
      { key: 'partly', label: 'Partly' },
      { key: 'no', label: 'Not really' },
    ],
  },
  {
    code: '3a',
    component: 'Communicating with students',
    text: 'Ask one or two students: “What are you learning, and why?” Could they explain it?',
    options: [
      { key: 'clearly', label: 'Clearly' },
      { key: 'partly', label: 'Partly' },
      { key: 'no', label: 'Not really' },
      { key: 'not_asked', label: 'I didn’t ask' },
    ],
  },
  {
    code: '3b',
    component: 'Questioning and discussion',
    text: 'In pairs or groups, were students discussing the content with each other?',
    options: [
      { key: 'most', label: 'Most groups' },
      { key: 'some', label: 'Some groups' },
      { key: 'few', label: 'Few groups' },
      { key: 'none', label: 'No pair or group work' },
    ],
  },
  {
    code: '3c',
    component: 'Student engagement',
    text: 'About how many students were actively thinking and working?',
    options: [
      { key: 'all', label: 'All or almost all' },
      { key: 'most', label: 'Most' },
      { key: 'half', label: 'About half' },
      { key: 'few', label: 'Few' },
    ],
  },
  {
    code: '3d',
    component: 'Checking understanding',
    text: 'From the student work and checks you saw (whiteboards, exit tickets, circulating), how many students were getting it?',
    options: [
      { key: 'most', label: 'Most' },
      { key: 'some', label: 'Some' },
      { key: 'few', label: 'Few' },
      { key: 'not_seen', label: 'I didn’t see student work' },
    ],
  },
  {
    code: '3e',
    component: 'Responding to students',
    text: 'When students struggled or finished early, did they get help or a next step?',
    options: [
      { key: 'yes', label: 'Yes, adjusted for students or groups' },
      { key: 'sometimes', label: 'Sometimes' },
      { key: 'no', label: 'No' },
      { key: 'no_need', label: 'There was no need' },
    ],
  },
]
