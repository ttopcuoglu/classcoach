import { strict as assert } from 'node:assert'
import test from 'node:test'
import { rehearsalInPlay, talkWordBudget, REHEARSAL_WORD_BUDGET } from './rehearsalTurn.ts'
import { TALK_REPLY_WORD_BUDGET } from './replyBudget.ts'

const turn = (role: 'user' | 'assistant', text: string) => ({ role, text, createdAt: '' })

test('a conversation the teacher has to have gets the room', () => {
  for (const said of [
    "Honestly I'm dreading the call. I think she's going to come after me.",
    'I have to tell a dad his son is failing and I am sick about it.',
    'What do I say to her when she asks why he failed?',
    'I need to email her back and I do not know how to word it.',
    'I have a conference with his parents on Thursday.',
    'I have to push back on my AP about the schedule.',
  ]) {
    assert.equal(rehearsalInPlay(said, []), true, `missed: ${said}`)
  }
})

test('a turn with no conversation in it keeps the ordinary budget', () => {
  for (const said of [
    'They will not settle after lunch.',
    'I am exhausted and it is only October.',
    'My third period talks over directions.',
    'What is a good exit ticket for fractions?',
    // A parent in the sentence is not a conversation the teacher must have.
    'A parent emailed me about the homework policy last week and I already handled it.',
  ]) {
    assert.equal(rehearsalInPlay(said, []), false, `false positive: ${said}`)
  }
})

test('a rehearsal already running keeps its room, whatever the teacher says next', () => {
  const history = [
    turn('user', 'I am dreading it.'),
    turn('assistant', "Want to practise it? I'll play her, and you can see how the first few seconds feel."),
  ]
  // The teacher's own turns here say nothing about a conversation at all.
  assert.equal(rehearsalInPlay('Okay, yes.', history), true)
  assert.equal(rehearsalInPlay('Hi Mrs. Alvarez, thanks for taking the time.', history), true)
})

test('a rehearsal that finished a while ago stops buying extra words', () => {
  const history = [
    turn('assistant', "I'll be her. Hi, this is his mom."),
    turn('user', 'Hi, thanks for calling.'),
    turn('assistant', 'Good opener. Okay, I am me again.'),
    turn('user', 'That went well.'),
    turn('assistant', 'Nice work. What will you change in class tomorrow?'),
    turn('user', 'Not sure yet.'),
    turn('assistant', 'Start with the seating.'),
    turn('user', 'Okay.'),
    turn('assistant', 'Let me know how it goes.'),
  ]
  assert.equal(rehearsalInPlay('Sounds good.', history), false)
})

test('the budget itself swaps, and the ordinary one is unchanged', () => {
  assert.equal(talkWordBudget('I have to call her tonight.', [], TALK_REPLY_WORD_BUDGET), REHEARSAL_WORD_BUDGET)
  assert.equal(talkWordBudget('They talk over directions.', [], TALK_REPLY_WORD_BUDGET), TALK_REPLY_WORD_BUDGET)
  assert.ok(REHEARSAL_WORD_BUDGET > TALK_REPLY_WORD_BUDGET)
})

test('the measured failure case is covered', () => {
  // 89 words written, 25 delivered, offer lost — see rehearsalTurn.ts.
  assert.equal(
    rehearsalInPlay("Honestly I'm dreading the call. I think she's going to come after me and I'll just freeze.", []),
    true,
  )
})
