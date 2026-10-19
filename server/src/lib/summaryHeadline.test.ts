import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkHeadline, factsText, headlineFacts } from './summaryHeadline.ts'

const FACTS = headlineFacts({
  durationSec: 600,
  teacherTalkPct: 34.3,
  questionLog: [
    { timestampSec: 10, type: 'recall', text: 'a' },
    { timestampSec: 20, type: 'higher_order', text: 'b' },
    { timestampSec: 30, type: 'higher_order', text: 'c' },
  ],
  teachingMoves: { questionKinds: [{ timestampSec: 30, kind: 'justify' }], directions: [{ parts: ['task'] }, { parts: ['task', 'steps', 'time', 'product'] }] },
  metricsDetail: { teacherTalkSec: 300, studentTalkSec: 100, answersHeardCount: 7, answersFollowedUpCount: 1 },
  lessonContent: { subject: 'business', keyTerms: [{ studentCount: 2 }, { studentCount: 0 }] },
})

test('facts are counted the way the page counts them', () => {
  assert.equal(FACTS.questionsBeyondRecall, 2)
  assert.equal(FACTS.questionsReasoning, 1)
  assert.equal(FACTS.directionsComplete, 1)
  assert.equal(FACTS.capturedPct, 67)
  assert.match(factsText(FACTS), /followed up on 1 of 7/)
  assert.match(factsText({ ...FACTS, capturedPct: 30 }), /^Coverage: 30%/m)
  assert.doesNotMatch(factsText({ ...FACTS, capturedPct: 30 }), /^Talk:/m)
})

test('a headline may only use the facts’ numbers, and may not judge or speak for students', () => {
  const facts = factsText(FACTS)
  assert.equal(checkHeadline('You asked students to reason in 2 of 3 questions, and you followed up on 1 of 7 answers they gave you today.', facts), null)
  assert.match(checkHeadline('You asked students to reason in 67% of your questions, then moved on quickly every time today.', facts)!, /number 67/)
  assert.match(checkHeadline('Your follow-ups were weak today: you followed up on 1 of 7 answers the recording could hear.', facts)!, /banned/)
  assert.match(checkHeadline('You asked 2 of 3 questions beyond recall but followed up on just 1 of 7 answers the recording heard.', facts)!, /belittles/)
  assert.match(checkHeadline('Students were engaged by your 2 of 3 reasoning questions and followed up on ideas with each other.', facts)!, /claim about students/)
})
