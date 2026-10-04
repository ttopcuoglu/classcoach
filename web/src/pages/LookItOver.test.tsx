// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Review } from '../lib/api'

// Look It Over's whole argument is that a teacher does not pick a tool. So
// the tests that matter are about what happens around the document rather
// than about the review itself:
//
//   * one drop zone takes a file, a paste or a photo;
//   * the type is CONFIRMED, never asked — and correcting it costs one tap;
//   * suggested edits are a diff the teacher accepts one at a time, and the
//     export button can never claim more changes than were accepted;
//   * the limits are stated on the result, not buried.
//
// The last one is the reason the export label is computed server-side and
// only rendered here: a client that counted edits itself could tell a teacher
// they were downloading three changes when they had accepted one.

const extractReviewDocument = vi.fn()
const detectReviewType = vi.fn()
const createReview = vi.fn()
const getReview = vi.fn()
const deleteReview = vi.fn()
const updateReview = vi.fn()
const runReview = vi.fn()
const setReviewEditStatus = vi.fn()
const getReviewDocument = vi.fn()
const redesignReviewForAi = vi.fn()
const getClassProfiles = vi.fn()

vi.mock('../lib/api', () => ({
  extractReviewDocument: (...a: unknown[]) => extractReviewDocument(...a),
  detectReviewType: (...a: unknown[]) => detectReviewType(...a),
  createReview: (...a: unknown[]) => createReview(...a),
  getReview: (...a: unknown[]) => getReview(...a),
  updateReview: (...a: unknown[]) => updateReview(...a),
  runReview: (...a: unknown[]) => runReview(...a),
  setReviewEditStatus: (...a: unknown[]) => setReviewEditStatus(...a),
  getReviewDocument: (...a: unknown[]) => getReviewDocument(...a),
  redesignReviewForAi: (...a: unknown[]) => redesignReviewForAi(...a),
  deleteReview: (...a: unknown[]) => deleteReview(...a),
  getClassProfiles: () => getClassProfiles(),
  createClassProfile: vi.fn(),
  updateClassProfile: vi.fn(),
}))

const { default: LookItOver } = await import('./LookItOver')

const LIMITS =
  'This read the document only. It has not met your students, it does not know how last week went, and it cannot hear what you will say out loud while you run it.'

function review(over: Partial<Review> & { detectionConfident?: boolean } = {}): Review & {
  detectionConfident: boolean
} {
  return {
    id: 'r1',
    docType: 'quiz',
    docTypeLabel: 'Quiz or exam',
    detectionEvidence: ['numbered items', 'lettered options'],
    detectedType: 'quiz',
    docTypeConfirmed: false,
    sourceKind: 'file',
    fileName: 'unit-4-quiz.docx',
    pageCount: null,
    originalText: 'Students will discuss the reading.',
    focusArea: null,
    classProfileId: null,
    lenses: [
      { key: 'item_purpose', label: 'What each item measures', blurb: 'Item by item.', on: true, finding: null },
      { key: 'reading_load', label: 'Reading load', blurb: 'How much reading.', on: true, finding: null },
      { key: 'ai_risk', label: 'AI completion risk', blurb: 'What a chatbot could do.', on: false, finding: null },
    ],
    oneThing: null,
    edits: [],
    unanchoredEditIds: [],
    acceptedCount: 0,
    exportLabel: 'Export my original',
    timingBasis: null,
    status: 'draft',
    saved: false,
    createdAt: new Date().toISOString(),
    limits: LIMITS,
    detectionConfident: true,
    ...over,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LookItOver />
    </MemoryRouter>,
  )
}

