import { useEffect, useState } from 'react'
import {
  archiveCoachingPriority,
  createCoachingPriority,
  draftCoachingPriority,
  getCoachingPriorities,
  publishCoachingPriority,
  updateCoachingPriority,
  type AdminOverview,
  type GuidanceFields,
  type Organization,
  type SchoolPriority,
  type SchoolPriorityEdit,
} from '../lib/api'
import { CheckIcon, LockIcon } from './icons'

// Coaching Priorities, the admin side (docs/coaching-priorities.md). An admin
// shares up to two focus areas as coaching guidance; each teacher decides
// privately whether Wivoza brings one into their coaching. Nothing on this
// screen says who chose it — the server never sends that, and this screen
// says so.

const FIELDS: { key: keyof GuidanceFields; label: string; hint: string; max: number; rows: number }[] = [
  { key: 'name', label: 'Name', hint: '', max: 60, rows: 1 },
  { key: 'purpose', label: 'Purpose', hint: 'What it is for, in a sentence or two.', max: 400, rows: 2 },
  { key: 'looksLike', label: 'What it looks like', hint: 'What it looks and sounds like in a classroom.', max: 600, rows: 3 },
  { key: 'whenItFits', label: 'When it fits', hint: 'Lessons or moments where it helps.', max: 600, rows: 3 },
  { key: 'ideas', label: 'Ideas teachers could consider', hint: 'Small things a teacher could try.', max: 600, rows: 3 },
  { key: 'whenNotToUse', label: 'When it may not fit', hint: 'Be honest: when is it the wrong tool?', max: 600, rows: 3 },
]

const EMPTY: GuidanceFields = { name: '', purpose: '', looksLike: '', whenItFits: '', ideas: '', whenNotToUse: '' }

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

