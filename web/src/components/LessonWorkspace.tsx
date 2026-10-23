import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  dismissSchoolFocusIdea,
  generateLessonDeck,
  getLessonTemplates,
  layoutLessonPlan,
  type ExportDoc,
  type ExportDocBlock,
  type LessonAdaptation,
  type LessonPlan,
  type LessonStep,
  type LessonTemplates,
  type PendingAdaptation,
  type TemplateContent,
  type TemplateSectionKind,
} from '../lib/api'
import {
  checkBlocks,
  currentMinutes,
  DURATION_CHOICES,
  hasLookFors,
  lessonMinutes,
  lessonTitle,
  misconceptionBlocks,
  stepBlocks,
  stepHeading,
  textBlocks,
  ticketLookForBlocks,
  ticketPromptBlocks,
  toHtml,
  toPlainText,
  type CopyBlock,
} from '../lib/lessonCopy'
import {
  ArrowRightIcon,
  BrainIcon,
  ChatBubbleIcon,
  CheckIcon,
  ChecklistIcon,
  ClipboardIcon,
  ClockIcon,
  CloseIcon,
  ShareIcon,
  SparkleIcon,
  StarIcon,
} from './icons'
import ExportModal from './ExportModal'
import { LessonFormatsDialog } from './LessonFormats'
import SendToCanvasDialog, { SendToCanvasButton, useCanvasStatus } from './SendToCanvas'
import Overlay from './Overlay'
import { WorkingRing } from './ProgressRing'
import { Spinner } from './Spinner'

// Planning Coach's Lesson Workspace: a built lesson as one document a teacher
// can read, lift into their own school's template piece by piece, and adapt
// with tools that stay in view. The page owns the lesson and every call; this
// file is how it looks and what lands on the clipboard.
//
// Every foreground colour is set on the element that shows it, never left to
// inherit — an inherited colour inside a button is how text vanished on a
// coloured surface in earlier previews.

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest'
const OUTLINE_BUTTON = `rounded-full border border-divider bg-white text-forest hover:border-forest/40 hover:bg-cream ${FOCUS}`

export type WorkspaceAdaptation = {
  busy: LessonAdaptation | null
  applying: boolean
  reverting: boolean
  undoing: boolean
  error: string | null
  justApplied: string | null
  adapt: (action: LessonAdaptation, targetMinutes?: number) => void
  apply: () => void
  discard: () => void
  revert: () => void
  undo: () => void
  clearApplied: () => void
}

// ---------------------------------------------------------------------------
// Copying
// ---------------------------------------------------------------------------

async function writeClipboard(blocks: CopyBlock[]): Promise<boolean> {
  const text = toPlainText(blocks)
  // Rich first, so a paste into Word or a Google Doc keeps headings and real
  // bullets; plain text wherever the browser won't do that.
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([toHtml(blocks)], { type: 'text/html' }),
        }),
      ])
      return true
    }
  } catch {
    // fall through to plain text
  }
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

type Fallback = { title: string; text: string }
const CopyContext = createContext<{ copy: (blocks: CopyBlock[], what: string) => Promise<boolean>; showFallback: (f: Fallback) => void }>({
  copy: async () => false,
  showFallback: () => {},
})

export function CopyButton({
  blocks,
  what,
  label = 'Copy',
  className = '',
}: {
  blocks: () => CopyBlock[]
  what: string
  label?: string
  className?: string
}) {
  const { copy } = useContext(CopyContext)
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function handleClick() {
    // Only a write that worked says so; a refusal opens the text to copy by hand.
    if (await copy(blocks(), what)) {
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={copied ? `${what} copied` : `${label}: ${what}`}
      className={`inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold ${OUTLINE_BUTTON} ${className}`}
    >
      {copied ? (
        <span className="text-forest">Copied ✓</span>
      ) : (
        <>
          <ClipboardIcon className="h-3.5 w-3.5 text-forest" />
          <span className="text-forest">{label}</span>
        </>
      )}
    </button>
  )
}

function FallbackDialog({ fallback, onClose }: { fallback: Fallback; onClose: () => void }) {
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    area.current?.focus()
    area.current?.select()
  }, [])
  return (
    <Overlay onClose={onClose} labelledBy="copy-fallback-title">
      <div className="mx-auto mb-6 mt-[10vh] w-full max-w-xl rounded-2xl border border-divider bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="copy-fallback-title" className="font-heading text-lg font-bold text-forest">
            {fallback.title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className={`rounded-full p-1 text-forest ${FOCUS}`}>
            <CloseIcon className="h-5 w-5 text-forest" />
          </button>
        </div>
        <p className="mt-1 text-sm text-warm-gray">
          Your browser didn't let Wivoza copy this. It's selected below — press ⌘C (Mac) or Ctrl+C (Windows) to copy it.
        </p>
        <textarea
          ref={area}
          readOnly
          value={fallback.text}
          rows={10}
          onFocus={(e) => e.target.select()}
          className="mt-3 w-full rounded-xl border border-divider bg-cream px-3 py-2 text-sm text-forest focus:border-forest focus:outline-none"
        />
      </div>
    </Overlay>
  )
}

/// Copy buttons inside it write to the clipboard, and open the text to copy
/// by hand when the browser refuses. The Lesson Workspace has its own; this
/// is for the other documents that reuse its sections (Plan a Week).
export function CopyScope({ children }: { children: React.ReactNode }) {
  const [fallback, setFallback] = useState<Fallback | null>(null)
  const copier = {
    copy: async (blocks: CopyBlock[], what: string) => {
      const ok = await writeClipboard(blocks)
      if (!ok) setFallback({ title: `Copy ${what}`, text: toPlainText(blocks) })
      return ok
    },
    showFallback: setFallback,
  }
  return (
    <CopyContext.Provider value={copier}>
      {children}
      {fallback && <FallbackDialog fallback={fallback} onClose={() => setFallback(null)} />}
    </CopyContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-warm-gray transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 7.5 5 5 5-5" />
    </svg>
  )
}

export function Blocks({ blocks }: { blocks: CopyBlock[] }) {
  return (
    <div className="flex flex-col gap-1.5 text-[15px] leading-relaxed text-forest">
      {blocks.map((block, i) => {
        if (block.t === 'ul' || block.t === 'ol') {
          const List = block.t
          return (
            <List
              key={i}
              className={`${List === 'ul' ? 'list-disc' : 'list-decimal'} space-y-1 pl-5 text-forest marker:text-warm-gray`}
            >
              {block.items.map((item, n) => (
                <li key={n}>{item}</li>
              ))}
            </List>
          )
        }
        if (block.t === 'label')
          return (
            <p key={i} className={`text-xs font-bold uppercase tracking-[0.12em] text-warm-gray ${i > 0 ? 'mt-2' : ''}`}>
              {block.text}
            </p>
          )
        if (block.t === 'p')
          return (
            <p key={i} className="whitespace-pre-wrap text-forest">
              {block.text}
            </p>
          )
        return (
          <p key={i} className={`font-semibold text-forest ${i > 0 ? 'mt-3' : ''}`}>
            {block.text}
          </p>
        )
      })}
    </div>
  )
}

