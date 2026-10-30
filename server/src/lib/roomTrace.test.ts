import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildRoomTrace, openingWasRecorderOnly, roomFacts, roomShares } from './roomTrace.ts'

// A lesson is described a second at a time by its voice class: v one voice,
// m many, o other sound, q quiet, - too little audio.
const voices = (voiceTrace: string) => ({ voiceTrace })
const said = (speakerLabel: string, startSec: number, endSec: number) => ({ speakerLabel, startSec, endSec })

test('words go to whoever the transcript says spoke them', () => {
  assert.equal(buildRoomTrace(voices('mmmvvv'), [said('Teacher', 0, 3), said('Student 1', 3, 6)]), 'tttsss')
})

test("a student's words while many voices were going is group talk", () => {
  assert.equal(buildRoomTrace(voices('mmmm'), [said('Student 1', 0, 4)]), 'gggg')
})

test("a video's words are the video, not a student", () => {
  assert.equal(buildRoomTrace(voices('mmmm'), [said('Video', 0, 4)]), 'xxxx')
})

test('a voice with no words goes to no one', () => {
  // On the first real lesson, a student no one transcribed was read as the
  // teacher; here it is only a voice.
  assert.equal(buildRoomTrace(voices('vvvvvmmmmm'), []), 'uuuuuuuuuu')
})

test('a short pause inside one speaker’s talk is still them', () => {
  assert.equal(buildRoomTrace(voices('vvvvvvvv'), [said('Teacher', 0, 3), said('Teacher', 5, 8)]), 'tttttttt')
  assert.equal(buildRoomTrace(voices('vvmvv'), [said('Student 1', 0, 2), said('Student 1', 3, 5)]), 'ssgss')
})

test('quiet and other sound in a pause stay what they were', () => {
  assert.equal(buildRoomTrace(voices('vqovv'), [said('Teacher', 0, 1), said('Teacher', 4, 5)]), 'tqott')
})

test('a gap longer than a pause, or between two speakers, goes to no one', () => {
  const long = 'v' + 'v'.repeat(11) + 'v'
  assert.equal(buildRoomTrace(voices(long), [said('Teacher', 0, 1), said('Teacher', 12, 13)]), 't' + 'u'.repeat(11) + 't')
  assert.equal(buildRoomTrace(voices('vvvv'), [said('Teacher', 0, 1), said('Student 1', 3, 4)]), 'tuus')
})

test('voice before the first words and after the last goes to no one', () => {
  assert.equal(buildRoomTrace(voices('vvvvv'), [said('Teacher', 2, 3)]), 'uutuu')
})

test('a pause in a video is the video', () => {
  assert.equal(buildRoomTrace(voices('mmmmm'), [said('Video', 0, 2), said('Video', 3, 5)]), 'xxxxx')
})

test('with no words, other sound and quiet are what they are', () => {
  assert.equal(buildRoomTrace(voices('oq-'), []), 'oq-')
})

test('shares count each of the seven', () => {
  assert.deepEqual(roomShares('ttsgxuoq-'), {
    roomTeacherSec: 2,
    roomStudentSec: 1,
    roomGroupSec: 1,
    roomVideoSec: 1,
    roomUnclearSec: 1,
    roomOtherSec: 1,
    roomQuietSec: 1,
  })
})

test('room facts group seconds the way the report tiles do', () => {
  const facts = roomFacts('ttsgxxuoqq')
  assert.deepEqual(
    { t: facts.teacherSec, s: facts.studentSec, g: facts.groupSec, x: facts.videoSec, q: facts.quietSec },
    { t: 2, s: 2, g: 2, x: 2, q: 2 },
  )
})

test('a quiet opening before the first words is the recorder running early', () => {
  const facts = roomFacts('q'.repeat(40) + 'ttt')
  assert.equal(facts.openingSec, 40)
  assert.equal(openingWasRecorderOnly(facts), true)
})

test('an opening full of sound is a room settling, not the recorder', () => {
  // The creative writing warm-up: 42 wordless seconds of room sound before
  // the teacher's first line, which the note called "nothing for the first
  // minutes".
  const facts = roomFacts('u'.repeat(30) + 'o'.repeat(12) + 'ttt')
  assert.equal(facts.openingSec, 42)
  assert.equal(openingWasRecorderOnly(facts), false)
})

test('a short quiet opening is not worth a sentence', () => {
  assert.equal(openingWasRecorderOnly(roomFacts('q'.repeat(20) + 'ttt')), false)
})
