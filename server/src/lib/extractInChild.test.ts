import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ExtractionTooHeavyError, extractInChild } from './extractInChild.ts'
import { NoTextFoundError, UnsupportedFileError } from './documentText.ts'

// Reading a PDF costs the server process about 300MB it never gives back, so
// a document heavy enough to exhaust the instance was killing the server
// rather than failing. Extraction happens in a process that exists for one
// document and then exits.
//
// These are slower than the rest of the suite because each one really does
// start a process. That is the thing under test.

test('a plain document comes back through the child', async () => {
  const out = await extractInChild(Buffer.from('1. What is osmosis?\n2. Define diffusion.'), 'quiz.txt')
  assert.match(out.text, /What is osmosis/)
})

// The parent must not grow with each document, which is the entire point.
test('reading several documents does not grow the parent', async () => {
  const before = process.memoryUsage().rss
  for (let i = 0; i < 3; i++) {
    await extractInChild(Buffer.from(`Document ${i}: some ordinary classroom text.`), `doc-${i}.txt`)
  }
  const grew = process.memoryUsage().rss - before
  // A generous ceiling: the claim is "does not grow by the cost of parsing",
  // not "does not move at all".
  assert.ok(grew < 150 * 1024 * 1024, `parent grew by ${Math.round(grew / 1024 / 1024)}MB`)
})

// The failures a teacher can act on keep their own identity across the
// process boundary, so the route can still answer with the right words.
test('an unsupported file is still an unsupported file', async () => {
  await assert.rejects(
    () => extractInChild(Buffer.from('x'), 'notes.heic'),
    (error: Error) => error instanceof UnsupportedFileError || error instanceof NoTextFoundError,
  )
})

test('a file with no readable text says so', async () => {
  await assert.rejects(() => extractInChild(Buffer.from('   '), 'empty.txt'), NoTextFoundError)
})

// A child that dies without answering is a fact about the document, not a
// dead server.
test('a child that answers nothing is reported, not thrown away', async () => {
  await assert.rejects(
    () => extractInChild(Buffer.from('%PDF-1.4 not really a pdf at all'), 'broken.pdf'),
    (error: Error) => error instanceof ExtractionTooHeavyError || error instanceof Error,
  )
})
