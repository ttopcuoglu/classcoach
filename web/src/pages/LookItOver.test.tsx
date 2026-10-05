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

/// Picks what the document is, which this surface now asks before it will
/// take a file at all.
function chooseType(label = 'Quiz / exam') {
  fireEvent.click(screen.getByRole('button', { name: label }))
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
  // Reading now happens without being asked, so every upload runs. A draft
  // result keeps a test on the setup state; the finished one is opted into.
  runReview.mockResolvedValue(review())
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

// --- one way in ---

test('one drop zone offers a file, a photo and a paste', async () => {
  renderPage()
  await waitFor(() => expect(screen.getByText('Pick what it is first')).toBeTruthy())
  expect(screen.getByRole('button', { name: 'Choose a file' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Take a photo' })).toBeTruthy()
  expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy()
})

// A paper quiz photographed on a phone is a first-class way in, not a
// workaround, so the camera is its own button with a rear-camera hint.
test('the photo input asks for the rear camera', async () => {
  renderPage()
  await waitFor(() => expect(screen.getByText('Pick what it is first')).toBeTruthy())
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
  chooseType('Message')

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

// The surface asks what the document is BEFORE it takes one, so by the time
// a review exists the question has been answered. What it must not do is ask
// again — that would be interrogating a teacher about their own answer.
test('the chosen type is stated, not asked again', async () => {
  detectReviewType.mockResolvedValue({ docType: 'quiz', confident: true })
  createReview.mockResolvedValue(review())
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  chooseType()
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))

  await waitFor(() => expect(screen.getByText('Got it — reviewing as a quiz.')).toBeTruthy())
  // Never asked back as a question, and never with a Yes/No step in front of
  // the chips.
  expect(screen.queryByText(/Looks like .* — right\?/)).toBeNull()
  expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull()
  expect(screen.queryByRole('button', { name: "No — it's something else" })).toBeNull()
  // But changing it is still one tap.
  expect(screen.getByText(/tap any to change it/)).toBeTruthy()
})

// Being wrong has to cost one tap.
test('correcting the type is one tap away, and offers all seven', async () => {
  detectReviewType.mockResolvedValue({ docType: 'quiz', confident: true })
  createReview.mockResolvedValue(review())
  updateReview.mockResolvedValue(review({ docType: 'lesson_plan', docTypeLabel: 'Lesson plan' }))
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  chooseType()
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

// --- lenses ---



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
  createReview.mockResolvedValue(review())
  runReview.mockResolvedValue(REVIEWED)
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  chooseType()
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
  // No second press: pressing it once is the whole instruction.
  await waitFor(() => expect(screen.getByText('If you change one thing')).toBeTruthy())
}

// The one change leads, above everything a teacher could choose to read next.
// The one change leads, above the findings that argue for it.
test('the result leads with the one-thing card, above the findings', async () => {
  await openReviewed()
  const all = Array.from(document.querySelectorAll('*'))
  const oneThing = all.indexOf(screen.getByText('If you change one thing'))
  // The first numbered finding section.
  const found = all.indexOf(screen.getByText('What each item measures'))
  expect(oneThing).toBeLessThan(found)
  expect(screen.getByText('Split question 4 — it is measuring reading, not the content.')).toBeTruthy()
})

// Every finding is on the page, in order. They used to be behind pills, which
// meant reading one and having to know to go looking for the rest.
// The same numbered, colour-banded sections as the printed reports and
// Lesson Debrief's Insights, so every report in this app reads the same way.
test('findings are numbered sections, all on the page', async () => {
  await openReviewed()
  expect(screen.getByText('What each item measures')).toBeTruthy()
  expect(screen.getByText('Items 1-3 are recall. Item 4 is really a reading test.')).toBeTruthy()
  expect(screen.getByText('Suggested edits')).toBeTruthy()
  // Numbered in reading order, so a lens that produced nothing leaves no gap.
  const numbers = Array.from(document.querySelectorAll('section h3')).map(
    (h) => h.previousElementSibling?.textContent ?? h.parentElement?.previousElementSibling?.textContent,
  )
  expect(numbers.filter(Boolean).length).toBeGreaterThan(0)
  // Nothing to click to see them.
  expect(screen.queryByRole('navigation', { name: 'Review sections' })).toBeNull()
})

// Edits are what a teacher arrived for, so that is what is open.


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
  chooseType()
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))

  await waitFor(() => expect(screen.getByText('If you change one thing')).toBeTruthy())
  expect(screen.queryByRole('button', { name: 'Redesign for meaningful AI use' })).toBeNull()
})

// --- failures ---

test('an unreadable file reports why and leaves the drop zone usable', async () => {
  extractReviewDocument.mockRejectedValue(new Error("Couldn't find any text in that file"))
  renderPage()
  await waitFor(() => expect(screen.getByText('Pick what it is first')).toBeTruthy())

  const input = document.querySelector(`input[accept=".docx,.pdf,.pptx,.xlsx,.xls,.txt,.jpg,.jpeg,.png"]`)
  fireEvent.change(input!, { target: { files: [new File(['x'], 'scan.pdf')] } })

  await waitFor(() => expect(screen.getByText(/Couldn't find any text/)).toBeTruthy())
  expect(screen.getByText('Pick what it is first')).toBeTruthy()
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
  expect(screen.getByText('Pick what it is first')).toBeTruthy()
})

test('a handoff for another surface is left alone', async () => {
  sessionStorage.setItem(
    'wivoza.handoff',
    JSON.stringify({ kind: 'rehearse', debriefId: 'd1', situation: 'x', topic: null }),
  )
  renderPage()
  await waitFor(() => expect(screen.getByText('Pick what it is first')).toBeTruthy())
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
  const uploaded = review({ fileName: 'Unit 3 Quiz.docx', pageCount: 4, sourceKind: 'photo' })
  createReview.mockResolvedValue(uploaded)
  // The automatic run replaces the review on screen, so it has to carry the
  // same document — otherwise the file details vanish between the two.
  runReview.mockResolvedValue(uploaded)
  renderPage()
  await waitFor(() => expect(screen.getByPlaceholderText('Paste the text here...')).toBeTruthy())
  chooseType()
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
  await waitFor(() => expect(screen.getByText(/Got it — reviewing as/)).toBeTruthy())
}

// Setting up a review used to be three separate panels, which made the type
// confirmation and the lenses read as unrelated questions rather than two
// halves of the same setup. Each block says what it is.
test('every block of the setup says what it is', async () => {
  await reachSetup()
  for (const heading of ['Got it — reviewing as a quiz.', 'Your class']) {
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


// --- the state every teacher lands on ---

// The drop zone, the paste box and the class line used to sit loose on the
// page background while the state two seconds later was a single card, so
// arriving here looked like a different surface from the one you were about
// to be on. Everything needed to start a review is in one card.
test('the empty state is one card, like the step that follows it', async () => {
  renderPage()
  await waitFor(() => expect(screen.getByText('Pick what it is first')).toBeTruthy())

  const card = screen.getByText('Pick what it is first').closest('.rounded-3xl')?.parentElement
  expect(card, 'the drop zone should sit inside a card').toBeTruthy()
  const text = card?.textContent ?? ''
  for (const piece of ['What are you looking over?', 'Or paste it', 'Your class', 'No student names, please.']) {
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
  chooseType()
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Homework' })).toBeTruthy())

  fireEvent.click(screen.getByRole('button', { name: 'Homework' }))

  await waitFor(() => expect(screen.getByText('Got it — reviewing as homework.')).toBeTruthy())
  expect(screen.getByText(/tap any to change it/)).toBeTruthy()
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
  chooseType()
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
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
  chooseType()
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
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
  chooseType()
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
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
  chooseType()
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))

  await waitFor(() => expect(screen.getByText('Nothing I would change before tomorrow')).toBeTruthy())
  // The findings still stand and are still on the page — "no edits" is an
  // answer about the changes, not about the whole review.
  expect(screen.getByText('What each item measures')).toBeTruthy()
  expect(screen.getByText('Items 1-3 are recall. Item 4 is really a reading test.')).toBeTruthy()
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
  chooseType()
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
  // The run happens by itself, so the question arrives without a second press.
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

  await waitFor(() => expect(screen.getByText(/Got it — reviewing as/)).toBeTruthy())
  expect(screen.queryByText('If you change one thing')).toBeNull()
})

// A link to a review that is gone has somewhere useful to land.
test('a URL for a review that no longer exists lands on the drop zone', async () => {
  getReview.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }))
  renderAt('/look-it-over/gone')

  await waitFor(() => expect(screen.getByText('Pick what it is first')).toBeTruthy())
})

// My Work linked with ?open= before results had URLs, and those links are in
// teachers' histories.
test('the old ?open= link still opens the review', async () => {
  getReview.mockResolvedValue(REVIEWED)
  renderAt('/look-it-over?open=r1')

  await waitFor(() => expect(screen.getByText('If you change one thing')).toBeTruthy())
  expect(getReview).toHaveBeenCalledWith('r1')
})

// --- one review, several documents ---

const FILE_INPUT = `input[accept=".docx,.pdf,.pptx,.xlsx,.xls,.txt,.jpg,.jpeg,.png"]`

function dropFiles(names: string[]) {
  const input = document.querySelector(FILE_INPUT)
  fireEvent.change(input!, { target: { files: names.map((n) => new File(['x'], n)) } })
}

function readsEachFile() {
  extractReviewDocument.mockImplementation((file: File) =>
    Promise.resolve({ text: `text of ${file.name}`, fileName: file.name, pageCount: 1, docType: 'assignment', confident: true }),
  )
}

// Criterion 4: an assignment and its rubric are one review, not two. What a
// teacher wants from the pair is the comparison, which is exactly what they
// cannot get by reviewing each separately.
test('several files dropped together become one review', async () => {
  readsEachFile()
  createReview.mockResolvedValue(review())
  renderPage()
  await waitFor(() => expect(screen.getByText('What are you looking over?')).toBeTruthy())
  chooseType('Assignment')

  dropFiles(['Essay task.docx', 'Rubric.docx'])

  await waitFor(() => expect(createReview).toHaveBeenCalled())
  const sent = createReview.mock.calls[0][0]
  expect(sent.files).toHaveLength(2)
  expect(sent.files[0].fileName).toBe('Essay task.docx')
  expect(sent.files[1].fileName).toBe('Rubric.docx')
})

// Dropping a file is the instruction. Nothing waits to be told again.
test('dropping a file reads it without being asked twice', async () => {
  readsEachFile()
  createReview.mockResolvedValue(review())
  runReview.mockResolvedValue(REVIEWED)
  renderPage()
  await waitFor(() => expect(screen.getByText('What are you looking over?')).toBeTruthy())
  chooseType()

  dropFiles(['quiz.docx'])

  // Straight to the result — no "Read it" in between.
  await waitFor(() => expect(screen.getByText('If you change one thing')).toBeTruthy())
  expect(runReview).toHaveBeenCalled()
})

// One unreadable file in a drop of two must not lose the other.
test('a file that cannot be read is named, and the rest are still used', async () => {
  extractReviewDocument.mockImplementation((file: File) =>
    file.name === 'broken.pdf'
      ? Promise.reject(new Error("Couldn't find any text in that file"))
      : Promise.resolve({ text: 'fine', fileName: file.name, pageCount: 1, docType: 'quiz', confident: true }),
  )
  createReview.mockResolvedValue(review())
  renderPage()
  await waitFor(() => expect(screen.getByText('What are you looking over?')).toBeTruthy())
  chooseType()

  dropFiles(['good.docx', 'broken.pdf'])

  await waitFor(() => expect(createReview).toHaveBeenCalled())
  // The good one went through, named by name rather than "one of your files".
  expect(createReview.mock.calls[0][0].files).toHaveLength(1)
  expect(createReview.mock.calls[0][0].files[0].fileName).toBe('good.docx')
})

test('no readable file means no review, and a reason', async () => {
  extractReviewDocument.mockRejectedValue(new Error("Couldn't find any text in that file"))
  renderPage()
  await waitFor(() => expect(screen.getByText('What are you looking over?')).toBeTruthy())
  chooseType()

  dropFiles(['broken.pdf'])

  await waitFor(() => expect(screen.getByText(/broken\.pdf/)).toBeTruthy())
  expect(createReview).not.toHaveBeenCalled()
})

test('more than five in one drop takes the first five', async () => {
  readsEachFile()
  createReview.mockResolvedValue(review())
  renderPage()
  await waitFor(() => expect(screen.getByText('What are you looking over?')).toBeTruthy())
  chooseType()

  dropFiles(['a.docx', 'b.docx', 'c.docx', 'd.docx', 'e.docx', 'f.docx'])

  await waitFor(() => expect(createReview).toHaveBeenCalled())
  expect(createReview.mock.calls[0][0].files).toHaveLength(5)
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

  await waitFor(() => expect(screen.getByText(/Got it — reviewing as/)).toBeTruthy())
  expect(screen.queryByText('If you change one thing')).toBeNull()
})

// A link to a review that is gone has somewhere useful to land.
test('a URL for a review that no longer exists lands on the drop zone', async () => {
  getReview.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }))
  renderAt('/look-it-over/gone')

  await waitFor(() => expect(screen.getByText('Pick what it is first')).toBeTruthy())
})

// My Work linked with ?open= before results had URLs, and those links are in
// teachers' histories.
test('the old ?open= link still opens the review', async () => {
  getReview.mockResolvedValue(REVIEWED)
  renderAt('/look-it-over?open=r1')

  await waitFor(() => expect(screen.getByText('If you change one thing')).toBeTruthy())
  expect(getReview).toHaveBeenCalledWith('r1')
})

// --- the type is chosen first ---

// The surface asks what the document is before it will take one. That is the
// shape of the whole flow, so it is pinned rather than left to drift back.
test('the type is asked before anything can be uploaded', async () => {
  renderPage()
  await waitFor(() => expect(screen.getByText('What are you looking over?')).toBeTruthy())

  for (const label of ['Quiz / exam', 'Homework', 'Assignment', 'Project', 'Lesson plan', 'Presentation', 'Rubric', 'Message']) {
    expect(screen.getByRole('button', { name: label }), label).toBeTruthy()
  }
  expect(screen.getByText('Pick what it is first')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Choose a file' })).toHaveProperty('disabled', true)
  expect(screen.getByRole('button', { name: 'Take a photo' })).toHaveProperty('disabled', true)
})

test('choosing one opens the drop zone', async () => {
  renderPage()
  await waitFor(() => expect(screen.getByText('What are you looking over?')).toBeTruthy())

  chooseType('Lesson plan')

  await waitFor(() => expect(screen.getByText('Drop it here')).toBeTruthy())
  expect(screen.getByRole('button', { name: 'Choose a file' })).toHaveProperty('disabled', false)
})

// A lens set a teacher cannot see is a promise they have no way to check —
// and this is the moment they are deciding whether to use the surface at all.
test('choosing a type says what will be checked', async () => {
  renderPage()
  await waitFor(() => expect(screen.getByText('What are you looking over?')).toBeTruthy())

  chooseType('Lesson plan')

  await waitFor(() => expect(screen.getByText(/timing realism/)).toBeTruthy())
  expect(screen.getByText(/and 3 more/)).toBeTruthy()
})

test('the choice is what the review is created as', async () => {
  createReview.mockResolvedValue(review())
  renderPage()
  await waitFor(() => expect(screen.getByText('What are you looking over?')).toBeTruthy())
  chooseType('Rubric')
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))

  await waitFor(() => expect(createReview).toHaveBeenCalled())
  expect(createReview.mock.calls[0][0].docType).toBe('rubric')
})

