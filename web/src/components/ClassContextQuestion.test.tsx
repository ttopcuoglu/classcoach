// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { ClassContext } from '../lib/api'

// The inline question writes to the teacher's profile from one tap, made in
// the middle of talking about something else. That makes it the most likely
// place in the app for a mis-tap, and the least likely place for someone to
// go hunting for where it got saved — so the two behaviors pinned hardest
// here are that an answer is immediately undoable, and that the question
// never blocks or nags.
//
// `../lib/api` is mocked rather than hitting a server: these tests are about
// what the component does with a response, and the route's own rules are
// covered by the server's classProfile tests.
//
// Clicks go through fireEvent rather than a raw DOM .click() so React's state
// updates are wrapped in act() and actually flush — a bare .click() leaves the
// component rendered as it was before the tap.

const updateClassProfile = vi.fn()
const createClassProfile = vi.fn()

vi.mock('../lib/api', () => ({
  updateClassProfile: (...args: unknown[]) => updateClassProfile(...args),
  createClassProfile: (...args: unknown[]) => createClassProfile(...args),
}))

const { default: ClassContextQuestion } = await import('./ClassContextQuestion')

function prep(over: Partial<ClassContext> = {}): ClassContext {
  return {
    id: 'c1',
    label: null,
    gradeBand: '9-12',
    subject: null,
    course: null,
    courseLevel: null,
    classMakeup: [],
    isDefault: true,
    confirmed: false,
    inferred: false,
    schoolYear: null,
    line: 'Grades 9–12',
    needsConfirmation: true,
    ...over,
  }
}

beforeEach(() => {
  updateClassProfile.mockReset()
  createClassProfile.mockReset()
})

afterEach(cleanup)

test('nothing is rendered when there is nothing worth asking', () => {
  const { container } = render(
    <ClassContextQuestion
      prep={prep({ subject: 'Science', confirmed: true })}
      needs={['subject']}
      onSaved={() => {}}
    />,
  )
  expect(container.innerHTML).toBe('')
})

test('the one question renders with chips to answer it', () => {
  render(<ClassContextQuestion prep={prep()} needs={['subject']} onSaved={() => {}} />)
  expect(screen.getByText('What subject?')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Science' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Math' })).toBeTruthy()
})

// One tap is the whole interaction for a single-select — a chip plus a
// separate Save would be a form again.
test('a single tap saves the answer and confirms the prep', async () => {
  updateClassProfile.mockResolvedValue({
    ...prep({ subject: 'Science', confirmed: true, line: 'Grades 9–12 · Science' }),
    previous: prep(),
  })
  const onSaved = vi.fn()
  render(<ClassContextQuestion prep={prep()} needs={['subject']} onSaved={onSaved} />)

  fireEvent.click(screen.getByRole('button', { name: 'Science' }))

  await waitFor(() => expect(updateClassProfile).toHaveBeenCalled())
  expect(updateClassProfile).toHaveBeenCalledWith('c1', { subject: 'Science', confirm: true })
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
})

test('an answer is followed by the reversible confirmation, not silence', async () => {
  updateClassProfile.mockResolvedValue({
    ...prep({ subject: 'Science', confirmed: true, line: 'Grades 9–12 · Science' }),
    previous: prep(),
  })
  render(<ClassContextQuestion prep={prep()} needs={['subject']} onSaved={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'Science' }))

  await waitFor(() => expect(screen.getByText('Saved to your class — not quite?')).toBeTruthy())
  expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
  // The line is shown back so the teacher can see what they just agreed to
  // without opening their profile.
  expect(screen.getByText('Grades 9–12 · Science')).toBeTruthy()
})

// Undo has to restore the previous values, not merely hide the strip.
test('undo writes back exactly what was there before the tap', async () => {
  const before = prep({ subject: 'Math', line: 'Grades 9–12 · Math' })
  updateClassProfile.mockResolvedValueOnce({
    ...prep({ subject: 'Science', confirmed: true, line: 'Grades 9–12 · Science' }),
    previous: before,
  })
  render(<ClassContextQuestion prep={prep()} needs={['subject']} onSaved={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'Science' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy())

  updateClassProfile.mockResolvedValueOnce({ ...before, previous: before })
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

  await waitFor(() => expect(updateClassProfile).toHaveBeenCalledTimes(2))
  expect(updateClassProfile).toHaveBeenLastCalledWith('c1', {
    label: null,
    gradeBand: '9-12',
    subject: 'Math',
    course: null,
    courseLevel: null,
    classMakeup: [],
  })
})

// Who's-in-the-room is the only multi-select, because "both" and "the first
// one I tapped" are different answers.
test('who-is-in-the-room collects several answers before saving', async () => {
  updateClassProfile.mockResolvedValue({ ...prep({ confirmed: true }), previous: prep() })
  render(<ClassContextQuestion prep={prep()} needs={['classMakeup']} onSaved={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'SPED / 504' }))
  fireEvent.click(screen.getByRole('button', { name: 'English learners' }))
  // Still nothing saved — a tap is a selection here, not a commit.
  expect(updateClassProfile).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(updateClassProfile).toHaveBeenCalled())
  expect(updateClassProfile).toHaveBeenCalledWith('c1', {
    classMakeup: ['inclusion', 'english_learners'],
    confirm: true,
  })
})

// "Never block an action on missing context" — skipping is always available
// and costs the teacher nothing.
test('the question can always be skipped, and writes nothing when it is', () => {
  render(<ClassContextQuestion prep={prep()} needs={['subject']} onSaved={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
  expect(updateClassProfile).not.toHaveBeenCalled()
  expect(screen.queryByText('What subject?')).toBeNull()
})

test('"neither" is a real answer to who-is-in-the-room and stores nothing', () => {
  render(<ClassContextQuestion prep={prep()} needs={['classMakeup']} onSaved={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Neither' }))
  expect(updateClassProfile).not.toHaveBeenCalled()
  expect(screen.queryByText(/who's in the room/i)).toBeNull()
})

// A teacher with no prep at all answers the band question, which creates one.
test('answering the band question creates the first prep', async () => {
  createClassProfile.mockResolvedValue(prep({ id: 'new', confirmed: true }))
  render(<ClassContextQuestion prep={null} needs={['gradeBand']} onSaved={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'Grades 9-12' }))

  await waitFor(() => expect(createClassProfile).toHaveBeenCalled())
  expect(createClassProfile).toHaveBeenCalledWith({ gradeBand: '9-12', isDefault: true })
})

// A failed save must not interrupt a conversation. The question goes away and
// the coach carries on without the answer, which it could always do.
test('a failed save disappears quietly rather than showing an error', async () => {
  updateClassProfile.mockRejectedValue(new Error('offline'))
  const { container } = render(
    <ClassContextQuestion prep={prep()} needs={['subject']} onSaved={() => {}} />,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Science' }))

  await waitFor(() => expect(container.innerHTML).toBe(''))
  expect(screen.queryByText(/offline/i)).toBeNull()
})
