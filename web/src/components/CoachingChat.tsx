import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../lib/api'
import { useSimulatedProgress } from '../hooks/useSimulatedProgress'
import { ProgressRing } from './ProgressRing'

// Shared follow-up chat thread for the one-shot feedback surfaces (Practice,
// Debrief, Difficult Conversations, Parent Messages). Visually mirrors
// Audio Coaching's Reflect tab, built fresh rather than extracted from it so
// that already-shipped, working code stays untouched.
//
// Unlike Reflect, there's no "Start" state here — these features are always
// seeded with a real submission + first reply before this ever renders, so
// it's always ready for the next message.
export default function CoachingChat({
  messages,
  sending,
  error,
  draft,
  onDraftChange,
  onSend,
  disabled,
  disabledMessage,
  placeholder = 'Ask a follow-up...',
}: {
  messages: ChatMessage[]
  sending: boolean
  error: string | null
  draft: string
  onDraftChange: (v: string) => void
  onSend: () => void
  disabled?: boolean
  disabledMessage?: string
  placeholder?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const thinkingProgress = useSimulatedProgress(sending, 8000)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, sending])

  return (
    <div className="flex flex-col rounded-2xl border border-hairline bg-cream-card">
      {/* The thread also opens while the very first follow-up is sending —
          otherwise that first wait showed nothing at all (the draft clears
          and no message exists yet), which read as a frozen screen. */}
      {(messages.length > 0 || sending) && (
        <div ref={scrollRef} className="flex max-h-80 flex-col gap-3 overflow-y-auto p-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === 'user'
                  ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-terracotta px-4 py-2.5 text-sm text-cream'
                  : 'max-w-[85%] rounded-2xl rounded-bl-sm border border-hairline bg-cream px-4 py-2.5 text-sm whitespace-pre-wrap text-ink'
              }
            >
              {m.text}
            </div>
          ))}
          {sending && (
            <div className="flex max-w-[85%] items-center gap-3 rounded-2xl rounded-bl-sm border border-hairline bg-cream px-3 py-2 text-sm text-ink-soft">
              <span className="text-forest">
                <ProgressRing progress={thinkingProgress} size={40} />
              </span>
              Wivoza is thinking…
            </div>
          )}
        </div>
      )}

      {error && <p className="border-t border-hairline px-4 py-2 text-sm text-terracotta-600">{error}</p>}

      <form
        className={messages.length > 0 || sending ? 'border-t border-hairline p-4' : 'p-4'}
        onSubmit={(e) => {
          e.preventDefault()
          onSend()
        }}
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder={placeholder}
            disabled={sending || disabled}
            className="flex-1 rounded-lg border border-hairline bg-cream px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || disabled || !draft.trim()}
            className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
          >
            Send
          </button>
        </div>
        {disabled && disabledMessage && <p className="mt-2 text-xs text-ink-soft">{disabledMessage}</p>}
      </form>
    </div>
  )
}
