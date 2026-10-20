import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeTranscript, type Segment } from './audioAnalysis.ts'

// The question counter is the number a teacher is most likely to read as a
// verdict, and every error in it so far has been found by a human reading a
// real report rather than by anything here. These are the cases that cost a
// teacher's trust: a rising inflection on an ingredient, a name said twice, an
// instruction scored as a higher-order question, and one question split by the
// transcriber into two.

let clock = 0
function say(speakerLabel: 'Teacher' | 'Student', text: string, sec = 4): Segment {
  const startSec = clock
  clock += sec
  return { speakerLabel, startSec, endSec: startSec - 0.2 + sec, text }
}
function transcript(build: () => Segment[]) {
  clock = 0
  return analyzeTranscript(build())
}

test('a rising inflection on a list is not a question per item', () => {
  const a = transcript(() => [
    say('Teacher', 'So we need a few things for this recipe.'),
    say('Teacher', 'Tomato paste?'),
    say('Teacher', 'Bell peppers?'),
    say('Teacher', 'Onions?'),
  ])
  assert.equal(a.questionCount, 0)
})

test("a student's name said with a rising inflection is not a question", () => {
  const a = transcript(() => [say('Teacher', 'Yeshua?'), say('Teacher', 'Yeshua?')])
  assert.equal(a.questionCount, 0)
})

test('okay and right are not questions', () => {
  const a = transcript(() => [say('Teacher', 'Okay?'), say('Teacher', 'Right?'), say('Teacher', 'Alright?')])
  assert.equal(a.questionCount, 0)
})

test('a short question that opens like one still counts', () => {
  const a = transcript(() => [say('Teacher', 'Any others?')])
  assert.equal(a.questionCount, 1)
})

test('an instruction is not a higher-order question', () => {
  const a = transcript(() => [
    say('Teacher', 'Compare with your neighbours.'),
    say('Teacher', 'Explain your reasoning to your partner.'),
  ])
  assert.equal(a.questionCount, 0)
  assert.equal(a.higherOrderPct, null)
})

test('but the same words as a real question do count', () => {
  const a = transcript(() => [say('Teacher', 'Why do you think the leaves are green?')])
  assert.equal(a.questionCount, 1)
  assert.equal(a.higherOrderPct, 100)
})

test('one question split across two utterances counts once, in full', () => {
  const a = transcript(() => [
    say('Teacher', 'So how'),
    say('Teacher', 'much of each ingredient does Mia need?'),
  ])
  assert.equal(a.questionCount, 1)
  assert.equal(a.questionLog[0].text, 'So how much of each ingredient does Mia need')
})

test('a fragment is not joined across a speaker change', () => {
  const a = transcript(() => [
    say('Teacher', 'So how'),
    say('Student', 'I think it is four.'),
    say('Teacher', 'much of each ingredient does Mia need?'),
  ])
  assert.equal(a.questionCount, 1)
})

test('two real questions in one turn are still two', () => {
  const a = transcript(() => [
    say('Teacher', 'What makes them equivalent? And how did you work that out?'),
  ])
  assert.equal(a.questionCount, 2)
})

// --- speaking pace, the pause after an answer, and leading dead air
//
// The report had four ways to say how LONG a teacher spoke and none to say how
// fast; it timed the pause after a question and never the pause after an
// answer; and it counted a recording's leading silence as classroom quiet.

test('pace is words over the teacher’s own speaking time, not over the lesson', () => {
  // 120 words across 60s of teacher speech, inside a much longer recording.
  const long = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ')
  const a = transcript(() => [
    { speakerLabel: 'Teacher', startSec: 0, endSec: 60, text: long },
    { speakerLabel: 'Student', startSec: 300, endSec: 360, text: 'a student talking for a whole minute' },
  ])
  // 120 words / 60s = 120 a minute. Student speech and the gap do not dilute it.
  assert.equal(a.metricsDetail.teacherWordsPerMinute, 120)
})

test('pace counts short pauses inside the teacher\'s turn, not student answers or long gaps', () => {
  const sixty = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ')
  const a = transcript(() => [
    // Two 30s lines with a 2s breath between: 62s of speaking time.
    { speakerLabel: 'Teacher', startSec: 0, endSec: 30, text: sixty },
    { speakerLabel: 'Teacher', startSec: 32, endSec: 62, text: sixty },
    // A student answer, then the teacher again: the answer is not hers.
    { speakerLabel: 'Student', startSec: 63, endSec: 70, text: 'an answer' },
    // After a 20s gap: a new turn, the gap left out.
    { speakerLabel: 'Teacher', startSec: 90, endSec: 120, text: sixty },
  ])
  // 180 words over 62s + 30s.
  assert.equal(a.metricsDetail.teacherWordsPerMinute, Math.round((180 / 92) * 60))
})

