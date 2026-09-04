// Curated subset of Deepgram Aura-2's 36 English voices — Deepgram bills
// Aura-2 at one flat per-character rate regardless of which voice is
// selected, so this is a UX choice (avoid dumping the full catalog on a
// teacher), not a cost one. Add to this list freely; removing a value that
// a teacher already has stored as their preference just falls back to the
// default at the application layer, never a hard error.
export const TALK_VOICES = ['thalia', 'andromeda', 'helena', 'apollo', 'arcas', 'aries'] as const

export type TalkVoice = (typeof TALK_VOICES)[number]

export const DEFAULT_TALK_VOICE: TalkVoice = 'thalia'

export function isValidTalkVoice(value: unknown): value is TalkVoice {
  return typeof value === 'string' && (TALK_VOICES as readonly string[]).includes(value)
}
