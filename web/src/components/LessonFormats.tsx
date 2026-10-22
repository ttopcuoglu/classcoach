import { useEffect, useRef, useState } from 'react'
import {
  createLessonTemplate,
  deleteLessonTemplate,
  getLessonTemplates,
  readLessonTemplate,
  updateLessonTemplate,
  type LessonTemplate,
  type LessonTemplates,
  type TemplateCadence,
  type TemplateSection,
  type TemplateSectionKind,
} from '../lib/api'
import { ArrowUpIcon, CloseIcon, UploadIcon } from './icons'
import Overlay from './Overlay'
import { WorkingRing } from './ProgressRing'
import { Spinner } from './Spinner'

// Lesson plan formats: the school's (managed by its Wivoza admins) and a
// teacher's own. Uploading a form has Wivoza read its sections; nothing is
// saved until the person has checked them here. Used as a dialog from the
// Lesson Workspace and inline on the admin dashboard.

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest'
const OUTLINE_BUTTON = `rounded-full border border-divider bg-white text-forest hover:border-forest/40 hover:bg-cream ${FOCUS}`
const PRIMARY_BUTTON = `rounded-full bg-forest text-cream hover:bg-forest-soft disabled:opacity-60 ${FOCUS}`
const INPUT = 'w-full rounded-lg border border-divider bg-white px-3 py-2 text-sm text-forest focus:border-forest focus:outline-none'

/// The same kinds and order as SECTION_KINDS in server/src/lib/lessonTemplateModel.ts.
const KIND_LABEL: Record<TemplateSectionKind, string> = {
  details: 'Lesson details',
  objective: 'Objective',
  standards: 'Standards',
  essential_question: 'Essential question',
  success_criteria: 'Success criteria',
  vocabulary: 'Vocabulary',
  materials: 'Materials',
  opening: 'Opening / Do Now',
  instruction: 'Instruction (I do)',
  guided_practice: 'Guided practice (we do)',
  independent_practice: 'Independent practice (you do)',
  activities: 'All activities',
  closing: 'Closing',
  checks: 'Checks for understanding',
  assessment: 'Assessment',
  misconceptions: 'Misconceptions',
  differentiation: 'Differentiation',
  exit_ticket: 'Exit ticket',
  homework: 'Homework',
  other: 'Other',
  teacher_fills: 'You fill this in',
}

const ACCEPT = '.docx,.pdf,.txt,.jpg,.jpeg,.png'

type Draft = {
  templateId: string | null
  name: string
  cadence: TemplateCadence
  sections: TemplateSection[]
  scope: 'school' | 'personal'
  sourceFileName: string | null
  note: string | null
}

type View = { kind: 'list' } | { kind: 'reading'; fileName: string } | { kind: 'edit'; draft: Draft }

function nextId(sections: TemplateSection[]): string {
  const taken = new Set(sections.map((s) => s.id))
  for (let n = sections.length + 1; ; n++) if (!taken.has(`s${n}`)) return `s${n}`
}

// ---------------------------------------------------------------------------
// Reviewing and editing a format
// ---------------------------------------------------------------------------

