import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  acceptedCount,
  applyAcceptedEdits,
  exportLabel,
  formatTimingRange,
  isEditStatus,
  parseEdits,
  parseTimingBasis,
  setEditStatus,
  unanchoredEdits,
  type ReviewEdit,
} from './reviewEdits.ts'

// "Suggested edits are a marked-up diff, never a replacement document."
//
// The failure this rules out is specific and bad: the tool this replaces
// offered a whole rewritten document, and accepting it silently overwrote
// work the teacher had written themselves. So the rules under test are that
// the teacher's original is never modified except by an edit they accepted,
// that the export label can never overstate what was accepted, and that an
// edit quoting text which is not in the document cannot smuggle a new
// sentence in under the teacher's name.

function edit(over: Partial<ReviewEdit> = {}): ReviewEdit {
  return {
    id: 'e1',
    anchor: 'Students will discuss the reading.',
    original: 'Students will discuss the reading.',
    revision: 'In pairs, students will each name one claim the author makes.',
    why: 'Names what students actually produce, so you can tell who is thinking.',
    lens: 'where_thinking',
    status: 'pending',
    ...over,
  }
}

// --- the export label ---

// A teacher has to know whether they are about to download their own document
// or an edited one, without remembering what they tapped.
test('the export label says "my original" until something is accepted', () => {
  assert.equal(exportLabel([]), 'Export my original')
  assert.equal(exportLabel([edit()]), 'Export my original')
  assert.equal(exportLabel([edit({ status: 'kept_mine' })]), 'Export my original')
})

test('the export label counts accepted edits, and only those', () => {
  assert.equal(exportLabel([edit({ status: 'accepted' })]), 'Export with 1 change')
  assert.equal(
    exportLabel([
      edit({ id: 'a', status: 'accepted' }),
      edit({ id: 'b', status: 'accepted' }),
      edit({ id: 'c', status: 'pending' }),
      edit({ id: 'd', status: 'kept_mine' }),
    ]),
    'Export with 2 changes',
  )
})

// Declining a suggestion and not having answered it yet produce the same
// document, so they have to produce the same label.
test('pending and kept-mine are both "not accepted"', () => {
  assert.equal(acceptedCount([edit({ status: 'pending' }), edit({ id: 'b', status: 'kept_mine' })]), 0)
})

test('the label is singular for one change', () => {
  assert.ok(exportLabel([edit({ status: 'accepted' })]).endsWith('1 change'))
})

// --- applying edits ---

const PLAN = `Do Now (5 minutes): students copy the objective.
Students will discuss the reading.
Closure: collect the exit ticket.`

test('nothing is changed until an edit is accepted', () => {
  assert.equal(applyAcceptedEdits(PLAN, [edit()]), PLAN)
  assert.equal(applyAcceptedEdits(PLAN, [edit({ status: 'kept_mine' })]), PLAN)
})

test('an accepted edit replaces exactly its anchor and nothing else', () => {
  const out = applyAcceptedEdits(PLAN, [edit({ status: 'accepted' })])
  assert.ok(out.includes('In pairs, students will each name one claim the author makes.'))
  assert.ok(!out.includes('Students will discuss the reading.'))
  // Everything the teacher wrote around it survives untouched.
  assert.ok(out.includes('Do Now (5 minutes): students copy the objective.'))
  assert.ok(out.includes('Closure: collect the exit ticket.'))
})

test('several accepted edits all land', () => {
  const out = applyAcceptedEdits(PLAN, [
    edit({ id: 'a', status: 'accepted' }),
    edit({
      id: 'b',
      anchor: 'Closure: collect the exit ticket.',
      original: 'Closure: collect the exit ticket.',
      revision: 'Closure: students write the one thing they are still unsure about.',
      status: 'accepted',
    }),
  ])
  assert.ok(out.includes('In pairs, students will each name one claim'))
  assert.ok(out.includes('still unsure about'))
})

// An anchor the first edit already consumed is skipped rather than guessed
// at. Corrupting a sentence the teacher wrote is worse than dropping a
// suggestion they can still see in the result.
test('an edit whose anchor is gone is skipped, not forced', () => {
  const out = applyAcceptedEdits(PLAN, [
    edit({ id: 'a', status: 'accepted' }),
    // Anchored to text the first edit replaced.
    edit({ id: 'b', anchor: 'discuss the reading', revision: 'debate the reading', status: 'accepted' }),
  ])
  assert.ok(out.includes('In pairs, students will each name one claim'))
  assert.ok(!out.includes('debate the reading'))
})

test('an edit anchored to text that was never in the document changes nothing', () => {
  const out = applyAcceptedEdits(PLAN, [
    edit({ anchor: 'A sentence the teacher never wrote.', status: 'accepted' }),
  ])
  assert.equal(out, PLAN)
})

