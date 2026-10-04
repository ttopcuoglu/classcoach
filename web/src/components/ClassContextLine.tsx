import { useEffect, useState } from 'react'
import {
  createClassProfile,
  getClassProfiles,
  updateClassProfile,
  type ClassContext,
  type ClassContextInput,
} from '../lib/api'
import {
  CLASS_MAKEUP,
  COURSE_LEVEL_BLURB,
  GRADE_BANDS,
  OTHER_COURSE,
  OTHER_SUBJECT,
  SUBJECTS,
  courseLevelsFor,
  coursesFor,
} from '../lib/teachingContext'

// The teacher's class context, as one line with a [Change] beside it:
//
//     YOUR CLASS   Grades 9–12 · Biology · Honors · ELs in the room   [Change]
//
// This replaces the five-field panel that every surface used to carry (see
// TeachingContextFields, which this will retire once Practice moves). The
// fields themselves have not changed and neither has the chip styling — only
// where a teacher answers them, and how often.
//
// Two rules from the brief are enforced here rather than left to callers:
//
//   * Nothing blocks on missing context. A teacher with no prep sees an
//     invitation, never an error, and every surface renders normally around
//     it. `onChange` fires with null in that state so a caller knows there is
//     no room yet and can carry on without one.
//   * An inferred prep is a guess until the teacher agrees. A row that still
//     needs confirming shows the reversible strip rather than presenting
//     itself as fact.

