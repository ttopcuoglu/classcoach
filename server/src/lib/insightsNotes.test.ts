import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Segment } from './audioAnalysis.ts'
import {
  checkSectionNote,
  hashNotesInput,
  keepTeacherQuotes,
  parseNotesInput,
  quotedSpans,
  sectionUnavailable,
  templateNote,
  type NotesSection,
  type SectionNote,
} from './insightsNotes.ts'

const SECTION: NotesSection = {
  key: 'questioning',
  title: 'Questioning & Checking',
  findings: [
    {
      key: 'higher_order_questions',
      label: 'Higher-order questions',
      state: 'measured',
      value: '6 of 15',
      evidence: [
        { id: 'q-3', tag: 'Higher-order', polarity: 'strength', quote: 'So if this is an imagery hook, what should I see?', time: '13:05' },
      ],
    },
    {
      key: 'self_answered',
      label: 'Questions you answered yourself',
      state: 'measured',
      value: '3',
      evidence: [
        { id: 'sa-0', tag: 'You answered it', polarity: 'growth', quote: 'What should I see? I should see the gym, the lights, the ball.', time: '13:08' },
      ],
    },
  ],
}

const GOOD: SectionNote = {
  lead: 'Your best questions asked students to use the craft idea: 6 of 15 went beyond recall.',
  more: ['At 13:05, “what should I see?” turned a definition into a skill. One easy move: hold your own answer back.'],
  findingRefs: ['higher_order_questions', 'self_answered'],
  keep: { evidenceId: 'q-3', text: 'It asked students to apply the term, not name it.' },
  try: {
    evidenceId: 'sa-0',
    text: 'Hold the answer for three seconds.',
    rewrite: 'What should I see? Tell your partner first.',
  },
  guidanceLinks: [],
  source: 'model',
}

test('a note that keeps every rule passes', () => {
  assert.deepEqual(checkSectionNote(GOOD, SECTION), [])
})

test('a quote that is not one of the lines is caught', () => {
  const errors = checkSectionNote({ ...GOOD, more: ['You said “let’s look closer at the gym”.'] }, SECTION)
  assert.ok(errors.some((e) => e.startsWith('quote not in the evidence')))
})

test('a number not in the findings is caught, a time on a line is not', () => {
  assert.ok(checkSectionNote({ ...GOOD, lead: 'You asked 16 questions today.' }, SECTION).some((e) => e.includes('16')))
  assert.deepEqual(checkSectionNote({ ...GOOD, lead: 'At 13:05 you asked for an image.' }, SECTION), [])
})

test('a number counts only if its finding is referenced', () => {
  const errors = checkSectionNote({ ...GOOD, findingRefs: ['self_answered'] }, SECTION)
  assert.ok(errors.some((e) => e.includes('number 6')))
})

test('the rewrite may hold its own numbers; it is advice, not a claim', () => {
  const note = { ...GOOD, try: { ...GOOD.try!, rewrite: 'What should I see? Take 30 seconds with your partner.' } }
  assert.deepEqual(checkSectionNote(note, SECTION), [])
})

test('banned words, student claims and rubric codes are caught', () => {
  assert.ok(checkSectionNote({ ...GOOD, lead: 'Your pacing was weak at times.' }, SECTION).some((e) => e.includes('weak')))
  assert.ok(checkSectionNote({ ...GOOD, lead: 'Students understood the hook idea.' }, SECTION).some((e) => e.startsWith('claim about students')))
  assert.ok(checkSectionNote({ ...GOOD, lead: 'This is strong 3b questioning.' }, SECTION).includes('rubric code'))
})

test('length limits hold', () => {
  const long = Array.from({ length: 40 }, () => 'word').join(' ')
  assert.ok(checkSectionNote({ ...GOOD, lead: long }, SECTION).some((e) => e.startsWith('lead is')))
  assert.ok(checkSectionNote({ ...GOOD, more: ['a', 'b', 'c'] }, SECTION).some((e) => e.includes('paragraphs')))
})

test('keep and try must point at real lines of the right kind', () => {
  assert.ok(checkSectionNote({ ...GOOD, keep: { evidenceId: 'sa-0', text: 'x' } }, SECTION).includes('keep points at a growth line'))
  assert.ok(checkSectionNote({ ...GOOD, try: { ...GOOD.try!, evidenceId: 'nope' } }, SECTION).includes('try points at no evidence'))
})

test('a section with nothing measured has no note, and the template is the top finding', () => {
  assert.equal(sectionUnavailable({ ...SECTION, findings: SECTION.findings.map((f) => ({ ...f, state: 'unavailable' })) }), true)
  assert.deepEqual(templateNote(SECTION).lead, 'Higher-order questions: 6 of 15.')
})

