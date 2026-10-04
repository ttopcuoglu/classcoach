// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

// Practice is four rows, each driven by the one above it. The cascade is the
// design: a kind belongs to exactly one topic, a course belongs to a band and
// a subject, and showing a choice that cannot apply is how the old collapsed
// panel ended up hiding the two controls that mattered behind a fold.
//
// The response shell below the intake is explicitly meant to be untouched, so
// several tests here exist to catch it being changed by accident — the badge,
// "How would you handle this?", "Not sure where to start?", "Try a different
// scenario" and "Get Feedback" are pinned as specified wording.

const generateScenario = vi.fn()
const createOwnScenario = vi.fn()
const getAttempts = vi.fn()
const getClassProfiles = vi.fn()
const submitAttempt = vi.fn()

vi.mock('../lib/api', () => ({
  generateScenario: (...a: unknown[]) => generateScenario(...a),
  createOwnScenario: (...a: unknown[]) => createOwnScenario(...a),
  getAttempts: () => getAttempts(),
  getClassProfiles: () => getClassProfiles(),
  submitAttempt: (...a: unknown[]) => submitAttempt(...a),
  deleteAttempt: vi.fn(),
  markAttemptTried: vi.fn(),
  saveAttemptReflection: vi.fn(),
  sendAttemptChat: vi.fn(),
  setAttemptSaved: vi.fn(),
  shareAttempt: vi.fn(),
  updateClassProfile: vi.fn(),
  createClassProfile: vi.fn(),
}))

vi.mock('../hooks/useSpeechToText', () => ({
  useSpeechToText: () => ({ supported: true, listening: false, toggleListening: vi.fn() }),
}))

const { default: TryItOut } = await import('./TryItOut')

function scenario(over: Record<string, unknown> = {}) {
  return {
    id: 's1',
    text: 'A student says plants get their food from the soil.',
    focusArea: 'teaching_and_learning',
    category: 'misconceptions',
    gradeBand: '9-12',
    subject: 'Science',
    course: 'Biology',
    topic: null,
    courseLevel: 'Honors',
    classMakeup: [],
    difficulty: 'intermediate',
    source: 'generated',
    createdAt: new Date().toISOString(),
    ...over,
  }
}

function renderPractice() {
  return render(
    <MemoryRouter>
      <TryItOut />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  generateScenario.mockReset()
  createOwnScenario.mockReset()
  submitAttempt.mockReset()
  getAttempts.mockResolvedValue([])
  getClassProfiles.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

// --- the four rows ---

test('all four rows are on screen, numbered and in order', async () => {
  renderPractice()
  await waitFor(() => expect(screen.getByText('1 · Topic')).toBeTruthy())
  const labels = ['1 · Topic', '2 · Kind', '3 · Your class', '4 · Difficulty']
  const all = Array.from(document.querySelectorAll('*'))
  const positions = labels.map((l) => all.indexOf(screen.getByText(l)))
  expect(positions).toEqual([...positions].sort((a, b) => a - b))
})

test('the topic row offers the same seven topics as Talk It Through', async () => {
  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Classroom Management' })).toBeTruthy())
  for (const label of [
    'Teaching and Learning',
    'Classroom Management',
    "A student I'm worried about",
    'Parent Communication',
    'Professionalism',
    'Me and this job',
    'Something else',
  ]) {
    expect(screen.getByRole('button', { name: label }), label).toBeTruthy()
  }
})

// The cascade. A kind belongs to exactly one topic, so there is nothing to
// show until a topic is chosen.
test('the kind row is empty until a topic is chosen, and explains why', async () => {
  renderPractice()
  await waitFor(() => expect(screen.getByText('2 · Kind')).toBeTruthy())
  expect(screen.getByText(/Pick a topic to narrow this/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Questioning and discussion' })).toBeNull()
})

test('choosing a topic fills the kind row with that topic’s kinds', async () => {
  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Classroom Management' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Classroom Management' }))

  await waitFor(() => expect(screen.getByRole('button', { name: /Engagement and participation/ })).toBeTruthy())
  expect(screen.getByRole('button', { name: /Behavior in the moment/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: /Group work breaking down/ })).toBeTruthy()
  // A kind from a different topic must not appear.
  expect(screen.queryByRole('button', { name: /Delivering hard news/ })).toBeNull()
})

test('changing topic clears a kind that belonged to the old one', async () => {
  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Classroom Management' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Classroom Management' }))
  await waitFor(() => expect(screen.getByRole('button', { name: /Phones and devices/ })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: /Phones and devices/ }))
  expect(screen.getByRole('button', { name: /Phones and devices/ }).getAttribute('aria-pressed')).toBe('true')

  fireEvent.click(screen.getByRole('button', { name: 'Parent Communication' }))

  await waitFor(() => expect(screen.getByRole('button', { name: /Delivering hard news/ })).toBeTruthy())
  for (const kind of ['Delivering hard news', 'Grade dispute', 'Attendance']) {
    expect(screen.getByRole('button', { name: new RegExp(kind) }).getAttribute('aria-pressed')).toBe('false')
  }
})

