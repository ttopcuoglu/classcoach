import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildRoomTrace, roomShares } from './roomTrace.ts'
import { encodeSeconds, type SecondFeatures, type StoredVoices } from './voiceActivity.ts'

// A lesson is described a second at a time: its voice class, and what the
// audio measured, encoded the way upload stores it.
type Sec = { c: string; hz?: number | null; db?: number; depth?: number; clarity?: number }

// Close to the phone, and — as on the first real lesson — read by the fixed
// rules as several voices: little rise and fall, unclear pitch.
const TEACHER = { c: 'm', hz: 120, db: -20, depth: 10, clarity: 0.2 }
const STUDENT = { c: 'v', hz: 230, db: -32, depth: 22, clarity: 0.6 }
// Pair work: no one voice, a steady murmur at no pitch in particular.
const CROWD = { c: 'm', hz: null, db: -30, depth: 4, clarity: 0.05 }

function voices(secs: Sec[]): StoredVoices {
  const features = secs.map(
    (s): SecondFeatures => ({
      active: s.c !== 'q',
      depthDb: s.depth ?? 0,
      clearPitch: s.clarity ?? 0,
      somePitch: 0,
      pitchHz: s.hz ?? null,
      levelDb: s.db ?? -60,
    }),
  )
  const { pitch, level, depth, clarity } = encodeSeconds(features)
  return { voiceTrace: secs.map((s) => s.c).join(''), voicePitch: pitch, voiceLevel: level, voiceDepth: depth, voiceClarity: clarity }
}

const repeat = (n: number, s: Sec): Sec[] => Array.from({ length: n }, () => s)
const said = (speakerLabel: string, startSec: number, endSec: number) => ({ speakerLabel, startSec, endSec })

/// Twelve seconds each of the teacher and a student with words, the way
/// every lesson starts out labelling its own examples.
const KNOWN = [...repeat(12, TEACHER), ...repeat(12, STUDENT)]
const KNOWN_WORDS = [said('Teacher', 0, 12), said('Student 1', 12, 24)]

test('words go to whoever the transcript says spoke them', () => {
  assert.equal(buildRoomTrace(voices([...repeat(3, TEACHER), ...repeat(3, STUDENT)]), [said('Teacher', 0, 3), said('Student 1', 3, 6)]), 'tttsss')
})

test("a student's words while many voices were going is group talk", () => {
  assert.equal(buildRoomTrace(voices(repeat(4, CROWD)), [said('Student 1', 0, 4)]), 'gggg')
})

test('with no words, other sound and quiet are what they are', () => {
  assert.equal(buildRoomTrace(voices([...KNOWN, { c: 'o' }, { c: 'q' }, { c: '-' }]), KNOWN_WORDS).slice(24), 'oq-')
})

test('a voice with no words goes to whoever in this lesson it sounds like', () => {
  const v = voices([...KNOWN, ...repeat(5, { ...TEACHER, hz: 123, db: -21 }), ...repeat(5, { ...STUDENT, hz: 225, db: -33 })])
  assert.equal(buildRoomTrace(v, KNOWN_WORDS).slice(24), 'tttttsssss')
})

test('a teacher the audio reads as several voices is still the teacher when the words are lost', () => {
  // The first real lesson: the teacher's own speech came out as "many
  // voices" three seconds in four. Against fixed rules, every wordless second
  // of theirs would be group talk; against their own seconds, it is them.
  const v = voices([...KNOWN, ...repeat(6, { ...TEACHER, db: -23 })])
  assert.equal(buildRoomTrace(v, KNOWN_WORDS).slice(24), 'tttttt')
})

test('several voices that sound like no one speaker are group talk', () => {
  const v = voices([...KNOWN, ...repeat(6, CROWD)])
  assert.equal(buildRoomTrace(v, KNOWN_WORDS).slice(24), 'gggggg')
})

test('a lesson with every word lost puts a lone voice down to the teacher, and several to a group', () => {
  // The phone face down: nothing transcribed, so nothing to compare with.
  const v = voices([...repeat(10, STUDENT), ...repeat(10, CROWD)])
  assert.equal(buildRoomTrace(v, []), 't'.repeat(10) + 'g'.repeat(10))
})

test('one second does not flip a stretch of wordless talk', () => {
  const v = voices([...KNOWN, ...repeat(3, TEACHER), STUDENT, ...repeat(3, TEACHER)])
  assert.equal(buildRoomTrace(v, KNOWN_WORDS).slice(24), 'ttttttt')
})

test('a lesson classified before the measures were kept still gets every second', () => {
  assert.equal(buildRoomTrace({ voiceTrace: 'vvmoq' }, [said('Teacher', 0, 1)]), 'ttgoq')
})

test('shares count each of the five', () => {
  assert.deepEqual(roomShares('ttsgoq-'), { roomTeacherSec: 2, roomStudentSec: 1, roomGroupSec: 1, roomOtherSec: 1, roomQuietSec: 1 })
})
