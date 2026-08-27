import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../lib/api'

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, sending])

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface">
      {messages.length > 0 && (
        <div ref={scrollRef} className="flex max-h-80 flex-col gap-3 overflow-y-auto p-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === 'user'
                  ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brand-500 px-4 py-2.5 text-sm text-white'
                  : 'max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-canvas px-4 py-2.5 text-sm whitespace-pre-wrap text-ink'
              }
            >
              {m.text}
            </div>
          ))}
          {sending && (
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-canvas px-4 py-2.5 text-sm text-ink-soft">
              Thinking...
            </div>
          )}
        </div>
      )}

      {error && <p className="border-t border-border px-4 py-2 text-sm text-warm-500">{error}</p>}

      <form
        className={messages.length > 0 ? 'border-t border-border p-4' : 'p-4'}
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
            className="flex-1 rounded-lg border border-border bg-canvas px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || disabled || !draft.trim()}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            Send
          </button>
        </div>
        {disabled && disabledMessage && <p className="mt-2 text-xs text-ink-soft">{disabledMessage}</p>}
      </form>
    </div>
  )
}
