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

// The name is not the format. The iOS app writes a picked photo to
// "assignment-photo.jpg" and posts the bytes it was handed — and an
// iPhone's own photos are HEIC, so that name is a lie it doesn't know
// it's telling.

import { readFileSync } from 'node:fs'
import { sniffImage } from './imageText.ts'

function iso(brand: string): Buffer {
  const b = Buffer.alloc(16)
  b.write('ftyp', 4, 'latin1')
  b.write(brand, 8, 'latin1')
  return b
}

test('a real JPEG is recognised from its bytes', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
  assert.equal(sniffImage(jpeg), 'image/jpeg')
})

test('a PNG is too', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)])
  assert.equal(sniffImage(png), 'image/png')
})

test("an iPhone photo named .jpg is caught as HEIC", () => {
  for (const brand of ['heic', 'heix', 'mif1']) {
    assert.equal(sniffImage(iso(brand)), 'heic', `${brand} should be caught`)
  }
})

test('an mp4 is not mistaken for a photo', () => {
  assert.equal(sniffImage(iso('isom')), null)
})

test('something too short to identify is not guessed at', () => {
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8])), null)
})
