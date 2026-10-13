import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isCompleteReflection } from './telegramCoach.ts'

// The rule that decides whether a single message gets offered a takeaway.
// Getting it wrong in one direction nags a teacher who was mid-sentence;
// in the other, the one reflection worth keeping quietly becomes nothing.

const OPENER = 'my 3rd period was a disaster today, they would not stop talking during the notes'

const VOICE_NOTE =
  "Okay so third period again. I started the notes and within about two minutes the back four were talking over me, " +
  "and I did the thing I always do where I just raise my voice and push through it, which never works. By the time I " +
  "got to the practice problems I'd lost maybe half the room and I was already annoyed, which I know they could hear. " +
  "The weird part is first period had the exact same lesson and it was fine, so it isn't the material."

test('a long first message is a reflection worth wrapping up', () => {
  assert.ok(VOICE_NOTE.length >= 400, 'fixture should be a realistic length')
  assert.equal(isCompleteReflection(VOICE_NOTE, 0), true)
})

test('an opening line is not', () => {
  assert.equal(isCompleteReflection(OPENER, 0), false)
})

test('a long message mid-conversation is left to the sweep', () => {
  // Two exchanges in, the thirty-minute offer already covers it, and a
  // button on every long turn would be a nag.
  assert.equal(isCompleteReflection(VOICE_NOTE, 2), false)
})

test('whitespace is not substance', () => {
  assert.equal(isCompleteReflection(`${OPENER}${' '.repeat(500)}`, 0), false)
})

// Which button an offer becomes. Three branches, and the difference is
// what the teacher is promised: a thing arriving here, a form opening
// filled in, or a tool opening empty.

import { toolOfferButton } from './telegramCoach.ts'

function labelsOf(markup: ReturnType<typeof toolOfferButton>): string[] {
  const rows = markup && 'inline_keyboard' in markup ? markup.inline_keyboard : []
  return rows.flat().map((button) => button.text)
}

const PLANNING = { key: 'planning_coach' as const, label: 'Open Planning Coach', path: '/lesson-planning' }

test('a few activities are made here, so the button says so', () => {
  const markup = toolOfferButton(PLANNING, { topic: 'photosynthesis', kind: 'ideas' }, 'user-1')
  assert.deepEqual(labelsOf(markup), ['Send me a few ideas', '🆕 New topic'])
})

test('with nothing collected, the tool just opens', () => {
  const markup = toolOfferButton(PLANNING, null, 'user-1')
  assert.deepEqual(labelsOf(markup), ['Open Planning Coach', '🆕 New topic'])
})

const COMMS = { key: 'communication_coach' as const, label: 'Open Communication Coach', path: '/communications' }

test('a message is offered here first, because that is where it gets copied', () => {
  const markup = toolOfferButton(
    COMMS,
    { mode: 'message', situation: 'missing homework', startingAction: 'new' },
    'user-1',
  )
  assert.deepEqual(labelsOf(markup), ['✍️ Draft it here', 'Open in Wivoza', '🆕 New topic'])
})

test('a meeting plan is offered as a page to carry in', () => {
  const markup = toolOfferButton(COMMS, { mode: 'meeting', situation: 'an IEP meeting' }, 'user-1')
  assert.deepEqual(labelsOf(markup), ['Get ready for this', '📄 Send a PDF', '🆕 New topic'])
})

// Forwarding is how the parent's own words reach Coach. The draft has to
// answer those, not Coach's paraphrase of them — which is why "respond"
// mode existed and was being withheld.

import { readHandoff } from './coachHandoff.ts'

const PARENT_EMAIL =
  "I am frankly appalled that my son received a zero on an assignment he tells me he handed in, and that nobody thought to tell me he was behind until now."

function handoffBehind(markup: ReturnType<typeof toolOfferButton>, prefix: string, userId: string) {
  const rows = markup && 'inline_keyboard' in markup ? markup.inline_keyboard : []
  const button = rows.flat().find((b) => 'callback_data' in b && b.callback_data.startsWith(`${prefix}:`))
  const id = button && 'callback_data' in button ? button.callback_data.split(':')[1] : ''
  return readHandoff(id, userId)
}

