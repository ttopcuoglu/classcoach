import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  cleanTeacherNote,
  parseRubricLens,
  parseRubricLevel,
  RUBRIC_FRAMEWORKS,
  RUBRIC_TEACHER_NOTE_MAX,
} from './rubricLens.ts'

test('a level needs a cited moment behind it', () => {
  assert.equal(parseRubricLevel('3', 2), 3)
  assert.equal(parseRubricLevel(' 4 ', 1), 4)
  assert.equal(parseRubricLevel('3', 0), null)
  assert.equal(parseRubricLevel('not_enough', 3), null)
  assert.equal(parseRubricLevel('5', 3), null)
  assert.equal(parseRubricLevel('Proficient', 3), null)
  assert.equal(parseRubricLevel(null, 3), null)
})

test('the teacher note is trimmed, capped, and empty removes it', () => {
  assert.equal(cleanTeacherNote('  I asked follow-ups off mic.  '), 'I asked follow-ups off mic.')
  assert.equal(cleanTeacherNote('   '), null)
  assert.equal(cleanTeacherNote(42), null)
  assert.equal(cleanTeacherNote('x'.repeat(RUBRIC_TEACHER_NOTE_MAX + 50))?.length, RUBRIC_TEACHER_NOTE_MAX)
})

test('parseRubricLens reads the level and drops it without evidence', () => {
  const framework = RUBRIC_FRAMEWORKS.danielson_2022
  const items = [
    { kind: 'Recall question', timestampSec: 10, text: 'What is a cell?' },
    { kind: 'Specific feedback', timestampSec: 20, text: 'Yes, the membrane controls what enters.' },
  ]
  const text = `
<component><code>3b</code><evidence>1</evidence><level>2</level><summary>Mostly recall.</summary><next_step>Ask why.</next_step></component>
<component><code>3d</code><evidence>none</evidence><level>3</level><summary>Little heard.</summary><next_step>none</next_step></component>`
  const [b, d] = parseRubricLens(text, framework, items)
  assert.equal(b.code, '3b')
  assert.equal(b.level, 2)
  assert.equal(d.code, '3d')
  assert.equal(d.level, null)
})
