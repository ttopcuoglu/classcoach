import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { WarningIcon } from '../components/icons'
import { getAudioSession, type AudioSessionWithSegments } from '../lib/api'
import {
  formatRatio,
  getCoverage,
  getCountMetric,
  getPresenceMetric,
  MIN_DURATION_FOR_CFU_DETECTION_SEC,
  SHORT_SESSION_THRESHOLD_SEC,
} from '../lib/reportConfidence'

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatHighlightHeadline(h: { label: string; timestampSec: number; durationSec?: number }): string {
  if (h.durationSec != null) {
    return `${h.label}: ${Math.round(h.durationSec)}s — occurred at ${formatTime(h.timestampSec)}`
  }
  return `${h.label} · ${formatTime(h.timestampSec)}`
}

// Mirrors AudioCoaching.tsx's buildTinyRecordingSnapshot wording — this
// export view is a fully independent render path with its own local
// copies of every helper, so the two must be kept in sync by hand.
function formatTinyRecordingSnapshot(
  session: AudioSessionWithSegments,
  coverage: ReturnType<typeof getCoverage>,
): string {
  const parts: string[] = [`This is a short excerpt (${formatTime(coverage.recordedSec)}), not a full lesson.`]
  if (session.questionCount != null && session.questionCount > 0) {
    parts.push(`It includes ${session.questionCount} detected question${session.questionCount === 1 ? '' : 's'}.`)
  }
  if (session.studentTalkPct == null || session.studentTalkPct === 0) {
    parts.push('Student voice was not separately identified in this clip.')
  }
  parts.push('Review the moments below and add your own classroom context before drawing any broader conclusions.')
  return parts.join(' ')
}