export type DocSection = {
  key: string
  title: string
  defaultOpen: boolean
  copy: () => CopyBlock[]
  copyLabel?: string
  /** Nothing to copy — a school-format section the lesson left empty. */
  noCopy?: boolean
  body: React.ReactNode
}

export function SectionRow({ n, section, preview }: { n: number; section: DocSection; preview: boolean }) {
  const [open, setOpen] = useState(preview || section.defaultOpen)
  const id = `lesson-section-${section.key}`
  return (
    <section className="border-t border-divider first:border-t-0">
      <div className="flex items-center gap-2 px-4 py-3.5 sm:px-5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={id}
          className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left ${FOCUS}`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sage text-[13px] font-bold text-forest">
            {n}
          </span>
          <span className="min-w-0 flex-1 font-heading text-[17px] font-bold leading-snug text-forest">{section.title}</span>
          <Chevron open={open} />
        </button>
        {!preview && !section.noCopy && <CopyButton blocks={section.copy} what={section.title} label={section.copyLabel} />}
      </div>
      {open && (
        <div id={id} className="px-4 pb-5 sm:px-5 sm:pl-[60px]">
          {section.body}
        </div>
      )}
    </section>
  )
}

function ActivityRow({ step, i, preview, open, onToggle }: { step: LessonStep; i: number; preview: boolean; open: boolean; onToggle: () => void }) {
  const id = `lesson-activity-${i}`
  return (
    <li className="rounded-xl border border-divider bg-white">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={id}
          className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-0.5 text-left ${FOCUS}`}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-cream text-xs font-bold text-forest">{i + 1}</span>
          <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-forest">{step.title || `Activity ${i + 1}`}</span>
          {step.minutes != null && (
            <span className="shrink-0 rounded-full bg-pale-gold px-2.5 py-0.5 text-xs font-bold text-forest">{step.minutes} min</span>
          )}
          <Chevron open={open} />
        </button>
        {!preview && <CopyButton blocks={() => stepBlocks(step, i, 'h2')} what={stepHeading(step, i)} />}
      </div>
      {open && (step.teacher || step.students) && (
        <div id={id} className="flex flex-col gap-2 px-3 pb-3">
          {step.teacher && (
            <div className="rounded-lg bg-sage px-3.5 py-2.5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-forest">Teacher actions</p>
              <div className="mt-1">
                <Blocks blocks={textBlocks(step.teacher)} />
              </div>
            </div>
          )}
          {step.students && (
            <div className="rounded-lg bg-soft-terracotta px-3.5 py-2.5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-forest">Student actions</p>
              <div className="mt-1">
                <Blocks blocks={textBlocks(step.students)} />
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function Sequence({ plan, preview }: { plan: LessonPlan; preview: boolean }) {
  const steps = plan.sequence ?? []
  const [open, setOpen] = useState<Set<number>>(() => new Set(preview ? steps.map((_, i) => i) : []))
  const allOpen = open.size === steps.length
  return (
    <div className="flex flex-col gap-2">
      {!preview && steps.length > 1 && (
        <button
          type="button"
          onClick={() => setOpen(allOpen ? new Set() : new Set(steps.map((_, i) => i)))}
          className={`self-start rounded-md text-[13px] font-semibold text-forest underline decoration-divider underline-offset-4 hover:decoration-forest ${FOCUS}`}
        >
          {allOpen ? 'Collapse all activities' : 'Expand all activities'}
        </button>
      )}
      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <ActivityRow
            key={i}
            step={step}
            i={i}
            preview={preview}
            open={open.has(i)}
            onToggle={() =>
              setOpen((prev) => {
                const next = new Set(prev)
                if (next.has(i)) next.delete(i)
                else next.add(i)
                return next
              })
            }
          />
        ))}
      </ol>
    </div>
  )
}

function SubBlock({ title, blocks, preview, what }: { title: string; blocks: CopyBlock[]; preview: boolean; what: string }) {
  return (
    <div className="rounded-xl border border-divider bg-cream/50 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-forest">{title}</p>
        {!preview && <CopyButton blocks={() => blocks} what={what} />}
      </div>
      <div className="mt-1.5">
        <Blocks blocks={blocks} />
      </div>
    </div>
  )
}

const LEGACY_PARTS: { key: 'doNow' | 'agenda' | 'closure' | 'hots' | 'homework'; title: string }[] = [
  { key: 'doNow', title: 'Do Now' },
  { key: 'agenda', title: 'Agenda' },
  { key: 'closure', title: 'Closure' },
  { key: 'hots', title: 'Higher-Order Thinking' },
  { key: 'homework', title: 'Homework' },
]

/// The sections a plan has, in teaching order. Three shapes reach here: a
/// Planning Coach lesson, a list of teaching ideas, and one of the old
/// five-slot sample plans reopened from history. A section with nothing in it
/// is left out rather than shown empty.
function documentSections(plan: LessonPlan, preview: boolean): DocSection[] {
  // Improve a Lesson: Coach's read of the plan, then the plan itself — which
  // is what an adaptation rewrites, so a preview shows only that.
  if (plan.mode === 'feedback') {
    const sections: DocSection[] = []
    const feedback = textBlocks(plan.feedback)
    if (feedback.length && !preview)
      sections.push({ key: 'feedback', title: 'Coaching Feedback', defaultOpen: true, copy: () => feedback, body: <Blocks blocks={feedback} /> })
    const planBlocks = textBlocks(plan.planText)
    if (planBlocks.length)
      sections.push({
        key: 'plan',
        title: preview ? 'Your Plan, Revised' : 'Your Plan',
        defaultOpen: true,
        copy: () => planBlocks,
        body: <Blocks blocks={planBlocks} />,
      })
    return sections
  }

  if ((plan.quickIdeas ?? []).length > 0) {
    return (plan.quickIdeas ?? []).map((idea, i) => ({
      key: `idea-${i}`,
      title: idea.title,
      defaultOpen: true,
      copy: () => textBlocks(idea.how),
      body: <Blocks blocks={textBlocks(idea.how)} />,
    }))
  }

  if (!(plan.sequence ?? []).length) {
    const legacy: DocSection[] = LEGACY_PARTS.filter((part) => plan[part.key]?.trim()).map((part) => ({
      key: part.key,
      title: part.title,
      defaultOpen: true,
      copy: () => textBlocks(plan[part.key]),
      body: <Blocks blocks={textBlocks(plan[part.key])} />,
    }))
    if (legacy.length || !plan.planText) return legacy
    return [{ key: 'plan', title: 'Lesson Plan', defaultOpen: true, copy: () => textBlocks(plan.planText), body: <Blocks blocks={textBlocks(plan.planText)} /> }]
  }

  const sections: DocSection[] = []
  const objective = [
    ...textBlocks(plan.objective),
    ...(plan.essentialQuestion?.trim() ? [{ t: 'label', text: 'Essential question' } as CopyBlock, ...textBlocks(plan.essentialQuestion)] : []),
    ...(plan.standard?.trim() ? [{ t: 'label', text: 'Standard' } as CopyBlock, ...textBlocks(plan.standard)] : []),
  ]
  if (objective.length)
    sections.push({ key: 'objective', title: 'Learning Objective', defaultOpen: true, copy: () => objective, body: <Blocks blocks={objective} /> })

  const criteria = textBlocks(plan.successCriteria)
  if (criteria.length)
    sections.push({ key: 'criteria', title: 'Success Criteria', defaultOpen: true, copy: () => criteria, body: <Blocks blocks={criteria} /> })

  const materials = textBlocks(plan.materials)
  if (materials.length)
    sections.push({ key: 'materials', title: 'Materials & Preparation', defaultOpen: false, copy: () => materials, body: <Blocks blocks={materials} /> })

  const steps = plan.sequence ?? []
  sections.push({
    key: 'sequence',
    title: 'Lesson Sequence',
    defaultOpen: true,
    copyLabel: 'Copy All Steps',
    copy: () => steps.flatMap((step, i) => stepBlocks(step, i)),
    body: <Sequence plan={plan} preview={preview} />,
  })

  const checks = plan.checks ?? []
  if (checks.length) {
    const blocks = checks.flatMap((check, i) => checkBlocks(check, i))
    sections.push({ key: 'checks', title: 'Checks for Understanding', defaultOpen: true, copy: () => blocks, body: <Blocks blocks={blocks} /> })
  }

  const misconceptions = plan.misconceptions ?? []
  if (misconceptions.length) {
    const blocks = misconceptions.flatMap((item, i) => misconceptionBlocks(item, i))
    sections.push({
      key: 'misconceptions',
      title: 'Potential Misconceptions',
      defaultOpen: true,
      copy: () => blocks,
      body: (
        <div className="flex flex-col gap-3">
          <Blocks blocks={blocks} />
          <p className="text-xs text-warm-gray">
            These are common for this content at this grade — not a claim about your students. You'll find out which ones are in the
            room when you ask.
          </p>
        </div>
      ),
    })
  }

  const ticket = plan.exitTicket
  if (ticket?.task?.trim()) {
    const prompt = ticketPromptBlocks(ticket)
    const lookFors = hasLookFors(ticket) ? ticketLookForBlocks(ticket) : []
    sections.push({
      key: 'exit',
      title: 'Exit Ticket',
      defaultOpen: true,
      copy: () => [
        { t: 'h3', text: 'Student prompt' },
        ...prompt,
        ...(lookFors.length ? [{ t: 'h3', text: 'Teacher look-fors' } as CopyBlock, ...lookFors] : []),
      ],
      body: (
        <div className="flex flex-col gap-2.5">
          <SubBlock title="Student prompt" blocks={prompt} preview={preview} what="Exit ticket student prompt" />
          {lookFors.length > 0 && <SubBlock title="Teacher look-fors" blocks={lookFors} preview={preview} what="Exit ticket teacher look-fors" />}
        </div>
      ),
    })
  }
  return sections
}

function metaLine(plan: LessonPlan): string {
  return [[plan.subject, plan.gradeLevel].filter(Boolean).join(' · '), lessonMinutes(plan)].filter(Boolean).join(' · ')
}

function wholeLesson(plan: LessonPlan): CopyBlock[] {
  const meta = metaLine(plan)
  return [
    { t: 'h1', text: lessonTitle(plan) },
    ...(meta ? [{ t: 'p', text: meta } as CopyBlock] : []),
    ...documentSections(plan, true).flatMap((section): CopyBlock[] => [{ t: 'h2', text: section.title }, ...section.copy()]),
  ]
}

function LessonDocument({ plan, preview = false }: { plan: LessonPlan; preview?: boolean }) {
  const sections = documentSections(plan, preview)
  if (!sections.length)
    return <p className="rounded-2xl border border-divider bg-white px-5 py-6 text-sm text-warm-gray">This lesson has no content to show.</p>
  return (
    <div className="overflow-hidden rounded-2xl border border-divider bg-white">
      {sections.map((section, i) => (
        <SectionRow key={section.key} n={i + 1} section={section} preview={preview} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The lesson in a school's (or the teacher's own) lesson plan format
// ---------------------------------------------------------------------------

/// Which school-format kinds hold each part of Wivoza's own layout. A part no
/// section of the format holds is not lost: it is listed under "Also from
/// Wivoza", outside what is copied or downloaded as the plan.
const HELD_BY: Record<string, TemplateSectionKind[]> = {
  objective: ['objective'],
  criteria: ['success_criteria'],
  materials: ['materials'],
  sequence: ['opening', 'instruction', 'guided_practice', 'independent_practice', 'activities', 'closing'],
  checks: ['checks', 'assessment'],
  misconceptions: ['misconceptions'],
  exit: ['exit_ticket', 'assessment'],
}

function templateSections(content: TemplateContent, ownPlan: boolean): DocSection[] {
  return content.sections.map((section) => {
    const blocks = textBlocks(section.text)
    const empty =
      section.kind === 'teacher_fills'
        ? 'For you to fill in.'
        : ownPlan
          ? 'Your plan has nothing for this box. Fill it in yourself, or leave it.'
          : 'Nothing in this lesson goes here. Fill it in yourself, or leave it.'
    return {
      key: section.id,
      title: section.title,
      defaultOpen: true,
      noCopy: blocks.length === 0,
      copy: () => blocks,
      body: blocks.length ? <Blocks blocks={blocks} /> : <p className="text-sm italic text-warm-gray">{empty}</p>,
    }
  })
}

function wholeTemplateLesson(plan: LessonPlan, content: TemplateContent): CopyBlock[] {
  const meta = metaLine(plan)
  return [
    { t: 'h1', text: lessonTitle(plan) },
    ...(meta ? [{ t: 'p', text: meta } as CopyBlock] : []),
    ...content.sections.flatMap((section): CopyBlock[] => [{ t: 'h2', text: section.title }, ...textBlocks(section.text)]),
  ]
}

/// The school-format plan as the export file builder's document model.
function templateExportDoc(plan: LessonPlan, content: TemplateContent): ExportDoc {
  const blocks: ExportDocBlock[] = content.sections.flatMap((section): ExportDocBlock[] => [
    { type: 'heading', text: section.title },
    ...textBlocks(section.text).map((block): ExportDocBlock => {
      if (block.t === 'ul') return { type: 'bullets', items: block.items }
      if (block.t === 'ol') return { type: 'numbered', items: block.items }
      return { type: 'paragraph', text: block.text }
    }),
  ])
  return { title: lessonTitle(plan), subtitle: [content.templateName, metaLine(plan)].filter(Boolean).join(' · '), blocks }
}

function TemplateDocument({ plan, content }: { plan: LessonPlan; content: TemplateContent }) {
  const kinds = new Set(content.sections.map((s) => s.kind))
  // A plan the teacher brought is all of it in the format; Coach's feedback
  // on it is not part of the plan, and stays open above it rather than being
  // tucked away with the extras.
  const isImprove = plan.mode === 'feedback'
  const feedback = isImprove ? documentSections(plan, false).filter((section) => section.key === 'feedback') : []
  const extras = isImprove ? [] : documentSections(plan, false).filter((section) => !(HELD_BY[section.key] ?? []).some((kind) => kinds.has(kind)))
  const [extrasOpen, setExtrasOpen] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      {feedback.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-divider bg-white">
          {feedback.map((section, i) => (
            <SectionRow key={section.key} n={i + 1} section={section} preview={false} />
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-divider bg-white">
        {templateSections(content, isImprove).map((section, i) => (
          <SectionRow key={section.key} n={i + 1} section={section} preview={false} />
        ))}
      </div>
      {extras.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-dashed border-divider bg-cream/40">
          <button
            type="button"
            onClick={() => setExtrasOpen((o) => !o)}
            aria-expanded={extrasOpen}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5 ${FOCUS}`}
          >
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-[15px] font-bold text-forest">Also from Wivoza</span>
              <span className="block text-xs text-warm-gray">
                {extras.map((e) => e.title).join(', ')} — your format has no place for these, so they're not in the copy or the download.
              </span>
            </span>
            <Chevron open={extrasOpen} />
          </button>
          {extrasOpen && (
            <div className="border-t border-divider bg-white">
              {extras.map((section, i) => (
                <SectionRow key={section.key} n={i + 1} section={section} preview={false} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/// What the layout depends on. When it changes (an adaptation applied or
/// undone), the stored layout is out of date and is asked for again; the
/// server answers from its store when nothing that matters changed.
function lessonSignature(plan: LessonPlan): string {
  return JSON.stringify([
    plan.id,
    plan.planText,
    plan.objective,
    plan.successCriteria,
    plan.materials,
    plan.approach,
    plan.durationMinutes,
    plan.sequence,
    plan.checks,
    plan.misconceptions,
    plan.exitTicket,
    plan.subject,
    plan.gradeLevel,
    plan.unitName,
    plan.essentialQuestion,
    plan.standard,
  ])
}

export type FormatPatch = Pick<LessonPlan, 'templateChoice' | 'templateContent'>

function useLessonFormat(plan: LessonPlan, enabled: boolean, onFormatChange?: (patch: FormatPatch) => void) {
  const [templates, setTemplates] = useState<LessonTemplates | null>(null)
  const [applied, setApplied] = useState<{ signature: string; templateId: string | null } | null>(null)
  const [pendingChoice, setPendingChoice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)
  const onChange = useRef(onFormatChange)
  useEffect(() => {
    onChange.current = onFormatChange
  })
  const signature = lessonSignature(plan)

  const loadTemplates = useCallback(async () => {
    try {
      setTemplates(await getLessonTemplates())
    } catch {
      setTemplates(null)
    }
  }, [])
  useEffect(() => {
    if (enabled) void loadTemplates()
  }, [enabled, loadTemplates])

  const hasAny = !!templates && templates.personal.length + templates.school.length > 0

  const run = useCallback(
    async (choice?: string | null) => {
      const n = ++request.current
      setLoading(true)
      setError(null)
      setPendingChoice(choice === undefined ? null : (choice ?? 'default'))
      try {
        const result = await layoutLessonPlan(plan.id, choice)
        if (n !== request.current) return
        onChange.current?.({ templateChoice: result.plan.templateChoice ?? null, templateContent: result.plan.templateContent ?? null })
        setApplied({ signature: lessonSignature(result.plan), templateId: result.appliedTemplateId })
      } catch (e) {
        if (n === request.current) setError((e as Error).message || "Could not put this lesson in your format.")
      } finally {
        if (n === request.current) {
          setLoading(false)
          setPendingChoice(null)
        }
      }
    },
    [plan.id],
  )

  useEffect(() => {
    if (enabled && hasAny && applied?.signature !== signature) void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hasAny, signature])

  const content =
    enabled && !loading && applied?.templateId && applied.signature === signature && plan.templateContent?.templateId === applied.templateId
      ? plan.templateContent
      : null

  return {
    enabled: enabled && !!templates,
    templates,
    hasAny,
    appliedId: applied?.templateId ?? null,
    pendingChoice,
    loading,
    error,
    content,
    choose: (choice: string) => void run(choice),
    retry: () => void run(),
    changed: async () => {
      await loadTemplates()
      void run()
    },
  }
}

type LessonFormat = ReturnType<typeof useLessonFormat>

function FormatBar({ format, onManage }: { format: LessonFormat; onManage: () => void }) {
  const templates = format.templates
  if (!templates) return null
  if (!format.hasAny)
    return (
      <p className="text-[13px] text-warm-gray">
        Does your school use its own lesson plan form?{' '}
        <button type="button" onClick={onManage} className={`rounded font-semibold text-forest underline decoration-forest/30 underline-offset-4 hover:decoration-forest ${FOCUS}`}>
          Set up your format
        </button>{' '}
        and your lessons come out in it.
      </p>
    )
  const value = format.loading && format.pendingChoice && format.pendingChoice !== 'default' ? format.pendingChoice : (format.appliedId ?? 'wivoza')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="lesson-format" className="text-xs font-bold uppercase tracking-[0.12em] text-warm-gray">
        Format
      </label>
      <select
        id="lesson-format"
        value={value}
        disabled={format.loading}
        onChange={(e) => format.choose(e.target.value)}
        className="min-w-0 max-w-full rounded-full border border-divider bg-white py-1.5 pl-3 pr-8 text-[13px] font-semibold text-forest focus:border-forest focus:outline-none disabled:opacity-70"
      >
        {templates.school.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
        {templates.personal.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
        <option value="wivoza">Wivoza layout</option>
      </select>
      <button type="button" onClick={onManage} className={`rounded text-[13px] font-semibold text-forest underline decoration-divider underline-offset-4 hover:decoration-forest ${FOCUS}`}>
        Manage formats
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Make It Yours
// ---------------------------------------------------------------------------

const ADAPT_BUTTONS: {
  action: Exclude<LessonAdaptation, 'time'>
  label: string
  hint: string
  busyLabel: string
  tone: string
  Icon: (props: { className?: string }) => React.ReactElement
}[] = [
  { action: 'simplify', label: 'Simplify', hint: 'Clearer steps & more support', busyLabel: 'Simplifying…', tone: 'bg-sage hover:bg-[#dbe6db]', Icon: ChecklistIcon },
  { action: 'challenge', label: 'Add Challenge', hint: 'Deepen the thinking', busyLabel: 'Adding challenge…', tone: 'bg-pale-gold hover:bg-[#efdb9f]', Icon: BrainIcon },
  {
    action: 'participation',
    label: 'Increase Participation',
    hint: 'More ways to contribute',
    busyLabel: 'Revising…',
    tone: 'bg-soft-terracotta hover:bg-[#f2dac9]',
    Icon: ChatBubbleIcon,
  },
]

function AdaptButton({
  label,
  hint,
  tone,
  dark = false,
  busy,
  disabled,
  icon,
  onClick,
  expanded,
}: {
  label: string
  hint: string
  tone: string
  dark?: boolean
  busy: string | null
  disabled: boolean
  icon: React.ReactNode
  onClick: () => void
  expanded?: boolean
}) {
  const fg = dark ? 'text-cream' : 'text-forest'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={expanded}
      className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${tone} ${FOCUS}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${dark ? 'bg-white/10' : 'bg-white/70'} ${fg}`}>
        {busy ? <Spinner /> : icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={`text-[15px] font-bold leading-tight ${fg}`}>{busy ?? label}</span>
        <span className={`text-[13px] leading-snug ${dark ? 'text-cream/85' : 'text-forest/75'}`}>{hint}</span>
      </span>
    </button>
  )
}

function TimePicker({ plan, onPick }: { plan: LessonPlan; onPick: (minutes: number) => void }) {
  const [custom, setCustom] = useState('')
  const minutes = currentMinutes(plan)
  const customMinutes = Number.parseInt(custom, 10)
  const customValid = Number.isFinite(customMinutes) && customMinutes >= 5 && customMinutes <= 240 && customMinutes !== minutes
  return (
    <div className="rounded-xl border border-divider bg-cream px-3.5 py-3">
      <p className="text-[13px] font-semibold text-forest">
        Rebuild for a different length{minutes ? <span className="font-normal text-warm-gray"> — now {minutes} min</span> : null}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {DURATION_CHOICES.map((choice) => {
          const current = choice === minutes
          return (
            <button
              key={choice}
              type="button"
              disabled={current}
              onClick={() => onPick(choice)}
              aria-label={current ? `${choice} minutes (current length)` : `Rebuild for ${choice} minutes`}
              className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${
                current ? 'bg-forest text-cream' : 'border border-divider bg-white text-forest hover:border-forest/40'
              } ${FOCUS}`}
            >
              {choice} min
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          min={5}
          max={240}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Other"
          aria-label="Other lesson length in minutes"
          className="w-20 rounded-lg border border-divider bg-white px-2.5 py-1.5 text-sm text-forest placeholder:text-warm-gray focus:border-forest focus:outline-none"
        />
        <span className="text-[13px] text-warm-gray">min</span>
        <button
          type="button"
          disabled={!customValid}
          onClick={() => onPick(customMinutes)}
          className={`ml-auto rounded-full bg-forest px-3.5 py-1.5 text-[13px] font-semibold text-cream disabled:bg-divider disabled:text-warm-gray ${FOCUS}`}
        >
          Rebuild
        </button>
      </div>
    </div>
  )
}

function MakeItYours({
  plan,
  adaptation,
  onReview,
}: {
  plan: LessonPlan
  adaptation: WorkspaceAdaptation
  onReview: () => void
}) {
  const [timeOpen, setTimeOpen] = useState(false)
  const busy = adaptation.busy
  const pending = plan.pendingAdaptation
  const history = plan.versionHistory?.length ?? 0

  return (
    <section id="make-it-yours" aria-labelledby="make-it-yours-title" className="scroll-mt-6 overflow-hidden rounded-2xl border border-divider bg-white">
      <div className="bg-forest px-4 py-3.5">
        <h2 id="make-it-yours-title" className="flex items-center gap-2 font-heading text-lg font-bold text-cream">
          <SparkleIcon className="h-5 w-5 text-gold" />
          <span className="text-cream">Make It Yours</span>
        </h2>
        <p className="text-[13px] text-cream/85">Adapt the lesson to your class.</p>
      </div>
      <div className="flex flex-col gap-2.5 p-3.5">
        <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 @min-[760px]:grid-cols-1">
          {ADAPT_BUTTONS.map(({ action, label, hint, busyLabel, tone, Icon }) => (
            <AdaptButton
              key={action}
              label={label}
              hint={hint}
              tone={tone}
              busy={busy === action ? busyLabel : null}
              disabled={busy != null || adaptation.applying}
              icon={<Icon className="h-5 w-5 text-forest" />}
              onClick={() => {
                setTimeOpen(false)
                adaptation.adapt(action)
              }}
            />
          ))}
          <AdaptButton
            label="Adjust Time ▾"
            hint="Fit your class period"
            tone="bg-forest hover:bg-forest-soft"
            dark
            busy={busy === 'time' ? 'Adjusting time…' : null}
            disabled={busy != null || adaptation.applying}
            icon={<ClockIcon className="h-5 w-5 text-cream" />}
            expanded={timeOpen}
            onClick={() => setTimeOpen((open) => !open)}
          />
        </div>
        {timeOpen && busy == null && (
          <TimePicker
            plan={plan}
            onPick={(minutes) => {
              setTimeOpen(false)
              adaptation.adapt('time', minutes)
            }}
          />
        )}
        <WorkingRing active={busy != null} estimatedMs={18000} label="Drafting a revision" className="text-forest" />
        {adaptation.error && (
          <p role="alert" className="rounded-lg bg-soft-terracotta px-3 py-2 text-[13px] text-forest">
            {adaptation.error} Your current lesson hasn't changed.
          </p>
        )}
        {pending && busy == null && (
          <div className="rounded-xl border border-gold/60 bg-pale-gold/50 px-3.5 py-2.5">
            <p className="text-[13px] text-forest">
              <span className="font-semibold">{pending.label}</span> is drafted and waiting for you.
            </p>
            <button type="button" onClick={onReview} className={`mt-1.5 rounded-full bg-forest px-3.5 py-1.5 text-[13px] font-semibold text-cream ${FOCUS}`}>
              Review changes
            </button>
          </div>
        )}
        <p className="text-xs leading-snug text-warm-gray">Preview first. Your current lesson stays until you apply changes.</p>
        {history > 0 && (
          <p className="text-xs leading-snug text-warm-gray">
            {history === 1 ? 'One adaptation applied.' : `${history} adaptations applied.`} Your original is kept —{' '}
            <button
              type="button"
              onClick={adaptation.revert}
              disabled={adaptation.reverting}
              className={`rounded font-semibold text-terracotta-strong underline underline-offset-2 disabled:opacity-60 ${FOCUS}`}
            >
              {adaptation.reverting ? 'going back…' : 'go back to it'}
            </button>
            .
          </p>
        )}
      </div>
    </section>
  )
}

function BringItToLife({
  hasFeedback,
  loading,
  error,
  onRequest,
  onView,
  slidesWaiting,
  onSlides,
}: {
  hasFeedback: boolean
  loading: boolean
  error: string | null
  onRequest: () => void
  onView: () => void
  slidesWaiting: boolean
  onSlides: () => void
}) {
  return (
    <section aria-labelledby="bring-it-title" className="rounded-2xl border border-divider bg-soft-terracotta p-4">
      <h2 id="bring-it-title" className="font-heading text-lg font-bold text-forest">
        Bring It to Life
      </h2>
      <p className="mt-0.5 text-[13px] leading-snug text-forest/80">
        Talk through your lesson and get feedback on clarity, questions, and pacing.
      </p>
      <button
        type="button"
        onClick={hasFeedback ? onView : onRequest}
        disabled={loading}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-terracotta-strong px-4 py-2.5 text-sm font-bold text-white hover:bg-[#983f25] disabled:opacity-70 ${FOCUS}`}
      >
        {loading ? (
          <>
            <Spinner /> <span className="text-white">Getting feedback…</span>
          </>
        ) : hasFeedback ? (
          <span className="text-white">See Delivery Feedback ↓</span>
        ) : (
          <>
            <span className="text-white">Get Delivery Feedback</span>
            <ArrowRightIcon className="h-4 w-4 text-white" />
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onSlides}
        disabled={loading}
        className={`mt-2 flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold disabled:opacity-70 ${OUTLINE_BUTTON}`}
      >
        <span className="flex h-5 min-w-5 items-center justify-center rounded bg-[#D24726] px-1 text-[10px] font-extrabold text-white">P</span>
        <span className="text-forest">{slidesWaiting ? 'Preparing your slides…' : 'Create Slides'}</span>
      </button>
      <p className="mt-1.5 text-xs leading-snug text-forest/75">
        A deck to project, with your delivery notes in the speaker notes{hasFeedback ? '.' : ' — delivery feedback comes first, then the slides.'}
      </p>
      {hasFeedback && !loading && (
        <button
          type="button"
          onClick={onRequest}
          className={`mt-2 w-full rounded text-center text-[13px] font-semibold text-forest underline decoration-forest/30 underline-offset-4 ${FOCUS}`}
        >
          Get fresh feedback ↻
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-forest">
          {error}
        </p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Preview before apply
// ---------------------------------------------------------------------------

/// The lesson the revision would become — the same fallbacks the server uses
/// when it applies one, so what is previewed is what is applied.
function proposedPlan(plan: LessonPlan, pending: PendingAdaptation): LessonPlan {
  const s = pending.sections
  if (s.planText != null) return { ...plan, planText: s.planText, pendingAdaptation: null }
  return {
    ...plan,
    objective: s.objective ?? plan.objective,
    approach: s.approach ?? plan.approach,
    successCriteria: s.successCriteria ?? plan.successCriteria,
    materials: s.materials ?? plan.materials,
    sequence: s.sequence ?? plan.sequence,
    checks: s.checks ?? plan.checks,
    misconceptions: s.misconceptions ?? plan.misconceptions,
    exitTicket: s.exitTicket ?? plan.exitTicket,
    durationMinutes: pending.minutes ?? plan.durationMinutes,
    pendingAdaptation: null,
  }
}

function PreviewDialog({
  plan,
  pending,
  applying,
  onApply,
  onKeep,
  onClose,
}: {
  plan: LessonPlan
  pending: PendingAdaptation
  applying: boolean
  onApply: () => void
  onKeep: () => void
  onClose: () => void
}) {
  const next = proposedPlan(plan, pending)
  const before = lessonMinutes(plan)
  const after = lessonMinutes(next)
  return (
    <Overlay onClose={onClose} labelledBy="preview-title">
      <div className="mx-auto mb-6 w-full max-w-3xl rounded-2xl border border-divider bg-cream">
        <div className="flex items-start justify-between gap-3 rounded-t-2xl bg-forest px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Preview · {pending.label}</p>
            <h2 id="preview-title" className="mt-0.5 font-heading text-xl font-bold text-cream">
              Your lesson, revised
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview (the revision stays drafted)"
            className="rounded-full p-1 text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
          >
            <CloseIcon className="h-5 w-5 text-cream" />
          </button>
        </div>
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          {(pending.summary || (before !== after && after)) && (
            <div className="rounded-xl border border-divider bg-white px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-terracotta-strong">What changed</p>
              {pending.summary && (
                <div className="mt-1">
                  <Blocks blocks={textBlocks(pending.summary)} />
                </div>
              )}
              {before !== after && after && (
                <p className="mt-1.5 text-[13px] text-warm-gray">
                  Length: {before ?? '—'} → <span className="font-semibold text-forest">{after}</span>
                </p>
              )}
            </div>
          )}
          <LessonDocument plan={next} preview />
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t border-divider bg-cream/95 px-4 py-3 backdrop-blur sm:px-5">
          <button type="button" onClick={onKeep} disabled={applying} className={`px-4 py-2 text-sm font-semibold ${OUTLINE_BUTTON} disabled:opacity-60`}>
            Keep Current Lesson
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={applying}
            className={`flex items-center gap-2 rounded-full bg-forest px-5 py-2 text-sm font-bold text-cream hover:bg-forest-soft disabled:opacity-70 ${FOCUS}`}
          >
            {applying ? (
              <>
                <Spinner /> <span className="text-cream">Applying…</span>
              </>
            ) : (
              <span className="text-cream">Apply Changes</span>
            )}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

function UndoToast({ label, undoing, onUndo, onClose }: { label: string; undoing: boolean; onUndo: () => void; onClose: () => void }) {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    const t = window.setTimeout(() => close.current(), 12000)
    return () => window.clearTimeout(t)
  }, [label])
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-forest px-4 py-3 shadow-lg md:bottom-6"
    >
      <CheckIcon className="h-5 w-5 shrink-0 text-gold" />
      <p className="min-w-0 flex-1 text-sm text-cream">
        <span className="font-semibold text-cream">{label}</span> applied to your lesson.
      </p>
      <button
        type="button"
        onClick={onUndo}
        disabled={undoing}
        className="rounded-full bg-cream px-3.5 py-1.5 text-[13px] font-bold text-forest disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
      >
        {undoing ? 'Undoing…' : 'Undo'}
      </button>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="rounded-full p-1 text-cream">
        <CloseIcon className="h-4 w-4 text-cream" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The workspace
// ---------------------------------------------------------------------------

function SaveForLater({ saved, onClick }: { saved: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      className={`flex items-center justify-center gap-2 rounded-full bg-forest px-4 py-2.5 text-sm font-bold text-cream hover:bg-forest-soft ${FOCUS}`}
    >
      {saved ? <CheckIcon className="h-4 w-4 text-gold" /> : <StarIcon className="h-4 w-4 text-cream" />}
      <span className="text-cream">{saved ? 'Saved' : 'Save for Later'}</span>
    </button>
  )
}

function ShareLesson({ onShare }: { onShare: () => Promise<{ shareToken: string }> }) {
  const { showFallback } = useContext(CopyContext)
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'busy' | 'copied' | 'failed'>('idle')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  function settle(next: 'copied' | 'failed') {
    setState(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState('idle'), 2200)
  }

  async function handleClick() {
    let link = url
    if (!link) {
      setState('busy')
      try {
        const { shareToken } = await onShare()
        link = `${window.location.origin}/shared/lesson-plan/${shareToken}`
        setUrl(link)
      } catch {
        settle('failed')
        return
      }
    }
    try {
      await navigator.clipboard.writeText(link)
      settle('copied')
    } catch {
      setState('idle')
      showFallback({ title: 'Share link', text: link })
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === 'busy'}
      className={`flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold disabled:opacity-70 ${OUTLINE_BUTTON}`}
    >
      {state === 'busy' ? <Spinner /> : <ShareIcon className="h-4 w-4 text-forest" />}
      <span className="text-forest">
        {state === 'busy' ? 'Sharing…' : state === 'copied' ? 'Link copied ✓' : state === 'failed' ? "Couldn't share — try again" : 'Share'}
      </span>
    </button>
  )
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" />
    </svg>
  )
}

/// The one idea connected to a school focus the teacher chose
/// (docs/coaching-priorities.md). On screen only: it is not a section, so it is
/// never in Copy, the printout, the Word document or a Canvas page, and the
/// label goes nowhere the teacher didn't put it.
function SchoolFocusIdeaBox({ plan, adaptation }: { plan: LessonPlan; adaptation: WorkspaceAdaptation }) {
  const idea = plan.schoolFocusIdea
  const [hidden, setHidden] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  if (!idea || idea.dismissed || idea.added || hidden || plan.pendingAdaptation) return null
  const adding = adaptation.busy === 'school_focus'

  async function notForThisClass() {
    setDismissing(true)
    try {
      await dismissSchoolFocusIdea(plan.id)
      setHidden(true)
    } catch {
      setDismissing(false)
    }
  }

  return (
    <section aria-label="An idea connected to your school focus" className="rounded-2xl border-[1.5px] border-gold bg-gold-tint/40 p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 className="font-heading text-base font-bold text-forest">One option here</h3>
        <span className="rounded-full bg-gold-tint px-2.5 py-0.5 text-xs font-semibold text-ink">
          Connected to your selected school focus · {idea.name}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm text-ink">{idea.text}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={adding || dismissing || adaptation.busy != null}
          onClick={() => adaptation.adapt('school_focus')}
          className={`min-h-[44px] rounded-full bg-forest px-4 text-sm font-semibold text-cream disabled:opacity-60 ${FOCUS}`}
        >
          {adding ? 'Adding…' : 'Add to lesson'}
        </button>
        <button
          type="button"
          disabled={adding || dismissing}
          onClick={notForThisClass}
          className={`min-h-[44px] px-4 text-sm font-semibold ${OUTLINE_BUTTON} disabled:opacity-60`}
        >
          Not for this class
        </button>
      </div>
      <p className="mt-2 text-xs text-warm-gray">Only you see this. It isn&rsquo;t part of the lesson unless you add it.</p>
    </section>
  )
}

export default function LessonWorkspace({
  plan,
  adaptation,
  delivery,
  deliveryCard,
  extras,
  onToggleSaved,
  onShare,
  onNew,
  onFormatChange,
  onBackToWeek,
}: {
  plan: LessonPlan
  adaptation: WorkspaceAdaptation
  delivery: { loading: boolean; error: string | null; onRequest: () => void }
  deliveryCard: React.ReactNode
  /** Anything that follows the lesson before its delivery coaching — Improve a Lesson's follow-up chat. */
  extras?: React.ReactNode
  onToggleSaved: () => void
  onShare: () => Promise<{ shareToken: string }>
  onNew: () => void
  /** Build a Lesson only: lets the lesson be shown in a school's lesson plan format. */
  onFormatChange?: (patch: FormatPatch) => void
  /** A lesson opened from a day of a week: the way back to that week. */
  onBackToWeek?: () => void
}) {
  const [fallback, setFallback] = useState<Fallback | null>(null)
  const copier = {
    copy: async (blocks: CopyBlock[], what: string) => {
      const ok = await writeClipboard(blocks)
      if (!ok) setFallback({ title: `Copy ${what}`, text: toPlainText(blocks) })
      return ok
    },
    showFallback: setFallback,
  }

  const isImprove = plan.mode === 'feedback'
  const isIdeas = !isImprove && (plan.quickIdeas ?? []).length > 0
  const isFullLesson = !isImprove && (plan.sequence ?? []).length > 0
  // A Planning Coach lesson and a plan the teacher brought can both be
  // adapted; the old five-slot samples have nowhere to write a revision back.
  const canAdapt = isFullLesson || (isImprove && !!plan.planText?.trim())
  const canDeliver = !isIdeas
  const hasTools = canAdapt || canDeliver

  // A built lesson, or a plan the teacher brought (Improve a Lesson): both
  // are lesson plans a school wants in its own form.
  const formatable = (isFullLesson && plan.mode === 'generated') || (isImprove && !!plan.planText?.trim())
  const format = useLessonFormat(plan, formatable && !!onFormatChange, onFormatChange)
  const [formatsOpen, setFormatsOpen] = useState(false)
  const [wordOpen, setWordOpen] = useState(false)
  const content = format.content
  const canvas = useCanvasStatus()
  const [canvasOpen, setCanvasOpen] = useState(false)

  // The preview opens itself when a revision arrives; closing it leaves the
  // revision drafted, with a way back to it in the tools column.
  const pending = plan.pendingAdaptation
  const pendingKey = pending ? `${plan.id}:${pending.action}:${pending.label}:${pending.summary ?? ''}:${pending.minutes ?? ''}` : null
  const [closedKey, setClosedKey] = useState<string | null>(null)
  const previewOpen = !!pending && canAdapt && pendingKey !== closedKey

  // The deck is built from the delivery coaching (hook first, checkpoints,
  // the hard part), so Create Slides on a lesson without coaching gets the
  // coaching first and opens the deck the moment it lands.
  const [slidesOpen, setSlidesOpen] = useState(false)
  const [slidesWaiting, setSlidesWaiting] = useState(false)
  function handleSlides() {
    if (plan.deliveryCoaching) {
      setSlidesOpen(true)
      return
    }
    setSlidesWaiting(true)
    if (!delivery.loading) delivery.onRequest()
  }

  const deliveryRef = useRef<HTMLDivElement>(null)
  const wasLoading = useRef(false)
  useEffect(() => {
    if (wasLoading.current && !delivery.loading) {
      if (slidesWaiting) {
        setSlidesWaiting(false)
        if (plan.deliveryCoaching) setSlidesOpen(true)
      } else if (plan.deliveryCoaching) {
        deliveryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
    wasLoading.current = delivery.loading
  }, [delivery.loading, plan.deliveryCoaching, slidesWaiting])

  const kind = isImprove ? 'Your plan, with coaching' : isIdeas ? 'Teaching ideas' : isFullLesson ? 'Lesson draft' : 'Sample plan'
  const meta = [plan.subject, plan.gradeLevel].filter(Boolean).join(' · ')
  const minutes = lessonMinutes(plan)
  const description = plan.approach?.trim() || null

  return (
    <CopyContext.Provider value={copier}>
      <div data-workspace className="@container flex flex-col gap-5">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <nav aria-label="Breadcrumb" className="text-[13px] text-warm-gray">
              {onBackToWeek && (
                <>
                  <button
                    type="button"
                    onClick={onBackToWeek}
                    className={`rounded font-semibold text-forest underline decoration-divider underline-offset-4 hover:decoration-forest ${FOCUS}`}
                  >
                    ← Back to the week
                  </button>
                  <span aria-hidden="true" className="mx-1.5 text-warm-gray">
                    ·
                  </span>
                </>
              )}
              <span className="text-warm-gray">Planning Coach</span>
              <span aria-hidden="true" className="mx-1.5 text-warm-gray">
                ›
              </span>
              <span className="font-semibold text-forest">{isImprove ? 'Improve a Lesson' : isIdeas ? 'Quick Ideas' : 'Build a Lesson'}</span>
            </nav>
            <button
              type="button"
              onClick={onNew}
              className={`rounded-full px-3 py-1 text-[13px] font-semibold text-forest underline decoration-divider underline-offset-4 hover:decoration-forest ${FOCUS}`}
            >
              + {isImprove ? 'New plan' : isIdeas ? 'New ideas' : 'New lesson'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {meta && <span className="rounded-full bg-sage px-3 py-1 text-[13px] font-semibold text-forest">{meta}</span>}
            {minutes && (
              <span className="rounded-full border border-divider bg-cream px-3 py-1 text-[13px] font-semibold text-forest">{minutes}</span>
            )}
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-warm-gray">{kind}</span>
          </div>
          <h1 className="font-heading text-2xl font-extrabold leading-tight text-forest [overflow-wrap:anywhere] md:text-3xl">{lessonTitle(plan)}</h1>
          {description && <p className="text-[15px] text-warm-gray">{description}</p>}

          <div className="mt-1 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <SaveForLater saved={plan.saved} onClick={onToggleSaved} />
            <ShareLesson onShare={onShare} />
            {content ? (
              <button
                type="button"
                onClick={() => setWordOpen(true)}
                className={`flex items-center justify-center gap-2 rounded-full bg-pale-gold px-4 py-2.5 text-sm font-bold text-forest hover:bg-[#efdb9f] ${FOCUS}`}
              >
                <DownloadIcon className="h-4 w-4 text-forest" />
                <span className="text-forest">Download as Word</span>
              </button>
            ) : (
              <Link
                to={`/lesson-planning/${plan.id}/export`}
                className={`flex items-center justify-center gap-2 rounded-full bg-pale-gold px-4 py-2.5 text-sm font-bold text-forest hover:bg-[#efdb9f] ${FOCUS}`}
              >
                <DownloadIcon className="h-4 w-4 text-forest" />
                <span className="text-forest">Download</span>
              </Link>
            )}
            <CopyButton
              blocks={() => (content ? wholeTemplateLesson(plan, content) : wholeLesson(plan))}
              what="the entire lesson"
              label={isIdeas ? 'Copy All Ideas' : 'Copy Entire Lesson'}
              className="justify-center !px-4 !py-2.5 !text-sm !font-bold"
            />
            {canvas?.available && <SendToCanvasButton onClick={() => setCanvasOpen(true)} />}
          </div>
          {canAdapt && (
            <a
              href="#make-it-yours"
              className={`self-start rounded text-[13px] font-semibold text-forest underline decoration-forest/30 underline-offset-4 @min-[760px]:hidden ${FOCUS}`}
            >
              Adapt this lesson for your class ↓
            </a>
          )}
        </header>

        <div className={`grid gap-6 ${hasTools ? '@min-[760px]:grid-cols-[minmax(0,1fr)_270px]' : ''}`}>
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col gap-2">
              <div>
                <h2 className="font-heading text-xl font-bold text-forest">{isIdeas ? 'Your Ideas' : 'Your Lesson'}</h2>
                <p className="text-[13px] text-warm-gray">
                  {content ? `In ${content.templateName}. Copy any section, or the whole plan.` : 'Copy any section into your own template.'}
                </p>
              </div>
              {format.enabled && <FormatBar format={format} onManage={() => setFormatsOpen(true)} />}
            </div>
            {format.loading ? (
              <div className="rounded-2xl border border-divider bg-white px-5 py-6">
                <WorkingRing
                  active
                  estimatedMs={12000}
                  label="Putting it in your format"
                  hint="Your lesson, in your form's own sections."
                  className="text-forest"
                />
              </div>
            ) : (
              <>
                {format.error && (
                  <p role="alert" className="rounded-lg bg-soft-terracotta px-3 py-2 text-[13px] text-forest">
                    {format.error}{' '}
                    <button type="button" onClick={format.retry} className={`rounded font-semibold underline underline-offset-2 ${FOCUS}`}>
                      Try again
                    </button>{' '}
                    Showing the Wivoza layout meanwhile.
                  </p>
                )}
                {content ? (
                  <TemplateDocument key={content.sourceKey} plan={plan} content={content} />
                ) : (
                  <LessonDocument key={`${plan.id}:${plan.versionHistory?.length ?? 0}`} plan={plan} />
                )}
              </>
            )}
            {canAdapt && isFullLesson && <SchoolFocusIdeaBox plan={plan} adaptation={adaptation} />}
            <p className="text-xs text-warm-gray">
              {isImprove
                ? 'Coaching on the plan you brought. Your learning goal and the parts that work stay as they are.'
                : isIdeas
                  ? 'Ideas to pull into the plan you are writing — take the ones that fit your class.'
                  : 'A draft to edit, not a script. You know your class; change whatever needs changing.'}
            </p>
            {extras}
            {deliveryCard && (
              <div ref={deliveryRef} className="scroll-mt-6">
                {deliveryCard}
              </div>
            )}
          </div>

          {hasTools && (
            <aside className="flex min-w-0 flex-col gap-4 @min-[760px]:sticky @min-[760px]:top-6 @min-[760px]:self-start">
              {canAdapt && <MakeItYours plan={plan} adaptation={adaptation} onReview={() => setClosedKey(null)} />}
              {canDeliver && (
                <BringItToLife
                  hasFeedback={!!plan.deliveryCoaching}
                  loading={delivery.loading}
                  error={delivery.error}
                  onRequest={delivery.onRequest}
                  onView={() => deliveryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  slidesWaiting={slidesWaiting}
                  onSlides={handleSlides}
                />
              )}
            </aside>
          )}
        </div>
      </div>

      {previewOpen && pending && (
        <PreviewDialog
          plan={plan}
          pending={pending}
          applying={adaptation.applying}
          onApply={adaptation.apply}
          onKeep={adaptation.discard}
          onClose={() => setClosedKey(pendingKey)}
        />
      )}
      {adaptation.justApplied && (
        <UndoToast label={adaptation.justApplied} undoing={adaptation.undoing} onUndo={adaptation.undo} onClose={adaptation.clearApplied} />
      )}
      {slidesOpen && (
        <ExportModal
          sessionId={plan.id}
          text="lesson-deck"
          initialFormat="pptx"
          slidesOnly
          chipLabel="Lesson presentation"
          changesLabel="How your delivery plan is built in"
          loader={() => generateLessonDeck(plan.id).then((result) => result.model)}
          onClose={() => setSlidesOpen(false)}
        />
      )}
      {canvasOpen && (
        <SendToCanvasDialog
          planId={plan.id}
          defaultTitle={lessonTitle(plan)}
          useFormat={!!content}
          formatName={content?.templateName ?? null}
          onClose={() => setCanvasOpen(false)}
        />
      )}
      {formatsOpen && <LessonFormatsDialog onClose={() => setFormatsOpen(false)} onChanged={() => void format.changed()} />}
      {wordOpen && content && (
        <ExportModal
          sessionId={plan.id}
          text={content.sourceKey}
          initialFormat="docx"
          documentOnly
          note={`Laid out in ${content.templateName}.`}
          loader={async () => templateExportDoc(plan, content)}
          onClose={() => setWordOpen(false)}
        />
      )}
      {fallback && <FallbackDialog fallback={fallback} onClose={() => setFallback(null)} />}
    </CopyContext.Provider>
  )
}
