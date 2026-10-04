// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type React from 'react'
import { afterEach, expect, test, vi } from 'vitest'

// Lesson Debrief's Reflect tab used to hold two unrelated things: a coaching
// conversation (voice turns, playback, a start screen, a topic picker, a
// transcript) and the teacher's own written reflection. The conversation
// moved to Talk It Through and its engine — about 850 lines — was removed.
//
// A deletion that large, inside a 5,600-line file, is exactly the kind that
// takes something live with it. These tests pin what had to survive: the four
// notes a teacher writes themselves, the save, the focus selector My Growth
// depends on, and the one way out into a conversation.

vi.mock('../lib/api', () => ({}))
vi.mock('../hooks/useVoiceTurn', () => ({ useVoiceTurn: () => ({ supported: false }) }))

const { ReflectTab } = await import('./AudioCoaching')

function renderNotes(over: Record<string, unknown> = {}) {
  const props = {
    locked: false,
    strengths: '',
    growthAreas: '',
    nextStep: '',
    followUpDate: '',
    onStrengthsChange: vi.fn(),
    onGrowthAreasChange: vi.fn(),
    onNextStepChange: vi.fn(),
    onFollowUpDateChange: vi.fn(),
    saving: false,
    saved: false,
    error: null,
    onSave: vi.fn(),
    onTalkItThrough: vi.fn(),
    focusMetric: null,
    onFocusMetricChange: vi.fn(),
    ...over,
  }
  const rendered = render(
    <MemoryRouter>
      <ReflectTab {...(props as React.ComponentProps<typeof ReflectTab>)} />
    </MemoryRouter>,
  )
  return { props, container: rendered.container }
}

afterEach(cleanup)

test('the four notes a teacher writes themselves all survived', () => {
  renderNotes()
  for (const label of [
    'What I noticed',
    'What I want to explore',
    'My next step',
    'Focus for my next recording',
  ]) {
    expect(screen.getByText(label), label).toBeTruthy()
  }
})

test('the notes are editable and report their changes', () => {
  const { props } = renderNotes()
  fireEvent.change(screen.getByLabelText('What I noticed'), { target: { value: 'The room went quiet.' } })
  expect(props.onStrengthsChange).toHaveBeenCalledWith('The room went quiet.')
})

// `onSave` fires on blur, which is how a teacher's words get persisted at all.
test('leaving a note saves it', () => {
  const { props } = renderNotes()
  fireEvent.blur(screen.getByLabelText('What I noticed'))
  expect(props.onSave).toHaveBeenCalled()
})

// The focus metric is what My Growth trends across recordings — it is the
// one piece of this tab that another surface depends on.
test('the focus selector survived, since My Growth reads it', () => {
  renderNotes()
  expect(screen.getByText('Focus for my next recording')).toBeTruthy()
})

// The only way out of this tab into a conversation, and it carries the report.
test('talking it through is offered, and hands off rather than opening a chat here', () => {
  const { props } = renderNotes()
  const button = screen.getByRole('button', { name: /Talk this lesson through with Coach/ })
  fireEvent.click(button)
  expect(props.onTalkItThrough).toHaveBeenCalled()
})

test('a locked report offers no handoff and no editing', () => {
  renderNotes({ locked: true })
  expect(screen.queryByRole('button', { name: /Talk this lesson through/ })).toBeNull()
  // The notes themselves are read-only once locked, which was already true
  // and had to stay true through the removal.
  expect(screen.getByLabelText('What I noticed')).toHaveProperty('disabled', true)
  expect(screen.getByLabelText('What I want to explore')).toHaveProperty('disabled', true)
})

// None of the conversation engine may come back by accident.
test('nothing from the removed conversation engine renders', () => {
  const { container } = renderNotes()
  const text = container.textContent ?? ''
  for (const gone of [
    'Start Talking',
    'Type instead',
    'Pause',
    'Finish and write my debrief',
    'Wrapping up your reflection',
    'carry on the conversation',
  ]) {
    expect(text, gone).not.toContain(gone)
  }
  // And no audio element, which only playback needed.
  expect(container.querySelector('audio')).toBeNull()
})

test('an error is shown rather than swallowed', () => {
  renderNotes({ error: 'Could not save your notes. Please try again.' })
  expect(screen.getByText('Could not save your notes. Please try again.')).toBeTruthy()
})
