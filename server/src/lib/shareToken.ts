import { randomBytes } from 'node:crypto'

export function generateShareToken(): string {
  return randomBytes(12).toString('base64url')
}
