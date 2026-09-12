import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ACCENTS,
  Callout,
  ReportCover,
  ReportFooter,
  ReportSection,
  ReportShell,
  ReportState,
  StatTile,
  type Accent,
} from '../components/report'
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

// Bridges the audio report's confidence-gated metrics onto the shared
// StatTile: an unmeasurable value prints as a dash WITH its reason, never as
// a zero. That distinction is the credibility of the whole report.
function Stat({ label, metric, unit, accent }: { label: string; metric: ConfidentMetric; unit?: string; accent: Accent }) {
  const confident = isConfidentState(metric.state)
  return (
    <StatTile
      label={label}
      value={metric.display}
      unit={confident ? unit : undefined}
      hint={confident ? undefined : metric.reason}
      accent={accent}
    />
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

  if (loading) return <ReportState text="Loading…" />
  if (!session) return <ReportState text="Session not found." />

  const metrics = session.metricsDetail ?? {}
  // metricsDetail is nullable in the schema, so a session analyzed before a
  // given count existed has no key at all. Coercing that to 0 prints a
  // confident zero directly under a coverage line promising the opposite, so
  // absence stays null here and only becomes 0 where it is genuine arithmetic.
  const rawNum = (k: string): number | null => (typeof metrics[k] === 'number' ? (metrics[k] as number) : null)
  const num = (k: string): number => rawNum(k) ?? 0
  const recordedSec = session.durationSec ?? 0
  const coverage = getCoverage(session.durationSec, session.phases)
  const isShort = recordedSec > 0 && recordedSec < TINY_RECORDING_THRESHOLD_SEC

  const teacherPct = session.teacherTalkPct
  const studentPct = session.studentTalkPct
  const silencePct =
    teacherPct != null && studentPct != null ? Math.max(0, Math.round(100 - teacherPct - studentPct)) : null

  const questions = getCountMetric({ count: session.questionCount, recordedSec })
  const higherOrder =
    session.questionCount != null && rawNum('higherOrderQuestionCount') != null
      ? formatRatio(num('higherOrderQuestionCount'), session.questionCount)
      : null
  const waitTime = getPresenceMetric(session.avgWaitTimeSec)
  const followUps = getCountMetric({ count: rawNum('followUpQuestionCount'), recordedSec })
  const cfu = getCountMetric({
    count: session.cfuCount,
    recordedSec,
    minDurationSec: MIN_DURATION_FOR_CFU_DETECTION_SEC,
  })
  const feedbackCounted = rawNum('specificFeedbackCount') != null || rawNum('genericFeedbackCount') != null
  const feedbackTotal = num('specificFeedbackCount') + num('genericFeedbackCount')
  const feedbackMoments = getCountMetric({ count: feedbackCounted ? feedbackTotal : null, recordedSec })
  const specificShare = feedbackTotal > 0 ? formatRatio(num('specificFeedbackCount'), feedbackTotal) : null
  const teacherTalk = getPresenceMetric(teacherPct)
  const studentTalk = getPresenceMetric(studentPct)

  const A = ACCENTS
  const content = session.lessonContent
  // Two sections below are conditional, so the numbers have to be counted
  // as they render — hardcoding them printed 1,2,3,5,7 on a sparse session,
  // which reads as missing pages rather than as sections that don't apply.
  let n = 0

  return (
    <ReportShell backTo="/audio-coaching">
        <ReportCover
          eyebrow="Wivoza · Lesson Debrief"
          title={session.classSubject || 'Lesson report'}
          accentTitle={session.period ?? undefined}
          meta={[
            session.teacherName,
            formatSessionDateTime(session.sessionDate),
            session.gradeLevel,
            session.durationSec ? `${formatTime(session.durationSec)} recorded` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          badge={isShort ? 'Short excerpt — read as a snapshot, not a full lesson' : undefined}
        />

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

        {/* Talk & participation */}
        <ReportSection n={++n} title="Talk & Participation" blurb="Who was heard, and for how long." accent={A.terracotta}>
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
        </ReportSection>

        {/* Questions & thinking */}
        <ReportSection n={++n} title="Questions & Thinking" blurb="What you asked, and how long you left for an answer." accent={A.gold}>
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
        </ReportSection>

        {/* Checks & feedback */}
        <ReportSection n={++n} title="Checks & Feedback" blurb="How you checked they were with you, and how specific your feedback was." accent={A.mint}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Checks for understanding" metric={cfu} accent={A.mint} />
            {specificShare && <Stat label="Feedback that was specific" metric={specificShare} accent={A.mint} />}
            <Stat label="Feedback moments" metric={feedbackMoments} accent={A.mint} />
          </div>
        </ReportSection>

        {/* Clarity & content */}
        {content && (
          <ReportSection n={++n} title="Clarity & Content" blurb="What the lesson said it was about, in its own words." accent={A.forest}>
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
          </ReportSection>
        )}

        {/* Climate & routines */}
        <ReportSection n={++n} title="Climate & Routines" blurb="Counts, not scores. There is no such thing as a correct number here." accent={A.terracotta}>
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
                metric={getCountMetric({ count: rawNum(key), recordedSec })}
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
        </ReportSection>

        {/* Moments */}
        {session.highlights && session.highlights.length > 0 && (
          <ReportSection n={++n} title="Moments Worth Revisiting" blurb="Specific points in the recording, with timestamps." accent={A.gold}>
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
          </ReportSection>
        )}

        {/* Reflection */}
        <ReportSection n={++n} title="My Reflection" blurb="Your own words — the part that turns a report into a change." accent={A.forest}>
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
        </ReportSection>

        <ReportFooter />
    </ReportShell>
  )
}