function formatSessionDateTime(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date} at ${time}`
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

  return (
    <div className="min-h-screen bg-canvas px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <Link to="/audio-coaching" className="text-sm font-medium text-ink-soft hover:text-ink">
            ← Back
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
          >
            Print / Save as PDF
          </button>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-ink-soft">Loading...</p>
        ) : !session ? (
          <p className="mt-8 text-sm text-ink-soft">Session not found.</p>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-ink">Wivoza — Lesson Debrief Report</h1>
            <p className="mt-1 text-sm text-ink-soft">
              {session.teacherName ? `${session.teacherName} · ` : ''}
              {session.classSubject || 'New Recording'}
              {session.period ? ` · ${session.period}` : ''}
              {session.gradeLevel ? ` · ${session.gradeLevel}` : ''}
            </p>
            <p className="text-sm text-ink-soft">
              {formatSessionDateTime(session.sessionDate)}
              {session.durationSec ? ` · ${formatTime(session.durationSec)}` : ''}
            </p>

            {(() => {
              const metrics = session.metricsDetail ?? {}
              const recordedSec = session.durationSec ?? 0
              const coverage = getCoverage(session.durationSec, session.phases)
              const higherOrderRatio =
                session.questionCount != null
                  ? formatRatio(
                      typeof metrics.higherOrderQuestionCount === 'number' ? metrics.higherOrderQuestionCount : 0,
                      session.questionCount,
                    )
                  : null
              const questionsMetric = getCountMetric({ count: session.questionCount, recordedSec })
              const cfuMetric = getCountMetric({
                count: session.cfuCount,
                recordedSec,
                minDurationSec: MIN_DURATION_FOR_CFU_DETECTION_SEC,
              })
              const teacherTalkMetric = getPresenceMetric(session.teacherTalkPct)
              const studentTalkMetric = getPresenceMetric(session.studentTalkPct)
              const waitTimeMetric = getPresenceMetric(session.avgWaitTimeSec)

              return (
                <>
                  {session.classSummary && (
                    <div className="mt-4 break-inside-avoid rounded-xl border border-border bg-surface p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">This lesson</p>
                      <p className="mt-1.5 text-sm text-ink">{session.classSummary}</p>
                    </div>
                  )}
                  <p className="mt-4 break-inside-avoid text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    Coverage: {formatTime(coverage.recordedSec)} recorded of {formatTime(coverage.totalSec)}
                    {coverage.uncapturedPhases.length > 0 && (
                      <> · Not meaningfully captured: {coverage.uncapturedPhases.join(', ')}</>
                    )}
                  </p>
                  {coverage.isTinyRecording ? (
                    <div className="mt-2 flex items-start gap-3 break-inside-avoid rounded-xl border border-border bg-surface p-4">
                      <span className="mt-0.5 shrink-0 rounded-full bg-warm-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-500">
                        Short excerpt
                      </span>
                      <p className="text-sm text-ink">{formatTinyRecordingSnapshot(session, coverage)}</p>
                    </div>
                  ) : (
                    coverage.isShort && (
                      <div className="mt-2 flex items-start gap-3 break-inside-avoid rounded-xl border-2 border-warm-500 bg-warm-100 p-4">
                        <WarningIcon className="mt-0.5 h-5 w-5 shrink-0 text-warm-500" />
                        <p className="text-sm font-semibold text-warm-500">
                          Session under {Math.round(SHORT_SESSION_THRESHOLD_SEC / 60)} minutes — treat metrics as
                          indicative, not conclusive.
                        </p>
                      </div>
                    )
                  )}

                  <section className="mt-6 break-inside-avoid rounded-xl border border-border p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Talk & Participation</p>
                    <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <Stat
                        label="Teacher talk"
                        value={session.teacherTalkPct != null ? `${session.teacherTalkPct}%` : teacherTalkMetric.display}
                        reason={teacherTalkMetric.reason}
                      />
                      <Stat
                        label="Student talk"
                        value={session.studentTalkPct != null ? `${session.studentTalkPct}%` : studentTalkMetric.display}
                        reason={studentTalkMetric.reason}
                      />
                    </div>
                  </section>

                  <section className="mt-4 break-inside-avoid rounded-xl border border-border p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Questioning & Thinking</p>
                    <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <Stat label="Questions" value={questionsMetric.display} reason={questionsMetric.reason} />
                      <Stat
                        label="Higher-order"
                        value={higherOrderRatio ? higherOrderRatio.display : '—'}
                        reason={higherOrderRatio?.reason}
                      />
                      <Stat
                        label="Avg. wait time"
                        value={session.avgWaitTimeSec != null ? `${session.avgWaitTimeSec}s` : waitTimeMetric.display}
                        reason={waitTimeMetric.reason}
                      />
                    </div>
                  </section>

                  <section className="mt-4 break-inside-avoid rounded-xl border border-border p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Checking Understanding</p>
                    <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <Stat label="Checks for understanding" value={cfuMetric.display} reason={cfuMetric.reason} />
                    </div>
                  </section>
                </>
              )
            })()}

            {session.lessonContent && (
              <section className="mt-4 break-inside-avoid rounded-xl border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Lesson Content <span className="font-normal normal-case italic">(flags & quotes only — not scored)</span>
                </p>
                <div className="mt-2 flex flex-col gap-2 text-sm text-ink">
                  <p>
                    <span className="text-xs font-semibold text-ink-soft">Topic terms: </span>
                    {Array.isArray(session.lessonContent.topicTerms) ? (
                      session.lessonContent.topicTerms.length > 0 ? (
                        session.lessonContent.topicTerms.join(', ')
                      ) : (
                        'None detected.'
                      )
                    ) : (
                      <>
                        Teacher:{' '}
                        {session.lessonContent.topicTerms.teacher.length > 0
                          ? session.lessonContent.topicTerms.teacher.map((t) => t.term).join(', ')
                          : 'None detected.'}
                        {session.lessonContent.topicTerms.student.length > 0 && (
                          <>
                            {' '}
                            · Student: {session.lessonContent.topicTerms.student.map((t) => t.term).join(', ')}
                          </>
                        )}
                      </>
                    )}
                  </p>
                  <p>
                    <span className="text-xs font-semibold text-ink-soft">Stated objective: </span>
                    {session.lessonContent.statedObjective.found === null
                      ? 'Opening phase not captured.'
                      : session.lessonContent.statedObjective.found
                        ? `"${session.lessonContent.statedObjective.quote}"`
                        : 'Not detected.'}
                  </p>
                  <p>
                    <span className="text-xs font-semibold text-ink-soft">Connections: </span>
                    {session.lessonContent.connections.length > 0
                      ? session.lessonContent.connections.map((c) => `"${c.quote}"`).join('; ')
                      : 'None detected.'}
                  </p>
                  <p>
                    <span className="text-xs font-semibold text-ink-soft">Vocabulary: </span>
                    {session.lessonContent.vocabulary.length > 0
                      ? session.lessonContent.vocabulary.map((v) => `"${v.quote}"`).join('; ')
                      : 'None detected.'}
                  </p>
                </div>
              </section>
            )}

            {session.highlights && session.highlights.length > 0 && (
              <section className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Highlights</p>
                <div className="mt-2 flex flex-col gap-3">
                  {session.highlights.map((h, i) => (
                    <article key={i} className="break-inside-avoid rounded-xl border border-border p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                        {formatHighlightHeadline(h)}
                      </p>
                      <p className="mt-1.5 text-sm text-ink">"{h.excerpt}"</p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-6 break-inside-avoid rounded-xl border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Reflecting on your session</p>
              <div className="mt-2 flex flex-col gap-3">
                <div>
                  <p className="text-xs font-semibold text-ink-soft">Strengths</p>
                  <p className="mt-0.5 text-sm whitespace-pre-wrap text-ink">{session.strengths || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-soft">Growth areas</p>
                  <p className="mt-0.5 text-sm whitespace-pre-wrap text-ink">{session.growthAreas || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-soft">Next step</p>
                  <p className="mt-0.5 text-sm whitespace-pre-wrap text-ink">{session.nextStep || '—'}</p>
                </div>
                {session.followUpDate && (
                  <div>
                    <p className="text-xs font-semibold text-ink-soft">Follow-up date</p>
                    <p className="mt-0.5 text-sm text-ink">
                      {new Date(session.followUpDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </section>

            <p className="mt-6 break-inside-avoid text-xs text-ink-soft">
              This report reflects what could be heard in the recording — talk patterns, questioning, and
              classroom routines. It doesn't capture lesson planning, materials, physical space, visual
              engagement, or anything outside class time. No audio recording is stored anywhere; this
              transcript-derived summary is the sole record of the session.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, reason }: { label: string; value: string; reason?: string }) {
  const unavailable = value === '—'
  return (
    <div>
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`text-sm font-semibold ${unavailable ? 'text-ink-soft' : 'text-ink'}`} title={reason}>
        {value}
      </p>
      {unavailable && reason && <p className="text-xs text-ink-soft">{reason}</p>}
    </div>
  )
}
