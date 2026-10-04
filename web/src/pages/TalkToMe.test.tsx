// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

// Talk It Through is the surface the consolidation points everything else at,
// and its start screen has a specified order: mic hero, then the optional
// topic chips, then the starter prompts, then the class line. Order is the
// whole argument — the mic has to be the first thing and the chips have to
// read as optional, or this becomes the gated "What's this about?" pill row
// the refactor set out to remove.
//
// So these tests assert document order, not just presence. The heavy
// dependencies (the voice turn loop, audio playback, the API) are mocked:
// what is under test is the page's structure and the chip's behavior.

const getProfile = vi.fn()
const getDebriefs = vi.fn()
const getFollowUp = vi.fn()
const getClassProfiles = vi.fn()
const streamCoachReply = vi.fn()

vi.mock('../lib/api', () => ({
  getProfile: () => getProfile(),
  getDebriefs: () => getDebriefs(),
  getFollowUp: () => getFollowUp(),
  getClassProfiles: () => getClassProfiles(),
  streamCoachReply: (...a: unknown[]) => streamCoachReply(...a),
  deleteDebrief: vi.fn(),
  generateTalkTakeaway: vi.fn(),
  dismissFollowUpForDebrief: vi.fn(),
  makeFollowUpsDueNow: vi.fn(),
  saveDebriefReflection: vi.fn(),
  sendDebriefChat: vi.fn(),
  setDebriefSaved: vi.fn(),
  startTalkToMe: vi.fn(),
  updateClassProfile: vi.fn(),
  createClassProfile: vi.fn(),
}))

// `supported: true` matters: jsdom has no MediaRecorder or getUserMedia, so
// the real hook reports the browser cannot do voice and the page renders its
// "not available in this browser" fallback instead of anything under test.
vi.mock('../hooks/useVoiceTurn', () => ({
  useVoiceTurn: () => ({
    supported: true,
    level: 0,
    fatalError: null,
    transcribing: false,
    start: vi.fn(),
    close: vi.fn(),
  }),
}))

vi.mock('../lib/voicePlayback', () => ({
  createPlaybackQueue: () => ({
    push: vi.fn(),
    end: vi.fn(),
    cancel: vi.fn(),
    finished: Promise.resolve(),
  }),
  primeAudioElement: vi.fn(),
  splitIntoSentences: (t: string) => [t],
}))

const { default: TalkToMe } = await import('./TalkToMe')

function renderAt(path = '/talk') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TalkToMe />
    </MemoryRouter>,
  )
}

/// The starter prompt buttons, read from the section they live in rather
/// than by their punctuation — they used to be wrapped in quotation marks and
/// the tests matched on the quote, which made a styling change look like a
/// missing feature.
function starterPrompts(): string[] {
  const heading = screen.getByText('Or start with one of these')
  const buttons = Array.from(heading.parentElement?.querySelectorAll('button') ?? [])
  return buttons.map((b) => b.textContent?.replace(/→$/, '').trim() ?? '')
}

/// Where a piece of text sits in the rendered document, for order assertions.
/// Takes the FIRST match, which is what matters for order — the starter
/// prompts are four separate nodes and the first one is where that block
/// begins.
function positionOf(text: string | RegExp): number {
  const node = screen.getAllByText(text)[0]
  const all = Array.from(document.querySelectorAll('*'))
  return all.indexOf(node as Element)
}

beforeEach(() => {
  getProfile.mockResolvedValue({ talkVoice: null, role: 'teacher', experienceLevel: 'early' })
  getDebriefs.mockResolvedValue([])
  getFollowUp.mockResolvedValue(null)
  getClassProfiles.mockResolvedValue([])
  streamCoachReply.mockReset()
})

afterEach(cleanup)

test('the hero asks the specified opening question', async () => {
  renderAt()
  await waitFor(() => expect(screen.getByText('Hi. What would you like to talk about?')).toBeTruthy())
})

// Type instead is a real button beside the primary, not a small link —
// typing is a first-class way to use this page.
test('both ways in are buttons in the hero, with talking as the primary', async () => {
  renderAt()
  await waitFor(() => expect(screen.getByRole('button', { name: /start talking/i })).toBeTruthy())
  const type = screen.getByRole('button', { name: 'Type instead' })
  expect(type.tagName).toBe('BUTTON')
  // Neither action is duplicated now that they live in the hero.
  expect(screen.getAllByRole('button', { name: /start talking/i })).toHaveLength(1)
  expect(screen.getAllByRole('button', { name: 'Type instead' })).toHaveLength(1)
})

