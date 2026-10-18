// The Insights tab, v3 layout (wivoza-insights-plan-v3.html): five sections
// on one page, each a coach note, its findings with the teacher's own lines,
// and a Keep / Try next time.
//
// Everything shown is decided by buildInsightsModel; this file only lays it
// out. Pieces that already live elsewhere in the report — the Hard Look,
// Discuss with Coach, the escalation and correction cards, regenerating the
// content notes — are passed in rather than rebuilt.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  flagQuote,
  getPreviousFocus,
  getQuoteFlags,
  saveFocusCheckIn,
  setNextFocus,
  writeInsightsNotes,
  type AudioSessionWithSegments,
  type InsightsNotes,
  type InsightsSectionNote,
  type NextFocus,
} from '../../lib/api'
import { checkFocus, focusFromTry, suggestFocus, type FocusCandidate } from '../../lib/focusLoop'
import {
  applyGuidanceLinks,
  buildInsightsModel,
  buildNotesInput,
  mmss,
  type CoachText,
  type Evidence,
  type KeepTry as KeepTryModel,
  type SectionKey,
  type SectionModel,
} from '../../lib/insightsModel'
import { NOT_IN_THIS_REPORT, STUDENT_METRICS_ON } from '../../lib/teacherVoice'
import { DirectionsGrid, HeldOpenBars, QuestionSquares, TalkFlowChart } from './InsightsCharts'
import { CoachNote, EmptyEvidence, FindingRow, KeepTry, SectionCard, UnavailablePanel, type SectionMeta } from './InsightsParts'
import { QuoteFlagContext, type QuoteFlagState } from './quoteFlagContext'
import { FocusCheckInCard, OneFocusCard } from './FocusCards'

const META: Record<SectionKey, SectionMeta> = {
  talk_pace: { n: 1, title: 'Talk & Pace', sub: 'How much you spoke, how fast, and when you opened the floor.', chip: 'bg-terracotta' },
  questioning: { n: 2, title: 'Questioning & Checking', sub: 'What you asked and how you checked.', chip: 'bg-gold' },
  clarity: { n: 3, title: 'Clarity', sub: 'Did students know what to do and where the lesson was going?', chip: 'bg-forest' },
  climate: { n: 4, title: 'Climate & Routines', sub: 'Feedback and redirections, as they sounded.', chip: 'bg-terracotta' },
  content_lens: { n: 5, title: 'Content Lens', sub: 'Your teaching of the subject itself.', chip: 'bg-[#8A7BC0]' },
}
const ORDER: SectionKey[] = ['talk_pace', 'questioning', 'clarity', 'climate', 'content_lens']

/// How each section's numbers are made, in a sentence or two.
const HOW_TO_READ: Record<SectionKey, string> = {
  talk_pace:
    'Talk share is your speech as a share of the recording; the rest is other voices, sound with no words, and quiet. Pace is words a minute of your own speaking time — everyday conversation runs about 150, an anchor rather than a target.',
  questioning:
    'Every question listed is one that was counted, so the number and the list always agree. The pause runs from the end of a question to the next thing you said, so it may include a student’s answer.',
  clarity:
    'A complete set of directions names the task, the steps, the time and what to hand in or produce. Lesson connections are the objective, a link to earlier learning, why it matters, and a closing summary — each heard or not.',
  climate:
    'Specific feedback names something in a student’s answer or work; general feedback is praise or acknowledgement on its own. Tone of voice is never judged — only the words.',
  content_lens:
    'The topic is read from what you said. “What worked” and “Take it further” are a subject specialist’s reading of your lines; the general guidance below is about the topic, not a reading of your lesson.',
}

export type InsightsSlots = {
  /// Shown at the foot of each section: the Hard Look and Discuss with Coach.
  footer: (section: SectionKey) => React.ReactNode
  /// Cards that belong to Climate & Routines and are built elsewhere.
  climateExtra?: React.ReactNode
  contentNotes: {
    sending: boolean
    error: string | null
    locked: boolean
    onGenerate: () => void
  }
}

