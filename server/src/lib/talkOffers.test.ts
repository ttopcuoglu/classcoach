import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appendTurn, latestOffer, type ChatMessage } from './coachingChat.ts'
import { OFFER_COPY, OFFER_INSTRUCTION, OFFER_KINDS, isOfferKind } from './talkOffers.ts'
import { visibleSoFar } from './sentenceStream.ts'

// The inline offer is the entry point to two of the four cross-surface
// handoffs, and it is the one piece of this refactor that can actively make
// the product worse. Talk It Through's promise is that it produces no
// deliverable up front — a coach that keeps suggesting the teacher go and do
// an exercise somewhere else has broken that promise while technically
// implementing the feature.
//
// So the tests here are mostly about restraint and about the tag never
// reaching a teacher's eyes or ears.

test('only the two real offer kinds are accepted', () => {
  for (const kind of OFFER_KINDS) assert.equal(isOfferKind(kind), true, kind)
  for (const value of ['plan', 'message', '', 'REHEARSE', null, undefined, 1, {}]) {
    assert.equal(isOfferKind(value), false, String(value))
  }
})

test('every offer kind has copy and a destination', () => {
  for (const kind of OFFER_KINDS) {
    assert.ok(OFFER_COPY[kind].label, `${kind} has no label`)
    assert.ok(OFFER_COPY[kind].to.startsWith('/'), `${kind} has no destination`)
  }
})

// An offer interrupts a conversation, so it asks rather than instructs.
// "Rehearse this now" reads as the app deciding the conversation is over.
test('the offers are phrased as questions, not instructions', () => {
  for (const kind of OFFER_KINDS) {
    assert.ok(OFFER_COPY[kind].label.endsWith('?'), `${kind} does not ask`)
  }
})

// --- the instruction, which is where the restraint lives ---

test('the coach is told to default to silence', () => {
  const text = OFFER_INSTRUCTION.toLowerCase()
  assert.ok(text.includes('default to no tag'), 'silence is not the default')
  assert.ok(text.includes('twice in this conversation at most'), 'offers are not capped')
  assert.ok(text.includes('never offer twice in a row'), 'repeats are not ruled out')
})

// The failure that would hurt most: a teacher mid-sentence about something
// hard, handed a button that reads as "go and do an exercise".
test('the coach is told not to offer while the teacher is still upset', () => {
  const text = OFFER_INSTRUCTION.toLowerCase()
  assert.ok(text.includes('upset and still describing'), 'the wait-until-it-turns rule is missing')
  assert.ok(text.includes('dismissed'), 'the reason is not stated')
})

// The teacher sees a button. If the reply also talks about the button, the
// offer has become the coach's idea rather than an option beside it.
test('the reply must read identically with or without the tag', () => {
  const text = OFFER_INSTRUCTION.toLowerCase()
  assert.ok(text.includes('say nothing about it in your reply'), 'the coach may narrate the tag')
  assert.ok(text.includes('not a way to end the conversation'), 'an offer may close the conversation')
})

test('the coach is told not to offer before it knows what this is about', () => {
  assert.ok(OFFER_INSTRUCTION.toLowerCase().includes('never offer on your first reply'))
})

test('both kinds name the specific condition rather than a vibe', () => {
  assert.ok(OFFER_INSTRUCTION.includes('<offer>rehearse</offer>'))
  assert.ok(OFFER_INSTRUCTION.includes('<offer>document</offer>'))
  assert.ok(
    OFFER_INSTRUCTION.includes('about to have with a real person'),
    'rehearse is not tied to a real upcoming conversation',
  )
  assert.ok(
    OFFER_INSTRUCTION.includes('a specific document they made'),
    'document is not tied to a real document',
  )
})

// --- the tag never reaches the teacher ---

// Talk It Through is spoken. A tag that leaks is not a cosmetic bug — it is
// read aloud to the teacher in the coach's voice.
test('a complete offer tag is withheld from the spoken stream', () => {
  assert.equal(
    visibleSoFar('That sounds like a hard one.\n<offer>rehearse</offer>'),
    'That sounds like a hard one.\n',
  )
})

test('a partial offer tag is withheld while it could still become one', () => {
  for (const partial of ['<', '<o', '<off', '<offer', '<offer>']) {
    assert.equal(
      visibleSoFar(`Okay, so here is a thought.\n${partial}`),
      'Okay, so here is a thought.\n',
      `"${partial}" leaked`,
    )
  }
})

test('the memory tag is still withheld, and whichever comes first wins', () => {
  assert.equal(visibleSoFar('Said it.\n<memory_update>note</memory_update>'), 'Said it.\n')
  assert.equal(
    visibleSoFar('Said it.\n<offer>rehearse</offer>\n<memory_update>note</memory_update>'),
    'Said it.\n',
  )
  assert.equal(
    visibleSoFar('Said it.\n<memory_update>note</memory_update>\n<offer>rehearse</offer>'),
    'Said it.\n',
  )
})

// A "<" that is not the start of a hidden tag is ordinary text — a maths or
// computer-science conversation will contain them.
test('an unrelated angle bracket is not withheld', () => {
  assert.equal(visibleSoFar('So x < 5 in that case. '), 'So x < 5 in that case. ')
})

// --- which offer still stands ---

test('an offer on the latest turn stands', () => {
  const conversation = appendTurn([], 'I have to talk to a parent tomorrow.', 'That is a hard one.', 'rehearse')
  assert.equal(latestOffer(conversation), 'rehearse')
})

// An offer two turns back has been passed over. Re-showing it is the app
// pressing a suggestion the teacher already moved on from.
test('an offer the teacher talked past is not re-shown', () => {
  let conversation = appendTurn([], 'first', 'reply one', 'rehearse')
  conversation = appendTurn(conversation, 'second', 'reply two')
  assert.equal(latestOffer(conversation), null)
})

test('a conversation with no offers has none', () => {
  const conversation = appendTurn([], 'hello', 'hi there')
  assert.equal(latestOffer(conversation), null)
  assert.equal(latestOffer([]), null)
})

// Every turn written before offers existed has no `offer` key at all.
test('turns from before offers existed read as having none', () => {
  const legacy: ChatMessage[] = [
    { role: 'user', text: 'something', createdAt: new Date().toISOString() },
    { role: 'assistant', text: 'a reply', createdAt: new Date().toISOString() },
  ]
  assert.equal(latestOffer(legacy), null)
})

test('a turn with no offer stores no offer key, rather than a null one', () => {
  const conversation = appendTurn([], 'hello', 'hi there')
  assert.ok(!('offer' in conversation[1]), 'an empty offer was stored anyway')
})