test('pace is withheld below a minute of teacher speech', () => {
  const a = transcript(() => [say('Teacher', 'Just a few words here', 10)])
  assert.equal(a.metricsDetail.teacherWordsPerMinute, null)
})

test('the pause after an answer is timed, separately from the pause after a question', () => {
  const a = analyzeTranscript([
    { speakerLabel: 'Teacher', startSec: 0, endSec: 4, text: 'Why do you think wages rose?' },
    // 3s of wait time 1, then the answer.
    { speakerLabel: 'Student', startSec: 7, endSec: 10, text: 'Because fewer people were left' },
    // 2s of wait time 2 before the teacher takes the floor back.
    { speakerLabel: 'Teacher', startSec: 12, endSec: 16, text: 'Yes, that is the labour shortage.' },
  ])
  assert.equal(a.metricsDetail.waitTime2Sec, 2)
  assert.equal(a.metricsDetail.waitTime2SampleCount, 1)
  // And the two are not the same number.
  assert.equal(a.avgWaitTimeSec, 3)
})

test('a gap long enough to be work time is not counted as a pause', () => {
  const a = analyzeTranscript([
    { speakerLabel: 'Student', startSec: 0, endSec: 5, text: 'Is this one due today' },
    // Five minutes later — independent work, not a teacher holding a pause.
    { speakerLabel: 'Teacher', startSec: 305, endSec: 310, text: 'Alright, come back together.' },
  ])
  assert.equal(a.metricsDetail.waitTime2SampleCount, 0)
  assert.equal(a.metricsDetail.waitTime2Sec, null)
})

test('a teacher following their own talk is not a pause after an answer', () => {
  const a = analyzeTranscript([
    { speakerLabel: 'Teacher', startSec: 0, endSec: 4, text: 'So terrace farming.' },
    { speakerLabel: 'Teacher', startSec: 9, endSec: 13, text: 'It cuts stairs into the hillside.' },
  ])
  assert.equal(a.metricsDetail.waitTime2SampleCount, 0)
})

test('the first transcribed word is recorded, so leading silence can be explained', () => {
  const a = analyzeTranscript([
    { speakerLabel: 'Teacher', startSec: 269, endSec: 275, text: 'Alright, take out your packets.' },
  ])
  assert.equal(a.metricsDetail.firstWordSec, 269)
})

// --- how long the teacher left a question hanging ---------------------------
//
// The measure that exists because waitTimeSec could not see the thing that
// matters. Across real lessons waitTimeSec is set on 23 questions and null on
// 117, and the 117 are the ones where nobody answered — by construction, the
// times the wait did NOT work.

test('the pause runs to the teacher speaking again, not to a student', () => {
  const result = transcript(() => [
    say('Teacher', 'What makes the wage rise?', 4),
    say('Student', 'Fewer workers.', 4),
    say('Teacher', 'Right, fewer workers.', 4),
  ])
  const q = result.questionLog[0]
  assert.ok(q, 'a question should be detected')
  // Teacher ends ~3.8, student runs 4-7.8, teacher resumes at 8.
  assert.ok(q.pauseSec != null && q.pauseSec > 4, `expected a pause spanning the answer, got ${q.pauseSec}`)
  assert.equal(q.studentAudibleInPause, true)
})

test('a question the teacher answers themselves still has a pause', () => {
  // waitTimeSec is null here — no student spoke — which is exactly the case
  // the old metric threw away.
  const result = transcript(() => {
    const asked = say('Teacher', 'What makes the wage rise?', 4)
    clock += 3 // three seconds of nobody answering
    return [asked, say('Teacher', 'Fewer workers, of course.', 4)]
  })
  const q = result.questionLog[0]
  assert.ok(q)
  assert.equal(q.waitTimeSec, null)
  assert.ok(q.pauseSec != null, 'the pause should still be measured')
  assert.equal(q.studentAudibleInPause, false)
})

test('a gap longer than the ceiling is independent work, not a pause', () => {
  const result = transcript(() => {
    const first = say('Teacher', 'What makes the wage rise?', 4)
    clock += 600 // ten minutes of work time
    return [first, say('Teacher', 'Alright, back together.', 4)]
  })
  assert.equal(result.questionLog[0]?.pauseSec, null)
})
