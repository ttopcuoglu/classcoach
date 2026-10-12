import { strict as assert } from 'node:assert'
import test from 'node:test'
import { buildFeelingBlock } from './feelingSteer.ts'

test('a hard turn is steered towards naming it', () => {
  const block = buildFeelingBlock("I'm so tired, it's only October.")
  assert.ok(block.includes('hard one'))
  // Tentative, so the teacher can correct it — asserting the idea, not the adverb.
  assert.ok(/tentative/.test(block))
  assert.ok(block.includes('one short sentence'))
})

test('good news is steered towards being pleased, not towards sympathy', () => {
  const block = buildFeelingBlock('It finally worked today!')
  assert.ok(block.includes('good news'))
  assert.ok(!block.includes('hard one'))
})

test('a plain question gets no steer at all', () => {
  assert.equal(buildFeelingBlock('What do you recommend for exit tickets?'), '')
})

test('a neutral account gets no steer', () => {
  assert.equal(buildFeelingBlock('We started argumentative writing this week.'), '')
  assert.equal(buildFeelingBlock('They will not settle after lunch.'), '')
})

test('a hard day is steered; a hard test is not', () => {
  assert.ok(buildFeelingBlock("I had a rough day").includes('hard one'))
  assert.equal(buildFeelingBlock('The test was hard for them.'), '')
})
