import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { test } from 'node:test'

// Downloading a voice note is two hops against two different URL shapes —
// /bot<token>/getFile for the path, then /file/bot<token>/<path> for the
// bytes — and getting either wrong fails only at runtime, in a chat, as
// "I couldn't get that one to play back". A fake Bot API pins both.

const AUDIO = Buffer.from('fake opus bytes, but exactly these bytes')

const requested: string[] = []
let filePath: string | null = 'voice/file_42.oga'

const server: Server = createServer((req, res) => {
  requested.push(req.url ?? '')
  if (req.url?.endsWith('/getFile')) {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ ok: true, result: filePath ? { file_path: filePath } : {} }))
    return
  }
  if (req.url?.includes('/file/bot')) {
    res.end(AUDIO)
    return
  }
  res.statusCode = 404
  res.end('{}')
})

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address() as { port: number }
process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${port}`
process.env.TELEGRAM_BOT_TOKEN = '123456:test-bot-token'

// Imported after the environment is set: the module reads the API base once.
const { downloadFile } = await import('./telegram.ts')

test('a file comes back byte for byte, from both of Telegram\'s URL shapes', async () => {
  requested.length = 0
  const bytes = await downloadFile('file-42')
  assert.equal(Buffer.compare(bytes, AUDIO), 0)
  assert.deepEqual(requested, ['/bot123456:test-bot-token/getFile', '/file/bot123456:test-bot-token/voice/file_42.oga'])
})

test('a file Telegram will not give a path for fails loudly', async () => {
  filePath = null
  await assert.rejects(() => downloadFile('file-43'), /no path/i)
  filePath = 'voice/file_42.oga'
})

test.after(() => server.close())