// The specified page order.
test('the page runs mic hero, then topic chips, then starter prompts, then the class line', async () => {
  renderAt()
  await waitFor(() => expect(screen.getByText('Hi. What would you like to talk about?')).toBeTruthy())

  const hero = positionOf('Hi. What would you like to talk about?')
  const chips = positionOf('Want me focused on something?')
  const starters = positionOf('Or start with one of these')
  const classLine = positionOf('Your class')

  expect(hero).toBeLessThan(chips)
  expect(chips).toBeLessThan(starters)
  expect(starters).toBeLessThan(classLine)
})

test('the chips are labelled as optional, in so many words', async () => {
  renderAt()
  await waitFor(() => expect(screen.getByText('Want me focused on something?')).toBeTruthy())
  expect(screen.getByText("Optional — skip it and I'll just listen.")).toBeTruthy()
})

test('all seven topics are offered, including the ghost chip', async () => {
  renderAt()
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

test('the ghost chip is drawn dashed rather than solid', async () => {
  renderAt()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Something else' })).toBeTruthy())
  expect(screen.getByRole('button', { name: 'Something else' }).className).toContain('border-dashed')
  expect(screen.getByRole('button', { name: 'Professionalism' }).className).not.toContain('border-dashed')
})

// The strip is where the promise is made explicit: the chip decides where the
// coach opens and nothing after that.
test('choosing a topic shows the confirmation strip with a Clear', async () => {
  renderAt()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Parent Communication' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Parent Communication' }))

  await waitFor(() =>
    expect(
      screen.getByText(
        /Coach will start from Parent Communication — say anything and it will follow you from there\./,
      ),
    ).toBeTruthy(),
  )
  expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy()
})

test('Clear puts the page back to no topic', async () => {
  renderAt()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Professionalism' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Professionalism' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy())

  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull())
  expect(screen.queryByText(/Coach will start from/)).toBeNull()
})

test('tapping the selected chip again clears it', async () => {
  renderAt()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Me and this job' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Me and this job' }))
  await waitFor(() => expect(screen.getByText(/Coach will start from Me and this job/)).toBeTruthy())

  fireEvent.click(screen.getByRole('button', { name: 'Me and this job' }))
  await waitFor(() => expect(screen.queryByText(/Coach will start from/)).toBeNull())
})