// Content fields are Teaching and Learning only — a parent email does not get
// better for knowing it came from an honors section.
test('only Teaching and Learning asks what is being taught right now', async () => {
  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Parent Communication' })).toBeTruthy())

  fireEvent.click(screen.getByRole('button', { name: 'Parent Communication' }))
  expect(screen.queryByText('What are you teaching right now?')).toBeNull()
  expect(screen.queryByText('Subject')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Teaching and Learning' }))
  await waitFor(() => expect(screen.getByText('What are you teaching right now?')).toBeTruthy())
  expect(screen.getByText('Subject')).toBeTruthy()
})

test('the course row only appears once a subject with courses is chosen', async () => {
  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Teaching and Learning' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Teaching and Learning' }))
  await waitFor(() => expect(screen.getByText('Subject')).toBeTruthy())
  expect(screen.queryByText('Course')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Science' }))
  await waitFor(() => expect(screen.getByText('Course')).toBeTruthy())
})

// The label exists so nobody reads the row as a judgment about themselves.
test('the difficulty question says whose difficulty it is', async () => {
  renderPractice()
  await waitFor(() => expect(screen.getByText('4 · Difficulty')).toBeTruthy())
  expect(screen.getByText(/How tough should it be\?/)).toBeTruthy()
  expect(screen.getByText(/This is the scenario’s difficulty, not yours\./)).toBeTruthy()
})

// --- describe my own ---

test('describe my own is always offered, whatever the topic', async () => {
  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Describe my own' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Me and this job' }))
  expect(screen.getByRole('button', { name: 'Describe my own' })).toBeTruthy()
})

test('describing your own opens a box and changes what the button does', async () => {
  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Describe my own' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Describe my own' }))

  const box = screen.getByPlaceholderText(/What happened, or what are you about to walk into\?/)
  expect(box).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Use my situation' })).toBeTruthy()
  // Nothing typed yet, so there is nothing to use.
  expect(screen.getByRole('button', { name: 'Use my situation' })).toHaveProperty('disabled', true)
})

test('your own situation is sent as written, with no generation call', async () => {
  createOwnScenario.mockResolvedValue(scenario({ source: 'own', category: 'describe_my_own' }))
  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Describe my own' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Describe my own' }))

  fireEvent.change(screen.getByPlaceholderText(/What happened/), {
    target: { value: 'A parent cornered me at pickup.' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Use my situation' }))

  await waitFor(() => expect(createOwnScenario).toHaveBeenCalled())
  expect(createOwnScenario.mock.calls[0][0].text).toBe('A parent cornered me at pickup.')
  expect(generateScenario).not.toHaveBeenCalled()
})

// Three of the same situation is not a session.
test('the quick session is hidden while describing your own', async () => {
  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: /Quick Session/ })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Describe my own' }))
  expect(screen.queryByRole('button', { name: /Quick Session/ })).toBeNull()
})

// --- what reaches the server ---

test('the topic and kind are sent as focusArea and category', async () => {
  generateScenario.mockResolvedValue(scenario())
  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Professionalism' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Professionalism' }))
  await waitFor(() => expect(screen.getByRole('button', { name: /Post-observation/ })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: /Post-observation/ }))
  fireEvent.click(screen.getByRole('button', { name: 'New Scenario' }))

  await waitFor(() => expect(generateScenario).toHaveBeenCalled())
  expect(generateScenario.mock.calls[0][0]).toMatchObject({
    focusArea: 'professionalism',
    category: 'post_observation',
  })
})

// Content fields must not leak out of the one topic that asks for them.
test('content fields are not sent from a topic that does not ask for them', async () => {
  generateScenario.mockResolvedValue(scenario())
  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Parent Communication' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Parent Communication' }))
  fireEvent.click(screen.getByRole('button', { name: 'New Scenario' }))

  await waitFor(() => expect(generateScenario).toHaveBeenCalled())
  const sent = generateScenario.mock.calls[0][0]
  expect(sent.subject).toBeUndefined()
  expect(sent.course).toBeUndefined()
  expect(sent.topic).toBeUndefined()
})

// --- the response shell, which must not change ---

test('the response shell keeps its specified wording', async () => {
  generateScenario.mockResolvedValue(scenario())
  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'New Scenario' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'New Scenario' }))

  await waitFor(() => expect(screen.getByText('How would you handle this?')).toBeTruthy())
  expect(screen.getByPlaceholderText(/Your first move/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Not sure where to start?' })).toBeTruthy()
  expect(screen.getByRole('button', { name: /Speak your response/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Try a different scenario' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Get Feedback' })).toBeTruthy()
})

