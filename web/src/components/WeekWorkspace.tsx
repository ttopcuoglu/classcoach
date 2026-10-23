import { useEffect, useState } from 'react'
import {
  fillWeekPlan,
  getLessonTemplates,
  type ExportDoc,
  type ExportDocBlock,
  type LaidOutSection,
  type LessonPlan,
  type LessonTemplate,
} from '../lib/api'
import { textBlocks, type CopyBlock } from '../lib/lessonCopy'
import ExportModal from './ExportModal'
import { ArrowRightIcon, StarIcon } from './icons'
import { LessonFormatsDialog } from './LessonFormats'
import { Blocks, CopyButton, CopyScope, SectionRow, type DocSection } from './LessonWorkspace'
import { WorkingRing } from './ProgressRing'
import { Spinner } from './Spinner'

// Plan a Week: the daily objectives to check, then the week filled in — in
// the teacher's weekly form when they have one, otherwise in Wivoza's own
// weekly layout. Any day opens as a full lesson in the Lesson Workspace.
// The page owns the plan and the calls that leave this view (opening a day);
// filling the week in happens here.

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest'
const OUTLINE_BUTTON = `rounded-full border border-divider bg-white text-forest hover:border-forest/40 hover:bg-cream ${FOCUS}`
const PRIMARY_BUTTON = `rounded-full bg-forest text-cream hover:bg-forest-soft disabled:opacity-60 ${FOCUS}`

function sectionDoc(section: LaidOutSection, emptyText: string): DocSection {
  const blocks = textBlocks(section.text)
  return {
    key: section.id,
    title: section.title,
    defaultOpen: true,
    noCopy: blocks.length === 0,
    copy: () => blocks,
    body: blocks.length ? (
      <Blocks blocks={blocks} />
    ) : (
      <p className="text-sm italic text-warm-gray">{section.kind === 'teacher_fills' ? 'For you to fill in.' : emptyText}</p>
    ),
  }
}

function sectionBlocks(sections: LaidOutSection[]): CopyBlock[] {
  return sections.flatMap((s): CopyBlock[] => [{ t: 'h3', text: s.title }, ...textBlocks(s.text)])
}

function weekTitle(plan: LessonPlan): string {
  return plan.objective?.trim() || 'Your week'
}

function metaLine(plan: LessonPlan): string {
  return [plan.subject, plan.gradeLevel].filter(Boolean).join(' · ')
}

function wholeWeek(plan: LessonPlan): CopyBlock[] {
  const content = plan.week?.content
  if (!content) return []
  const meta = metaLine(plan)
  return [
    { t: 'h1', text: weekTitle(plan) },
    ...(meta ? [{ t: 'p', text: meta } as CopyBlock] : []),
    ...(content.shared.length ? [{ t: 'h2', text: 'This week' } as CopyBlock, ...sectionBlocks(content.shared)] : []),
    ...content.days.flatMap((day): CopyBlock[] => [{ t: 'h2', text: day.label }, ...sectionBlocks(day.sections)]),
  ]
}

function weekExportDoc(plan: LessonPlan): ExportDoc {
  const content = plan.week!.content!
  const asBlocks = (sections: LaidOutSection[]): ExportDocBlock[] =>
    sections.map((s) => ({ type: 'callout', label: s.title, text: s.text.trim() || '—' }))
  return {
    title: weekTitle(plan),
    subtitle: [content.templateName, metaLine(plan)].filter(Boolean).join(' · '),
    blocks: [
      ...(content.shared.length ? [{ type: 'heading', text: 'This week' } as ExportDocBlock, ...asBlocks(content.shared)] : []),
      ...content.days.flatMap((day): ExportDocBlock[] => [{ type: 'heading', text: day.label }, ...asBlocks(day.sections)]),
    ],
  }
}