function FormatEditor({
  draft: initial,
  schoolName,
  canManageSchool,
  saving,
  error,
  onSave,
  onCancel,
}: {
  draft: Draft
  schoolName: string | null
  canManageSchool: boolean
  saving: boolean
  error: string | null
  onSave: (draft: Draft) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const setSection = (i: number, patch: Partial<TemplateSection>) =>
    set({ sections: draft.sections.map((s, n) => (n === i ? { ...s, ...patch } : s)) })
  const move = (i: number, by: -1 | 1) => {
    const next = [...draft.sections]
    const [item] = next.splice(i, 1)
    next.splice(i + by, 0, item)
    set({ sections: next })
  }
  const named = draft.sections.filter((s) => s.title.trim())
  const canSave = !!draft.name.trim() && named.length > 0 && !saving

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave) onSave({ ...draft, sections: named })
      }}
    >
      {draft.note && (
        <p className="rounded-lg bg-pale-gold/60 px-3 py-2 text-[13px] text-forest">
          <span className="font-semibold">Worth checking:</span> {draft.note}
        </p>
      )}
      <p className="text-[13px] text-warm-gray">
        {draft.templateId
          ? 'Change anything that is wrong. Lessons already laid out in this format are redone the next time they are opened.'
          : "This is what Wivoza read from your form. Check the sections and what goes in each, then save. Nothing is used until you do."}
      </p>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-warm-gray">Name</span>
          <input id="format-name" className={INPUT} value={draft.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-warm-gray">Plans are</span>
          <select id="format-cadence" className={INPUT} value={draft.cadence} onChange={(e) => set({ cadence: e.target.value as TemplateCadence })}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
      </div>
      {draft.cadence === 'weekly' && (
        <p className="rounded-lg bg-sage px-3 py-2 text-[13px] text-forest">
          Weekly plans are coming next. Until then, each lesson is laid out as one day in these sections.
        </p>
      )}

      {canManageSchool && !draft.templateId && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-xs font-bold uppercase tracking-[0.12em] text-warm-gray">Who uses it</legend>
          <div className="flex flex-wrap gap-2">
            {(['school', 'personal'] as const).map((scope) => (
              <label
                key={scope}
                className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-semibold text-forest ${draft.scope === scope ? 'border-forest bg-sage' : 'border-divider bg-white'}`}
              >
                <input type="radio" name="format-scope" id={`format-scope-${scope}`} checked={draft.scope === scope} onChange={() => set({ scope })} className="accent-forest" />
                {scope === 'school' ? `Everyone at ${schoolName ?? 'my school'}` : 'Just me'}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-warm-gray">Sections, in order</p>
        <ol className="flex flex-col gap-2">
          {draft.sections.map((section, i) => (
            <li key={section.id} className="rounded-xl border border-divider bg-white p-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-cream text-xs font-bold text-forest">{i + 1}</span>
                <input
                  id={`format-section-title-${section.id}`}
                  aria-label={`Section ${i + 1} title`}
                  placeholder="Section title, as the form says it"
                  className={`${INPUT} min-w-0 flex-1`}
                  value={section.title}
                  maxLength={120}
                  onChange={(e) => setSection(i, { title: e.target.value })}
                />
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move section ${i + 1} up`}
                    className={`rounded-full p-1.5 text-forest hover:bg-cream disabled:opacity-30 ${FOCUS}`}
                  >
                    <ArrowUpIcon className="h-4 w-4 text-forest" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === draft.sections.length - 1}
                    aria-label={`Move section ${i + 1} down`}
                    className={`rounded-full p-1.5 text-forest hover:bg-cream disabled:opacity-30 ${FOCUS}`}
                  >
                    <ArrowUpIcon className="h-4 w-4 rotate-180 text-forest" />
                  </button>
                  <button
                    type="button"
                    onClick={() => set({ sections: draft.sections.filter((_, n) => n !== i) })}
                    aria-label={`Remove section ${i + 1}`}
                    className={`rounded-full p-1.5 text-forest hover:bg-cream ${FOCUS}`}
                  >
                    <CloseIcon className="h-4 w-4 text-forest" />
                  </button>
                </div>
              </div>
              <label className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-8">
                <span className="text-xs font-semibold text-warm-gray">What goes here</span>
                <select
                  id={`format-section-kind-${section.id}`}
                  className="min-w-0 max-w-full rounded-full border border-divider bg-white py-1 pl-2.5 pr-7 text-[13px] text-forest focus:border-forest focus:outline-none"
                  value={section.kind}
                  onChange={(e) => setSection(i, { kind: e.target.value as TemplateSectionKind })}
                >
                  {Object.entries(KIND_LABEL).map(([kind, label]) => (
                    <option key={kind} value={kind}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {section.kind === 'teacher_fills' && (
                <p className="mt-1 pl-8 text-xs text-warm-gray">Left blank for the teacher. Wivoza never writes here.</p>
              )}
              {section.prompt && section.kind !== 'teacher_fills' && (
                <p className="mt-1 pl-8 text-xs text-warm-gray">The form says: {section.prompt}</p>
              )}
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => set({ sections: [...draft.sections, { id: nextId(draft.sections), title: '', kind: 'other', prompt: null }] })}
          className={`self-start px-3.5 py-1.5 text-[13px] font-semibold ${OUTLINE_BUTTON}`}
        >
          + Add a section
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-soft-terracotta px-3 py-2 text-[13px] text-forest">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!canSave} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold ${PRIMARY_BUTTON}`}>
          {saving && <Spinner />}
          <span className="text-cream">{saving ? 'Saving…' : 'Save format'}</span>
        </button>
        <button type="button" onClick={onCancel} className={`px-4 py-2 text-sm font-semibold ${OUTLINE_BUTTON}`}>
          Cancel
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

function FormatRow({
  template,
  isDefault,
  editable,
  busy,
  defaultLabel = 'Use for my lessons',
  onDefault,
  onEdit,
  onDelete,
}: {
  template: LessonTemplate
  isDefault: boolean
  editable: boolean
  busy: boolean
  defaultLabel?: string
  onDefault?: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-divider bg-white px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 basis-40 font-semibold text-forest [overflow-wrap:anywhere]">{template.name}</span>
        <span className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-semibold text-forest">
          {template.cadence === 'weekly' ? 'Weekly' : 'Daily'} · {template.sections.length} sections
        </span>
        {isDefault && <span className="rounded-full bg-sage px-2.5 py-0.5 text-xs font-bold text-forest">Default</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        {!isDefault && onDefault && (
          <button type="button" onClick={onDefault} disabled={busy} className={`rounded font-semibold text-forest underline decoration-divider underline-offset-4 hover:decoration-forest disabled:opacity-60 ${FOCUS}`}>
            {defaultLabel}
          </button>
        )}
        {editable && (
          <button type="button" onClick={onEdit} disabled={busy} className={`rounded font-semibold text-forest underline decoration-divider underline-offset-4 hover:decoration-forest disabled:opacity-60 ${FOCUS}`}>
            Edit sections
          </button>
        )}
        {editable &&
          (confirming ? (
            <span className="flex items-center gap-2 text-forest">
              Remove this format?
              <button type="button" onClick={onDelete} disabled={busy} className={`rounded font-semibold text-terracotta-strong underline underline-offset-4 disabled:opacity-60 ${FOCUS}`}>
                Remove
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={`rounded font-semibold text-forest underline decoration-divider underline-offset-4 ${FOCUS}`}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} disabled={busy} className={`rounded font-semibold text-warm-gray underline decoration-divider underline-offset-4 hover:text-forest disabled:opacity-60 ${FOCUS}`}>
              Remove
            </button>
          ))}
      </div>
    </li>
  )
}

/// Lists, uploads and edits formats. `schoolOnly` is the admin dashboard's
/// view: the school's formats and nothing personal.
export function LessonFormatManager({ schoolOnly = false, onChanged }: { schoolOnly?: boolean; onChanged?: () => void }) {
  const [data, setData] = useState<LessonTemplates | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ kind: 'list' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function refresh() {
    try {
      setData(await getLessonTemplates())
      setLoadError(null)
    } catch (e) {
      setLoadError((e as Error).message)
    }
  }
  useEffect(() => {
    void refresh()
  }, [])

  const canManageSchool = !!data?.canManageSchool
  const defaultScope: Draft['scope'] = schoolOnly || (canManageSchool && !data?.school.length) ? 'school' : 'personal'

  async function handleFile(file: File) {
    setError(null)
    setView({ kind: 'reading', fileName: file.name })
    try {
      const read = await readLessonTemplate(file)
      setView({
        kind: 'edit',
        draft: {
          templateId: null,
          name: read.name ?? file.name.replace(/\.[^.]+$/, ''),
          cadence: read.cadence,
          sections: read.sections,
          scope: defaultScope,
          sourceFileName: read.sourceFileName,
          note: read.note,
        },
      })
    } catch (e) {
      setError((e as Error).message)
      setView({ kind: 'list' })
    }
  }

  async function handleSave(draft: Draft) {
    setBusy(true)
    setError(null)
    try {
      if (draft.templateId) {
        await updateLessonTemplate(draft.templateId, { name: draft.name, cadence: draft.cadence, sections: draft.sections })
      } else {
        await createLessonTemplate({
          scope: draft.scope,
          name: draft.name,
          cadence: draft.cadence,
          sections: draft.sections,
          sourceFileName: draft.sourceFileName,
        })
      }
      await refresh()
      setView({ kind: 'list' })
      onChanged?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await refresh()
      onChanged?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (loadError)
    return (
      <p role="alert" className="rounded-lg bg-soft-terracotta px-3 py-2 text-[13px] text-forest">
        {loadError}
      </p>
    )
  if (!data)
    return (
      <div className="flex items-center gap-2 text-sm text-warm-gray">
        <Spinner /> Loading formats…
      </div>
    )

  if (view.kind === 'reading')
    return (
      <WorkingRing
        active
        estimatedMs={12000}
        label={`Reading ${view.fileName}`}
        hint="Finding the sections your form asks for."
        className="text-forest"
      />
    )

  if (view.kind === 'edit')
    return (
      <FormatEditor
        draft={view.draft}
        schoolName={data.schoolName}
        canManageSchool={canManageSchool && !schoolOnly}
        saving={busy}
        error={error}
        onSave={handleSave}
        onCancel={() => {
          setError(null)
          setView({ kind: 'list' })
        }}
      />
    )

  const edit = (template: LessonTemplate) =>
    setView({
      kind: 'edit',
      draft: {
        templateId: template.id,
        name: template.name,
        cadence: template.cadence,
        sections: template.sections,
        scope: template.organizationId ? 'school' : 'personal',
        sourceFileName: template.sourceFileName,
        note: null,
      },
    })

  if (schoolOnly && !data.schoolName)
    return <p className="text-sm text-warm-gray">Your account isn't part of a school on Wivoza, so there is no school format to set.</p>

  const schoolDefaultId = data.school.find((t) => t.isDefault)?.id ?? null
  const canUpload = !schoolOnly || canManageSchool

  return (
    <div className="flex flex-col gap-4">
      {data.schoolName && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-warm-gray">{data.schoolName}</h3>
          {data.school.length ? (
            <ul className="flex flex-col gap-2">
              {data.school.map((t) => (
                <FormatRow
                  key={t.id}
                  template={t}
                  isDefault={schoolOnly ? t.isDefault : data.defaultId === t.id}
                  editable={canManageSchool}
                  busy={busy}
                  defaultLabel={canManageSchool ? "Make it the school's default" : 'Use for my lessons'}
                  // A teacher chooses a school format for their lessons by
                  // clearing their own default; an admin sets the school's.
                  onDefault={
                    schoolOnly || canManageSchool
                      ? () => act(() => updateLessonTemplate(t.id, { isDefault: true }))
                      : t.id === schoolDefaultId && data.personal.some((p) => p.isDefault)
                        ? () => act(() => Promise.all(data.personal.filter((p) => p.isDefault).map((p) => updateLessonTemplate(p.id, { isDefault: false }))))
                        : undefined
                  }
                  onEdit={() => edit(t)}
                  onDelete={() => act(() => deleteLessonTemplate(t.id))}
                />
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-warm-gray">
              {canManageSchool
                ? "Your school doesn't have a format yet. Upload the form your teachers use and every lesson they build comes out in it."
                : "Your school hasn't set up a format. You can add your own below."}
            </p>
          )}
        </section>
      )}

      {!schoolOnly && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-warm-gray">Your formats</h3>
          {data.personal.length ? (
            <ul className="flex flex-col gap-2">
              {data.personal.map((t) => (
                <FormatRow
                  key={t.id}
                  template={t}
                  isDefault={data.defaultId === t.id}
                  editable
                  busy={busy}
                  onDefault={() => act(() => updateLessonTemplate(t.id, { isDefault: true }))}
                  onEdit={() => edit(t)}
                  onDelete={() => act(() => deleteLessonTemplate(t.id))}
                />
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-warm-gray">
              {data.school.length
                ? 'Using your school format. If you use a different form, add it here and your lessons will use that.'
                : 'Upload the lesson plan form you hand in, and your lessons will come out in it.'}
            </p>
          )}
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-soft-terracotta px-3 py-2 text-[13px] text-forest">
          {error}
        </p>
      )}

      {canUpload && (
        <div className="flex flex-col gap-1.5">
          <input
            ref={fileInput}
            id="format-upload"
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void handleFile(file)
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold ${PRIMARY_BUTTON}`}>
              <UploadIcon className="h-4 w-4 text-cream" />
              <span className="text-cream">Upload a lesson plan form</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setView({
                  kind: 'edit',
                  draft: {
                    templateId: null,
                    name: '',
                    cadence: 'daily',
                    sections: [{ id: 's1', title: '', kind: 'objective', prompt: null }],
                    scope: defaultScope,
                    sourceFileName: null,
                    note: null,
                  },
                })
              }
              className={`rounded px-1 text-[13px] font-semibold text-forest underline decoration-divider underline-offset-4 hover:decoration-forest disabled:opacity-60 ${FOCUS}`}
            >
              or set the sections by hand
            </button>
          </div>
          <p className="text-xs text-warm-gray">A blank form or a filled-in example, as Word, PDF or a photo. Word keeps tables best.</p>
        </div>
      )}
    </div>
  )
}

export function LessonFormatsDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  return (
    <Overlay onClose={onClose} labelledBy="lesson-formats-title">
      <div className="mx-auto mb-6 mt-[6vh] w-full max-w-2xl rounded-2xl border border-divider bg-cream-card p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="lesson-formats-title" className="font-heading text-xl font-bold text-forest">
              Lesson plan formats
            </h2>
            <p className="text-[13px] text-warm-gray">Your lessons are laid out in your school's own form, ready to hand in or post.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={`rounded-full p-1 text-forest ${FOCUS}`}>
            <CloseIcon className="h-5 w-5 text-forest" />
          </button>
        </div>
        <LessonFormatManager onChanged={onChanged} />
      </div>
    </Overlay>
  )
}
