import assert from 'node:assert/strict'
import { test } from 'node:test'
import { focusLineKey, parseFocusLine } from './focusLine.ts'

test('the key is the same for the same text, ignoring outer spaces, and differs otherwise', () => {
  assert.equal(focusLineKey('Ask pairs first.'), focusLineKey('  Ask pairs first.\n'))
  assert.notEqual(focusLineKey('Ask pairs first.'), focusLineKey('Ask pairs second.'))
  assert.match(focusLineKey('é — “quoted”'), /^[0-9a-f]{8}$/)
  // Pinned: the web and iOS apps compute this same value to find a line.
  assert.equal(focusLineKey('hello'), '08b5134f')
})

test('a line ending on a quoted word keeps its closing quote; a wrapped line loses its wrapping', () => {
  assert.equal(parseFocusLine('<well>NONE</well><try>Then ask one "why."</try>')?.try, 'Then ask one "why."')
  assert.equal(parseFocusLine('<well>NONE</well><try>"Give pairs thirty seconds."</try>')?.try, 'Give pairs thirty seconds.')
  assert.equal(parseFocusLine('<well>NONE</well><try>"Ask "why" first."</try>')?.try, '"Ask "why" first."')
})

test('a line needs a try; NONE leaves out the well line', () => {
  assert.deepEqual(parseFocusLine('<well>NONE</well>\n<try>Give pairs thirty seconds before taking an answer.</try>'), {
    well: null,
    try: 'Give pairs thirty seconds before taking an answer.',
  })
  assert.deepEqual(parseFocusLine('<well>Your “why” questions got students explaining.</well><try>Ask one more.</try>'), {
    well: 'Your “why” questions got students explaining.',
    try: 'Ask one more.',
  })
  assert.equal(parseFocusLine('<well>Nice.</well><try>NONE</try>'), null)
  assert.equal(parseFocusLine('no tags'), null)
})
