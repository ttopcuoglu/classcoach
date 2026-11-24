import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildObservationPrompt,
  componentDefs,
  observationEvidence,
  observationSegments,
  OBSERVATION_QUESTIONS,
  parseObservationReport,
  readAnswers,
  readNotes,
} from './observationReport.ts'

test('ten questions, one per component of Domains 2 and 3', () => {
  assert.deepEqual(
    OBSERVATION_QUESTIONS.map((q) => q.code),
    ['2a', '2b', '2c', '2d', '2e', '3a', '3b', '3c', '3d', '3e'],
  )
  assert.deepEqual(componentDefs().map((d) => d.code), ['2a', '2b', '2c', '2d', '2e', '3a', '3b', '3c', '3d', '3e'])
})

test('only real answers to real questions are kept', () => {
  assert.deepEqual(readAnswers({ '2a': 'warm', '3b': 'made-up', '9z': 'most', '3c': 'most' }), { '2a': 'warm', '3c': 'most' })
  assert.deepEqual(readAnswers(null), {})
})

test('notes are trimmed, capped, sorted, and tags must be real components', () => {
  const notes = readNotes([
    { atSec: 300, text: '  Anchor chart from this unit  ', code: '2e' },
    { atSec: 60, text: 'Pairs on task', code: 'zz' },
    { atSec: 10, text: '   ' },
    'nonsense',
  ])
  assert.deepEqual(notes, [
    { atSec: 60, text: 'Pairs on task', code: null },
    { atSec: 300, text: 'Anchor chart from this unit', code: '2e' },
  ])
})

test('the voice with the most words is taken as the teacher', () => {
  const segs = observationSegments([
    { speaker: 1, startSec: 0, endSec: 5, text: 'yes' },
    { speaker: 0, startSec: 5, endSec: 20, text: 'Today we are going to explain why salt water conducts electricity and sugar water does not' },
    { speaker: 1, startSec: 20, endSec: 24, text: 'because of ions' },
  ])
  assert.deepEqual(segs.map((s) => s.speakerLabel), ['Student', 'Teacher', 'Student'])
})

test('no recording gives no evidence, and speaker-dependent counts never reach the prompt', () => {
  assert.deepEqual(observationEvidence(null), { items: [], facts: [] })
  const evidence = observationEvidence([
    { speaker: 0, startSec: 0, endSec: 30, text: 'Our goal for today is to explain why some solutions conduct. Why do you think salt water lights the bulb?' },
    { speaker: 1, startSec: 33, endSec: 40, text: 'Because the salt breaks into charged pieces that can move around in the water.' },
    { speaker: 0, startSec: 41, endSec: 60, text: 'Good. What makes you say charged? Turn and talk with your partner for one minute.' },
  ])
  assert.ok(evidence.facts.every((f) => !/talk time|second by second|followed up|uninterrupted/i.test(f)))
})

const REPLY = `<about>An 8th grade science lesson on conductivity, with a demonstration and pair work.</about>
<plan_vs_lesson>none</plan_vs_lesson>
<component><code>2a</code><recording>none</recording><notes>none</notes><level>3</level><reason>You saw warm, respectful talk in pairs.</reason><disagreement>none</disagreement><next_step>none</next_step></component>
<component><code>2b</code><recording>none</recording><notes>none</notes><level>4</level><reason>Invented.</reason><disagreement>none</disagreement><next_step>none</next_step></component>
<component><code>2c</code><recording>none</recording><notes>N1</notes><level>2</level><reason>Your note N1 says materials took time.</reason><disagreement>none</disagreement><next_step>Have materials on tables before the bell.</next_step></component>
<component><code>2d</code><recording>none</recording><notes>none</notes><level>3</level><reason>x</reason><disagreement>none</disagreement><next_step>none</next_step></component>
<component><code>2e</code><recording>none</recording><notes>none</notes><level>3</level><reason>x</reason><disagreement>none</disagreement><next_step>none</next_step></component>
<component><code>3a</code><recording>1</recording><notes>none</notes><level>3</level><reason>The goal was stated in moment 1.</reason><disagreement>none</disagreement><next_step>none</next_step></component>
<component><code>3b</code><recording>2</recording><notes>none</notes><level>3</level><reason>Students explained their thinking.</reason><disagreement>The audio heard little pair talk, but you saw most groups discussing.</disagreement><next_step>none</next_step></component>`

test('a level needs a source; tagged notes stay with their component; references are cleaned', () => {
  const items = [
    { kind: 'Stated learning goal', timestampSec: 5, text: 'Our goal for today is to explain why some solutions conduct.' },
    { kind: 'Student response', timestampSec: 33, text: 'Because the salt breaks into charged pieces.' },
  ]
  const notes = [{ atSec: 200, text: 'Materials took four minutes to hand out', code: null }, { atSec: 400, text: 'Word wall current', code: '2e' }]
  const report = parseObservationReport(REPLY, { items, answers: { '2a': 'warm', '3b': 'most', '3a': 'not_asked' }, notes, recordingMissing: false, planning: null })
  assert.ok(report)
  const by = Object.fromEntries(report!.components.map((c) => [c.code, c]))
  assert.equal(by['2a'].level, 3, 'an answer is evidence')
  assert.equal(by['2b'].level, null, 'no answer, note or moment: not enough evidence')
  assert.equal(by['2c'].level, 2)
  assert.deepEqual(by['2c'].notes.map((n) => n.atSec), [200])
  assert.ok(!by['2c'].reason.includes('N1'), 'note numbers are ours')
  assert.deepEqual(by['2e'].notes.map((n) => n.text), ['Word wall current'], 'a tagged note always sits with its component')
  assert.equal(by['2e'].level, 3)
  assert.equal(by['3a'].level, 3, 'a cited moment is evidence even when the answer is not')
  assert.ok(!/moment 1/.test(by['3a'].reason))
  assert.equal(by['3b'].disagreement, 'The audio heard little pair talk, but you saw most groups discussing.')
  assert.equal(by['3c'].level, null, 'a component the model skipped is not enough evidence')
  assert.equal(by['3b'].observed?.answer, 'Most groups')
  assert.equal(report!.planVsLesson, null)
})

test('a reply missing most components is refused', () => {
  assert.equal(parseObservationReport('<about>x</about>', { items: [], answers: {}, notes: [], recordingMissing: true, planning: null }), null)
})

test('the prompt carries the answers, notes and plan, and says when there is no recording', () => {
  const prompt = buildObservationPrompt({
    evidence: { items: [], facts: [] },
    answers: { '3c': 'half' },
    notes: [{ atSec: 125, text: 'Back table off task', code: '3c' }],
    closingNote: 'Fire drill cut the end short.',
    plan: [{ ref: 'Objective', text: 'Students will explain conductivity.' }],
    context: { subject: 'Science', grade: '8th', lessonTitle: 'Conductivity', durationSec: 1500 },
    sharedRules: '',
  })
  assert.match(prompt, /3c — .* Observer's answer: About half/)
  assert.match(prompt, /N1 \(2:05, tagged 3c\) Back table off task/)
  assert.match(prompt, /Fire drill cut the end short/)
  assert.match(prompt, /\(1\) Objective: Students will explain conductivity/)
  assert.match(prompt, /No usable recording/)
})
