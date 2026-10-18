import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeTranscript, type Segment } from './audioAnalysis.ts'

const t = (startSec: number, text: string): Segment => ({ speakerLabel: 'Teacher', startSec, endSec: startSec + 3, text })
const s = (startSec: number, text: string): Segment => ({ speakerLabel: 'Student', startSec, endSec: startSec + 2, text })

test('answers heard, answers followed up (once each), and every follow-up kept', () => {
  const { metricsDetail: m } = analyzeTranscript([
    t(0, 'Why do you think the leaves change colour?'),
    s(4, 'Because it gets cold.'),
    t(7, 'Why does the cold matter? What makes you think so?'),
    s(12, 'Less sun.'),
    t(15, 'Okay, open your books to page ten.'),
    t(20, 'What is the capital of France?'),
    s(24, 'Paris.'),
    t(27, 'Good. Now write the date at the top.'),
  ])
  assert.equal(m.answersHeardCount, 3, 'three student turns came straight after a question')
  assert.equal(m.answersFollowedUpCount, 1, 'two follow-up questions on one answer count once')
  assert.equal(m.followUpQuestionCount, 2)
  assert.deepEqual(
    m.followUpLog?.map((f) => f.text),
    ['Why does the cold matter', 'What makes you think so'],
  )
})