test('quoted single words are terms, not claims about speech', () => {
  assert.deepEqual(quotedSpans('You named “imagery” and said “what should I see?”'), ['what should I see'])
})

test('input is shape-checked, and quotes not in the teacher’s speech never reach the model', () => {
  const parsed = parseNotesInput({ sections: [SECTION, { key: 'nonsense', findings: [] }] })
  assert.ok(!('error' in parsed))
  if ('error' in parsed) return
  assert.equal(parsed.sections.length, 1)
  const segments: Segment[] = [
    { speakerLabel: 'Teacher', startSec: 785, endSec: 790, text: 'So if this is an imagery hook, what should I see?' },
  ]
  const kept = keepTeacherQuotes(parsed, segments)
  assert.equal(kept.sections[0].findings[0].evidence.length, 1)
  assert.equal(kept.sections[0].findings[1].evidence.length, 0, 'not said by the teacher in this lesson')
  assert.equal(hashNotesInput(kept), hashNotesInput(keepTeacherQuotes(parsed, segments)), 'stable hash')
})

test('a section with findings must have a lead, and every paragraph must end as a sentence', () => {
  assert.ok(checkSectionNote({ ...GOOD, lead: null }, SECTION).includes('no lead, though the section has findings'))
  assert.ok(checkSectionNote({ ...GOOD, lead: 'You opened the floor, including inviting a student to' }, SECTION).some((e) => e.startsWith('does not end')))
  assert.deepEqual(checkSectionNote({ ...GOOD, lead: 'You asked what they should “see.”' }, SECTION), [])
})

test('a Keep or Try pointing at the wrong line is dropped, not the whole note', async () => {
  const { dropBadPointers } = await import('./insightsNotes.ts')
  const fixed = dropBadPointers({ ...GOOD, keep: { evidenceId: 'sa-0', text: 'x' }, try: { ...GOOD.try!, evidenceId: 'made-up' } }, SECTION)
  assert.equal(fixed.keep, null)
  assert.equal(fixed.try, null)
  assert.deepEqual(checkSectionNote(fixed, SECTION), [])
})

test('a note may not speak to what this report does not measure', () => {
  const errors = checkSectionNote({ ...GOOD, more: ['Your share left room for student voice.'] }, SECTION)
  assert.ok(errors.some((e) => e.startsWith('speaks to something not measured')))
})

test('a student the teacher called on by name is never named in a note', () => {
  const section: NotesSection = {
    ...SECTION,
    findings: [
      {
        key: 'invitations',
        label: 'Invitations to participate',
        state: 'measured',
        value: '1',
        evidence: [{ id: 'inv-0', tag: 'Opened the floor', polarity: 'strength', quote: 'Jared, will you start us off?', time: '2:10' }],
      },
    ],
  }
  const note: SectionNote = { lead: 'You opened the floor, inviting Jared to begin.', more: [], findingRefs: ['invitations'], keep: null, try: null, guidanceLinks: [], source: 'model' }
  assert.ok(checkSectionNote(note, section).includes('names a student: Jared'))
  assert.deepEqual(checkSectionNote({ ...note, lead: 'You opened the floor, inviting a student to begin.' }, section), [])
})

test('a guidance link holds only between a real stuck item and a real Take it further line', async () => {
  const { dropBadPointers } = await import('./insightsNotes.ts')
  const content: NotesSection = {
    key: 'content_lens',
    title: 'Content Lens',
    stuck: ['Students often treat anonymous and confidential reporting as the same thing.'],
    findings: [
      {
        key: 'take_it_further',
        label: 'Take it further',
        state: 'measured',
        value: '1',
        evidence: [{ id: 'note-1', tag: 'Where it could go further', polarity: 'growth', quote: 'What options does the code provide for confidential or anonymous reporting?', time: '2:37' }],
      },
    ],
  }
  const base: SectionNote = { lead: 'You built the lesson around a real document.', more: [], findingRefs: ['take_it_further'], keep: null, try: null, guidanceLinks: [], source: 'model' }
  const kept = dropBadPointers({ ...base, guidanceLinks: [{ stuckIndex: 0, evidenceId: 'note-1' }] }, content)
  assert.deepEqual(kept.guidanceLinks, [{ stuckIndex: 0, evidenceId: 'note-1' }])
  const dropped = dropBadPointers(
    { ...base, guidanceLinks: [{ stuckIndex: 3, evidenceId: 'note-1' }, { stuckIndex: 0, evidenceId: 'made-up' }] },
    content,
  )
  assert.deepEqual(dropped.guidanceLinks, [])
})
