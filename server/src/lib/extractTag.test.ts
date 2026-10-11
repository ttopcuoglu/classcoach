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