/// Renders the page at a URL, through the real route table shape, so
/// `useParams` sees what it would in the app.
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="look-it-over" element={<LookItOver />} />
        <Route path="look-it-over/:reviewId" element={<LookItOver />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  extractReviewDocument.mockReset()
  detectReviewType.mockReset()
  createReview.mockReset()
  updateReview.mockReset()
  runReview.mockReset()
  setReviewEditStatus.mockReset()
  getReviewDocument.mockReset()
  redesignReviewForAi.mockReset()
  getClassProfiles.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

// --- one way in ---

test('one drop zone offers a file, a photo and a paste', async () => {
  renderPage()
  await waitFor(() => expect(screen.getByText('Drop it here')).toBeTruthy())
  expect(screen.getByRole('button', { name: 'Choose a file' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Take a photo' })).toBeTruthy()
  expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy()
})

// A paper quiz photographed on a phone is a first-class way in, not a
// workaround, so the camera is its own button with a rear-camera hint.
test('the photo input asks for the rear camera', async () => {
  renderPage()
  await waitFor(() => expect(screen.getByText('Drop it here')).toBeTruthy())
  const camera = document.querySelector('input[capture]')
  expect(camera).toBeTruthy()
  expect(camera?.getAttribute('capture')).toBe('environment')
  expect(camera?.getAttribute('accept')).toBe('image/*')
})

test('pasting text starts a review without a file', async () => {
  detectReviewType.mockResolvedValue({ docType: 'message', confident: true })
  createReview.mockResolvedValue(review({ docType: 'message', docTypeLabel: 'Message' }))
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())

  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), {
    target: { value: 'Dear Mrs Alvarez, thank you for reaching out.' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))

  await waitFor(() => expect(createReview).toHaveBeenCalled())
  expect(createReview.mock.calls[0][0].sourceKind).toBe('paste')
})

test('an empty paste cannot be submitted', async () => {
  renderPage()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Look it over' })).toBeTruthy())
  expect(screen.getByRole('button', { name: 'Look it over' })).toHaveProperty('disabled', true)
})

// --- confirm, never interrogate ---

test('the type is confirmed as a question, not asked as one', async () => {
  detectReviewType.mockResolvedValue({ docType: 'quiz', confident: true })
  createReview.mockResolvedValue(review())
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))

  await waitFor(() => expect(screen.getByText('Looks like a quiz — right?')).toBeTruthy())
  // The guess is shown as already chosen. Correcting it is one tap on any
  // other chip, so there is no Yes / "no, it's something else" step standing
  // in front of them.
  expect(screen.getByRole('button', { name: 'Quiz / exam' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull()
  expect(screen.queryByRole('button', { name: "No — it's something else" })).toBeNull()
})

// Being wrong has to cost one tap.
test('correcting the type is one tap away, and offers all seven', async () => {
  detectReviewType.mockResolvedValue({ docType: 'quiz', confident: true })
  createReview.mockResolvedValue(review())
  updateReview.mockResolvedValue(review({ docType: 'lesson_plan', docTypeLabel: 'Lesson plan' }))
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Lesson plan' })).toBeTruthy())

  for (const label of [
    'Quiz / exam',
    'Homework',
    'Assignment',
    'Project',
    'Lesson plan',
    'Presentation',
    'Message',
  ]) {
    expect(screen.getByRole('button', { name: label }), label).toBeTruthy()
  }

  fireEvent.click(screen.getByRole('button', { name: 'Lesson plan' }))
  await waitFor(() => expect(updateReview).toHaveBeenCalledWith('r1', { docType: 'lesson_plan' }))
})

// A weak guess still asks the same question — it just arrives with the
// alternatives already visible.
test('an unconfident guess opens with the chips already showing', async () => {
  detectReviewType.mockResolvedValue({ docType: 'assignment', confident: false })
  createReview.mockResolvedValue(
    review({ docType: 'assignment', docTypeLabel: 'Assignment', detectionConfident: false }),
  )
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))

  await waitFor(() => expect(screen.getByText('Looks like an assignment — right?')).toBeTruthy())
  expect(screen.getByRole('button', { name: 'Lesson plan' })).toBeTruthy()
})

// --- lenses ---

test('lenses are individually toggleable with a visible count', async () => {
  detectReviewType.mockResolvedValue({ docType: 'quiz', confident: true })
  createReview.mockResolvedValue(review())
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))

  await waitFor(() => expect(screen.getByText(/2 of 3 on/)).toBeTruthy())
  expect(screen.getByRole('button', { name: /What each item measures/ }).getAttribute('aria-pressed')).toBe('true')
  // A quiz opens with AI completion risk off — it is sat in the room.
  expect(screen.getByRole('button', { name: /AI completion risk/ }).getAttribute('aria-pressed')).toBe('false')
})

