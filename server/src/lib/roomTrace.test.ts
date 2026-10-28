import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildRoomTrace, roomShares } from './roomTrace.ts'
import { encodeSeconds, type SecondFeatures } from './voiceActivity.ts'

// A lesson is described a second at a time: its voice class, and the pitch
// and loudness the audio measured, encoded the way upload stores them.
type Sec = { c: string; hz?: number | null; db?: number }

const TEACHER = { hz: 120, db: -20 }
const STUDENT = { hz: 230, db: -32 }

function voices(secs: Sec[]) {
  const features = secs.map((s): SecondFeatures => ({
    active: s.c !== 'q',
    depthDb: 0,
    clearPitch: 0,
    somePitch: 0,
    pitchHz: s.hz ?? null,
    levelDb: s.db ?? -60,
  }))
  const { pitch, level } = encodeSeconds(features)
  return { voiceTrace: secs.map((s) => s.c).join(''), voicePitch: pitch, voiceLevel: level }
}

const repeat = (n: number, s: Sec): Sec[] => Array.from({ length: n }, () => s)
const said = (speakerLabel: string, startSec: number, endSec: number) => ({ speakerLabel, startSec, endSec })

test('words go to whoever the transcript says spoke them', () => {
  const v = voices([...repeat(3, { c: 'v', ...TEACHER }), ...repeat(3, { c: 'v', ...STUDENT })])
  assert.equal(buildRoomTrace(v, [said('Teacher', 0, 3), said('Student 1', 3, 6)]), 'tttsss')
})

test("a student's words while many voices were going is group talk", () => {
  const v = voices(repeat(4, { c: 'm', db: -30 }))
  assert.equal(buildRoomTrace(v, [said('Student 1', 0, 4)]), 'gggg')
})

test('with no words, many voices is group, and other sound and quiet are what they are', () => {
  const v = voices([{ c: 'm' }, { c: 'm' }, { c: 'o' }, { c: 'q' }, { c: '-' }])
  assert.equal(buildRoomTrace(v, []), 'ggoq-')
})

test('a voice with no words is put down to the teacher or a student by how it sounds', () => {
  const v = voices([
    ...repeat(12, { c: 'v', ...TEACHER }),
    ...repeat(12, { c: 'v', ...STUDENT }),
    // No words for these: the transcript lost them.
    ...repeat(5, { c: 'v', hz: 125, db: -22 }),
    ...repeat(5, { c: 'v', hz: 220, db: -34 }),
  ])
  const room = buildRoomTrace(v, [said('Teacher', 0, 12), said('Student 1', 12, 24)])
  assert.equal(room.slice(24), 'tttttsssss')
})

test('with no student heard alone, a wordless voice is the teacher unless clearly quieter or pitched elsewhere', () => {
  const v = voices([
    ...repeat(12, { c: 'v', ...TEACHER }),
    ...repeat(5, { c: 'v', hz: 118, db: -23 }),
    ...repeat(5, { c: 'v', hz: 118, db: -35 }),
    ...repeat(5, { c: 'v', hz: 240, db: -21 }),
  ])
  assert.equal(buildRoomTrace(v, [said('Teacher', 0, 12)]).slice(12), 'tttttssssssssss')
})

test('a lesson with every word lost puts a lone voice down to the teacher', () => {
  // The phone face down: one voice for minutes, nothing transcribed.
  const v = voices(repeat(30, { c: 'v', ...STUDENT }))
  assert.equal(buildRoomTrace(v, []), 't'.repeat(30))
})

test('one second does not flip a stretch of wordless talk', () => {
  const v = voices([
    ...repeat(12, { c: 'v', ...TEACHER }),
    ...repeat(12, { c: 'v', ...STUDENT }),
    ...repeat(3, { c: 'v', ...TEACHER }),
    { c: 'v', ...STUDENT },
    ...repeat(3, { c: 'v', ...TEACHER }),
  ])
  assert.equal(buildRoomTrace(v, [said('Teacher', 0, 12), said('Student 1', 12, 24)]).slice(24), 'ttttttt')
})

test('a lesson classified before pitch and level were kept still gets every second', () => {
  assert.equal(buildRoomTrace({ voiceTrace: 'vvmoq' }, [said('Teacher', 0, 1)]), 'ttgoq')
})

test('shares count each of the five', () => {
  assert.deepEqual(roomShares('ttsgoq-'), { roomTeacherSec: 2, roomStudentSec: 1, roomGroupSec: 1, roomOtherSec: 1, roomQuietSec: 1 })
})
