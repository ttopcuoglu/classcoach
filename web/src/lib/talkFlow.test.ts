import { strict as assert } from 'node:assert'
import test from 'node:test'
import type { TranscriptSegment } from './api.ts'
import { buildFlow, buildPace } from './talkFlow.ts'

const seg = (speakerLabel: string, startSec: number, endSec: number, text: string): TranscriptSegment => ({
  id: `${speakerLabel}-${startSec}`, speakerLabel, rawSpeakerTag: speakerLabel, startSec, endSec, text,
})

test('every second is one kind, and the shares add to 100', () => {
  // 10 seconds: you 0–4, another voice 4–6, then quiet 6–8 and sound 8–10.
  const flow = buildFlow([seg('Teacher', 0, 4, 'one two three'), seg('Student', 4, 6, 'yes')], 10, 'wwwwwwqqss')!
  assert.deepEqual(flow.shares, { you: 40, other: 20, sound: 20, quiet: 20, unknown: 0 })
  assert.equal(flow.bins.length, 10)
  assert.deepEqual(flow.bins.slice(0, 7), ['you', 'you', 'you', 'you', 'other', 'other', 'quiet'])
})

test('the stored talk share is used as-is, and the rest shared out in proportion', () => {
  const flow = buildFlow([seg('Teacher', 0, 4, 'one two three'), seg('Student', 4, 6, 'yes')], 10, 'wwwwwwqqss', 34)!
  assert.equal(flow.shares.you, 34)
  const total = Object.values(flow.shares).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(total - 100) < 1e-9)
  assert.ok(Math.abs(flow.shares.other - flow.shares.quiet) < 1e-9, 'other voices and quiet had equal seconds')
})

test('without an envelope, quiet and sound cannot be told apart', () => {
  const flow = buildFlow([seg('Teacher', 0, 4, 'a b c')], 10, null)!
  assert.equal(flow.hasEnvelope, false)
  assert.equal(flow.shares.quiet + flow.shares.sound, 0)
  assert.equal(flow.shares.unknown, 60)
})

test('pace is your words a minute, and a minute with too little speech has none', () => {
  const words = (n: number) => Array.from({ length: n }, () => 'w').join(' ')
  const pace = buildPace([seg('Teacher', 0, 30, words(90)), seg('Teacher', 60, 65, words(20))], 120)
  assert.deepEqual(pace.map((p) => p.wpm), [180, null])
})
