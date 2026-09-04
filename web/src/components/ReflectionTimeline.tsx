import { useState } from 'react'

export default function ReflectionTimeline({
  triedAt,
  reflectionNote,
  onMarkTried,
  onSaveReflection,
}: {
  triedAt: string | null
  reflectionNote: string | null
  onMarkTried: () => void
  onSaveReflection: (note: string) => void
}) {
  const [draft, setDraft] = useState(reflectionNote ?? '')
  const [editing, setEditing] = useState(false)

  function handleSave() {
    const trimmed = draft.trim()
    if (!trimmed) return
    onSaveReflection(trimmed)
    setEditing(false)
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Reflection</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-brand-600">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          Practiced
        </span>
        {triedAt ? (
          <span className="flex items-center gap-1.5 font-medium text-brand-600">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            Tried in class
          </span>
        ) : (
          <button
            type="button"
            onClick={onMarkTried}
            className="flex items-center gap-1.5 font-medium text-ink-soft hover:text-brand-600"
          >
            <span className="h-1.5 w-1.5 rounded-full border border-ink-soft" />
            Mark as tried
          </button>
        )}
      </div>
      {reflectionNote && !editing ? (
        <div>
          <p className="text-sm whitespace-pre-wrap text-ink">{reflectionNote}</p>
          <button
            type="button"
            onClick={() => {
              setDraft(reflectionNote)
              setEditing(true)
            }}
            className="mt-1 text-xs font-medium text-ink-soft hover:text-brand-600"
          >
            Edit reflection
          </button>
        </div>
      ) : triedAt ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-ink-soft">What happened when you tried it?</p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="A quick note for yourself..."
            className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!draft.trim()}
            className="self-start rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
          >
            Save reflection
          </button>
        </div>
      ) : null}
    </div>
  )
}
