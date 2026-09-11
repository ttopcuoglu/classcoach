import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAudioSession, type AudioQuote, type AudioSessionWithSegments } from '../lib/api'
import {
  formatRatio,
  getCoverage,
  getCountMetric,
  getPresenceMetric,
  isConfidentState,
  MIN_DURATION_FOR_CFU_DETECTION_SEC,
  TINY_RECORDING_THRESHOLD_SEC,
  type ConfidentMetric,
} from '../lib/reportConfidence'

// A printable, section-per-page version of the Lesson Debrief report.
//
// Two constraints shape every decision below. First, it has to survive the
// printer: backgrounds only render because index.css sets
// print-color-adjust: exact globally, and each section carries an explicit
// page break so a teacher can hand one section to a coach without the rest.
// Second, it has to stay as honest as the in-app report — a metric that
// couldn't be measured reliably prints as a dash with its reason, never as a
// zero. That distinction is the whole credibility of the report.

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatSessionDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

type Accent = { band: string; chip: string; tint: string; ink: string; bar: string }

const ACCENTS: Record<string, Accent> = {
  terracotta: { band: 'bg-terracotta', chip: 'bg-peach-tint', tint: 'bg-peach-tint/50', ink: 'text-terracotta-600', bar: 'bg-terracotta' },
  gold: { band: 'bg-gold', chip: 'bg-gold-tint', tint: 'bg-gold-tint/50', ink: 'text-terracotta-600', bar: 'bg-gold' },
  mint: { band: 'bg-brand-500', chip: 'bg-mint-tint', tint: 'bg-mint-tint/50', ink: 'text-forest', bar: 'bg-brand-500' },
  forest: { band: 'bg-forest', chip: 'bg-mint-tint', tint: 'bg-mint-tint/40', ink: 'text-forest', bar: 'bg-forest' },
}

