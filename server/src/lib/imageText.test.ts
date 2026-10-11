import assert from 'node:assert/strict'
import { test } from 'node:test'
import { imageMediaType } from './imageText.ts'

// What decides whether an upload skips the parser and goes to the model.
// Getting it wrong sends a photo to tesseract, or a .docx to a vision call.

test('the formats teachers actually upload are recognised', () => {
  assert.equal(imageMediaType('worksheet.jpg'), 'image/jpeg')
  assert.equal(imageMediaType('IMG_4821.JPEG'), 'image/jpeg')
  assert.equal(imageMediaType('board.PNG'), 'image/png')
})

test('a document is not an image', () => {
  assert.equal(imageMediaType('quiz.docx'), null)
  assert.equal(imageMediaType('scan.pdf'), null)
})

test('a name that merely mentions a format is not one', () => {
  // "png" in the middle of a name, and no extension at all.
  assert.equal(imageMediaType('notes-about-png-files.txt'), null)
  assert.equal(imageMediaType('jpg'), null)
})