/// The objectives, one box per day. Shown before the week is filled in, and
/// again when the teacher wants to change them.
function ObjectivesEditor({
  plan,
  drafts,
  onChange,
}: {
  plan: LessonPlan
  drafts: string[]
  onChange: (index: number, value: string) => void
}) {
  const days = plan.week?.days ?? []
  return (
    <ol className="flex flex-col gap-2.5">
      {days.map((day, i) => (
        <li key={day.label} className="rounded-xl border border-divider bg-white p-3">
          <label className="flex flex-col gap-1.5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-heading text-[15px] font-bold text-forest">{day.label}</span>
              <span className="rounded-full bg-pale-gold px-2 py-0.5 text-xs font-bold text-forest">{day.minutes} min</span>
              {day.note && <span className="rounded-full bg-sage px-2 py-0.5 text-xs font-semibold text-forest">Your note: {day.note}</span>}
            </span>
            <textarea
              id={`week-objective-${i}`}
              value={drafts[i] ?? ''}
              onChange={(e) => onChange(i, e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-divider bg-cream/40 px-3 py-2 text-[15px] text-forest focus:border-forest focus:outline-none"
            />
          </label>
        </li>
      ))}
    </ol>
  )
}

export default function WeekWorkspace({
  plan,
  onPlan,
  onNew,
  onOpenDay,
  openingDay,
  dayError,
  onToggleSaved,
}: {
  plan: LessonPlan
  onPlan: (plan: LessonPlan) => void
  onNew: () => void
  onOpenDay: (index: number) => void
  /** The day being built as a full lesson, while it is. */
  openingDay: number | null
  dayError: string | null
  onToggleSaved: () => void
}) {
  const week = plan.week
  const content = week?.content ?? null
  const [editing, setEditing] = useState(!content)
  const [drafts, setDrafts] = useState<string[]>(() => (week?.days ?? []).map((d) => d.objective))
  const [filling, setFilling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weekly, setWeekly] = useState<LessonTemplate[] | null>(null)
  const [formatsOpen, setFormatsOpen] = useState(false)
  const [wordOpen, setWordOpen] = useState(false)
  // The format picked here, before the week is (re)filled in with it.
  const [formatChoice, setFormatChoice] = useState<string | null>(() => content?.templateId ?? (content ? 'wivoza' : plan.templateChoice ?? null))

  async function loadFormats() {
    try {
      const t = await getLessonTemplates()
      setWeekly([...t.personal, ...t.school].filter((x) => x.cadence === 'weekly'))
    } catch {
      setWeekly([])
    }
  }
  useEffect(() => {
    void loadFormats()
  }, [])

  // Another week opened in the same view starts from its own objectives.
  useEffect(() => {
    setDrafts((plan.week?.days ?? []).map((d) => d.objective))
    setEditing(!plan.week?.content)
    setFormatChoice(plan.week?.content ? (plan.week.content.templateId ?? 'wivoza') : (plan.templateChoice ?? null))
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id])

  async function fill(choice: string) {
    if (filling) return
    setFilling(true)
    setError(null)
    try {
      const updated = await fillWeekPlan(plan.id, { objectives: drafts.map((d) => d.trim()), choice })
      onPlan(updated)
      setEditing(false)
    } catch (e) {
      setError((e as Error).message || 'Could not fill in the week. Please try again.')
    } finally {
      setFilling(false)
    }
  }

  if (!week) return null
  const meta = metaLine(plan)
  const allObjectives = drafts.every((d) => d.trim())
  const formatValue =
    !weekly?.length
      ? 'wivoza'
      : formatChoice && (formatChoice === 'wivoza' || weekly.some((t) => t.id === formatChoice))
        ? formatChoice
        : weekly[0].id

  const formatPicker = weekly && (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="week-format" className="text-xs font-bold uppercase tracking-[0.12em] text-warm-gray">
        Format
      </label>
      {weekly.length ? (
        <select
          id="week-format"
          value={formatValue}
          disabled={filling}
          onChange={(e) => {
            setFormatChoice(e.target.value)
            if (content && !editing) void fill(e.target.value)
          }}
          className="min-w-0 max-w-full rounded-full border border-divider bg-white py-1.5 pl-3 pr-8 text-[13px] font-semibold text-forest focus:border-forest focus:outline-none disabled:opacity-70"
        >
          {weekly.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value="wivoza">Wivoza weekly layout</option>
        </select>
      ) : (
        <span className="text-[13px] text-forest">Wivoza weekly layout</span>
      )}
      <button type="button" onClick={() => setFormatsOpen(true)} className={`rounded text-[13px] font-semibold text-forest underline decoration-divider underline-offset-4 hover:decoration-forest ${FOCUS}`}>
        {weekly.length ? 'Manage formats' : 'Use your weekly form'}
      </button>
    </div>
  )

  return (
    <CopyScope>
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <nav aria-label="Breadcrumb" className="text-[13px] text-warm-gray">
              <span className="text-warm-gray">Planning Coach</span>
              <span aria-hidden="true" className="mx-1.5 text-warm-gray">
                ›
              </span>
              <span className="font-semibold text-forest">Plan a Week</span>
            </nav>
            <button
              type="button"
              onClick={onNew}
              className={`rounded-full px-3 py-1 text-[13px] font-semibold text-forest underline decoration-divider underline-offset-4 hover:decoration-forest ${FOCUS}`}
            >
              + New plan
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {meta && <span className="rounded-full bg-sage px-3 py-1 text-[13px] font-semibold text-forest">{meta}</span>}
            <span className="rounded-full border border-divider bg-cream px-3 py-1 text-[13px] font-semibold text-forest">
              {week.days.length} {week.days.length === 1 ? 'day' : 'days'}
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-warm-gray">Week plan</span>
          </div>
          <h1 className="font-heading text-2xl font-extrabold leading-tight text-forest [overflow-wrap:anywhere] md:text-3xl">{weekTitle(plan)}</h1>
          {content && !editing && (
            <div className="mt-1 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={onToggleSaved}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold ${plan.saved ? PRIMARY_BUTTON : OUTLINE_BUTTON}`}
              >
                <StarIcon className={`h-4 w-4 ${plan.saved ? 'text-gold' : 'text-forest'}`} />
                <span className={plan.saved ? 'text-cream' : 'text-forest'}>{plan.saved ? 'Saved' : 'Save for Later'}</span>
              </button>
              <button
                type="button"
                onClick={() => setWordOpen(true)}
                className={`flex items-center justify-center gap-2 rounded-full bg-pale-gold px-4 py-2.5 text-sm font-bold text-forest hover:bg-[#efdb9f] ${FOCUS}`}
              >
                <span className="text-forest">Download as Word</span>
              </button>
              <CopyButton blocks={() => wholeWeek(plan)} what="the whole week" label="Copy Whole Week" className="justify-center !px-4 !py-2.5 !text-sm !font-bold" />
              <button type="button" onClick={() => setEditing(true)} className={`px-4 py-2.5 text-sm font-bold ${OUTLINE_BUTTON}`}>
                Change objectives
              </button>
            </div>
          )}
        </header>

        {editing || !content ? (
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="font-heading text-xl font-bold text-forest">Your daily objectives</h2>
              <p className="text-[13px] text-warm-gray">
                {content
                  ? 'Change any day, then fill the week in again. Days you change lose the full lesson opened from them.'
                  : 'Each day builds on the one before. Change anything that is wrong for your class, then fill in the week.'}
              </p>
            </div>
            <ObjectivesEditor plan={plan} drafts={drafts} onChange={(i, v) => setDrafts((prev) => prev.map((d, n) => (n === i ? v : d)))} />
            {formatPicker}
            {filling ? (
              <div className="rounded-2xl border border-divider bg-white px-5 py-6">
                <WorkingRing active estimatedMs={30000} label="Filling in your week" hint="Every day, in your form's boxes. About half a minute." className="text-forest" />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void fill(formatValue)}
                  disabled={!allObjectives}
                  className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold ${PRIMARY_BUTTON}`}
                >
                  <span className="text-cream">{content ? 'Fill in the week again' : 'Fill in the week'}</span>
                  <ArrowRightIcon className="h-4 w-4 text-cream" />
                </button>
                {content && (
                  <button
                    type="button"
                    onClick={() => {
                      setDrafts(week.days.map((d) => d.objective))
                      setEditing(false)
                    }}
                    className={`px-4 py-2.5 text-sm font-semibold ${OUTLINE_BUTTON}`}
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-soft-terracotta px-3 py-2 text-[13px] text-forest">
                {error}
              </p>
            )}
          </section>
        ) : (
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div>
                <h2 className="font-heading text-xl font-bold text-forest">Your week</h2>
                <p className="text-[13px] text-warm-gray">In {content.templateName}. Copy a day, or the whole week. Open any day as a full lesson.</p>
              </div>
              {formatPicker}
            </div>
            {filling && (
              <div className="rounded-2xl border border-divider bg-white px-5 py-6">
                <WorkingRing active estimatedMs={30000} label="Filling in your week" hint="Every day, in your form's boxes. About half a minute." className="text-forest" />
              </div>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-soft-terracotta px-3 py-2 text-[13px] text-forest">
                {error}
              </p>
            )}

            {content.shared.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-divider bg-white">
                <div className="flex items-center justify-between gap-2 border-b border-divider bg-cream/50 px-4 py-2.5 sm:px-5">
                  <h3 className="font-heading text-[17px] font-bold text-forest">This week</h3>
                  <CopyButton blocks={() => sectionBlocks(content.shared)} what="this week's boxes" />
                </div>
                {content.shared.map((section, n) => (
                  <SectionRow key={section.id} n={n + 1} section={sectionDoc(section, 'Nothing for this.')} preview={false} />
                ))}
              </div>
            )}

            {content.days.map((day, i) => {
              const info = week.days[i]
              const opening = openingDay === i
              return (
                <article key={day.label} className="overflow-hidden rounded-2xl border border-divider bg-white">
                  <div className="flex flex-wrap items-center gap-2 border-b border-divider bg-sage/60 px-4 py-2.5 sm:px-5">
                    <h3 className="min-w-0 flex-1 font-heading text-[17px] font-bold text-forest">
                      {day.label}
                      {info && <span className="ml-2 text-[13px] font-semibold text-warm-gray">{info.minutes} min</span>}
                    </h3>
                    <CopyButton
                      blocks={() => [{ t: 'h2', text: day.label } as CopyBlock, ...sectionBlocks(day.sections)]}
                      what={day.label}
                      label="Copy day"
                    />
                    <button
                      type="button"
                      onClick={() => onOpenDay(i)}
                      disabled={openingDay != null}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold disabled:opacity-60 ${PRIMARY_BUTTON}`}
                    >
                      {opening && <Spinner />}
                      <span className="text-cream">{opening ? 'Building…' : info?.lessonPlanId ? 'Open lesson' : 'Open as full lesson'}</span>
                    </button>
                  </div>
                  {opening && (
                    <div className="border-b border-divider px-5 py-4">
                      <WorkingRing active estimatedMs={22000} label={`Building ${day.label}'s lesson`} hint="From this day's plan, with the rest of the week in mind." className="text-forest" />
                    </div>
                  )}
                  {day.sections.map((section, n) => (
                    <SectionRow key={section.id} n={n + 1} section={sectionDoc(section, 'Nothing for this day.')} preview={false} />
                  ))}
                </article>
              )
            })}
            {dayError && (
              <p role="alert" className="rounded-lg bg-soft-terracotta px-3 py-2 text-[13px] text-forest">
                {dayError}
              </p>
            )}
            <p className="text-xs text-warm-gray">A draft to edit, not a script. You know your class; change whatever needs changing.</p>
          </section>
        )}
      </div>

      {formatsOpen && <LessonFormatsDialog onClose={() => setFormatsOpen(false)} onChanged={() => void loadFormats()} />}
      {wordOpen && content && (
        <ExportModal
          sessionId={plan.id}
          text={JSON.stringify(content)}
          initialFormat="docx"
          documentOnly
          note={`Laid out in ${content.templateName}.`}
          loader={async () => weekExportDoc(plan)}
          onClose={() => setWordOpen(false)}
        />
      )}
    </CopyScope>
  )
}