test('the scenario badge still reads kind, then class, then difficulty', async () => {
  generateScenario.mockResolvedValue(scenario())
  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'New Scenario' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'New Scenario' }))

  await waitFor(() =>
    expect(
      screen.getByText('A misconception in the room · Grades 9-12 · Biology · Honors · Intermediate'),
    ).toBeTruthy(),
  )
})

// --- the three-part feedback ---

test('feedback comes back as three named parts', async () => {
  generateScenario.mockResolvedValue(scenario())
  submitAttempt.mockResolvedValue({
    id: 'a1',
    scenarioId: 's1',
    responseText: 'I would ask them to explain their reasoning.',
    feedback: 'did\n\nleft',
    modelResponse: 'keepable line',
    coachingParts: {
      did: 'It put the thinking back on the student.',
      left: 'It did not surface where the idea came from.',
      keep: 'Say more about what the plant is actually taking in.',
    },
    rating: 4,
    saved: false,
    createdAt: new Date().toISOString(),
    scenario: scenario(),
    conversation: [],
    triedAt: null,
    reflectionNote: null,
  })

  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'New Scenario' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'New Scenario' }))
  await waitFor(() => expect(screen.getByText('How would you handle this?')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText(/Your first move/), { target: { value: 'My answer.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Get Feedback' }))

  await waitFor(() => expect(screen.getByText('What your move did')).toBeTruthy())
  expect(screen.getByText('What it left on the table')).toBeTruthy()
  expect(screen.getByText('One line worth keeping')).toBeTruthy()
  expect(screen.getByText('It put the thinking back on the student.')).toBeTruthy()
})

// An attempt made before the three-part shape existed must still render.
test('an older attempt falls back to the coaching it actually stored', async () => {
  generateScenario.mockResolvedValue(scenario())
  submitAttempt.mockResolvedValue({
    id: 'a1',
    scenarioId: 's1',
    responseText: 'My answer.',
    feedback: 'Some older coaching text.',
    modelResponse: 'An older model response.',
    coachingParts: null,
    rating: 3,
    saved: false,
    createdAt: new Date().toISOString(),
    scenario: scenario(),
    conversation: [],
    triedAt: null,
    reflectionNote: null,
  })

  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'New Scenario' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'New Scenario' }))
  await waitFor(() => expect(screen.getByText('How would you handle this?')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText(/Your first move/), { target: { value: 'My answer.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Get Feedback' }))

  await waitFor(() => expect(screen.getByText('Coaching')).toBeTruthy())
  expect(screen.getByText('A model response')).toBeTruthy()
  expect(screen.queryByText('What your move did')).toBeNull()
})

// --- one notch harder ---

test('feedback offers the same situation one notch harder', async () => {
  generateScenario.mockResolvedValue(scenario({ difficulty: 'intermediate' }))
  submitAttempt.mockResolvedValue({
    id: 'a1',
    scenarioId: 's1',
    responseText: 'My answer.',
    feedback: 'f',
    modelResponse: null,
    coachingParts: { did: 'did', left: 'left', keep: null },
    rating: 4,
    saved: false,
    createdAt: new Date().toISOString(),
    scenario: scenario({ difficulty: 'intermediate' }),
    conversation: [],
    triedAt: null,
    reflectionNote: null,
  })

  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'New Scenario' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'New Scenario' }))
  await waitFor(() => expect(screen.getByText('How would you handle this?')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText(/Your first move/), { target: { value: 'My answer.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Get Feedback' }))

  await waitFor(() => expect(screen.getByText(/one notch harder\?/)).toBeTruthy())
  expect(screen.getByRole('button', { name: 'Run it advanced' })).toBeTruthy()
})

// Advanced is the ceiling — wrapping back to beginner would read as the app
// losing track of where the teacher is.
test('an advanced scenario offers no harder notch', async () => {
  generateScenario.mockResolvedValue(scenario({ difficulty: 'advanced' }))
  submitAttempt.mockResolvedValue({
    id: 'a1',
    scenarioId: 's1',
    responseText: 'My answer.',
    feedback: 'f',
    modelResponse: null,
    coachingParts: { did: 'did', left: 'left', keep: null },
    rating: 4,
    saved: false,
    createdAt: new Date().toISOString(),
    scenario: scenario({ difficulty: 'advanced' }),
    conversation: [],
    triedAt: null,
    reflectionNote: null,
  })

  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'New Scenario' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'New Scenario' }))
  await waitFor(() => expect(screen.getByText('How would you handle this?')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText(/Your first move/), { target: { value: 'My answer.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Get Feedback' }))

  await waitFor(() => expect(screen.getByText('What your move did')).toBeTruthy())
  expect(screen.queryByText(/one notch harder/)).toBeNull()
})