// This is the one failure mode that would let a suggestion invent a sentence
// and attribute it to the teacher, so it is surfaced rather than swallowed.
test('edits quoting text not in the document are reported', () => {
  const real = edit({ id: 'real' })
  const invented = edit({ id: 'invented', anchor: 'Never written anywhere.' })
  const flagged = unanchoredEdits(PLAN, [real, invented])
  assert.deepEqual(flagged.map((e) => e.id), ['invented'])
})

test('an empty document reports every edit as unanchored rather than throwing', () => {
  assert.equal(unanchoredEdits('', [edit()]).length, 1)
  assert.equal(applyAcceptedEdits('', [edit({ status: 'accepted' })]), '')
})

// --- status changes ---

test('setting a status changes one edit and leaves the rest alone', () => {
  const edits = [edit({ id: 'a' }), edit({ id: 'b' })]
  const next = setEditStatus(edits, 'a', 'accepted')
  assert.equal(next[0].status, 'accepted')
  assert.equal(next[1].status, 'pending')
  // The input is not mutated — the caller may still be rendering it.
  assert.equal(edits[0].status, 'pending')
})

test('an unknown id changes nothing', () => {
  const edits = [edit({ id: 'a' })]
  assert.deepEqual(setEditStatus(edits, 'nope', 'accepted'), edits)
})

test('a teacher can change their mind back', () => {
  let edits = [edit({ id: 'a' })]
  edits = setEditStatus(edits, 'a', 'accepted')
  assert.equal(exportLabel(edits), 'Export with 1 change')
  edits = setEditStatus(edits, 'a', 'kept_mine')
  assert.equal(exportLabel(edits), 'Export my original')
})

test('only the three statuses are accepted', () => {
  for (const s of ['pending', 'accepted', 'kept_mine']) assert.equal(isEditStatus(s), true, s)
  for (const s of ['rejected', '', null, 1]) assert.equal(isEditStatus(s), false, String(s))
})

// --- parsing ---

test('well-formed edits round-trip', () => {
  const parsed = parseEdits([edit()])
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].revision, edit().revision)
})

// One unparseable edit must not take a teacher's whole review down.
test('malformed edits are dropped, good ones in the same batch survive', () => {
  const parsed = parseEdits([
    edit({ id: 'good' }),
    null,
    'not an object',
    { anchor: 'no reason given', revision: 'something' },
    { why: 'no anchor to attach it to', revision: 'something' },
  ])
  assert.deepEqual(parsed.map((e) => e.id), ['good'])
})

// A "suggestion" identical to what is already there is not a suggestion.
test('an edit that changes nothing is dropped', () => {
  const unchanged = { ...edit(), revision: edit().anchor }
  assert.deepEqual(parseEdits([unchanged]), [])
})

test('an unrecognized status falls back to pending rather than accepted', () => {
  const parsed = parseEdits([{ ...edit(), status: 'applied' }])
  assert.equal(parsed[0].status, 'pending')
})

test('a missing id falls back to something stable rather than empty', () => {
  const { id: _id, ...noId } = edit()
  const parsed = parseEdits([noId])
  assert.equal(parsed.length, 1)
  assert.ok(parsed[0].id.length > 0)
})

test('anything that is not an array parses to no edits', () => {
  for (const value of [null, undefined, {}, 'edits', 7]) {
    assert.deepEqual(parseEdits(value), [], String(value))
  }
})

// --- timing ---

// "Any timing estimate must show its assumption or a range." A bare number
// reads as a measurement, so one is never storable.
test('a timing estimate needs both a range and an assumption', () => {
  assert.deepEqual(
    parseTimingBasis({ minutes: [20, 30], assumption: 'Two minutes per short-answer item.' }),
    { minutes: [20, 30], assumption: 'Two minutes per short-answer item.' },
  )
  assert.equal(parseTimingBasis({ minutes: [20, 30] }), null, 'no assumption')
  assert.equal(parseTimingBasis({ assumption: 'Two minutes per item.' }), null, 'no range')
  assert.equal(parseTimingBasis({ minutes: 25, assumption: 'x' }), null, 'a bare number is not a range')
  assert.equal(parseTimingBasis({ minutes: [25], assumption: 'x' }), null, 'one bound is not a range')
})

test('a backwards or negative range is rejected', () => {
  assert.equal(parseTimingBasis({ minutes: [30, 20], assumption: 'x' }), null)
  assert.equal(parseTimingBasis({ minutes: [-5, 10], assumption: 'x' }), null)
})

test('junk timing parses to nothing rather than throwing', () => {
  for (const value of [null, undefined, 'soon', 42, []]) {
    assert.equal(parseTimingBasis(value), null, String(value))
  }
})

test('a range reads as a range, and collapsed bounds read as approximate', () => {
  assert.equal(formatTimingRange({ minutes: [20, 30], assumption: 'x' }), '20–30 minutes')
  assert.equal(formatTimingRange({ minutes: [25, 25], assumption: 'x' }), 'about 25 minutes')
})