test('toggling a lens updates the count immediately', async () => {
  detectReviewType.mockResolvedValue({ docType: 'quiz', confident: true })
  createReview.mockResolvedValue(review())
  updateReview.mockImplementation((_id, data) =>
    Promise.resolve(review({ lenses: review().lenses.map((l) => ({ ...l, on: data.lenses.find((d: { key: string; on: boolean }) => d.key === l.key)?.on ?? l.on })) })),
  )
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
  await waitFor(() => expect(screen.getByText(/2 of 3 on/)).toBeTruthy())

  fireEvent.click(screen.getByRole('button', { name: /AI completion risk/ }))
  await waitFor(() => expect(screen.getByText(/3 of 3 on/)).toBeTruthy())
})

// --- the result page ---

const REVIEWED = review({
  status: 'reviewed',
  docTypeConfirmed: true,
  oneThing: 'Split question 4 — it is measuring reading, not the content.',
  lenses: [
    {
      key: 'item_purpose',
      label: 'What each item measures',
      blurb: 'Item by item.',
      on: true,
      finding: 'Items 1-3 are recall. Item 4 is really a reading test.',
    },
    { key: 'ai_risk', label: 'AI completion risk', blurb: 'What a chatbot could do.', on: false, finding: null },
  ],
  edits: [
    {
      id: 'e1',
      anchor: 'Students will discuss the reading.',
      original: 'Students will discuss the reading.',
      revision: 'In pairs, each student names one claim the author makes.',
      why: 'Names what students produce, so you can tell who is thinking.',
      lens: 'item_purpose',
      status: 'pending',
    },
  ],
  timingBasis: { minutes: [20, 30], assumption: 'Two minutes per short-answer item.' },
})

async function openReviewed() {
  detectReviewType.mockResolvedValue({ docType: 'quiz', confident: true })
  createReview.mockResolvedValue(review())
  runReview.mockResolvedValue(REVIEWED)
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
  await waitFor(() => expect(screen.getByText(/2 of 3 on/)).toBeTruthy())
  fireEvent.click(screen.getAllByRole('button', { name: 'Look it over' })[0])
  await waitFor(() => expect(screen.getByText('If you change one thing')).toBeTruthy())
}

// The one change leads, above everything a teacher could choose to read next.
test('the result leads with the one-thing card, above the lens nav', async () => {
  await openReviewed()
  const all = Array.from(document.querySelectorAll('*'))
  const oneThing = all.indexOf(screen.getByText('If you change one thing'))
  const lensNav = all.indexOf(screen.getByRole('navigation', { name: 'Review sections' }))
  expect(oneThing).toBeLessThan(lensNav)
  expect(screen.getByText('Split question 4 — it is measuring reading, not the content.')).toBeTruthy()
})

// Edits are what a teacher arrived for, so that is what is open.
test('the edits section is selected first', async () => {
  await openReviewed()
  const edits = screen.getByRole('button', { name: /Suggested edits ·/ })
  expect(edits.getAttribute('aria-pressed')).toBe('true')
})

test('only lenses that produced something get a pill, and its finding opens', async () => {
  await openReviewed()
  // Scoped to the nav: the lens TOGGLES are still on the page above, and a
  // teacher has to be able to turn AI risk on. What it must not have is a
  // result pill, because an empty section promises a finding that is not
  // there.
  const nav = screen.getByRole('navigation', { name: 'Review sections' })
  const pills = Array.from(nav.querySelectorAll('button')).map((b) => b.textContent)
  expect(pills.some((p) => p?.includes('AI completion risk'))).toBe(false)
  expect(pills.some((p) => p?.includes('What each item measures'))).toBe(true)

  fireEvent.click(
    Array.from(nav.querySelectorAll('button')).find((b) => b.textContent === 'What each item measures')!,
  )

  await waitFor(() =>
    expect(screen.getByText('Items 1-3 are recall. Item 4 is really a reading test.')).toBeTruthy(),
  )
})

