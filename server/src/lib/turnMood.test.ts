import { strict as assert } from 'node:assert'
import test from 'node:test'
import { moodOf } from './turnMood.ts'

test('a plain account of a problem is neutral', () => {
  assert.equal(moodOf('They will not settle after lunch.'), 'neutral')
  assert.equal(moodOf('We started argumentative writing this week.'), 'neutral')
  assert.equal(moodOf('I tried a bell ringer and some of them did it.'), 'neutral')
})

test('a question is a question', () => {
  assert.equal(moodOf('What do you recommend?'), 'asked')
  assert.equal(moodOf('How do I teach cells to eighth graders?'), 'asked')
})

test('first-person distress is heard before it is answered', () => {
  assert.equal(moodOf('I am exhausted and it is only October.'), 'hard')
  assert.equal(moodOf('I cried in my car at lunch.'), 'hard')
  assert.equal(moodOf('Honestly I have had enough this week.'), 'hard')
  // distress plus a question: being heard comes first
  assert.equal(moodOf("I don't know what to do. What would you try?"), 'hard')
})

test('an outcome that went well is a win, even with a question after it', () => {
  assert.equal(moodOf('The essay went really well today.'), 'glad')
  assert.equal(moodOf('It worked. They got it for the first time.'), 'glad')
  assert.equal(moodOf('It finally worked — what should I do next?'), 'glad')
})

test('a hard TEST is not a hard DAY', () => {
  // The failure that matters: sympathy on something that is not about them.
  assert.equal(moodOf('The test was hard for them.'), 'neutral')
  assert.equal(moodOf('This chapter is hard to teach.'), 'neutral')
  assert.equal(moodOf('They find fractions hard.'), 'neutral')
  assert.equal(moodOf('It was a hard question to answer.'), 'neutral')
})

test('and good news is not claimed from a hope', () => {
  assert.equal(moodOf('I hope it goes well tomorrow.'), 'neutral')
  assert.equal(moodOf('Maybe it will work next time.'), 'neutral')
})

test('empty and whitespace are neutral, never a mood', () => {
  assert.equal(moodOf(''), 'neutral')
  assert.equal(moodOf('   '), 'neutral')
})
