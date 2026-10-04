/// Runs document extraction in a child process, so a document that is too
/// heavy to read kills only that process.
///
/// The parent half of extractChild.ts. Every failure becomes a sentence: a
/// child that runs out of memory, hangs, or dies for any other reason is a
/// result here, not a dead server.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { NoTextFoundError, UnsupportedFileError } from './extractErrors.ts'

export class ExtractionTooHeavyError extends Error {}
export class ExtractionTimeoutError extends Error {}

const CHILD = fileURLToPath(new URL('./extractChild.ts', import.meta.url))

/// How long one document gets. Generous, because OCR on a photographed page
/// is genuinely slow, and the point of the cap is to end a hang rather than
/// to hurry a reader.
const TIMEOUT_MS = 90_000

/// The child's own heap ceiling. Below the instance's limit on purpose: a
/// child that hits this exits with a V8 OOM we can report, instead of the
/// kernel killing whichever process it likes — which, in a server, is
/// usually the server.
const CHILD_HEAP_MB = 700

export type Extracted = { text: string; pageCount: number | null }

export function extractInChild(buffer: Buffer, fileName: string): Promise<Extracted> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', `--max-old-space-size=${CHILD_HEAP_MB}`, CHILD],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )

    let out = ''
    let err = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new ExtractionTimeoutError('That took too long to read.'))
    }, TIMEOUT_MS)

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    child.stdout.on('data', (d: Buffer) => {
      out += d.toString()
    })
    child.stderr.on('data', (d: Buffer) => {
      err += d.toString()
    })

    child.on('error', (error) => {
      finish(() => reject(error))
    })

    child.on('close', (code, signal) => {
      finish(() => {
        // No JSON back means it did not get to answer: out of memory, or
        // killed. Either way the document was too heavy to read here, which is
        // a thing we can say rather than a thing that takes the server down.
        if (!out.trim()) {
          console.error('[extract] child died', { code, signal, stderr: err.slice(0, 500), fileName })
          reject(new ExtractionTooHeavyError('That file was too heavy to read.'))
          return
        }
        let parsed: { text?: string; pageCount?: number | null; error?: string; kind?: string }
        try {
          parsed = JSON.parse(out)
        } catch {
          reject(new ExtractionTooHeavyError('That file could not be read.'))
          return
        }
        if (parsed.error) {
          if (parsed.kind === 'unsupported') reject(new UnsupportedFileError(parsed.error))
          else if (parsed.kind === 'no_text') reject(new NoTextFoundError(parsed.error))
          else reject(new Error(parsed.error))
          return
        }
        resolve({ text: parsed.text ?? '', pageCount: parsed.pageCount ?? null })
      })
    })

    child.stdin.on('error', () => {
      // A child that died before the document finished arriving is handled by
      // `close` above; swallowing EPIPE here keeps that the one path.
    })
    child.stdin.end(JSON.stringify({ fileName, base64: buffer.toString('base64') }))
  })
}