// The cost of choosing first is that nothing checks the choice. Detection
// still runs for exactly this: a teacher who picks the wrong type is told,
// rather than quietly getting the wrong lenses.
test('detection disagreeing with the choice is said out loud', async () => {
  const mismatch = review({
    docType: 'assignment',
    docTypeLabel: 'Assignment',
    docTypeConfirmed: true,
    detectedType: 'quiz',
  })
  createReview.mockResolvedValue(mismatch)
  runReview.mockResolvedValue(mismatch)
  renderPage()
  await waitFor(() => expect(screen.getByText('What are you looking over?')).toBeTruthy())
  chooseType('Assignment')
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))

  await waitFor(() => expect(screen.getByText(/this looks more like/)).toBeTruthy())
  expect(screen.getByText(/numbered items/)).toBeTruthy()
})

test('agreement says nothing — it is not a notification', async () => {
  const agreed = review({ docTypeConfirmed: true, detectedType: 'quiz' })
  createReview.mockResolvedValue(agreed)
  runReview.mockResolvedValue(agreed)
  renderPage()
  await waitFor(() => expect(screen.getByText('What are you looking over?')).toBeTruthy())
  chooseType()
  fireEvent.change(screen.getByPlaceholderText('Paste the text here...'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))

  await waitFor(() => expect(screen.getByText(/Got it — reviewing as/)).toBeTruthy())
  expect(screen.queryByText(/this looks more like/)).toBeNull()
})
