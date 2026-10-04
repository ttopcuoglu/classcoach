import { useEffect, useState } from 'react'
import { ClassContextEditor } from './ClassContextLine'
import {
  createClassProfile,
  deleteClassProfile,
  getClassProfiles,
  updateClassProfile,
  type ClassContext,
  type ClassContextInput,
} from '../lib/api'

// The teacher's preps, managed in Profile. This is the one place the full list
// is editable; everywhere else shows a single line with a [Change] that opens
// the same editor for the default prep.
//
// A list because most teachers have two or three, and the five-field panel it
// replaces could only ever hold one — so a teacher with an AP Biology section
// and a 9th grade inclusion section had to keep re-answering, or accept that
// coaching was pitched at the wrong one of them.

export default function ClassProfileList() {
  const [preps, setPreps] = useState<ClassContext[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)

  useEffect(() => {
    getClassProfiles()
      .then(setPreps)
      .catch(() => setPreps([]))
  }, [])

  async function handleSave(input: ClassContextInput, id: string | null) {
    setSaving(true)
    setError(null)
    try {
      if (id) {
        const updated = await updateClassProfile(id, { ...input, confirm: true })
        const { previous: _previous, ...current } = updated
        // A newly-promoted default demotes the others, so the whole list is
        // re-read rather than patched in place.
        setPreps(input.isDefault ? await getClassProfiles() : (preps ?? []).map((p) => (p.id === id ? current : p)))
        setEditingId(null)
      } else {
        await createClassProfile(input)
        setPreps(await getClassProfiles())
        setAdding(false)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function makeDefault(id: string) {
    try {
      await updateClassProfile(id, { isDefault: true })
      setPreps(await getClassProfiles())
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function remove(id: string) {
    setConfirmingDelete(null)
    try {
      setPreps(await deleteClassProfile(id))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Body only — Profile owns the card and the numbered section heading, so
  // this stays usable inside any surface that wants the full list.
  return (
    <div className="flex flex-col gap-4">
      {preps == null ? (
        <p className="text-sm text-ink-soft">Loading...</p>
      ) : (
        <div className="flex flex-col gap-3">
          {preps.map((prep) =>
            editingId === prep.id ? (
              <ClassContextEditor
                key={prep.id}
                initial={prep}
                saving={saving}
                error={error}
                onCancel={() => {
                  setEditingId(null)
                  setError(null)
                }}
                onSave={(input) => void handleSave({ ...input, isDefault: prep.isDefault }, prep.id)}
              />
            ) : (
              <div
                key={prep.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl p-4 ${
                  prep.isDefault ? 'bg-mint-tint/50' : 'bg-cream'
                }`}
              >
                <span className="font-medium text-ink">{prep.line}</span>
                {prep.isDefault && (
                  <span className="rounded-full bg-forest px-2 py-0.5 text-[11px] font-semibold text-cream">
                    Default
                  </span>
                )}
                {/* An inferred prep is a guess nobody has agreed to. Saying so
                    is the honest alternative to showing it as fact. */}
                {prep.inferred && !prep.confirmed && (
                  <span className="rounded-full bg-gold-tint px-2 py-0.5 text-[11px] font-semibold text-terracotta-600">
                    Guessed from your profile
                  </span>
                )}
                <div className="ml-auto flex items-center gap-3 text-xs">
                  {!prep.isDefault && (
                    <button
                      type="button"
                      onClick={() => void makeDefault(prep.id)}
                      className="font-semibold text-ink-soft hover:text-ink"
                    >
                      Make default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingId(prep.id)}
                    className="font-semibold text-terracotta-600 hover:text-terracotta"
                  >
                    Change
                  </button>
                  {confirmingDelete === prep.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void remove(prep.id)}
                        className="font-semibold text-terracotta-600 hover:text-terracotta"
                      >
                        Really remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(null)}
                        className="font-medium text-ink-soft hover:text-ink"
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(prep.id)}
                      className="font-medium text-ink-soft hover:text-ink"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ),
          )}

          {preps.length === 0 && !adding && (
            <p className="text-sm text-ink-soft">
              Nothing here yet. Coaching works without it — a class just makes scenarios and reviews land
              somewhere real.
            </p>
          )}

          {adding ? (
            <ClassContextEditor
              initial={null}
              saving={saving}
              error={error}
              onCancel={() => {
                setAdding(false)
                setError(null)
              }}
              onSave={(input) => void handleSave(input, null)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="self-start rounded-full bg-cream px-4 py-2 text-sm font-semibold text-terracotta-600 transition-colors hover:text-terracotta"
            >
              + Add a class
            </button>
          )}

          {error && !editingId && !adding && <p className="text-xs text-terracotta-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