function formatDay(iso: string | null): string {
  if (!iso) return ''
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function CoachingPrioritiesPanel({
  selectedOrgId,
  onOrgChange,
  orgs,
  isSuperadmin,
  overview,
}: {
  selectedOrgId: string
  onOrgChange: (id: string) => void
  orgs: Organization[]
  isSuperadmin: boolean
  overview: AdminOverview | null
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-forest md:text-[34px]">
            Coaching Priorities<span className="text-gold">.</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Share up to two focus areas with your staff. Each teacher decides whether Wivoza brings one into their own
            coaching, and nobody is signed up for them.
          </p>
        </div>
        {isSuperadmin && orgs.length > 0 && (
          <select
            value={selectedOrgId}
            onChange={(e) => onOrgChange(e.target.value)}
            className="rounded-xl border border-hairline bg-cream px-3 py-1.5 text-sm text-ink focus:border-terracotta focus:outline-none"
          >
            <option value="">Select an organization</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {!overview ? (
        <p className="text-sm text-ink-soft">Loading...</p>
      ) : overview.scope === 'organization' ? (
        <CoachingPrioritiesContent organizationId={selectedOrgId || undefined} />
      ) : isSuperadmin && orgs.length === 0 ? (
        <p className="text-sm text-ink-soft">A priority needs a concrete school. Create an organization first under Organizations.</p>
      ) : (
        <p className="text-sm text-ink-soft">Select an organization above to set its coaching priorities.</p>
      )}
    </div>
  )
}

function CoachingPrioritiesContent({ organizationId }: { organizationId?: string }) {
  const [items, setItems] = useState<SchoolPriority[]>([])
  const [maxActive, setMaxActive] = useState(2)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<SchoolPriority | 'new' | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function refresh() {
    setLoading(true)
    getCoachingPriorities(organizationId)
      .then((data) => {
        setItems(data.items)
        setMaxActive(data.maxActive)
      })
      .catch(() => setError('Could not load coaching priorities.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId])

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id)
    setError(null)
    try {
      await action()
      refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p className="text-sm text-ink-soft">Loading...</p>

  const open = items.filter((i) => i.status !== 'archived')
  const archived = items.filter((i) => i.status === 'archived')

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-terracotta-600">{error}</p>}

      {editing ? (
        <PriorityEditor
          existing={editing === 'new' ? null : editing}
          organizationId={organizationId}
          onDone={() => {
            setEditing(null)
            refresh()
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {open.map((p, i) => (
              <div key={p.id} className="flex flex-col gap-3 rounded-3xl border border-hairline bg-cream-card p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-terracotta-strong font-heading font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-heading text-lg font-bold leading-tight text-forest">{p.name}</p>
                    <p className="text-xs text-ink-soft">
                      {p.status === 'active' ? 'Shared with teachers' : 'Draft · not shared yet'}
                      {p.startsOn || p.endsOn ? ` · ${formatDay(p.startsOn)} – ${formatDay(p.endsOn)}` : ''}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-ink">{p.purpose}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(p)}
                    className="min-h-[40px] rounded-full border border-hairline px-4 text-sm font-semibold text-ink hover:border-forest/40"
                  >
                    Edit
                  </button>
                  {p.status === 'draft' && (
                    <button
                      type="button"
                      disabled={busyId === p.id}
                      onClick={() => run(p.id, () => publishCoachingPriority(p.id, organizationId))}
                      className="min-h-[40px] rounded-full bg-terracotta-strong px-4 text-sm font-bold text-white disabled:opacity-60"
                    >
                      Share with teachers
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => {
                      if (window.confirm(`Archive ${p.name}? It stops coming up in coaching for every teacher from now on.`)) {
                        run(p.id, () => archiveCoachingPriority(p.id, organizationId))
                      }
                    }}
                    className="min-h-[40px] rounded-full px-3 text-sm font-semibold text-ink-soft hover:text-terracotta-600 disabled:opacity-60"
                  >
                    Archive
                  </button>
                </div>
              </div>
            ))}
            {open.length < maxActive && (
              <button
                type="button"
                onClick={() => setEditing('new')}
                className="flex min-h-[120px] items-center justify-center rounded-3xl border-2 border-dashed border-hairline p-5 text-sm font-semibold text-ink-soft hover:border-forest/40 hover:text-forest"
              >
                {open.length === 0 ? 'Set your first coaching priority' : 'Add a second priority (optional)'}
              </button>
            )}
          </div>
          {open.length >= maxActive && (
            <p className="text-xs text-ink-soft">A school can have {maxActive} priorities at a time. Archive one to add another.</p>
          )}
        </>
      )}

      <PrivacyBox />

      {archived.length > 0 && (
        <details className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Show {archived.length} archived
          </summary>
          <div className="mt-3 flex flex-col">
            {archived.map((p) => (
              <div key={p.id} className="border-b border-hairline/60 py-2.5 text-sm last:border-0">
                <p className="font-medium text-ink">{p.name}</p>
                <p className="mt-0.5 text-xs text-ink-soft">{p.purpose}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function PrivacyBox() {
  return (
    <section aria-labelledby="cp-privacy" className="rounded-3xl bg-forest p-6 text-cream">
      <h2 id="cp-privacy" className="flex items-center gap-2 font-heading text-lg font-bold">
        <LockIcon className="h-4 w-4" />
        What you will and won&rsquo;t see
      </h2>
      <div className="mt-3 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gold">You will see</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-cream/90">
            <li>Each priority, exactly as teachers see it.</li>
            <li>The staff-wide lesson numbers you already have in Coaching Insights.</li>
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gold">You won&rsquo;t see</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-cream/90">
            <li>Who turned a priority on, paused it or said no, or how many did.</li>
            <li>Any teacher&rsquo;s recordings, reports, plans or conversations.</li>
            <li>Whether anyone used a suggestion.</li>
          </ul>
        </div>
      </div>
      <p className="mt-4 rounded-2xl bg-forest-soft px-4 py-3 text-sm text-cream">
        Teachers choose privately. Please don&rsquo;t ask who has it on: a choice people are asked about stops being a
        free one.
      </p>
    </section>
  )
}

function PriorityEditor({
  existing,
  organizationId,
  onDone,
  onCancel,
}: {
  existing: SchoolPriority | null
  organizationId?: string
  onDone: () => void
  onCancel: () => void
}) {
  const [ownWords, setOwnWords] = useState('')
  const [fields, setFields] = useState<GuidanceFields>(
    existing
      ? {
          name: existing.name,
          purpose: existing.purpose,
          looksLike: existing.looksLike,
          whenItFits: existing.whenItFits,
          ideas: existing.ideas,
          whenNotToUse: existing.whenNotToUse,
        }
      : EMPTY,
  )
  const [startsOn, setStartsOn] = useState(day(existing?.startsOn ?? null))
  const [endsOn, setEndsOn] = useState(day(existing?.endsOn ?? null))
  const [change, setChange] = useState<'wording' | 'meaning' | null>(null)
  const [changeNote, setChangeNote] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const isActive = existing?.status === 'active'
  const complete = FIELDS.every((f) => fields[f.key].trim())

  async function handleDraft() {
    setDrafting(true)
    setMessage(null)
    try {
      const { draft, warning } = await draftCoachingPriority(ownWords, organizationId)
      setFields((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(draft).filter(([, v]) => v)) }))
      setMessage(warning ? `Drafted. One thing to fix before you save: ${warning}` : 'Drafted below. Change anything before you save it.')
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setDrafting(false)
    }
  }

  async function handleSave(andShare: boolean) {
    setSaving(true)
    setMessage(null)
    const body: SchoolPriorityEdit = { ...fields, startsOn: startsOn || null, endsOn: endsOn || null }
    if (isActive) {
      if (!change) {
        setMessage('Say whether this edit is wording only or changes what it means.')
        setSaving(false)
        return
      }
      body.change = change
      if (change === 'meaning') body.changeNote = changeNote
    }
    try {
      const saved = existing
        ? await updateCoachingPriority(existing.id, body, organizationId)
        : await createCoachingPriority(body, organizationId)
      if (andShare && saved.status === 'draft') await publishCoachingPriority(saved.id, organizationId)
      onDone()
    } catch (err) {
      setMessage((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {!existing && (
        <section className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
          <h2 className="font-heading text-lg font-bold text-forest">Describe it in your own words</h2>
          <p className="mt-0.5 text-sm text-ink-soft">A few sentences is enough. Wivoza turns them into coaching guidance you can edit.</p>
          <label htmlFor="cp-own" className="mt-3 block text-sm font-semibold text-ink">
            What is the school working on, and why?
          </label>
          <textarea
            id="cp-own"
            rows={4}
            value={ownWords}
            maxLength={1500}
            onChange={(e) => setOwnWords(e.target.value)}
            placeholder="Our school is focusing on academic discussions this year. We want students to explain their reasoning, build on classmates' ideas, and respectfully challenge claims."
            className="mt-1.5 w-full rounded-2xl border border-hairline bg-cream px-4 py-3 text-sm text-ink focus:border-terracotta focus:outline-none"
          />
          <button
            type="button"
            disabled={drafting || !ownWords.trim()}
            onClick={handleDraft}
            className="mt-3 min-h-[44px] rounded-full bg-forest px-5 text-sm font-semibold text-cream disabled:opacity-60"
          >
            {drafting ? 'Writing…' : 'Help me write this'}
          </button>
        </section>
      )}

      <section className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
        <h2 className="font-heading text-lg font-bold text-forest">Coaching guidance</h2>
        <p className="mt-0.5 text-sm text-ink-soft">This is what Wivoza works from, and what teachers read before they choose.</p>
        <div className="mt-4 grid gap-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label htmlFor={`cp-${f.key}`} className="block text-sm font-semibold text-ink">
                {f.label}
              </label>
              {f.hint && <p className="text-xs text-ink-soft">{f.hint}</p>}
              {f.rows === 1 ? (
                <input
                  id={`cp-${f.key}`}
                  value={fields[f.key]}
                  maxLength={f.max}
                  onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-hairline bg-cream px-3 text-sm text-ink focus:border-terracotta focus:outline-none"
                />
              ) : (
                <textarea
                  id={`cp-${f.key}`}
                  rows={f.rows}
                  value={fields[f.key]}
                  maxLength={f.max}
                  onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-hairline bg-cream px-3 py-2 text-sm text-ink focus:border-terracotta focus:outline-none"
                />
              )}
            </div>
          ))}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cp-start" className="block text-sm font-semibold text-ink">
                From (optional)
              </label>
              <input
                id="cp-start"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-hairline bg-cream px-3 text-sm text-ink"
              />
            </div>
            <div>
              <label htmlFor="cp-end" className="block text-sm font-semibold text-ink">
                Until (optional)
              </label>
              <input
                id="cp-end"
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-hairline bg-cream px-3 text-sm text-ink"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-mint-tint p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-forest">Where Wivoza can use this</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink">
            <li className="flex items-center gap-2">
              <CheckIcon className="h-4 w-4 text-forest" /> Planning Coach, when a teacher builds a lesson
            </li>
            <li className="flex items-center gap-2">
              <CheckIcon className="h-4 w-4 text-forest" /> Talk It Through, when it fits what a teacher brings
            </li>
          </ul>
          <p className="mt-2 text-xs text-ink">
            Lesson Debrief comes later. Wivoza offers at most one idea at a time, only when it fits, and always labels it.
          </p>
        </div>
      </section>

      {isActive && (
        <fieldset className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
          <legend className="px-1 font-heading text-lg font-bold text-forest">What kind of edit is this?</legend>
          <label className="mt-2 flex items-start gap-3 text-sm">
            <input type="radio" name="cp-change" checked={change === 'wording'} onChange={() => setChange('wording')} className="mt-1" />
            <span>
              <strong className="text-ink">Wording only.</strong>{' '}
              <span className="text-ink-soft">Clearer words, same meaning. Teachers who have it on keep it on.</span>
            </span>
          </label>
          <label className="mt-3 flex items-start gap-3 text-sm">
            <input type="radio" name="cp-change" checked={change === 'meaning'} onChange={() => setChange('meaning')} className="mt-1" />
            <span>
              <strong className="text-ink">Changed what it means.</strong>{' '}
              <span className="text-ink-soft">It switches off for every teacher until they choose again, with your note.</span>
            </span>
          </label>
          {change === 'meaning' && (
            <div className="mt-3">
              <label htmlFor="cp-note" className="block text-sm font-semibold text-ink">
                A note for teachers: what changed?
              </label>
              <textarea
                id="cp-note"
                rows={2}
                maxLength={300}
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-hairline bg-cream px-3 py-2 text-sm text-ink focus:border-terracotta focus:outline-none"
              />
            </div>
          )}
        </fieldset>
      )}

      {message && (
        <p role="status" className="text-sm text-ink">
          {message}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className="min-h-[44px] rounded-full px-4 text-sm font-semibold text-ink-soft hover:text-ink">
          Cancel
        </button>
        {!isActive && (
          <button
            type="button"
            disabled={saving || !complete}
            onClick={() => handleSave(false)}
            className="min-h-[44px] rounded-full border-[1.5px] border-forest px-5 text-sm font-semibold text-forest disabled:opacity-50"
          >
            Save as draft
          </button>
        )}
        <button
          type="button"
          disabled={saving || !complete}
          onClick={() => handleSave(!isActive)}
          className="min-h-[44px] rounded-full bg-terracotta-strong px-5 text-sm font-bold text-white disabled:opacity-50"
        >
          {isActive ? 'Save changes' : 'Share with teachers'}
        </button>
      </div>
    </div>
  )
}
