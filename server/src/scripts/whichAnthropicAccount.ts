import 'dotenv/config'

// "The credit is on but it still says the balance is too low" has one common
// cause: the credit went onto a different organization or workspace than the
// key belongs to. Anthropic answers both questions in the response headers of
// any failed request, so this asks for the cheapest possible completion and
// prints who it was answered for.
//
// Prints the key's last four characters only — enough to match it against the
// hint the Anthropic console shows beside each key, and nothing more.
const key = process.env.ANTHROPIC_API_KEY
if (!key) {
  console.log('ANTHROPIC_API_KEY is not set in server/.env')
  process.exit(1)
}

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-5',
    max_tokens: 1,
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: 'hi' }],
  }),
})

console.log(`key ...${key.slice(-4)} (${key.length} chars)`)
console.log(`http ${res.status}`)
console.log(`organization : ${res.headers.get('anthropic-organization-id') ?? '(none returned)'}`)
console.log(`workspace    : ${res.headers.get('anthropic-workspace-id') ?? '(none — key is not scoped to a workspace)'}`)
const body = await res.text()
console.log(`body ${body.slice(0, 300)}`)
