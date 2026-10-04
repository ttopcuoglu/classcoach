// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { ClassContext } from '../lib/api'

// The brief's first rule about class context is that it never blocks an
// action. That makes the interesting cases the degenerate ones: a teacher who
// has no class saved, and a load that fails outright. Both have to render
// something a teacher can use and both have to tell the caller there is no
// room, so the surface around this carries on either way.
//
// The second rule is that an inferred prep is a guess until the teacher
// agrees to it, which is what the reversible strip is for.

const getClassProfiles = vi.fn()
const updateClassProfile = vi.fn()
const createClassProfile = vi.fn()

vi.mock('../lib/api', () => ({
  getClassProfiles: () => getClassProfiles(),
  updateClassProfile: (...args: unknown[]) => updateClassProfile(...args),
  createClassProfile: (...args: unknown[]) => createClassProfile(...args),
}))

const { default: ClassContextLine } = await import('./ClassContextLine')

function prep(over: Partial<ClassContext> = {}): ClassContext {
  return {
    id: 'c1',
    label: null,
    gradeBand: '9-12',
    subject: 'Science',
    course: 'Biology',
    courseLevel: 'Honors',
    classMakeup: ['english_learners'],
    isDefault: true,
    confirmed: true,
    inferred: false,
    schoolYear: '2026-2027',
    line: 'Grades 9–12 · Biology · Honors · ELs in the room',
    needsConfirmation: false,
    ...over,
  }
}

beforeEach(() => {
  getClassProfiles.mockReset()
  updateClassProfile.mockReset()
  createClassProfile.mockReset()
})

afterEach(cleanup)

test('a confirmed prep renders as the standard line with a Change beside it', async () => {
  getClassProfiles.mockResolvedValue([prep()])
  render(<ClassContextLine />)

  await waitFor(() =>
    expect(screen.getByText('Grades 9–12 · Biology · Honors · ELs in the room')).toBeTruthy(),
  )
  expect(screen.getByText('Your class')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy()
  // Nothing to confirm, so no strip.
  expect(screen.queryByText(/not quite/i)).toBeNull()
})

// A brand-new account is a normal state, not an error state.
test('no class saved renders an invitation and says coaching still works', async () => {
  getClassProfiles.mockResolvedValue([])
  const onChange = vi.fn()
  render(<ClassContextLine onChange={onChange} />)

  await waitFor(() => expect(screen.getByText(/coaching still works without it/i)).toBeTruthy())
  expect(screen.getByRole('button', { name: 'Add your class' })).toBeTruthy()
  // The caller is told there is no room, so it can proceed without one.
  expect(onChange).toHaveBeenCalledWith(null)
})

// A failed load must not take the surface down with it — the teacher carries
// on exactly as one who never set a class does.
test('a failed load degrades to the same invitation rather than an error', async () => {
  getClassProfiles.mockRejectedValue(new Error('offline'))
  render(<ClassContextLine />)

  await waitFor(() => expect(screen.getByText(/coaching still works without it/i)).toBeTruthy())
  expect(screen.queryByText(/offline/i)).toBeNull()
})

test('the default prep is the one reported to the caller', async () => {
  const other = prep({ id: 'c2', isDefault: false, line: 'Grades 6–8 · Math' })
  const theDefault = prep({ id: 'c1', isDefault: true })
  getClassProfiles.mockResolvedValue([other, theDefault])
  const onChange = vi.fn()
  render(<ClassContextLine onChange={onChange} />)

  await waitFor(() => expect(onChange).toHaveBeenCalled())
  expect(onChange.mock.calls[0][0].id).toBe('c1')
})

// An inferred row was agreed to by nobody. Showing it as fact is the failure
// this strip exists to prevent.
test('a guessed prep says it was guessed and offers both ways out', async () => {
  getClassProfiles.mockResolvedValue([prep({ inferred: true, confirmed: false, needsConfirmation: true })])
  render(<ClassContextLine />)

  await waitFor(() => expect(screen.getByText(/not quite\?$/i)).toBeTruthy())
  expect(screen.getByText(/from what you had already told us/i)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Change it' })).toBeTruthy()
  expect(screen.getByRole('button', { name: "That's right" })).toBeTruthy()
})

test('agreeing to a guess confirms it and drops the strip', async () => {
  getClassProfiles.mockResolvedValue([prep({ inferred: true, confirmed: false, needsConfirmation: true })])
  updateClassProfile.mockResolvedValue({ ...prep(), previous: prep({ confirmed: false }) })
  render(<ClassContextLine />)

  await waitFor(() => expect(screen.getByRole('button', { name: "That's right" })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: "That's right" }))

  await waitFor(() => expect(updateClassProfile).toHaveBeenCalledWith('c1', { confirm: true }))
  await waitFor(() => expect(screen.queryByText(/not quite/i)).toBeNull())
})

// A new school year invalidates last year's agreement, but the wording has to
// differ from a guess — this one WAS confirmed, just not for this year.
test('a prep from last year asks whether it still holds, without calling it a guess', async () => {
  getClassProfiles.mockResolvedValue([
    prep({ confirmed: true, inferred: false, schoolYear: '2025-2026', needsConfirmation: true }),
  ])
  render(<ClassContextLine />)

  await waitFor(() => expect(screen.getByText(/still your class this year/i)).toBeTruthy())
  expect(screen.queryByText(/from what you had already told us/i)).toBeNull()
})

test('Change opens the editor on the current values', async () => {
  getClassProfiles.mockResolvedValue([prep()])
  render(<ClassContextLine />)

  await waitFor(() => expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Change' }))

  expect(screen.getByText('Grade band')).toBeTruthy()
  expect(screen.getByText("Who's in the room")).toBeTruthy()
  // The stored band is the selected chip, not a default.
  expect(screen.getByRole('button', { name: 'Grades 9-12' }).getAttribute('aria-pressed')).toBe('true')
})

// The editor's own narrowing rules, which the five-field panel also had: a
// course list is band-specific, and AP does not exist below high school.
test('moving to an elementary band drops the course and level that cannot apply', async () => {
  getClassProfiles.mockResolvedValue([prep({ courseLevel: 'AP' })])
  render(<ClassContextLine />)

  await waitFor(() => expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Change' }))
  expect(screen.getByText('Level')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Grades K-2' }))

  // K-2 offers only Regular, so there is no level row left to show, and no
  // course row either.
  expect(screen.queryByText('Level')).toBeNull()
  expect(screen.queryByText('Course')).toBeNull()
})

test('the compact variant drops the label but keeps the line', async () => {
  getClassProfiles.mockResolvedValue([prep()])
  render(<ClassContextLine compact />)

  await waitFor(() =>
    expect(screen.getByText('Grades 9–12 · Biology · Honors · ELs in the room')).toBeTruthy(),
  )
  expect(screen.queryByText('Your class')).toBeNull()
})
