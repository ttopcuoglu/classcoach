// Curated subset of Deepgram Aura-2's 36 English voices — Deepgram bills
// Aura-2 at one flat per-character rate regardless of which voice is
// selected, so this is a UX choice (avoid dumping the full catalog on a
// teacher), not a cost one. Add to this list freely; removing a value that
// a teacher already has stored as their preference just falls back to the
// default at the application layer, never a hard error.
//
// Cut from six to three on request. Teachers who had picked thalia, helena
// or aries keep that string in the column and are served arcas instead —
// isValidTalkVoice guards every read, so nothing has to be migrated. The
// web picker resolves an unlisted value to the default too, otherwise their
// Profile would show no voice selected at all.
export const TALK_VOICES = [
  'harmonia',
  'apollo',
  'arcas',
  'andromeda',
  'hera',
  'cordelia',
  'vesta',
  'luna',
  'orion',
  'pluto',
  'odysseus',
] as const

export type TalkVoice = (typeof TALK_VOICES)[number]

export const DEFAULT_TALK_VOICE: TalkVoice = 'harmonia'

export function isValidTalkVoice(value: unknown): value is TalkVoice {
  return typeof value === 'string' && (TALK_VOICES as readonly string[]).includes(value)
}
