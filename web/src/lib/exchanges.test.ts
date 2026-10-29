import { strict as assert } from 'node:assert'
import test from 'node:test'
import type { TranscriptSegment } from './api.ts'
import { exchanges } from './exchanges.ts'

const line = (speakerLabel: string, startSec: number, text: string): TranscriptSegment => ({
  id: `${speakerLabel}-${startSec}`, speakerLabel, rawSpeakerTag: speakerLabel, startSec, endSec: startSec + 2, text,
})

test('each time students were heard comes with the teacher line before and after', () => {
  const found = exchanges([
    line('Teacher', 0, 'What did Abel do?'),
    line('Student', 3, 'He lied.'),
    line('Student', 5, 'And left.'),
    line('Teacher', 8, 'Why do you think so?'),
    line('Teacher', 11, 'Anyone else?'),
    line('Student', 14, 'Because he was scared.'),
  ])
  assert.equal(found.length, 2)
  assert.equal(found[0].before?.text, 'What did Abel do?')
  assert.deepEqual(found[0].students.map((s) => s.text), ['He lied.', 'And left.'])
  assert.equal(found[0].after?.text, 'Why do you think so?')
  assert.equal(found[1].before?.text, 'Anyone else?')
  assert.equal(found[1].after, null)
})

test('a student who speaks first has nothing before, and blank lines are skipped', () => {
  const found = exchanges([line('Student', 0, 'Hi miss.'), line('Teacher', 2, '  '), line('Teacher', 4, 'Morning.')])
  assert.equal(found[0].before, null)
  assert.equal(found[0].after?.text, 'Morning.')
})
