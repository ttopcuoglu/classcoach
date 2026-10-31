// A Speak button that sits inside a text box's bottom-right corner, the way a
// phone's dictation sits in the field it fills — so it is plain which box the
// words go into. Listening, it turns terracotta and says how to stop; the
// box's own border follows (`speakingBoxClass`). The box needs `relative`
// on its wrapper and room at the bottom (`pb-12`) so text never runs under it.

import { MicIcon } from './icons'

/// `place` positions it; the default is a multi-line box's bottom-right corner.
export function SpeakInBox({
  listening,
  onClick,
  disabled,
  place = 'bottom-3 right-5',
}: {
  listening: boolean
  onClick: () => void
  disabled?: boolean
  place?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={listening}
      className={`absolute ${place} flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
        listening
          ? 'border-terracotta bg-peach-tint text-terracotta-600'
          : 'border-forest/30 bg-mint-tint text-forest hover:border-forest'
      }`}
    >
      {listening ? (
        <>
          <span className="h-2 w-2 animate-pulse rounded-full bg-terracotta" aria-hidden />
          Listening — tap to stop
        </>
      ) : (
        <>
          <MicIcon className="h-4 w-4" />
          Speak
        </>
      )}
    </button>
  )
}

/// The box's border while it is the one being spoken into.
export const speakingBoxClass = 'border-terracotta ring-2 ring-terracotta/20'