// "Any timing estimate must show its assumption or a range."
test('a timing estimate shows a range and its assumption', async () => {
  await openReviewed()
  // Shown among the assumptions rather than in a card of its own, so every
  // number on the page is accounted for in one place.
  expect(screen.getByText(/20–30 minutes/)).toBeTruthy()
  expect(screen.getByText(/Two minutes per short-answer item\./)).toBeTruthy()
  expect(screen.getByText('What the numbers assume')).toBeTruthy()
})

// The limits are part of the result, not a footnote somewhere else.
test('the stated limits are on the result page', async () => {
  await openReviewed()
  expect(screen.getByText(LIMITS)).toBeTruthy()
})

// --- the diff ---

test('an edit shows the original struck through, the revision, and why', async () => {
  await openReviewed()
  const original = screen.getByText('Students will discuss the reading.')
  expect(original.className).toContain('line-through')
  expect(screen.getByText('In pairs, each student names one claim the author makes.')).toBeTruthy()
  expect(screen.getByText('Names what students produce, so you can tell who is thinking.')).toBeTruthy()
})

test('each edit has its own Keep mine and Use this', async () => {
  await openReviewed()
  expect(screen.getByRole('button', { name: 'Use this' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Keep mine' })).toBeTruthy()
})

// The export label is the one place a teacher learns whether they are about
// to download their own document or an edited one.
test('the export button reads "my original" until an edit is accepted', async () => {
  await openReviewed()
  expect(screen.getByRole('button', { name: 'Export my original' })).toBeTruthy()
})

test('accepting an edit changes the export label to count it', async () => {
  await openReviewed()
  setReviewEditStatus.mockResolvedValue({
    ...REVIEWED,
    edits: [{ ...REVIEWED.edits[0], status: 'accepted' }],
    acceptedCount: 1,
    exportLabel: 'Export with 1 change',
  })

  fireEvent.click(screen.getByRole('button', { name: 'Use this' }))

  await waitFor(() => expect(setReviewEditStatus).toHaveBeenCalledWith('r1', 'e1', 'accepted'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Export with 1 change' })).toBeTruthy())
})

test('keeping yours leaves the label as the original', async () => {
  await openReviewed()
  setReviewEditStatus.mockResolvedValue({
    ...REVIEWED,
    edits: [{ ...REVIEWED.edits[0], status: 'kept_mine' }],
    acceptedCount: 0,
    exportLabel: 'Export my original',
  })

  fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }))

  await waitFor(() => expect(setReviewEditStatus).toHaveBeenCalledWith('r1', 'e1', 'kept_mine'))
  expect(screen.getByRole('button', { name: 'Export my original' })).toBeTruthy()
})

// A teacher must be able to take an acceptance back.
test('an accepted edit can be un-accepted', async () => {
  await openReviewed()
  setReviewEditStatus.mockResolvedValue({
    ...REVIEWED,
    edits: [{ ...REVIEWED.edits[0], status: 'accepted' }],
    acceptedCount: 1,
    exportLabel: 'Export with 1 change',
  })
  fireEvent.click(screen.getByRole('button', { name: 'Use this' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Export with 1 change' })).toBeTruthy())

  setReviewEditStatus.mockResolvedValue(REVIEWED)
  fireEvent.click(screen.getByRole('button', { name: 'Use this' }))
  await waitFor(() => expect(setReviewEditStatus).toHaveBeenLastCalledWith('r1', 'e1', 'pending'))
})

// --- redesign for AI use ---

// An action from the result, not a tool of its own.
test('a quiz result offers redesigning for AI use', async () => {
  await openReviewed()
  expect(screen.getByRole('button', { name: 'Redesign for meaningful AI use' })).toBeTruthy()
})

test('redesigning hands off pre-seeded, rather than starting from nothing', async () => {
  await openReviewed()
  redesignReviewForAi.mockResolvedValue({ assignmentCoachSessionId: 'acs1' })

  fireEvent.click(screen.getByRole('button', { name: 'Redesign for meaningful AI use' }))

  await waitFor(() => expect(redesignReviewForAi).toHaveBeenCalledWith('r1'))
})

// A lesson plan or a parent message has no student work for a chatbot to do.
test('a message result does not offer redesigning for AI use', async () => {
  detectReviewType.mockResolvedValue({ docType: 'message', confident: true })
  createReview.mockResolvedValue(review({ docType: 'message', docTypeLabel: 'Message' }))
  runReview.mockResolvedValue(
    review({
      docType: 'message',
      docTypeLabel: 'Message',
      status: 'reviewed',
      oneThing: 'Lead with what you have seen rather than what you concluded.',
    }),
  )
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
  await waitFor(() => expect(screen.getByText(/2 of 3 on/)).toBeTruthy())
  fireEvent.click(screen.getAllByRole('button', { name: 'Look it over' })[0])

  await waitFor(() => expect(screen.getByText('If you change one thing')).toBeTruthy())
  expect(screen.queryByRole('button', { name: 'Redesign for meaningful AI use' })).toBeNull()
})

// --- failures ---

test('an unreadable file reports why and leaves the drop zone usable', async () => {
  extractReviewDocument.mockRejectedValue(new Error("Couldn't find any text in that file"))
  renderPage()
  await waitFor(() => expect(screen.getByText('Drop it here')).toBeTruthy())

  const input = document.querySelector(`input[accept=".docx,.pdf,.pptx,.xlsx,.xls,.txt,.jpg,.jpeg,.png"]`)
  fireEvent.change(input!, { target: { files: [new File(['x'], 'scan.pdf')] } })

  await waitFor(() => expect(screen.getByText(/Couldn't find any text/)).toBeTruthy())
  expect(screen.getByText('Drop it here')).toBeTruthy()
})

// --- the handoffs ---

// Talk It Through -> Look It Over. Only the intent travels: the document is
// still on the teacher's machine, so this opens the drop zone knowing why
// rather than with anything in it.
test('arriving from a conversation says what it was about', async () => {
  sessionStorage.setItem(
    'wivoza.handoff',
    JSON.stringify({ kind: 'review_document', debriefId: 'd1', about: 'the quiz I wrote for Friday' }),
  )
  renderPage()

  await waitFor(() => expect(screen.getByText('From your conversation')).toBeTruthy())
  expect(screen.getByText('the quiz I wrote for Friday')).toBeTruthy()
  // Still the drop zone — nothing was carried over to review.
  expect(screen.getByText('Drop it here')).toBeTruthy()
})

test('a handoff for another surface is left alone', async () => {
  sessionStorage.setItem(
    'wivoza.handoff',
    JSON.stringify({ kind: 'rehearse', debriefId: 'd1', situation: 'x', topic: null }),
  )
  renderPage()
  await waitFor(() => expect(screen.getByText('Drop it here')).toBeTruthy())
  expect(screen.queryByText('From your conversation')).toBeNull()
  // And it is still there for the surface it was meant for.
  expect(sessionStorage.getItem('wivoza.handoff')).not.toBeNull()
})

// Look It Over -> Talk It Through. The review is the context; the
// conversation is about what to do with it.
test('the result offers talking it through, carrying the one-thing card', async () => {
  await openReviewed()
  expect(screen.getByRole('button', { name: 'Talk this through' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Talk this through' }))

  const stored = JSON.parse(sessionStorage.getItem('wivoza.handoff')!)
  expect(stored.kind).toBe('review_context')
  expect(stored.reviewId).toBe('r1')
  expect(stored.oneThing).toBe('Split question 4 — it is measuring reading, not the content.')
})

// --- the setup card ---

/// Gets to the state where a document is in and the review is being set up.
async function reachSetup() {
  createReview.mockResolvedValue(review({ fileName: 'Unit 3 Quiz.docx', pageCount: 4, sourceKind: 'photo' }))
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
  await waitFor(() => expect(screen.getByText("What I'll look at")).toBeTruthy())
}

// Setting up a review used to be three separate panels, which made the type
// confirmation and the lenses read as unrelated questions rather than two
// halves of the same setup. Each block says what it is.
test('every block of the setup says what it is', async () => {
  await reachSetup()
  for (const heading of ['Looks like a quiz — right?', "What I'll look at", 'Your class']) {
    expect(screen.getByText(heading), heading).toBeTruthy()
  }
})

test('the document is named, with how it arrived', async () => {
  await reachSetup()
  expect(screen.getByText('Unit 3 Quiz.docx')).toBeTruthy()
  expect(screen.getByText(/4 pages/)).toBeTruthy()
  // A photo says so: it has been through OCR and may be missing content the
  // paper copy has.
  expect(screen.getByText(/photographed/)).toBeTruthy()
  expect(screen.getByText(/added just now/)).toBeTruthy()
  // No item count: nothing counts the questions in a document, and a number
  // nobody computed is worse than one nobody shows.
  expect(screen.queryByText(/\d+ items/)).toBeNull()
})

// A teacher who dropped the wrong file should not have to guess that starting
// over is possible.
test('Replace goes back to the drop zone without deleting anything', async () => {
  await reachSetup()
  fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  expect(deleteReview).not.toHaveBeenCalled()
})

// The promise is on the screen where a teacher is about to upload student
// work, not only in the guide.
test('the no-names line is on the setup card', async () => {
  await reachSetup()
  expect(screen.getByText(/No student names, please\./)).toBeTruthy()
})

// Knowing what is NOT being looked at is half of trusting the result, so an
// off lens stays on screen rather than disappearing.
test('a lens that is off is still shown, and still says it is off', async () => {
  await reachSetup()
  const off = screen.getByRole('button', { name: /AI completion risk/ })
  expect(off.getAttribute('aria-pressed')).toBe('false')
  expect(off.className).toContain('border-dashed')
})

// --- the state every teacher lands on ---

// The drop zone, the paste box and the class line used to sit loose on the
// page background while the state two seconds later was a single card, so
// arriving here looked like a different surface from the one you were about
// to be on. Everything needed to start a review is in one card.
test('the empty state is one card, like the step that follows it', async () => {
  renderPage()
  await waitFor(() => expect(screen.getByText('Drop it here')).toBeTruthy())

  const card = screen.getByText('Drop it here').closest('.rounded-3xl')?.parentElement
  expect(card, 'the drop zone should sit inside a card').toBeTruthy()
  const text = card?.textContent ?? ''
  for (const piece of ['Drop it here', 'Or paste it', 'Your class', 'No student names, please.']) {
    expect(text.includes(piece), piece).toBe(true)
  }
  expect(card?.querySelector('textarea')).toBeTruthy()
  expect(card?.querySelector('button')).toBeTruthy()
})

// The same promise appears on both steps, because a teacher can upload from
// either one.
test('the no-names line is there before anything is uploaded', async () => {
  renderPage()
  await waitFor(() => expect(screen.getByText(/No student names, please\./)).toBeTruthy())
})

// --- correcting the type ---

// Changing the type swaps the whole lens set, so the strip has to say that
// rather than letting the result change underneath the teacher.
test('once the type is corrected the strip reports instead of asking', async () => {
  createReview.mockResolvedValue(review())
  updateReview.mockResolvedValue(review({ docType: 'homework', docTypeConfirmed: true }))
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Homework' })).toBeTruthy())

  fireEvent.click(screen.getByRole('button', { name: 'Homework' }))

  await waitFor(() => expect(screen.getByText('Got it — reviewing as homework.')).toBeTruthy())
  expect(screen.getByText("Different type, different checks. Here's what changes.")).toBeTruthy()
  // The question is answered, so it stops being asked.
  expect(screen.queryByText(/Looks like a .* — right\?/)).toBeNull()
})

// --- the student-name guard ---

/// The server's refusal: it declined to run until the teacher answers.
function namesRefusal() {
  return Object.assign(new Error('This looks like it has student names in it.'), {
    status: 409,
    details: { studentNames: { reason: 'a column headed with a student name', lineCount: 1 } },
  })
}

// Criterion 6: the prompt happens before any model call. The server enforces
// that; what this checks is that the refusal reads as a question rather than
// as something going wrong, because a teacher who reads it as an error will
// not understand that they have a choice.
test('a document with student names asks before it runs', async () => {
  createReview.mockResolvedValue(review())
  runReview.mockRejectedValueOnce(namesRefusal())
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
  await waitFor(() => expect(screen.getByText("What I'll look at")).toBeTruthy())

  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))

  await waitFor(() => expect(screen.getByText('This looks like it has student names in it.')).toBeTruthy())
  expect(screen.getByText(/a column headed with a student name/)).toBeTruthy()
  for (const choice of ['Strip names', 'Use it as is', 'Cancel']) {
    expect(screen.getByRole('button', { name: choice }), choice).toBeTruthy()
  }
})

test('stripping re-runs with the answer, and the question goes away', async () => {
  createReview.mockResolvedValue(review())
  runReview.mockRejectedValueOnce(namesRefusal()).mockResolvedValueOnce(review({ status: 'reviewed' }))
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
  await waitFor(() => expect(screen.getByText("What I'll look at")).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Strip names' })).toBeTruthy())

  fireEvent.click(screen.getByRole('button', { name: 'Strip names' }))

  await waitFor(() => expect(runReview).toHaveBeenCalledWith('r1', expect.objectContaining({ namesHandled: 'strip' })))
  await waitFor(() => expect(screen.queryByText('This looks like it has student names in it.')).toBeNull())
})

// Their document, their call — but it has to be said out loud rather than
// assumed.
test('using it as is is offered, and says so to the server', async () => {
  createReview.mockResolvedValue(review())
  runReview.mockRejectedValueOnce(namesRefusal()).mockResolvedValueOnce(review({ status: 'reviewed' }))
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
  await waitFor(() => expect(screen.getByText("What I'll look at")).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Use it as is' })).toBeTruthy())

  fireEvent.click(screen.getByRole('button', { name: 'Use it as is' }))

  await waitFor(() => expect(runReview).toHaveBeenCalledWith('r1', expect.objectContaining({ namesHandled: 'keep' })))
})

// --- the result contract ---

// Criterion 11: it renders on every result, not as a preference.
test('the limits footnote is on the result whatever else is', async () => {
  await openReviewed()
  expect(screen.getByText(LIMITS)).toBeTruthy()
})

// Criterion 7, as the UI can state it: the teacher's words stay on screen
// beside what they would become, and neither button acts until pressed.
test('an edit is a diff — the original stays, struck through', async () => {
  await openReviewed()
  const original = screen.getByText('Students will discuss the reading.')
  expect(original.className).toContain('line-through')
  expect(screen.getByRole('button', { name: 'Use this' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Keep mine' })).toBeTruthy()
})

// The finish bar says what has been decided before it offers to hand anything
// over, and the export button says what it will actually produce.
test('the finish bar counts what was accepted', async () => {
  await openReviewed()
  expect(screen.getByText('Nothing changed yet')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Export my original' })).toBeTruthy()
})

// A review with no suggested edits is a result, not a failure — and the
// lenses that ran are still worth reading.
test('zero edits reads as an answer, not an error', async () => {
  createReview.mockResolvedValue(review())
  runReview.mockResolvedValue(review({ ...REVIEWED, edits: [], acceptedCount: 0, exportLabel: 'Export my original' }))
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
  await waitFor(() => expect(screen.getByText(/2 of 3 on/)).toBeTruthy())
  fireEvent.click(screen.getAllByRole('button', { name: 'Look it over' })[0])

  await waitFor(() => expect(screen.getByText('Nothing I’d change before tomorrow')).toBeTruthy())
  // The lenses still have their pills.
  const nav = screen.getByRole('navigation', { name: 'Review sections' })
  expect(nav.querySelectorAll('button').length).toBeGreaterThan(1)
})

// Criterion 12: every control is a real button with a name.
test('every control on the result is a named button', async () => {
  await openReviewed()
  const unnamed = Array.from(document.querySelectorAll('button')).filter(
    (b) => !(b.textContent?.trim() || b.getAttribute('aria-label')),
  )
  expect(unnamed).toEqual([])
})

// --- scoping a long document ---

function scopeRefusal() {
  return Object.assign(new Error('This is 48 pages. Want the whole thing, or a part?'), {
    status: 409,
    details: {
      scope: {
        pages: 48,
        whole: { label: 'Whole document', minutes: [3, 6] },
        sections: [
          { label: 'Unit 3 (p. 12–20)', minutes: [1, 2] },
          { label: 'Assessment (p. 41–48)', minutes: [1, 2] },
        ],
      },
    },
  })
}

async function reachScopeQuestion() {
  createReview.mockResolvedValue(review())
  runReview.mockRejectedValueOnce(scopeRefusal())
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
  await waitFor(() => expect(screen.getByText("What I'll look at")).toBeTruthy())
  fireEvent.click(screen.getAllByRole('button', { name: 'Look it over' })[0])
  await waitFor(() => expect(screen.getByText(/This is 48 pages/)).toBeTruthy())
}

// Long documents are accepted. What changes is how much gets reviewed at once
// — so this is a question, never a refusal and never a silent truncation.
test('a long document asks which part, rather than refusing it', async () => {
  await reachScopeQuestion()
  expect(screen.getByRole('button', { name: /Whole document/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: /Unit 3/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: /Assessment/ })).toBeTruthy()
})

// Said before it starts, because that is what a teacher needs in order to
// decide whether to wait.
test('each choice says how long it will take, as a range', async () => {
  await reachScopeQuestion()
  expect(screen.getByRole('button', { name: /Whole document · 3–6 min/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: /Unit 3 \(p\. 12–20\) · 1–2 min/ })).toBeTruthy()
})

test('choosing a part runs that part', async () => {
  await reachScopeQuestion()
  runReview.mockResolvedValueOnce(review({ status: 'reviewed' }))

  fireEvent.click(screen.getByRole('button', { name: /Unit 3/ }))

  await waitFor(() =>
    expect(runReview).toHaveBeenLastCalledWith('r1', expect.objectContaining({ scope: 'Unit 3 (p. 12–20)' })),
  )
  await waitFor(() => expect(screen.queryByText(/This is 48 pages/)).toBeNull())
})

// Asked once. A teacher re-running after toggling a lens should not be asked
// to re-pick the part they already chose.
test('the choice sticks for later runs of the same review', async () => {
  await reachScopeQuestion()
  runReview.mockResolvedValue(review({ status: 'reviewed' }))
  fireEvent.click(screen.getByRole('button', { name: /Unit 3/ }))
  await waitFor(() => expect(screen.queryByText(/This is 48 pages/)).toBeNull())

  fireEvent.click(screen.getAllByRole('button', { name: /Look again|Look it over/ })[0])

  await waitFor(() =>
    expect(runReview).toHaveBeenLastCalledWith('r1', expect.objectContaining({ scope: 'Unit 3 (p. 12–20)' })),
  )
})

// --- a result has a URL ---

// Bookmarkable, linkable from My Work, and survives a reload. Before this the
// result existed only in the page's own state, so a refresh lost it.
test('a result URL loads that review', async () => {
  getReview.mockResolvedValue(REVIEWED)
  renderAt('/look-it-over/r1')

  await waitFor(() => expect(screen.getByText('If you change one thing')).toBeTruthy())
  expect(getReview).toHaveBeenCalledWith('r1')
})

// A review that exists but has not been run is still somewhere to come back to.
test('a draft URL loads the setup, not the result', async () => {
  getReview.mockResolvedValue(review())
  renderAt('/look-it-over?draft=r1')

  await waitFor(() => expect(screen.getByText("What I'll look at")).toBeTruthy())
  expect(screen.queryByText('If you change one thing')).toBeNull()
})

// A link to a review that is gone has somewhere useful to land.
test('a URL for a review that no longer exists lands on the drop zone', async () => {
  getReview.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }))
  renderAt('/look-it-over/gone')

  await waitFor(() => expect(screen.getByText('Drop it here')).toBeTruthy())
})

// My Work linked with ?open= before results had URLs, and those links are in
// teachers' histories.
test('the old ?open= link still opens the review', async () => {
  getReview.mockResolvedValue(REVIEWED)
  renderAt('/look-it-over?open=r1')

  await waitFor(() => expect(screen.getByText('If you change one thing')).toBeTruthy())
  expect(getReview).toHaveBeenCalledWith('r1')
})
