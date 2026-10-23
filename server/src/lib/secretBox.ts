// Encrypting the Canvas secrets kept in the database: a school's API key
// secret and teachers' Canvas tokens. A copy of the database alone is then
// not a way into anyone's Canvas.
//
// AES-256-GCM. The key is CANVAS_SECRET_KEY when set, otherwise derived from
// JWT_SECRET — so rotating either one means schools re-enter their secret
// and teachers reconnect Canvas, nothing worse.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function key(): Buffer {
  const material = process.env.CANVAS_SECRET_KEY || `wivoza-canvas:${process.env.JWT_SECRET ?? ''}`
  return createHash('sha256').update(material).digest()
}

/// "v1.<iv>.<tag>.<ciphertext>", base64url throughout.
export function seal(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.')
}

/// Null when it cannot be opened — a different key, or tampered with.
export function open(sealed: string): string | null {
  const [version, iv, tag, body] = sealed.split('.')
  if (version !== 'v1' || !iv || !tag || body === undefined) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