function HowToRead({ section }: { section: SectionKey }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-hairline pt-2">
      <button type="button" onClick={() => setOpen(!open)} className="text-[13px] font-semibold text-forest">
        How to read this {open ? '−' : '+'}
      </button>
      {open && <p className="mt-1 text-[13px] text-ink-soft">{HOW_TO_READ[section]}</p>}
    </div>
  )
}

function Footer({ section, slots }: { section: SectionKey; slots: InsightsSlots }) {
  return (
    <>
      <HowToRead section={section} />
      {slots.footer(section)}
    </>
  )
}

/// The coach note a section shows: the written one once it exists; nothing
/// while it is being written; and the stored narrative only if writing failed.
function coachFor(section: SectionModel, notes: NotesState): { coach: CoachText; pending: boolean } {
  if (notes.status === 'pending') return { coach: null, pending: true }
  const note = notes.status === 'ready' ? notes.notes.sections[section.key] : undefined
  if (!note) return { coach: section.coach, pending: false }
  if (note.source === 'unavailable' || !note.lead) return { coach: null, pending: false }
  return { coach: { lead: note.lead, more: note.more.length > 0 ? note.more.join('\n\n') : null }, pending: false }
}

/// Keep / Try from the written note, pointing at the page's own lines. The
/// built-in Keep / Try stands until the note exists, and wherever the note has
/// none.
function keepTryFor(section: SectionModel, notes: NotesState): KeepTryModel {
  const note: InsightsSectionNote | undefined = notes.status === 'ready' ? notes.notes.sections[section.key] : undefined
  if (!note || note.source !== 'model') return section.keepTry
  const line = (id: string): Evidence | null =>
    section.findings.flatMap((f) => f.evidence).find((e) => e.id === id) ?? null
  return {
    keep: note.keep ? { text: note.keep.text, line: line(note.keep.evidenceId) } : section.keepTry.keep,
    tryNext: note.try
      ? { text: note.try.text, line: line(note.try.evidenceId), rewrite: note.try.rewrite }
      : section.keepTry.tryNext,
  }
}

type NotesState = { status: 'pending' } | { status: 'ready'; notes: InsightsNotes } | { status: 'failed' }

/// `charts` puts a chart under the finding it draws.
function Findings({
  model,
  report,
  charts = {},
}: {
  model: SectionModel
  report: AudioSessionWithSegments
  charts?: Record<string, React.ReactNode>
}) {
  return (
    <>
      {model.findings.map((f) => (
        <Fragment key={f.key}>
          <FindingRow finding={f} segments={report.segments} />
          {charts[f.key]}
        </Fragment>
      ))}
    </>
  )
}

