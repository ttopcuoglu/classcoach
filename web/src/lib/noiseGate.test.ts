import { strict as assert } from 'node:assert'
import test from 'node:test'
import { createRoomLevel } from './noiseGate.ts'

const FRAME_MS = 1000 / 60
const SPEECH_THRESHOLD = 8
const SPEECH_MARGIN = 8
const BARGE_THRESHOLD = 20
const BARGE_MARGIN = 14

/// Mirrors the hook: a turn ends once the silence window elapses with no
/// frame counting as speech.
function turnEnds(levels: number[], windowMs = 2000): boolean {
  const room = createRoomLevel()
  let heardSpeech = false
  let silentMs = 0
  for (const level of levels) {
    const excess = room.excess(level, FRAME_MS)
    if (level > SPEECH_THRESHOLD && excess >= SPEECH_MARGIN) {
      heardSpeech = true
      silentMs = 0
    } else if (heardSpeech) {
      silentMs += FRAME_MS
      if (silentMs >= windowMs) return true
    }
  }
  return false
}

const frames = (level: number, seconds: number) => Array(Math.round(seconds * 60)).fill(level)

test('a turn ends after speech, in a quiet room and a loud one alike', () => {
  for (const room of [2, 10, 25, 45]) {
    const seq = [...frames(room, 3), ...frames(Math.max(room + 20, 40), 4), ...frames(room, 4)]
    assert.equal(turnEnds(seq), true, `a turn in a room at ${room} must end`)
  }
})

test('the reported bug: with a fixed threshold the turn never ends above it', () => {
  // The old rule, for contrast — level > 8 alone.
  const oldWay = (levels: number[]) => {
    let heard = false
    let silentMs = 0
    for (const level of levels) {
      if (level > SPEECH_THRESHOLD) {
        heard = true
        silentMs = 0
      } else if (heard) {
        silentMs += FRAME_MS
        if (silentMs >= 2000) return true
      }
    }
    return false
  }
  const noisy = [...frames(25, 3), ...frames(45, 4), ...frames(25, 4)]
  assert.equal(oldWay(noisy), false, 'this is the bug being fixed')
  assert.equal(turnEnds(noisy), true, 'and this is the fix')
})

test('a long sentence is never gated out mid-way', () => {
  const room = createRoomLevel()
  room.excess(25, FRAME_MS)
  let detected = 0
  const sentence = frames(55, 12)
  for (const level of sentence) {
    const excess = room.excess(level, FRAME_MS)
    if (level > SPEECH_THRESHOLD && excess >= SPEECH_MARGIN) detected += 1
  }
  assert.equal(detected, sentence.length, 'every frame of a 12s sentence must count as speech')
})

test('steady noise never reads as interrupting Coach', () => {
  for (const noise of [22, 30, 45, 60]) {
    const room = createRoomLevel()
    let longestRun = 0
    let run = 0
    for (const level of frames(noise, 10)) {
      const excess = room.excess(level, FRAME_MS)
      if (level > BARGE_THRESHOLD && excess >= BARGE_MARGIN) run += 1
      else run = 0
      longestRun = Math.max(longestRun, run)
    }
    assert.ok(longestRun * FRAME_MS < 350, `noise at ${noise} must not sustain a barge-in`)
  }
})

test('a raised voice over a loud room still interrupts', () => {
  const room = createRoomLevel()
  for (const level of frames(30, 2)) room.excess(level, FRAME_MS)
  let run = 0
  for (const level of frames(70, 1)) {
    const excess = room.excess(level, FRAME_MS)
    if (level > BARGE_THRESHOLD && excess >= BARGE_MARGIN) run += 1
    else run = 0
  }
  assert.ok(run * FRAME_MS >= 350, 'a voice clearly above the room must still barge in')
})

test('the room is never judged on the first sample', () => {
  assert.equal(createRoomLevel().excess(100, FRAME_MS), 0)
})

test('a room going quiet restores sensitivity quickly', () => {
  const room = createRoomLevel()
  for (const level of frames(50, 5)) room.excess(level, FRAME_MS)
  for (const level of frames(4, 1)) room.excess(level, FRAME_MS)
  assert.ok(room.floor() < 12, `floor should fall back fast, was ${room.floor()}`)
})
