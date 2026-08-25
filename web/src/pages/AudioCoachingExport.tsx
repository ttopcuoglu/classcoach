import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAudioSession, type AudioSessionWithSegments } from '../lib/api'

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
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
            <h1 className="text-2xl font-semibold text-ink">ClassCoach — Audio Coaching Report</h1>
            <p className="mt-1 text-sm text-ink-soft">
              {session.teacherName ? `${session.teacherName} · ` : ''}
              {session.classSubject || 'Untitled class'}
              {session.period ? ` · ${session.period}` : ''}
              {session.gradeLevel ? ` · ${session.gradeLevel}` : ''}
            </p>
            <p className="text-sm text-ink-soft">
              {new Date(session.sessionDate).toLocaleDateString()}
              {session.durationSec ? ` · ${formatTime(session.durationSec)}` : ''}
            </p>

            <section className="mt-6 break-inside-avoid rounded-xl border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Snapshot</p>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Teacher talk" value={session.teacherTalkPct != null ? `${session.teacherTalkPct}%` : '—'} />
                <Stat label="Student talk" value={session.studentTalkPct != null ? `${session.studentTalkPct}%` : '—'} />
                <Stat label="Questions" value={session.questionCount != null ? `${session.questionCount}` : '—'} />
                <Stat label="Higher-order %" value={session.higherOrderPct != null ? `${session.higherOrderPct}%` : '—'} />
                <Stat label="Avg. wait time" value={session.avgWaitTimeSec != null ? `${session.avgWaitTimeSec}s` : '—'} />
                <Stat label="CFUs" value={session.cfuCount != null ? `${session.cfuCount}` : '—'} />
              </div>
            </section>

            {session.highlights && session.highlights.length > 0 && (
              <section className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Highlights</p>
                <div className="mt-2 flex flex-col gap-3">
                  {session.highlights.map((h, i) => (
                    <article key={i} className="break-inside-avoid rounded-xl border border-border p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                        {h.label} · {formatTime(h.timestampSec)}
                      </p>
                      <p className="mt-1.5 text-sm text-ink">"{h.excerpt}"</p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-6 break-inside-avoid rounded-xl border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Coach's notes</p>
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
              This report is generated from audio only — it does not capture visual engagement, board or
              visual content, or non-verbal classroom management. No audio recording is stored anywhere;
              this transcript-derived summary is the sole record of the session.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="text-sm font-semibold text-ink">{value}</p>
    </div>
  )
}