export default function InsightsPage({ report, slots }: { report: AudioSessionWithSegments; slots: InsightsSlots }) {
  const model = useMemo(() => buildInsightsModel(report), [report])
  const { talk, questioning, clarity, climate } = model

  // The coach notes: stored ones come straight back, new findings are written
  // once (server lib/insightsNotes.ts). The request is what the page shows,
  // so it is keyed on that.
  const notesInput = useMemo(() => buildNotesInput(model), [model])
  const notesKey = useMemo(() => JSON.stringify(notesInput), [notesInput])
  // The result is kept with the request it answered; anything else is still
  // being written.
  const [answered, setAnswered] = useState<{ key: string; state: NotesState } | null>(null)
  const requestKey = `${report.id}:${notesKey}`
  const notes: NotesState = answered?.key === requestKey ? answered.state : { status: 'pending' }
  useEffect(() => {
    let live = true
    writeInsightsNotes(report.id, JSON.parse(notesKey))
      // A reply without sections is a failed write, not notes.
      .then((n) =>
        live &&
        setAnswered({
          key: requestKey,
          state: n && typeof n.sections === 'object' && n.sections ? { status: 'ready', notes: n } : { status: 'failed' },
        }),
      )
      .catch(() => live && setAnswered({ key: requestKey, state: { status: 'failed' } }))
    return () => {
      live = false
    }
  }, [report.id, notesKey, requestKey])

  // The Content Lens with any guidance links the notes made.
  const contentLinks = notes.status === 'ready' ? notes.notes.sections.content_lens?.guidanceLinks : undefined
  const content = useMemo(() => applyGuidanceLinks(model.content, contentLinks ?? []), [model.content, contentLinks])

  // The focus loop: the focus picked on this report for the teacher's next
  // lesson, and the one picked on their previous lesson, checked here.
  const [picked, setPicked] = useState<NextFocus | null>(report.lessonFocus?.next ?? null)
  const [focusSaving, setFocusSaving] = useState(false)
  const [focusError, setFocusError] = useState<string | null>(null)
  const pick = useCallback(
    (candidate: FocusCandidate) => {
      setFocusSaving(true)
      setFocusError(null)
      setNextFocus(report.id, candidate)
        .then((f) => setPicked(f.next ?? null))
        .catch(() => setFocusError('That focus could not be saved. Please try again.'))
        .finally(() => setFocusSaving(false))
    },
    [report.id],
  )
  const [previous, setPrevious] = useState<{ sessionId: string; next: NextFocus } | null>(null)
  useEffect(() => {
    let live = true
    getPreviousFocus(report.id)
      .then((r) => live && setPrevious(r.previous))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [report.id])
  const checkIn = useMemo(
    () => (previous ? checkFocus(model, previous.next, previous.sessionId) : null),
    [model, previous],
  )
  // Kept on this lesson so My Growth can list it; saved whenever what it
  // found changes, never more.
  const checkInKey = checkIn ? JSON.stringify(checkIn) : null
  useEffect(() => {
    if (!checkInKey) return
    saveFocusCheckIn(report.id, JSON.parse(checkInKey)).catch(() => {})
  }, [report.id, checkInKey])

  // "Not right?" flags this teacher already left on this lesson. A failed
  // load just means none show as flagged; flagging still works.
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  useEffect(() => {
    let live = true
    getQuoteFlags(report.id)
      .then((flags) => live && setFlagged(new Set(flags.map((f) => `${f.findingKey}:${f.segmentId}`))))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [report.id])
  const flag = useCallback<QuoteFlagState['flag']>(
    async (findingKey, evidence) => {
      if (!evidence.segmentId) return
      await flagQuote(report.id, {
        findingKey,
        segmentId: evidence.segmentId,
        quote: evidence.quote,
        timestampSec: evidence.timestampSec,
      })
      setFlagged((prev) => new Set(prev).add(`${findingKey}:${evidence.segmentId}`))
    },
    [report.id],
  )
  const flagState = useMemo<QuoteFlagState>(
    () => ({ isFlagged: (findingKey, segmentId) => flagged.has(`${findingKey}:${segmentId}`), flag }),
    [flagged, flag],
  )

  const sectionsByKey = { talk_pace: talk, questioning, clarity, climate, content_lens: content }
  const focusActionFor = (section: SectionModel) => {
    const candidate = focusFromTry(section, keepTryFor(section, notes))
    if (!candidate) return undefined
    const isPicked =
      !!picked && picked.findingKey === candidate.findingKey && picked.text === candidate.text
    return { picked: isPicked, saving: focusSaving, onPick: () => pick(candidate) }
  }
  const suggested = suggestFocus({ ...model, content }, (s) => keepTryFor(sectionsByKey[s.key] ?? s, notes))
  const oneFocus: FocusCandidate | null = picked ?? suggested

  return (
    <QuoteFlagContext.Provider value={flagState}>
    <div className="min-w-0">
      {previous && checkIn && (
        <FocusCheckInCard focus={previous.next} checkIn={checkIn} teacherName={report.teacherName} />
      )}

      <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Insights sections">
        {ORDER.map((key) => (
          <a
            key={key}
            href={`#insights-${key}`}
            className="flex items-center gap-[7px] rounded-full border border-hairline bg-cream-card px-2.5 py-1.5 text-[12.5px] text-ink no-underline"
          >
            <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-md text-[12px] font-extrabold text-white ${META[key].chip}`}>
              {META[key].n}
            </span>
            {META[key].title}
          </a>
        ))}
      </nav>

      {/* 1 TALK & PACE */}
      <SectionCard id="insights-talk_pace" meta={META.talk_pace} footer={<Footer section="talk_pace" slots={slots} />}>
        <CoachNote {...coachFor(talk, notes)} />
        {talk.flow ? (
          <TalkFlowChart flow={talk.flow} timeline={talk.timeline} />
        ) : (
          <EmptyEvidence>The lesson timeline is not available for this recording.</EmptyEvidence>
        )}
        {/* Pace as one number with its anchor: a minute-by-minute line was
            noise that invited reading too much into single minutes. */}
        {talk.wpm != null && (
          <div className="mt-3.5 rounded-2xl bg-cream px-4 py-3">
            <p className="m-0 text-sm text-ink">
              <b>Your pace — {talk.wpm} words a minute.</b> Everyday conversation runs about 150.
            </p>
            <p className="m-0 mt-0.5 text-[12px] text-ink-soft">An anchor to place yourself against, not a target.</p>
          </div>
        )}
        <Findings model={talk} report={report} />
        <KeepTry model={keepTryFor(talk, notes)} focusAction={focusActionFor(talk)} />
      </SectionCard>

      {/* 2 QUESTIONING */}
      <SectionCard id="insights-questioning" meta={META.questioning} footer={<Footer section="questioning" slots={slots} />}>
        <CoachNote {...coachFor(questioning, notes)} />
        {questioning.squares.length > 0 && <QuestionSquares squares={questioning.squares} />}
        <Findings
          model={questioning}
          report={report}
          charts={{
            held_open: questioning.heldOpen.length > 0 && (
              <HeldOpenBars questions={questioning.heldOpen} typicalSec={questioning.heldTypicalSec} />
            ),
          }}
        />
        <KeepTry model={keepTryFor(questioning, notes)} focusAction={focusActionFor(questioning)} />
      </SectionCard>

      {/* 3 CLARITY */}
      <SectionCard id="insights-clarity" meta={META.clarity} footer={<Footer section="clarity" slots={slots} />}>
        <CoachNote {...coachFor(clarity, notes)} />
        {clarity.directions.length > 0 && <DirectionsGrid rows={clarity.directions} />}
        <Findings model={clarity} report={report} />
        <KeepTry model={keepTryFor(clarity, notes)} focusAction={focusActionFor(clarity)} />
      </SectionCard>

      {/* 4 CLIMATE */}
      <SectionCard id="insights-climate" meta={META.climate} footer={<Footer section="climate" slots={slots} />}>
        <CoachNote {...coachFor(climate, notes)} />
        <Findings model={climate} report={report} />
        {slots.climateExtra && <div className="mt-4 flex flex-col gap-4">{slots.climateExtra}</div>}
        <KeepTry model={keepTryFor(climate, notes)} focusAction={focusActionFor(climate)} />
      </SectionCard>

      {/* 5 CONTENT LENS */}
      <SectionCard id="insights-content_lens" meta={META.content_lens} footer={<Footer section="content_lens" slots={slots} />}>
        {content.state === 'unavailable' ? (
          <EmptyEvidence>Content lens unavailable for this lesson: the topic could not be read from your speech.</EmptyEvidence>
        ) : (
          <>
            <span className="mt-2.5 inline-block rounded-full bg-lavender-tint px-3 py-1 text-[12px] font-bold text-[#5B4C93]">
              Topic detected from your speech: {content.topic}
            </span>
            <CoachNote {...coachFor(content, notes)} />
            {!content.notesGenerated && (
              <div className="mt-3 rounded-xl bg-cream px-4 py-3 text-sm">
                {slots.contentNotes.sending ? (
                  <span className="text-ink-soft">A subject specialist is reading your lesson…</span>
                ) : slots.contentNotes.locked ? (
                  <span className="text-ink-soft">Specialist notes were not written for this lesson.</span>
                ) : (
                  <button type="button" onClick={slots.contentNotes.onGenerate} className="font-semibold text-terracotta-600">
                    Get a subject specialist’s notes on this lesson →
                  </button>
                )}
                {slots.contentNotes.error && <p className="mt-1 text-terracotta-600">{slots.contentNotes.error}</p>}
              </div>
            )}
            <Findings model={content} report={report} />
            {content.terms.length > 0 && (
              <div className="mt-4 border-t border-dashed border-hairline pt-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2.5">
                  <h3 className="m-0 font-heading text-[15.5px] font-bold text-forest">Terms you used</h3>
                  <span className="font-heading text-[15px] font-extrabold text-forest">{content.terms.length} terms</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {content.terms.map((t) => (
                    <span key={t.term} className="rounded-full bg-mint-tint px-2.5 py-1 text-[12.5px] font-semibold text-forest">
                      {t.term}
                      {t.count > 1 ? ` ×${t.count}` : ''}
                    </span>
                  ))}
                </div>
                {content.leanedOn.length > 0 && (
                  <p className="mt-2.5 text-[13.5px]">
                    You leaned on {new Intl.ListFormat('en', { type: 'conjunction' }).format(content.leanedOn.map((t) => `“${t}”`))}.
                    Next time, have students use {content.leanedOn.length === 1 ? 'it' : 'each one'} in a sentence of their own.
                  </p>
                )}
              </div>
            )}
            <KeepTry model={keepTryFor(content, notes)} focusAction={focusActionFor(content)} />
            {(content.guidance.stuck.length > 0 || content.guidance.waysIn.length > 0) && (
              <div className="mt-3.5 rounded-xl bg-lavender-tint px-4 py-3 text-[13px] text-[#4A3F78]">
                <b>General guidance · about the topic, not a reading of your lesson</b>
                {content.guidance.waysIn.length > 0 && (
                  <p className="mt-1.5">
                    <b>Ways in:</b> {content.guidance.waysIn.join(' · ')}
                  </p>
                )}
                {content.guidance.stuck.length > 0 && (
                  <>
                    <p className="mb-0 mt-1">
                      <b>Where students often get stuck:</b>
                    </p>
                    <ul className="m-0 mt-0.5 list-disc pl-5">
                      {content.guidance.stuck.map((item, i) => (
                        <li key={i}>
                          {item}
                          {content.guidance.stuckLinks[i] != null && (
                            <span className="font-bold text-terracotta-600">
                              {' '}
                              → linked to your line at {mmss(content.guidance.stuckLinks[i])}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            {content.notesGenerated && !slots.contentNotes.locked && (
              // Capped per report: each rewrite is a different reading, and
              // the earlier ones are kept rather than silently replaced.
              content.rewritesLeft > 0 ? (
                <button
                  type="button"
                  onClick={slots.contentNotes.onGenerate}
                  disabled={slots.contentNotes.sending}
                  className="mt-3 text-[13px] font-semibold text-terracotta-600 disabled:opacity-50"
                >
                  {slots.contentNotes.sending
                    ? 'Writing the notes again…'
                    : `Write these notes again ↻ (${content.rewritesLeft} left)`}
                </button>
              ) : (
                <p className="mt-3 text-[12.5px] text-ink-soft">
                  These notes have been written again twice, the most for one report.
                </p>
              )
            )}
          </>
        )}
      </SectionCard>

      {oneFocus && (
        <OneFocusCard
          focus={oneFocus}
          picked={!!picked}
          teacherName={report.teacherName}
          saving={focusSaving}
          error={focusError}
          onPick={() => pick(oneFocus)}
        />
      )}

      {!STUDENT_METRICS_ON && <UnavailablePanel items={NOT_IN_THIS_REPORT} />}
    </div>
    </QuoteFlagContext.Provider>
  )
}
