import assert from 'node:assert/strict'
import { test } from 'node:test'
import { teacherPauseOf } from './teacherPause.ts'

const seg = (speakerLabel: string, startSec: number, endSec: number, text = 'words') => ({ speakerLabel, startSec, endSec, text })
/// A thinking question as the question log stores it.
const q = (timestampSec: number, text: string) => ({ timestampSec, text, type: 'higher_order' })
const pausesOf = (segments: ReturnType<typeof seg>[], questions: ReturnType<typeof q>[]) =>
  teacherPauseOf([...segments, seg('Student', 900, 901)], questions, null).thinking.map(({ sec, answered, keptTalking, folded }) => ({
    sec,
    answered,
    ...(keptTalking ? { keptTalking } : {}),
    ...(folded ? { folded } : {}),
  }))

test('the pause runs until the teacher speaks again, with any answer inside it', () => {
  const segments = [
    seg('Teacher', 10, 14, 'Why does the ice melt first?'),
    seg('Student', 17.5, 20),
    seg('Teacher', 22, 25, 'Good.'),
    seg('Teacher', 30, 33, 'What would change if it were salt water?'),
    seg('Teacher', 35.5, 38),
  ]
  assert.deepEqual(pausesOf(segments, [q(10, 'Why does the ice melt first?'), q(30, 'What would change if it were salt water?')]), [
    { sec: 8, answered: true },
    { sec: 2.5, answered: false },
  ])
})

test('a turn that keeps going is one turn; the pause starts when it ends', () => {
  const segments = [seg('Teacher', 10, 14, 'Why?'), seg('Teacher', 15, 18), seg('Student', 21, 23), seg('Teacher', 24, 26)]
  assert.deepEqual(pausesOf(segments, [q(10, 'Why?')]), [{ sec: 6, answered: true }])
})

test('too long a gap is not a pause, and a question the teacher never comes back after is not measured', () => {
  const segments = [seg('Teacher', 10, 14, 'Why?'), seg('Teacher', 60, 62), seg('Teacher', 70, 72, 'How?'), seg('Student', 75, 76)]
  assert.deepEqual(
    teacherPauseOf(segments, [q(10, 'Why?'), q(70, 'How?')], null).thinking.map((p) => p.sec),
    [null, null],
  )
})

test('a question you talked straight past had no pause', () => {
  const segments = [seg('Teacher', 10, 20, 'Would that work the same way for addition? So the same thing happens when we add them up.')]
  assert.deepEqual(pausesOf(segments, [q(10, 'Would that work the same way for addition?')]), [{ sec: 0, answered: false, keptTalking: true }])
})

test('a real gap before going on is a pause, even inside one turn', () => {
  const segments = [
    seg('Teacher', 10, 14, 'Would that work the same way for addition?'),
    seg('Teacher', 15.8, 20, 'So the same thing happens when we add them up.'),
  ]
  assert.deepEqual(pausesOf(segments, [q(10, 'Would that work the same way for addition?')]), [{ sec: 1.8, answered: false }])
})

test('a short gap before going on is talking past it, and keeps the gap there was', () => {
  const segments = [
    seg('Teacher', 10, 14, 'Would that work the same way for addition?'),
    seg('Teacher', 14.8, 20, 'So the same thing happens when we add them up.'),
  ]
  assert.deepEqual(pausesOf(segments, [q(10, 'Would that work the same way for addition?')]), [{ sec: 0.8, answered: false, keptTalking: true }])
})

test('a tag after the question is not talking past it', () => {
  const segments = [seg('Teacher', 10, 14, 'Would that work the same way for addition? K?'), seg('Teacher', 16.5, 18)]
  assert.deepEqual(pausesOf(segments, [q(10, 'Would that work the same way for addition?')]), [{ sec: 2.5, answered: false }])
})

// From a real lesson: students' answers transcribed inside the teacher's lines.
test("a student's answer in the teacher's line cannot be timed, and is not talking past it", () => {
  const segments = [
    seg('Teacher', 128, 137.3, 'number would be? What do you think the middle number would be, Bruce? Zero. Zero. Very good.'),
    seg('Teacher', 140.4, 141.9, 'me see this really quick.'),
    seg('Teacher', 193.3, 199.3, 'sections do we have in the coordinate plane? Four. Kissimm. We have four.'),
  ]
  assert.deepEqual(
    pausesOf(segments, [q(124.3, 'What do you think the middle number would be?'), q(190.2, 'How many sections do we have in the coordinate plane?')]),
    [
      { sec: null, answered: true, folded: true },
      { sec: null, answered: true, folded: true },
    ],
  )
})

test('an answer at the start of the next line of the same turn is still an answer', () => {
  const segments = [seg('Teacher', 355.2, 359.2, 'So what did we call this line right here? We called this the what?'), seg('Teacher', 359.8, 363.6, 'X axis. The x axis.')]
  assert.deepEqual(pausesOf(segments, [q(355.2, 'What did we call this line right here?')]).map((p) => p.folded), [undefined])
  assert.deepEqual(pausesOf(segments, [q(355.2, 'We called this the what?')]), [{ sec: null, answered: true, folded: true }])
})

test('another question, or praise, straight after is not an answer', () => {
  const segments = [
    seg('Teacher', 10, 14, 'Why do you think I am calling it 10? What do you think?'),
    seg('Teacher', 30, 33, 'Why does it sink? Okay. So when we look at the boat it floats.'),
  ]
  const pauses = pausesOf(segments, [q(10, 'Why do you think I am calling it 10?'), q(30, 'Why does it sink?')])
  assert.equal(pauses[0].folded, undefined)
  assert.equal(pauses[1].folded, undefined)
})

test('when answers in the teacher lines follow too many questions, there is no figure', () => {
  const segments = [
    seg('Teacher', 10, 14, 'Where do they meet? Middle. Middle.'),
    seg('Teacher', 20, 24, 'Why is it zero? Because nothing. Right.'),
    seg('Teacher', 30, 34, 'What quadrant is it? Three. Very good.'),
    seg('Teacher', 40, 44, 'Why would that work?'),
    seg('Teacher', 47, 48),
    seg('Student', 60, 61),
  ]
  const out = teacherPauseOf(
    segments,
    [q(10, 'Where do they meet?'), q(20, 'Why is it zero?'), q(30, 'What quadrant is it?'), q(40, 'Why would that work?')],
    null,
  )
  assert.equal(out.foldedCount, 3)
  assert.equal(out.average, null)
  assert.equal(out.reason, 'answers_in_teacher_voice')
})

test('with no student voice at all there is no figure', () => {
  const out = teacherPauseOf([seg('Teacher', 10, 14, 'Why?'), seg('Teacher', 17, 18)], [q(10, 'Why?')], null)
  assert.equal(out.average, null)
  assert.equal(out.reason, 'no_student_voice')
})

test('recall questions are left out, and the average is of the timed thinking ones', () => {
  const segments = [
    seg('Teacher', 10, 14, 'Why does it float?'),
    seg('Teacher', 17, 18),
    seg('Teacher', 30, 33, 'What is seven times eight?'),
    seg('Teacher', 40, 41),
    seg('Teacher', 50, 54, 'How could you check?'),
    seg('Teacher', 56.5, 57),
    seg('Student', 80, 81),
  ]
  const out = teacherPauseOf(
    segments,
    [q(10, 'Why does it float?'), { timestampSec: 30, text: 'What is seven times eight?', type: 'recall' }, q(50, 'How could you check?')],
    null,
  )
  assert.equal(out.thinking.length, 2)
  assert.equal(out.average, 2.8)
  assert.equal(out.reason, null)
})
