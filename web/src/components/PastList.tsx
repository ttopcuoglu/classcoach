import { useState } from 'react'
import { StarIcon } from './icons'

export type PastItem = {
  id: string
  createdAt: string
  label: string | null
  text: string
  saved: boolean
}

const SHOWN_AT_FIRST = 8

function dayLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Everything a teacher has asked or practiced, not just what they starred —
// an answer they forgot to save used to vanish from the page. Tapping a row
// reopens it in full, follow-up conversation included, so it can continue.
export default function PastList({
  title,
  items,
  activeId,
  loading,
  emptyText,
  onOpen,
  onDelete,
}: {
  title: string
  items: PastItem[]
  activeId: string | null
  loading: boolean
  emptyText: string
  onOpen: (id: string) => void
  // Optional: when given, each row gets a Delete button. The caller confirms
  // and does the deleting; this only asks.
  onDelete?: (id: string) => void
}) {
  const [filter, setFilter] = useState<'all' | 'saved'>('all')
  const [showAll, setShowAll] = useState(false)
  const savedCount = items.filter((i) => i.saved).length
  const filtered = filter === 'saved' ? items.filter((i) => i.saved) : items
  const shown = showAll ? filtered : filtered.slice(0, SHOWN_AT_FIRST)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">{title}</h2>
        {items.length > 0 && (
          <div className="flex gap-1 rounded-full bg-cream p-1">
            {(
              [
                ['all', `All · ${items.length}`],
                ['saved', `Saved · ${savedCount}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  filter === key ? 'bg-cream-card text-forest shadow-sm' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">
          {filter === 'saved' && items.length > 0 ? 'Nothing starred yet. Tap "Save for later" to star one.' : emptyText}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {shown.map((item) => (
            // A row is its own element rather than one big button, so Delete
            // can sit inside it without nesting a button in a button.
            <div
              key={item.id}
              className={`group flex items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                item.id === activeId
                  ? 'border-forest bg-mint-tint/40'
                  : 'border-hairline bg-cream-card hover:border-terracotta/40'
              }`}
            >
              <button type="button" onClick={() => onOpen(item.id)} className="min-w-0 flex-1 text-left">
                <p className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                  <span>{dayLabel(item.createdAt)}</span>
                  {item.label && (
                    <span className="rounded-full bg-mint-tint/60 px-2 py-0.5 font-semibold text-forest">{item.label}</span>
                  )}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-ink">{item.text}</p>
              </button>
              {item.saved && <StarIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" filled />}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  aria-label="Delete this conversation"
                  title="Delete this conversation"
                  className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-ink-soft transition-colors hover:bg-peach-tint hover:text-terracotta-600"
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className="mt-0.5 shrink-0 text-xs font-semibold text-forest"
              >
                {item.id === activeId ? 'Open' : 'Open →'}
              </button>
            </div>
          ))}
          {filtered.length > SHOWN_AT_FIRST && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="self-start text-xs font-semibold text-forest hover:text-terracotta-600"
            >
              {showAll ? 'Show fewer' : `Show all ${filtered.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