test('the harder re-run keeps the kind and only moves the difficulty', async () => {
  generateScenario.mockResolvedValue(scenario({ difficulty: 'beginner' }))
  submitAttempt.mockResolvedValue({
    id: 'a1',
    scenarioId: 's1',
    responseText: 'My answer.',
    feedback: 'f',
    modelResponse: null,
    coachingParts: { did: 'did', left: 'left', keep: null },
    rating: 4,
    saved: false,
    createdAt: new Date().toISOString(),
    scenario: scenario({ difficulty: 'beginner', category: 'misconceptions' }),
    conversation: [],
    triedAt: null,
    reflectionNote: null,
  })

  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'New Scenario' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'New Scenario' }))
  await waitFor(() => expect(screen.getByText('How would you handle this?')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText(/Your first move/), { target: { value: 'My answer.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Get Feedback' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run it intermediate' })).toBeTruthy())

  generateScenario.mockClear()
  fireEvent.click(screen.getByRole('button', { name: 'Run it intermediate' }))

  await waitFor(() => expect(generateScenario).toHaveBeenCalled())
  expect(generateScenario.mock.calls[0][0]).toMatchObject({
    category: 'misconceptions',
    difficulty: 'intermediate',
  })
})

// --- arriving from Talk It Through ---

// "Rehearse it" is one of the four cross-surface handoffs. The teacher's own
// words become the scenario rather than being handed to generation —
// rehearsing an approximation of what they just said out loud would be worse
// than rehearsing their own description of it.
test('arriving to rehearse pre-fills the teacher’s own situation', async () => {
  sessionStorage.setItem(
    'wivoza.handoff',
    JSON.stringify({
      kind: 'rehearse',
      debriefId: 'd1',
      situation: 'A parent is coming in tomorrow about a grade.',
      topic: 'parent_communication',
    }),
  )
  renderPractice()

  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Describe my own' }).getAttribute('aria-pressed')).toBe('true'),
  )
  expect(screen.getByPlaceholderText(/What happened/)).toHaveProperty(
    'value',
    'A parent is coming in tomorrow about a grade.',
  )
  // Opened on the topic the conversation was tagged with.
  expect(screen.getByRole('button', { name: 'Parent Communication' }).getAttribute('aria-pressed')).toBe('true')
})

// A pre-filled box with no explanation reads as the app having remembered
// something it should not have.
test('the pre-filled situation says where it came from, and is editable', async () => {
  sessionStorage.setItem(
    'wivoza.handoff',
    JSON.stringify({ kind: 'rehearse', debriefId: 'd1', situation: 'The thing I said.', topic: null }),
  )
  renderPractice()

  await waitFor(() => expect(screen.getByText(/From what you were just talking through/)).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText(/What happened/), { target: { value: 'Edited.' } })
  expect(screen.getByPlaceholderText(/What happened/)).toHaveProperty('value', 'Edited.')
})

// Consumed once: coming back to Practice next week must not re-open a
// situation already rehearsed.
test('the handoff is consumed on arrival', async () => {
  sessionStorage.setItem(
    'wivoza.handoff',
    JSON.stringify({ kind: 'rehearse', debriefId: 'd1', situation: 'Once only.', topic: null }),
  )
  renderPractice()
  await waitFor(() => expect(screen.getByPlaceholderText(/What happened/)).toBeTruthy())
  expect(sessionStorage.getItem('wivoza.handoff')).toBeNull()
})

// A handoff meant for a different surface must not be picked up here.
test('a handoff for another surface is left alone', async () => {
  sessionStorage.setItem(
    'wivoza.handoff',
    JSON.stringify({ kind: 'review_document', debriefId: 'd1', about: 'my quiz' }),
  )
  renderPractice()
  await waitFor(() => expect(screen.getByText('1 · Topic')).toBeTruthy())
  expect(screen.getByRole('button', { name: 'Describe my own' }).getAttribute('aria-pressed')).toBe('false')
})

// Caught by the rehearse handoff, but it is a plain bug on its own path too:
// "Describe my own" belongs to no topic, so the effect that clears a kind
// contradicting the chosen topic used to clear it on every topic change.
test('describe my own survives a topic change', async () => {
  renderPractice()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Describe my own' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Describe my own' }))
  expect(screen.getByRole('button', { name: 'Describe my own' }).getAttribute('aria-pressed')).toBe('true')

  fireEvent.click(screen.getByRole('button', { name: 'Professionalism' }))

  await waitFor(() => expect(screen.getByRole('button', { name: /Talking with admin/ })).toBeTruthy())
  expect(screen.getByRole('button', { name: 'Describe my own' }).getAttribute('aria-pressed')).toBe('true')
})