export default function ClassContextLine({
  onChange,
  compact,
}: {
  /// Fires with the default prep whenever it loads or changes, and with null
  /// when the teacher has none. Never withheld — a caller must be able to
  /// proceed without a room.
  onChange?: (prep: ClassContext | null) => void
  /// Drops the "YOUR CLASS" label, for places that already have a heading.
  compact?: boolean
}) {
  const [preps, setPreps] = useState<ClassContext[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = preps?.find((p) => p.isDefault) ?? preps?.[0] ?? null

  useEffect(() => {
    getClassProfiles()
      .then((loaded) => {
        setPreps(loaded)
        onChange?.(loaded.find((p) => p.isDefault) ?? loaded[0] ?? null)
      })
      // A failed load must not take the surface down with it — the teacher
      // carries on with no room, exactly as a teacher who never set one does.
      .catch(() => setPreps([]))
    // Loaded once per mount, like every other past-items fetch in this app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyUpdated(next: ClassContext[]) {
    setPreps(next)
    onChange?.(next.find((p) => p.isDefault) ?? next[0] ?? null)
  }

  async function save(input: ClassContextInput) {
    setSaving(true)
    setError(null)
    try {
      if (current) {
        const updated = await updateClassProfile(current.id, { ...input, confirm: true })
        applyUpdated((preps ?? []).map((p) => (p.id === updated.id ? stripPrevious(updated) : p)))
      } else {
        const created = await createClassProfile({ ...input, isDefault: true })
        applyUpdated([...(preps ?? []), created])
      }
      setEditing(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  /// Marks the stored guess as agreed to, without changing a field.
  async function confirm() {
    if (!current) return
    try {
      const updated = await updateClassProfile(current.id, { confirm: true })
      applyUpdated((preps ?? []).map((p) => (p.id === updated.id ? stripPrevious(updated) : p)))
    } catch {
      // Confirming is a convenience, not a gate — a failure leaves the strip
      // up and the teacher can tap Change instead.
    }
  }

  if (preps == null) {
    return <div className="h-5 w-64 animate-pulse rounded bg-hairline" aria-hidden="true" />
  }

  if (editing) {
    return (
      <ClassContextEditor
        initial={current}
        saving={saving}
        error={error}
        onCancel={() => {
          setEditing(false)
          setError(null)
        }}
        onSave={save}
      />
    )
  }

  // No prep at all. An invitation, not an empty state and not a warning —
  // this is a normal condition for a brand-new account.
  if (!current) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {!compact && <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Your class</span>}
        <span className="text-ink-soft">Not set yet — coaching still works without it.</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="font-semibold text-terracotta-600 underline decoration-hairline underline-offset-4 hover:text-terracotta"
        >
          Add your class
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        {!compact && <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Your class</span>}
        <span className="flex-1 font-medium text-ink">{current.line}</span>
        {/* A button rather than an underlined link: this sits inside a tinted
            strip on three surfaces now, and a text link in a filled box reads
            as part of the sentence rather than as the way to change it. */}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-full border border-hairline bg-cream-card px-4 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-terracotta/50 hover:text-terracotta-600"
        >
          Change
        </button>
      </div>

      {/* The reversible confirmation. An inferred row was never agreed to by
          anyone, and a new school year invalidates last year's agreement, so
          both get the same strip rather than being silently treated as fact. */}
      {current.needsConfirmation && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gold-tint/60 px-3 py-2 text-xs">
          <span className="text-ink">
            {current.inferred && !current.confirmed
              ? 'Saved to your class from what you had already told us — not quite?'
              : "Still your class this year — not quite?"}
          </span>
          <button type="button" onClick={() => setEditing(true)} className="font-semibold text-terracotta-600 hover:text-terracotta">
            Change it
          </button>
          <span aria-hidden="true" className="text-ink-soft">
            ·
          </span>
          <button type="button" onClick={confirm} className="font-semibold text-forest hover:underline">
            That's right
          </button>
        </div>
      )}
    </div>
  )
}

function stripPrevious(updated: ClassContext & { previous?: ClassContext }): ClassContext {
  const { previous: _previous, ...rest } = updated
  return rest
}

/// The five fields, in the band → subject → course → level → who's-in-the-room
/// order they narrow each other. Same chips as TeachingContextFields, on the
/// light card rather than the dark stage.
export function ClassContextEditor({
  initial,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initial: ClassContext | null
  saving?: boolean
  error?: string | null
  onSave: (input: ClassContextInput) => void
  onCancel: () => void
}) {
  const [gradeBand, setGradeBand] = useState(initial?.gradeBand ?? '6-8')
  const [subject, setSubject] = useState<string | undefined>(initial?.subject ?? undefined)
  const [otherSubject, setOtherSubject] = useState(
    !!initial?.subject && !(SUBJECTS as readonly string[]).includes(initial.subject),
  )
  const [course, setCourse] = useState<string | undefined>(initial?.course ?? undefined)
  const [otherCourse, setOtherCourse] = useState(false)
  const [courseLevel, setCourseLevel] = useState<string | undefined>(initial?.courseLevel ?? undefined)
  const [classMakeup, setClassMakeup] = useState<string[]>(initial?.classMakeup ?? [])
  const [label, setLabel] = useState(initial?.label ?? '')

  const courses = coursesFor(gradeBand, otherSubject ? undefined : subject)
  const levels = courseLevelsFor(gradeBand)

  const chip = (selected: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
      selected ? 'bg-forest text-cream' : 'bg-cream text-ink-soft hover:text-ink'
    }`

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-hairline bg-cream-card p-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Grade band</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {GRADE_BANDS.map((band) => (
            <button
              key={band}
              type="button"
              // A course list is band-specific, so changing band drops the
              // course, and a level the new band does not offer goes with it
              // (AP does not exist below 9-12). Same rules as the panel this
              // replaces.
              onClick={() => {
                setGradeBand(band)
                setCourse(undefined)
                setOtherCourse(false)
                if (!courseLevelsFor(band).includes(courseLevel ?? '')) setCourseLevel(undefined)
              }}
              aria-pressed={gradeBand === band}
              className={chip(gradeBand === band)}
            >
              Grades {band}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Subject</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {SUBJECTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSubject(s)
                setOtherSubject(false)
                setCourse(undefined)
                setOtherCourse(false)
              }}
              aria-pressed={subject === s && !otherSubject}
              className={chip(subject === s && !otherSubject)}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setOtherSubject(true)
              setSubject('')
              setCourse(undefined)
            }}
            aria-pressed={otherSubject}
            className={chip(otherSubject)}
          >
            {OTHER_SUBJECT}
          </button>
          {otherSubject && (
            <input
              value={subject ?? ''}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What do you teach?"
              className="w-44 rounded-lg border border-hairline bg-cream px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-soft/70"
            />
          )}
        </div>
      </div>

      {/* Only departmentalised bands have courses to name — in K-5 one teacher
          owns every subject and there is nothing to disambiguate. */}
      {courses.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Course</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {courses.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCourse(c)
                  setOtherCourse(false)
                }}
                aria-pressed={course === c && !otherCourse}
                className={chip(course === c && !otherCourse)}
              >
                {c}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setOtherCourse(true)
                setCourse('')
              }}
              aria-pressed={otherCourse}
              className={chip(otherCourse)}
            >
              {OTHER_COURSE}
            </button>
            {otherCourse && (
              <input
                value={course ?? ''}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="What's it called here?"
                className="w-44 rounded-lg border border-hairline bg-cream px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-soft/70"
              />
            )}
          </div>
        </div>
      )}

      {levels.length > 1 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Level</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {levels.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setCourseLevel(courseLevel === l ? undefined : l)}
                aria-pressed={courseLevel === l}
                className={chip(courseLevel === l)}
              >
                {l}
              </button>
            ))}
          </div>
          {courseLevel && COURSE_LEVEL_BLURB[courseLevel] && (
            <p className="mt-1.5 text-xs text-ink-soft">{COURSE_LEVEL_BLURB[courseLevel]}</p>
          )}
        </div>
      )}

      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Who's in the room</p>
        {/* Multi-select, and kept apart from the level: a co-taught Algebra 1
            with fourteen English learners is Regular AND inclusion AND ESL. */}
        <div className="mt-1.5 flex flex-wrap gap-2">
          {CLASS_MAKEUP.map(({ value, label: makeupLabel }) => {
            const on = classMakeup.includes(value)
            return (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setClassMakeup(on ? classMakeup.filter((m) => m !== value) : [...classMakeup, value])
                }
                aria-pressed={on}
                className={chip(on)}
              >
                {makeupLabel}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
          Name it <span className="font-normal normal-case tracking-normal text-ink-soft">(optional)</span>
        </p>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="3rd period Bio"
          className="mt-1.5 w-full max-w-xs rounded-lg border border-hairline bg-cream px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft/70"
        />
      </div>

      {error && <p className="text-xs text-terracotta-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onSave({
              label: label.trim() || null,
              gradeBand,
              subject: subject?.trim() || null,
              course: course?.trim() || null,
              courseLevel: courseLevel ?? null,
              classMakeup,
            })
          }
          className="rounded-full bg-terracotta px-5 py-2 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm font-medium text-ink-soft hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  )
}
