import { useState } from 'react'
import {
  createClassProfile,
  updateClassProfile,
  type ClassContext,
  type ClassContextInput,
} from '../lib/api'
import { nextClassContextQuestion, type ClassContextField } from '../lib/classContextQuestion'

// The one question a coach may ask inline, mid-conversation, when it needs
// something about the room that it does not know — and the reversible
// confirmation that follows an answer.
//
// Renders as a row of chips inside the conversation rather than as a form or a
// modal, because it is part of what the coach is saying. It is never a gate:
// a teacher who ignores it entirely loses nothing, the coach carries on
// without the answer, and nothing about the surrounding action is disabled
// while it sits there.
//
// After an answer it does not disappear silently. "Saved to your class — not
// quite?" stays up with a real Undo, because this writes to the teacher's
// profile from one tap made in the middle of talking about something else —
// the most likely place for a mis-tap in the whole app, and the least likely
// place for someone to go hunting for where it got saved.

export default function ClassContextQuestion({
  prep,
  needs,
  onSaved,
}: {
  /// The teacher's default prep, or null if they have none yet.
  prep: ClassContext | null
  /// What the coach actually needs for the work in front of it. A topic that
  /// does not care about subject must not pass 'subject'.
  needs: readonly ClassContextField[]
  /// Fires with the prep as it now stands, so the caller can keep its own copy
  /// in step. Also fires on undo, with the restored version.
  onSaved: (prep: ClassContext) => void
}) {
  const [saved, setSaved] = useState<{ current: ClassContext; previous: ClassContext | null } | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const question = nextClassContextQuestion(prep, needs)

  // Nothing worth asking is the common case, and it renders as nothing at all
  // rather than as an empty row.
  if (dismissed) return null
  if (!question && !saved) return null

  async function answer(values: string[]) {
    if (!question || values.length === 0) return
    setBusy(true)
    try {
      const patch: Partial<ClassContextInput> =
        question.field === 'classMakeup' ? { classMakeup: values } : { [question.field]: values[0] }

      if (prep) {
        const updated = await updateClassProfile(prep.id, { ...patch, confirm: true })
        const { previous, ...current } = updated
        setSaved({ current, previous })
        onSaved(current)
      } else {
        // No prep at all, so the answer creates one. A band is required to
        // create, and the question order guarantees it is the first thing
        // asked — but a caller that only needs, say, the subject could get
        // here without one, and a wrong band would be worse than no prep.
        if (question.field !== 'gradeBand') {
          setDismissed(true)
          return
        }
        const created = await createClassProfile({ gradeBand: values[0], isDefault: true })
        setSaved({ current: created, previous: null })
        onSaved(created)
      }
    } catch {
      // A failed save is not worth interrupting a conversation over. The
      // question goes away; the coach proceeds without the answer, which it
      // was always able to do.
      setDismissed(true)
    } finally {
      setBusy(false)
    }
  }

  /// Puts back exactly what was there before this one tap. A prep that did not
  /// exist before cannot be restored to anything, so it is deleted instead —
  /// handled by the caller's list refresh via onSaved.
  async function undo() {
    if (!saved) return
    setBusy(true)
    try {
      if (saved.previous) {
        const restored = await updateClassProfile(saved.previous.id, {
          label: saved.previous.label,
          gradeBand: saved.previous.gradeBand,
          subject: saved.previous.subject,
          course: saved.previous.course,
          courseLevel: saved.previous.courseLevel,
          classMakeup: saved.previous.classMakeup,
        })
        const { previous: _previous, ...current } = restored
        onSaved(current)
      }
      // Either way the strip goes: the teacher has said this was wrong, and
      // re-asking the same question immediately would be worse than leaving
      // the coach without the answer.
      setDismissed(true)
    } catch {
      setDismissed(true)
    } finally {
      setBusy(false)
    }
  }

  if (saved) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gold-tint/60 px-3 py-2 text-xs">
        <span className="text-ink">Saved to your class — not quite?</span>
        <button
          type="button"
          disabled={busy}
          onClick={undo}
          className="font-semibold text-terracotta-600 hover:text-terracotta disabled:opacity-60"
        >
          Undo
        </button>
        <span aria-hidden="true" className="text-ink-soft">
          ·
        </span>
        <span className="text-ink-soft">{saved.current.line}</span>
      </div>
    )
  }

  const multi = question!.multi === true

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-hairline bg-cream-card p-3.5">
      <p className="text-sm text-ink">{question!.question}</p>
      <div className="flex flex-wrap gap-2">
        {question!.options.map(({ value, label }) => {
          const on = selected.includes(value)
          return (
            <button
              key={value}
              type="button"
              disabled={busy}
              aria-pressed={multi ? on : undefined}
              onClick={() => {
                if (!multi) {
                  void answer([value])
                  return
                }
                setSelected(on ? selected.filter((v) => v !== value) : [...selected, value])
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                on ? 'bg-forest text-cream' : 'bg-cream text-ink-soft hover:text-ink'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        {/* Multi-select needs a commit step, since "both" and "the first one"
            are different answers and a single tap cannot tell them apart. */}
        {multi && (
          <button
            type="button"
            disabled={busy || selected.length === 0}
            onClick={() => void answer(selected)}
            className="text-xs font-semibold text-terracotta-600 hover:text-terracotta disabled:opacity-40"
          >
            Save
          </button>
        )}
        {/* Always skippable, and skipping costs nothing — the coach was never
            waiting on this. */}
        <button
          type="button"
          disabled={busy}
          onClick={() => setDismissed(true)}
          className="text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-60"
        >
          {multi ? 'Neither' : 'Skip'}
        </button>
      </div>
    </div>
  )
}