test('a topic in the URL is already selected on arrival', async () => {
  renderAt('/talk?topic=student_concern')
  await waitFor(() =>
    expect(screen.getByText(/Coach will start from A student I'm worried about/)).toBeTruthy(),
  )
  expect(screen.getByRole('button', { name: "A student I'm worried about" }).getAttribute('aria-pressed')).toBe(
    'true',
  )
})

// Four prompts are what tells a brand-new account where to start — the job
// First 30 Days used to do.
test('four starter prompts are offered before any topic is chosen', async () => {
  renderAt()
  await waitFor(() => expect(screen.getByText('Want me focused on something?')).toBeTruthy())
  expect(starterPrompts()).toHaveLength(4)
})

test('choosing a topic changes the starter prompts', async () => {
  renderAt()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Parent Communication' })).toBeTruthy())
  const before = starterPrompts()

  fireEvent.click(screen.getByRole('button', { name: 'Parent Communication' }))

  await waitFor(() => {
    const after = starterPrompts()
    expect(after).not.toEqual(before)
    expect(after).toHaveLength(4)
  })
})

// Voice-first means no submit control anywhere on the start screen — the old
// "Get coaching" button is exactly what this page must not grow back.
test('no submit control appears while the page is in voice mode', async () => {
  renderAt()
  await waitFor(() => expect(screen.getByRole('button', { name: /start talking/i })).toBeTruthy())
  expect(screen.queryByRole('button', { name: /get coaching/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /^send$/i })).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
})

// One tap swaps the mic for a textarea in place, rather than navigating.
test('Type instead swaps the hero actions for a text input on the same page', async () => {
  renderAt()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Type instead' })).toBeTruthy())

  fireEvent.click(screen.getByRole('button', { name: 'Type instead' }))

  await waitFor(() => expect(screen.getByRole('textbox')).toBeTruthy())
  expect(screen.getByPlaceholderText(/type what's on your mind/i)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
  // Still Talk It Through, not a different screen.
  expect(screen.getByText(/never saved/i)).toBeTruthy()
})

// The chip has to reach the server, or none of the prompt work matters.
test('the chosen topic is sent with the opening turn', async () => {
  streamCoachReply.mockResolvedValue({ id: 'd1', conversation: [], createdAt: new Date().toISOString() })
  renderAt('/talk?topic=classroom_management')
  await waitFor(() => expect(screen.getByRole('button', { name: /start talking/i })).toBeTruthy())

  fireEvent.click(screen.getByRole('button', { name: /start talking/i }))

  await waitFor(() => expect(streamCoachReply).toHaveBeenCalled())
  // streamCoachReply(id, message, onSentence, followUpId, topic)
  expect(streamCoachReply.mock.calls[0][4]).toBe('classroom_management')
})

test('no chosen topic sends none, rather than inventing one', async () => {
  streamCoachReply.mockResolvedValue({ id: 'd1', conversation: [], createdAt: new Date().toISOString() })
  renderAt()
  await waitFor(() => expect(screen.getByRole('button', { name: /start talking/i })).toBeTruthy())

  fireEvent.click(screen.getByRole('button', { name: /start talking/i }))

  await waitFor(() => expect(streamCoachReply).toHaveBeenCalled())
  expect(streamCoachReply.mock.calls[0][4]).toBeNull()
})

// The privacy guarantee is checked verbatim elsewhere; this is about it still
// being on screen where a teacher decides whether to start talking.
test('the voice guarantee is on the start screen itself', async () => {
  renderAt()
  await waitFor(() =>
    expect(screen.getByText('Your voice is never saved — only the conversation text.')).toBeTruthy(),
  )
})

// --- the second step, within a topic ---

// The placement is the requirement: the sub-options narrow what Coach opens
// on, so they belong between the chip they narrow and the prompts they change
// the meaning of — not below the starters, where they read as an afterthought
// to a decision already made.
test('choosing a topic reveals its sub-options, above the starter prompts', async () => {
  renderAt()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Classroom Management' })).toBeTruthy())
  // Nothing is offered until a topic is chosen.
  expect(screen.queryByRole('button', { name: 'Phones and devices' })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Classroom Management' }))

  await waitFor(() => expect(screen.getByRole('button', { name: 'Phones and devices' })).toBeTruthy())
  expect(positionOf('Classroom Management')).toBeLessThan(positionOf('Phones and devices'))
  expect(positionOf('Phones and devices')).toBeLessThan(positionOf('Or start with one of these'))
})

test('the sub-options are the chosen topic’s own', async () => {
  renderAt('/talk?topic=parent_communication')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Grade dispute' })).toBeTruthy())
  for (const label of ['Delivering hard news', 'Angry or accusatory', 'Attendance', 'Setting a boundary']) {
    expect(screen.getByRole('button', { name: label }), label).toBeTruthy()
  }
  // Another topic's kinds are not on the page.
  expect(screen.queryByRole('button', { name: 'Phones and devices' })).toBeNull()
})

test('a sub-option toggles off, and switching topic drops it', async () => {
  renderAt('/talk?topic=classroom_management&kind=technology_misuse')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Phones and devices' })).toBeTruthy())
  expect(screen.getByRole('button', { name: 'Phones and devices' }).getAttribute('aria-pressed')).toBe('true')

  fireEvent.click(screen.getByRole('button', { name: 'Phones and devices' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Phones and devices' }).getAttribute('aria-pressed')).toBe('false'),
  )

  // A kind belongs to the topic above it, so changing topic cannot leave a
  // narrowing behind that has nothing left to narrow.
  fireEvent.click(screen.getByRole('button', { name: 'Phones and devices' }))
  fireEvent.click(screen.getByRole('button', { name: 'Parent Communication' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Phones and devices' })).toBeNull())
})

// "Something else" is the chip that means "do not assume anything", so
// offering it a list of assumptions to pick from would invert it.
test('the ghost chip offers no sub-options', async () => {
  renderAt('/talk?topic=something_else')
  await waitFor(() => expect(screen.getByText('Or start with one of these')).toBeTruthy())
  const chips = screen.getByText('Want me focused on something?').parentElement?.parentElement
  const labels = Array.from(chips?.querySelectorAll('button') ?? []).map((b) => b.textContent)
  // Only the seven topics, and the Clear in the confirmation strip.
  expect(labels.filter((l) => l !== 'Clear')).toHaveLength(7)
})

test('the narrowing is sent with the opening turn', async () => {
  streamCoachReply.mockResolvedValue({ id: 'd1', messages: [] })
  renderAt('/talk?topic=classroom_management&kind=technology_misuse')
  await waitFor(() => expect(screen.getByRole('button', { name: /start talking/i })).toBeTruthy())

  fireEvent.click(screen.getByRole('button', { name: /start talking/i }))

  await waitFor(() => expect(streamCoachReply).toHaveBeenCalled())
  const args = streamCoachReply.mock.calls[0]
  expect(args).toContain('classroom_management')
  expect(args).toContain('technology_misuse')
})
