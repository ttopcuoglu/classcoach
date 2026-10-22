import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lessonTitle, stepBlocks, textBlocks, toHtml, toPlainText } from './lessonCopy.ts'

test('dash and numbered lines become real lists, prose stays prose', () => {
  assert.deepEqual(textBlocks('Bring these:\n- tubing\n- iodine\n\n1. Fill\n2. Wait'), [
    { t: 'p', text: 'Bring these:' },
    { t: 'ul', items: ['tubing', 'iodine'] },
    { t: 'ol', items: ['Fill', 'Wait'] },
  ])
  assert.deepEqual(textBlocks(null), [])
})

test('an activity copies with its minutes and both roles, and no interface text', () => {
  const step = { minutes: 8, title: 'Launch', teacher: 'Hold up the bag.', students: null }
  const text = toPlainText(stepBlocks(step, 0))
  assert.equal(text, '1. Launch (8 min)\n\nTeacher actions:\nHold up the bag.')
  assert.ok(!text.includes('undefined') && !text.includes('null'))
})

test('html escapes what the model wrote', () => {
  assert.equal(toHtml([{ t: 'p', text: 'a < b & c' }]), '<p>a &lt; b &amp; c</p>')
})

test('title drops the "students will be able to" and stays short', () => {
  const plan = { objective: 'Students will be able to explain why a cell membrane lets some things through.' } as never
  assert.equal(lessonTitle(plan), 'Explain why a cell membrane lets some things through')
})