function Section({
  n,
  title,
  blurb,
  accent,
  children,
}: {
  n: number
  title: string
  blurb?: string
  accent: Accent
  children: React.ReactNode
}) {
  return (
    <section className="mt-10 break-before-page break-inside-avoid-page">
      <div className="flex items-center gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${accent.band} font-heading text-xl font-bold text-cream`}>
          {n}
        </span>
        <div>
          <h2 className="font-heading text-2xl font-extrabold leading-tight text-forest">{title}</h2>
          {blurb && <p className="mt-0.5 text-sm text-ink-soft">{blurb}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

// One big number. A dash here is a deliberate statement, so the reason is
// printed alongside rather than left to look like a rendering failure.
function Stat({ label, metric, unit, accent }: { label: string; metric: ConfidentMetric; unit?: string; accent: Accent }) {
  const confident = isConfidentState(metric.state)
  return (
    <div className={`break-inside-avoid rounded-2xl ${accent.chip} p-5`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-forest/60">{label}</p>
      <p className="mt-1 font-heading text-4xl font-extrabold leading-none text-forest">
        {metric.display}
        {confident && unit ? <span className="text-xl font-bold"> {unit}</span> : null}
      </p>
      {!confident && metric.reason && <p className="mt-2 text-xs leading-snug text-forest/70">{metric.reason}</p>}
    </div>
  )
}

function Callout({ label, body, accent }: { label: string; body: string; accent: Accent }) {
  return (
    <div className={`mt-4 break-inside-avoid rounded-2xl ${accent.tint} p-5`}>
      <p className={`text-[11px] font-bold uppercase tracking-wide ${accent.ink}`}>{label}</p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">{body}</p>
    </div>
  )
}

function QuoteList({ label, quotes, accent }: { label: string; quotes: AudioQuote[]; accent: Accent }) {
  if (!quotes?.length) return null
  return (
    <div className="mt-4 break-inside-avoid">
      <p className={`text-[11px] font-bold uppercase tracking-wide ${accent.ink}`}>{label}</p>
      <div className="mt-2 flex flex-col gap-2">
        {quotes.slice(0, 6).map((q, i) => (
          <div key={i} className="rounded-xl border border-hairline bg-white p-3">
            <p className="text-sm italic text-ink">“{q.quote}”</p>
            <p className="mt-1 text-xs text-ink-soft">{formatTime(q.timestampSec)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AudioCoachingExport() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<AudioSessionWithSegments | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    getAudioSession(id)
      .then(setSession)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="p-8 text-sm text-ink-soft">Loading…</p>
  if (!session) return <p className="p-8 text-sm text-ink-soft">Session not found.</p>

  const metrics = session.metricsDetail ?? {}
  const num = (k: string): number => (typeof metrics[k] === 'number' ? (metrics[k] as number) : 0)
  const recordedSec = session.durationSec ?? 0
  const coverage = getCoverage(session.durationSec, session.phases)
  const isShort = recordedSec > 0 && recordedSec < TINY_RECORDING_THRESHOLD_SEC

  const teacherPct = session.teacherTalkPct
  const studentPct = session.studentTalkPct
  const silencePct =
    teacherPct != null && studentPct != null ? Math.max(0, Math.round(100 - teacherPct - studentPct)) : null

  const questions = getCountMetric({ count: session.questionCount, recordedSec })
  const higherOrder =
    session.questionCount != null ? formatRatio(num('higherOrderQuestionCount'), session.questionCount) : null
  const waitTime = getPresenceMetric(session.avgWaitTimeSec)
  const followUps = getCountMetric({ count: num('followUpQuestionCount'), recordedSec })
  const cfu = getCountMetric({
    count: session.cfuCount,
    recordedSec,
    minDurationSec: MIN_DURATION_FOR_CFU_DETECTION_SEC,
  })
  const feedbackTotal = num('specificFeedbackCount') + num('genericFeedbackCount')
  const specificShare = feedbackTotal > 0 ? formatRatio(num('specificFeedbackCount'), feedbackTotal) : null
  const teacherTalk = getPresenceMetric(teacherPct)
  const studentTalk = getPresenceMetric(studentPct)

  const A = ACCENTS
  const content = session.lessonContent

  return (
    <div className="min-h-screen bg-cream px-6 py-8 text-ink print:bg-white print:p-0">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <Link to="/audio-coaching" className="text-sm font-medium text-ink-soft hover:text-ink">
            ← Back
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
          >
            Print / Save as PDF
          </button>
        </div>

        {/* Cover */}
        <header className="overflow-hidden rounded-3xl bg-forest p-8 text-cream">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Wivoza · Lesson Debrief</p>
          <h1 className="mt-3 font-heading text-4xl font-extrabold leading-tight">
            {session.classSubject || 'Lesson report'}
            {session.period ? <span className="text-gold"> · {session.period}</span> : null}
          </h1>
          <p className="mt-2 text-sm text-cream/70">
            {session.teacherName ? `${session.teacherName} · ` : ''}
            {formatSessionDateTime(session.sessionDate)}
            {session.gradeLevel ? ` · ${session.gradeLevel}` : ''}
            {session.durationSec ? ` · ${formatTime(session.durationSec)} recorded` : ''}
          </p>
          {isShort && (
            <p className="mt-4 inline-block rounded-full bg-gold px-3 py-1 text-xs font-bold uppercase tracking-wide text-forest">
              Short excerpt — read as a snapshot, not a full lesson
            </p>
          )}
        </header>

        {session.classSummary && (
          <div className="mt-5 break-inside-avoid rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-6">
            <p className="text-[11px] font-bold uppercase tracking-wide text-terracotta-600">Lesson at a glance</p>
            <p className="mt-2 text-base leading-relaxed text-ink">{session.classSummary}</p>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="You spoke" metric={teacherTalk} unit="%" accent={A.terracotta} />
          <Stat label="Students spoke" metric={studentTalk} unit="%" accent={A.gold} />
          <Stat label="Questions" metric={questions} accent={A.mint} />
          <Stat label="Avg. wait" metric={waitTime} unit="s" accent={A.forest} />
        </div>

        <p className="mt-4 text-xs text-ink-soft">
          Coverage: {formatTime(coverage.recordedSec)} recorded of {formatTime(coverage.totalSec)}. A dash means
          Wivoza could not measure that reliably — never that the answer was zero.
        </p>

        {/* 1 — Talk & participation */}
        <Section n={1} title="Talk & Participation" blurb="Who was heard, and for how long." accent={A.terracotta}>
          {teacherPct != null && studentPct != null ? (
            <>
              <div className="flex h-8 w-full overflow-hidden rounded-full">
                <div className="bg-terracotta" style={{ width: `${teacherPct}%` }} />
                <div className="bg-gold" style={{ width: `${studentPct}%` }} />
                <div className="bg-hairline" style={{ width: `${silencePct ?? 0}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm font-semibold text-ink">
                <span><span className="mr-1.5 inline-block h-3 w-3 rounded-full bg-terracotta align-[-1px]" />You {Math.round(teacherPct)}%</span>
                <span><span className="mr-1.5 inline-block h-3 w-3 rounded-full bg-gold align-[-1px]" />Students {Math.round(studentPct)}%</span>
                <span><span className="mr-1.5 inline-block h-3 w-3 rounded-full bg-hairline align-[-1px]" />Silence {silencePct ?? 0}%</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-soft">
              Talk balance could not be measured for this recording — the speakers were not separable.
            </p>
          )}
        </Section>

        {/* 2 — Questions & thinking */}
        <Section n={2} title="Questions & Thinking" blurb="What you asked, and how long you left for an answer." accent={A.gold}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Questions asked" metric={questions} accent={A.gold} />
            {higherOrder && <Stat label="Higher-order" metric={higherOrder} accent={A.gold} />}
            <Stat label="Avg. wait time" metric={waitTime} unit="s" accent={A.gold} />
            <Stat label="Follow-ups" metric={followUps} accent={A.gold} />
          </div>
          <Callout
            label="Why wait time matters"
            body="Three to five seconds of silence after a question is the single cheapest change most teachers can make. It feels much longer than it is."
            accent={A.gold}
          />
        </Section>

        {/* 3 — Checks & feedback */}
        <Section n={3} title="Checks & Feedback" blurb="How you checked they were with you, and how specific your feedback was." accent={A.mint}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Checks for understanding" metric={cfu} accent={A.mint} />
            {specificShare && <Stat label="Feedback that was specific" metric={specificShare} accent={A.mint} />}
            <Stat
              label="Feedback moments"
              metric={{ state: feedbackTotal > 0 ? 'measured' : 'confirmed_none', display: String(feedbackTotal) }}
              accent={A.mint}
            />
          </div>
        </Section>

        {/* 4 — Clarity & content */}
        {content && (
          <Section n={4} title="Clarity & Content" blurb="What the lesson said it was about, in its own words." accent={A.forest}>
            <div className="break-inside-avoid rounded-2xl bg-mint-tint/50 p-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-forest">Stated objective</p>
              <p className="mt-1.5 text-sm text-ink">
                {content.statedObjective?.found && content.statedObjective.quote
                  ? `“${content.statedObjective.quote}”`
                  : 'No clearly stated objective was detected. Even one sentence naming the goal can anchor a lesson.'}
              </p>
            </div>
            <QuoteList label="Key vocabulary moments" quotes={content.vocabulary ?? []} accent={A.forest} />
            <QuoteList label="Connections to the wider world" quotes={content.connections ?? []} accent={A.forest} />
          </Section>
        )}

        {/* 5 — Climate & routines */}
        <Section n={5} title="Climate & Routines" blurb="Counts, not scores. There is no such thing as a correct number here." accent={A.terracotta}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ['Transitions', 'transitionCount'],
              ['Clear directions', 'directiveCount'],
              ['Student names used', 'nameMentionCount'],
              ['Redirections', 'redirectionCount'],
            ] as const).map(([label, key]) => (
              <Stat
                key={key}
                label={label}
                metric={{ state: 'measured', display: String(num(key)) }}
                accent={A.terracotta}
              />
            ))}
          </div>
          {(num('positivePhraseCount') > 0 || num('correctivePhraseCount') > 0) && (
            <div className="mt-4 break-inside-avoid rounded-2xl bg-peach-tint/50 p-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-terracotta-600">Tone balance</p>
              <div className="mt-3 flex h-6 w-full overflow-hidden rounded-full">
                <div
                  className="bg-brand-500"
                  style={{ width: `${(num('positivePhraseCount') / (num('positivePhraseCount') + num('correctivePhraseCount'))) * 100}%` }}
                />
                <div className="flex-1 bg-terracotta" />
              </div>
              <p className="mt-2 text-sm text-forest">
                {num('positivePhraseCount')} positive · {num('correctivePhraseCount')} corrective
              </p>
            </div>
          )}
        </Section>

        {/* 6 — Moments */}
        {session.highlights && session.highlights.length > 0 && (
          <Section n={6} title="Moments Worth Revisiting" blurb="Specific points in the recording, with timestamps." accent={A.gold}>
            <div className="flex flex-col gap-2">
              {session.highlights.slice(0, 12).map((h, i) => (
                <div key={i} className="flex items-start gap-3 break-inside-avoid rounded-xl border border-hairline bg-white p-3">
                  <span className="shrink-0 rounded-md bg-gold-tint px-2 py-0.5 font-mono text-xs font-bold text-terracotta-600">
                    {formatTime(h.timestampSec)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-forest">{h.label}</p>
                    {h.excerpt && <p className="mt-0.5 text-sm italic text-ink-soft">“{h.excerpt}”</p>}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* 7 — Reflection */}
        <Section n={7} title="My Reflection" blurb="Your own words — the part that turns a report into a change." accent={A.forest}>
          {session.strengths && <Callout label="Strengths" body={session.strengths} accent={A.mint} />}
          {session.growthAreas && <Callout label="Growth areas" body={session.growthAreas} accent={A.gold} />}
          {session.nextStep && <Callout label="My next step" body={session.nextStep} accent={A.terracotta} />}
          {session.followUpDate && (
            <p className="mt-4 text-sm font-semibold text-forest">
              Follow-up date: {new Date(session.followUpDate).toLocaleDateString()}
            </p>
          )}
          {!session.strengths && !session.growthAreas && !session.nextStep && (
            <div className="rounded-2xl border-2 border-dashed border-hairline p-8 text-center">
              <p className="text-sm text-ink-soft">
                No notes written yet. Open the Reflect tab to add your strengths, growth areas and next step —
                they will appear here next time you print.
              </p>
            </div>
          )}
        </Section>

        <footer className="mt-10 break-inside-avoid border-t border-hairline pt-4 text-center text-xs text-ink-soft">
          Generated by Wivoza · wivoza.com · This report is private to you. No administrator sees it.
        </footer>
      </div>
    </div>
  )
}
