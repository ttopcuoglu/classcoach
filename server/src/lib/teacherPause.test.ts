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

test('the pause runs to the teacher’s next real sentence, with any answer inside it', () => {
  const segments = [
    seg('Teacher', 10, 14, 'Why does the ice melt first?'),
    seg('Student', 17.5, 20),
    seg('Teacher', 22, 25, 'Good, so the salt makes it melt.'),
  ]
  assert.deepEqual(pausesOf(segments, [q(10, 'Why does the ice melt first?')]), [{ sec: 8, answered: true }])
})

test('short words in the teacher’s line do not stop the clock; the next real sentence does', () => {
  const segments = [
    seg('Teacher', 10, 14, 'Why does the ice melt first?'),
    seg('Teacher', 15, 16, 'Salt. Salt, very good.'),
    seg('Teacher', 18, 21, 'So the salt water melts it faster.'),
  ]
  assert.deepEqual(pausesOf(segments, [q(10, 'Why does the ice melt first?')]), [{ sec: 4, answered: false, folded: true }])
})

test('after a student heard on their own line, the teacher’s first words end it, however short', () => {
  const segments = [
    seg('Teacher', 10, 14, 'Did we understand the meaning of it?'),
    seg('Student', 15, 18, 'So it could change shape to fit it?'),
    seg('Teacher', 19, 20, 'Not completely.'),
    seg('Teacher', 26, 29, 'Think about what fit means here.'),
  ]
  assert.deepEqual(pausesOf(segments, [q(10, 'Did we understand the meaning of it?')]), [{ sec: 5, answered: true }])
})

test('too long a gap is not a pause, and a question the teacher never moves on from is not measured', () => {
  const segments = [seg('Teacher', 10, 14, 'But why?'), seg('Teacher', 60, 62, 'Now take out your packets.'), seg('Teacher', 70, 72, 'How so?'), seg('Student', 75, 76)]
  assert.deepEqual(
    teacherPauseOf(segments, [q(10, 'But why?'), q(70, 'How so?')], null).thinking.map((p) => p.sec),
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

test('a tag after the question is inside the pause', () => {
  const segments = [seg('Teacher', 10, 14, 'Would that work the same way for addition? K?'), seg('Teacher', 16.5, 18, 'Think about it with a partner.')]
  // The clock starts where the question ends, before "K?": 8 of the line's 9 words.
  assert.deepEqual(pausesOf(segments, [q(10, 'Would that work the same way for addition?')]), [{ sec: 2.9, answered: false }])
})

test('a short question of the teacher’s own ends it', () => {
  const segments = [seg('Teacher', 10, 14, 'Why would that work?'), seg('Teacher', 17, 18, 'Who can explain?')]
  assert.deepEqual(pausesOf(segments, [q(10, 'Why would that work?')]), [{ sec: 3, answered: false }])
})

// From a real lesson: a student's answer transcribed inside the teacher's line.
test("a one-word answer in the teacher's line is timed inside the pause", () => {
  const segments = [
    seg('Teacher', 128, 137.3, 'number would be? What do you think the middle number would be, Bruce? Zero. Zero. Because let’s say I got a one.'),
  ]
  // 22 words over 9.3 s: the question ends after word 12, "Because" starts at word 16.
  assert.deepEqual(pausesOf(segments, [q(124.3, 'What do you think the middle number would be?')]), [{ sec: 1.3, answered: false, folded: true }])
})

test('an answer at the start of the next line of the same turn is inside the pause', () => {
  const segments = [
    seg('Teacher', 355.2, 359.2, 'So what did we call this line right here? We called this the what?'),
    seg('Teacher', 359.8, 363.6, 'X axis. The x axis. So it landed right on the x axis.'),
  ]
  assert.deepEqual(pausesOf(segments, [q(355.2, 'We called this the what?')]), [{ sec: 2.1, answered: false, folded: true }])
})

test('another question, or praise, straight after is not counted as an answer', () => {
  const segments = [
    seg('Teacher', 10, 14, 'Why do you think I am calling it 10? What do you think?'),
    seg('Teacher', 30, 33, 'Why does it sink? Okay. So when we look at the boat it floats.'),
  ]
  const pauses = pausesOf(segments, [q(10, 'Why do you think I am calling it 10?'), q(30, 'Why does it sink?')])
  assert.equal(pauses[0].folded, undefined)
  assert.equal(pauses[1].folded, undefined)
})

test('answers in the teacher lines no longer hide the figure, and are still counted', () => {
  const segments = [
    seg('Teacher', 10, 14, 'Where do they meet? Middle. Middle. So that is the origin.'),
    seg('Teacher', 20, 24, 'Why is it zero? Because nothing. Right. So it is not on either side.'),
    seg('Teacher', 30, 34, 'What quadrant is it? Three. Very good. So we went past two.'),
    seg('Student', 60, 61),
  ]
  const out = teacherPauseOf(segments, [q(10, 'Where do they meet?'), q(20, 'Why is it zero?'), q(30, 'What quadrant is it?')], null)
  assert.equal(out.foldedCount, 3)
  assert.equal(out.reason, null)
  assert.ok(out.average != null && out.average > 0)
})

test('with no student voice at all there is no figure', () => {
  const out = teacherPauseOf([seg('Teacher', 10, 14, 'But why?'), seg('Teacher', 17, 18, 'Talk to your partner first.')], [q(10, 'But why?')], null)
  assert.equal(out.average, null)
  assert.equal(out.reason, 'no_student_voice')
})

test('recall questions are left out, and the average is of the timed thinking ones', () => {
  const segments = [
    seg('Teacher', 10, 14, 'Why does it float?'),
    seg('Teacher', 17, 18, 'It is the air inside.'),
    seg('Teacher', 30, 33, 'What is seven times eight?'),
    seg('Teacher', 40, 41, 'Write that one down please.'),
    seg('Teacher', 50, 54, 'How could you check?'),
    seg('Teacher', 56.5, 57, 'You could weigh it first.'),
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
