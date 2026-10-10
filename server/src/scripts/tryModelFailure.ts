import 'dotenv/config'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { classifyModelError } from '../lib/modelErrors.ts'

// Makes one real call and prints what a teacher would now be told if it fails.
// Written while the account was actually refusing calls, which is the only
// time this is worth running.
try {
  await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8,
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: 'hi' }],
  })
  console.log('call SUCCEEDED — nothing to classify')
} catch (error) {
  const failure = classifyModelError(error, 'Could not finish the hard look')
  console.log(`cause     : ${failure.cause}`)
  console.log(`status    : ${failure.status}`)
  console.log(`retryable : ${failure.retryable}`)
  console.log(`teacher sees: "${failure.message}"`)
}
