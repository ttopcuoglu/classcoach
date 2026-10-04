/// The child half of document extraction.
///
/// Reading a PDF costs this process about 300MB that it never gives back —
/// pdf.js allocates heavily and `destroy()` does not return it. Inside the
/// server that is fatal: the instance is OOM-killed mid-request, the teacher
/// gets a gateway error with no message in it, and every other request in
/// flight dies too.
///
/// So extraction happens here, in a process that exists for one document and
/// then exits. The memory goes back to the OS on exit whatever pdf.js did
/// with it, and a document heavy enough to die takes only this process with
/// it — which the parent can catch and turn into a sentence.
///
/// Reads {fileName, base64} as JSON on stdin, writes {text, pageCount} or
/// {error, kind} as JSON on stdout.

import { extractDocument } from './documentText.ts'
import { NoTextFoundError, UnsupportedFileError } from './extractErrors.ts'

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

async function main() {
  try {
    const { fileName, base64 } = JSON.parse(await readStdin()) as { fileName: string; base64: string }
    const buffer = Buffer.from(base64, 'base64')
    // One read, both answers — asking separately opened the PDF engine twice.
    const { text, pageCount } = await extractDocument(buffer, fileName)
    process.stdout.write(JSON.stringify({ text, pageCount }))
    process.exit(0)
  } catch (error) {
    const kind =
      error instanceof UnsupportedFileError
        ? 'unsupported'
        : error instanceof NoTextFoundError
          ? 'no_text'
          : 'failed'
    process.stdout.write(JSON.stringify({ error: (error as Error).message, kind }))
    process.exit(0)
  }
}

void main()
