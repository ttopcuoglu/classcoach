import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractTag, stripStructuralTags } from './extractTag.ts'

// A real lesson plan printed "<step>" on the page between Materials and
// the first step. The model had left off a </materials>, so the fallback
// took everything up to the next structural tag — and <step> has no
// underscore, so it wasn't one.

const MISSING_CLOSE = `<materials>
- A potted plant
- Chart paper
<step><step_title>Puzzle</step_title></step>`

test('a section that lost its closing tag still ends where the next one starts', () => {
  assert.equal(extractTag(MISSING_CLOSE, 'materials'), '- A potted plant\n- Chart paper')
})

test('a stray container tag never reaches the page', () => {
  assert.equal(stripStructuralTags('Materials here\n<step>'), 'Materials here')
})

test('a lesson about HTML can still print its own tags', () => {
  // The reason this is a list of five rather than "any single word".
  assert.equal(stripStructuralTags('Use <p> for a paragraph and <code> for code.'), 'Use <p> for a paragraph and <code> for code.')
})

test('a closed section is unaffected', () => {
  assert.equal(extractTag('<materials>Chart paper</materials><step>x</step>', 'materials'), 'Chart paper')
})

// The same failure one level up: a conversation plan printed its whole
// <opening> section inside the agenda, tags and all, and then again in
// its own place. <opening> is a single word, so nothing could recognise
// it as ours — but the parser writing it knows every section it asked for.

const PLAN_TAGS = ['agenda', 'opening', 'main_concern'] as const

const LOST_CLOSE = `<agenda>
- Open with the shared goal
- Review current services
<opening>
"Thanks for making time to meet."
</opening>
<main_concern>The parent wants more pull-out time.</main_concern>`

test('a section ends where a named sibling starts, even a one-word one', () => {
  assert.equal(extractTag(LOST_CLOSE, 'agenda', PLAN_TAGS), '- Open with the shared goal\n- Review current services')
})

test('and the swallowed section is still readable in its own right', () => {
  assert.equal(extractTag(LOST_CLOSE, 'opening', PLAN_TAGS), '"Thanks for making time to meet."')
})

test('without the sibling list, the old swallowing is what happens', () => {
  // Pinned so the reason for the parameter stays visible: this is the bug.
  assert.match(extractTag(LOST_CLOSE, 'agenda') ?? '', /Thanks for making time/)
})
