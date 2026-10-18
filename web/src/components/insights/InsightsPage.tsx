// The Insights tab, v3 layout (wivoza-insights-plan-v3.html): five sections
// on one page, each a coach note, its findings with the teacher's own lines,
// and a Keep / Try next time.
//
// Everything shown is decided by buildInsightsModel; this file only lays it
// out. Pieces that already live elsewhere in the report — the Hard Look,
// Discuss with Coach, the escalation and correction cards, regenerating the
// content notes — are passed in rather than rebuilt.

import { useMemo, useState } from 'react'
import type { AudioSessionWithSegments } from '../../lib/api'
import { buildInsightsModel, type SectionKey, type SectionModel } from '../../lib/insightsModel'
import { NOT_IN_THIS_REPORT, STUDENT_METRICS_ON } from '../../lib/teacherVoice'
import { DirectionsGrid, LessonTimeline, QuestionSquares } from './InsightsCharts'
import { CoachNote, EmptyEvidence, FindingRow, KeepTry, SectionCard, UnavailablePanel, type SectionMeta } from './InsightsParts'

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
    'Talk share is your speech as a share of the recording. Pace is words a minute of your own speaking time — everyday conversation runs about 150, an anchor rather than a target. A fast stretch is over 180 words a minute held for 30 seconds or more.',
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

function Findings({ model, report }: { model: SectionModel; report: AudioSessionWithSegments }) {
  return (
    <>
      {model.findings.map((f) => (
        <FindingRow key={f.key} finding={f} segments={report.segments} />
      ))}
    </>
  )
}

export default function InsightsPage({ report, slots }: { report: AudioSessionWithSegments; slots: InsightsSlots }) {
  const model = useMemo(() => buildInsightsModel(report), [report])
  const { talk, questioning, clarity, climate, content } = model

  return (
    <div className="min-w-0">
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
        <div className="mt-3 flex flex-wrap gap-2 text-[12.5px]">
          {talk.talkPct != null && <span className="rounded-full bg-cream px-3 py-1">You spoke {Math.round(talk.talkPct)}% of the recording</span>}
          {talk.wpm != null && <span className="rounded-full bg-cream px-3 py-1">{talk.wpm} words a minute · an anchor, not a target</span>}
        </div>
        <CoachNote coach={talk.coach} />
        {talk.timeline ? (
          <LessonTimeline model={talk.timeline} />
        ) : (
          <EmptyEvidence>The lesson timeline is not available for this recording.</EmptyEvidence>
        )}
        <Findings model={talk} report={report} />
        <KeepTry model={talk.keepTry} />
      </SectionCard>

      {/* 2 QUESTIONING */}
      <SectionCard id="insights-questioning" meta={META.questioning} footer={<Footer section="questioning" slots={slots} />}>
        <CoachNote coach={questioning.coach} />
        {questioning.squares.length > 0 && <QuestionSquares squares={questioning.squares} />}
        <Findings model={questioning} report={report} />
        <KeepTry model={questioning.keepTry} />
      </SectionCard>

      {/* 3 CLARITY */}
      <SectionCard id="insights-clarity" meta={META.clarity} footer={<Footer section="clarity" slots={slots} />}>
        <CoachNote coach={clarity.coach} />
        {clarity.directions.length > 0 && <DirectionsGrid rows={clarity.directions} />}
        <Findings model={clarity} report={report} />
        <KeepTry model={clarity.keepTry} />
      </SectionCard>

      {/* 4 CLIMATE */}
      <SectionCard id="insights-climate" meta={META.climate} footer={<Footer section="climate" slots={slots} />}>
        <CoachNote coach={climate.coach} />
        <Findings model={climate} report={report} />
        {slots.climateExtra && <div className="mt-4 flex flex-col gap-4">{slots.climateExtra}</div>}
        <KeepTry model={climate.keepTry} />
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
            <CoachNote coach={content.coach} />
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
            <KeepTry model={content.keepTry} />
            {(content.guidance.stuck.length > 0 || content.guidance.waysIn.length > 0) && (
              <div className="mt-3.5 rounded-xl bg-lavender-tint px-4 py-3 text-[13px] text-[#4A3F78]">
                <b>General guidance · about the topic, not a reading of your lesson</b>
                {content.guidance.waysIn.length > 0 && (
                  <p className="mt-1.5">
                    <b>Ways in:</b> {content.guidance.waysIn.join(' · ')}
                  </p>
                )}
                {content.guidance.stuck.length > 0 && (
                  <p className="mt-1">
                    <b>Where students often get stuck:</b> {content.guidance.stuck.join(' · ')}
                  </p>
                )}
              </div>
            )}
            {content.notesGenerated && !slots.contentNotes.locked && (
              <button
                type="button"
                onClick={slots.contentNotes.onGenerate}
                disabled={slots.contentNotes.sending}
                className="mt-3 text-[13px] font-semibold text-terracotta-600 disabled:opacity-50"
              >
                {slots.contentNotes.sending ? 'Writing the notes again…' : 'Write these notes again ↻'}
              </button>
            )}
          </>
        )}
      </SectionCard>

      {!STUDENT_METRICS_ON && <UnavailablePanel items={NOT_IN_THIS_REPORT} />}
    </div>
  )
}