test('a forwarded message is answered word for word, not paraphrased', () => {
  const markup = toolOfferButton(
    COMMS,
    { mode: 'message', situation: 'a parent is upset about a zero', startingAction: 'new', recipient: 'parent_caregiver' },
    'user-2',
    PARENT_EMAIL,
  )
  const details = handoffBehind(markup, 'draft', 'user-2')?.details
  assert.ok(details && 'situation' in details)
  assert.equal(details.situation, PARENT_EMAIL)
  assert.equal('startingAction' in details && details.startingAction, 'respond')
  // Everything Coach worked out about it survives.
  assert.equal('recipient' in details && details.recipient, 'parent_caregiver')
})

test('with nothing forwarded, Coach\'s own summary stands', () => {
  const markup = toolOfferButton(
    COMMS,
    { mode: 'message', situation: 'a parent is upset about a zero', startingAction: 'new' },
    'user-3',
  )
  const details = handoffBehind(markup, 'draft', 'user-3')?.details
  assert.equal(details && 'situation' in details && details.situation, 'a parent is upset about a zero')
  assert.equal(details && 'startingAction' in details && details.startingAction, 'new')
})

// The lesson length decides the shape of the lesson, and the form's 45
// minute default is invisible here because the button runs past the form.
// So nothing is MADE until Coach knows it.

test('with the length known, both doors, and the tap builds it', () => {
  const markup = toolOfferButton(PLANNING, { topic: 'photosynthesis', kind: 'full', durationMinutes: 30 }, 'u1')
  assert.deepEqual(labelsOf(markup), ['Build this lesson', '📄 Send a PDF', '🆕 New topic'])
  const rows = markup && 'inline_keyboard' in markup ? markup.inline_keyboard : []
  const open = rows.flat().find((b) => 'web_app' in b)
  assert.match((open as { web_app: { url: string } }).web_app.url, /build=1/)
})

test('without it, the form opens to be corrected and nothing is made', () => {
  const markup = toolOfferButton(PLANNING, { topic: 'photosynthesis', kind: 'full' }, 'u1')
  // No PDF: a file is finished the moment it arrives.
  assert.deepEqual(labelsOf(markup), ['Build this lesson', '🆕 New topic'])
  const rows = markup && 'inline_keyboard' in markup ? markup.inline_keyboard : []
  const open = rows.flat().find((b) => 'web_app' in b)
  assert.doesNotMatch((open as { web_app: { url: string } }).web_app.url, /build=1/)
})

test('quick ideas are unaffected — they are made here either way', () => {
  const markup = toolOfferButton(PLANNING, { topic: 'photosynthesis', kind: 'ideas' }, 'u1')
  assert.deepEqual(labelsOf(markup), ['Send me a few ideas', '🆕 New topic'])
})

// The two exits moved from the reply keyboard — which Telegram collapses
// behind a toggle, so a teacher saw no buttons for days — onto the
// messages themselves. Their actions have to be ones the dispatcher
// knows, or every reply ends with two buttons that answer "that button
// is from an older version of me".

import { BUTTON_ACTIONS, EXIT_BUTTONS } from './telegramCoach.ts'

test('the exits are inline, so nothing can hide them', () => {
  assert.ok('inline_keyboard' in EXIT_BUTTONS, 'a reply keyboard is collapsible; an inline one is not')
  assert.deepEqual(labelsOf(EXIT_BUTTONS), ['✅ Wrap up', '🆕 New topic'])
})

test('both exits are actions the dispatcher recognises', () => {
  const rows = 'inline_keyboard' in EXIT_BUTTONS ? EXIT_BUTTONS.inline_keyboard : []
  for (const button of rows.flat()) {
    assert.ok('callback_data' in button, `${button.text} must carry a callback`)
    const action = button.callback_data.split(':')[0]
    assert.ok(BUTTON_ACTIONS.includes(action), `${action} is not dispatched`)
  }
})

test('wrap carries no id, so it means the conversation they are in', () => {
  const rows = 'inline_keyboard' in EXIT_BUTTONS ? EXIT_BUTTONS.inline_keyboard : []
  const wrap = rows.flat().find((b) => b.text.includes('Wrap up'))
  assert.equal(wrap && 'callback_data' in wrap && wrap.callback_data, 'wrap')
})
