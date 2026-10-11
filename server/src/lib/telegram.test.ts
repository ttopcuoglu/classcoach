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

let uploaded = Buffer.alloc(0)

const server: Server = createServer(async (req, res) => {
  requested.push(req.url ?? '')
  if (req.url?.endsWith('/sendDocument')) {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    uploaded = Buffer.concat(chunks)
    res.setHeader('content-type', 'application/json')
    // Telegram answers 200 with ok:false when it won't take a message, so
    // a client that only checks the status code sends into the void.
    const refuse = uploaded.toString('latin1').includes('\r\n\r\nnobody')
    res.end(
      refuse
        ? JSON.stringify({ ok: false, error_code: 400, description: 'Bad Request: chat not found' })
        : JSON.stringify({ ok: true, result: { message_id: 1 } }),
    )
    return
  }
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
const { downloadFile, sendDocument } = await import('./telegram.ts')

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

// Sending a file is the one call that can't go through the JSON helper,
// so its multipart body is built by hand — and a wrong part name or a
// missing filename fails only in a real chat.

test('a document arrives as multipart, named, typed and addressed', async () => {
  await sendDocument('8675309', 'teaching-ideas.pdf', Buffer.from('%PDF-1.7 pretend'), 'application/pdf')
  const body = uploaded.toString('latin1')
  assert.match(body, /name="chat_id"\r\n\r\n8675309/)
  assert.match(body, /filename="teaching-ideas\.pdf"/)
  assert.match(body, /Content-Type: application\/pdf/)
  assert.ok(body.includes('%PDF-1.7 pretend'), 'the bytes themselves should be in the body')
})

test('a refusal from Telegram is thrown, not swallowed', async () => {
  await assert.rejects(
    () => sendDocument('nobody', 'x.pdf', Buffer.from('%PDF'), 'application/pdf', undefined, undefined),
    /sendDocument/,
  )
})

test.after(() => server.close())
