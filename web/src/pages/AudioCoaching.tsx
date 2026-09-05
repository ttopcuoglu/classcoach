import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpIcon, ChatBubbleIcon, MicIcon } from '../components/icons'
import { DashedLinePoint, HatchedBar, HatchedSwatch, NoDataLabel } from '../components/unavailableChart'
import { UpgradeMessage } from '../components/UpgradeMessage'
import { useVoiceTurn } from '../hooks/useVoiceTurn'
import { HATCH_STYLE } from '../lib/chartPatterns'
import { FOCUS_METRIC_GROUPS, FOCUS_METRIC_LABELS } from '../lib/focusMetrics'
import { playQueue, splitIntoSentences } from '../lib/voicePlayback'
import {
  createAudioSession,
  deleteAudioSession,
  generateClassSummary,
  generateContentNotes,
  getAudioSession,
  getAudioSessions,
  getProfile,
  sendReflectMessage,
  summarizeReflectConversation,
  tagSpeaker,
  transcribeAudioSession,
  updateAudioSession,
  updateProfile,
  type AudioContentNotes,
  type AudioHighlight,
  type AudioLessonContent,
  type AudioPhase,
  type AudioQuestionLogEntry,
  type AudioReflectMessage,
  type AudioSession,
  type AudioSessionWithSegments,
  type AudioTopicTerm,
  type FocusMetric,
  type ReflectChatErrorKind,
  type SpeakerSample,
  type TalkVoice,
  type TranscriptSegment,
} from '../lib/api'
import {
  buildEvidenceQualityLine,
  categoryCoverage,
  formatRatio,
  getCoverage,
  getCountMetric,
  getPresenceMetric,
  isConfidentState,
  isMissingState,
  judgeTalkBalance,
  MIN_DURATION_FOR_CFU_DETECTION_SEC,
  MIN_DURATION_FOR_TALK_BALANCE_CANDIDATE_SEC,
  MIN_N_FOR_PERCENT,
  MIN_PHASE_DURATION_SEC,
  SHORT_SESSION_THRESHOLD_SEC,
  type ConfidentMetric,
  type MetricState,
  type TalkBalanceJudgment,
} from '../lib/reportConfidence'

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatSessionDateTime(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date} at ${time}`
}

export default function AudioCoaching() {
  const [sessions, setSessions] = useState<AudioSession[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [active, setActive] = useState<AudioSessionWithSegments | null>(null)
  const [speakers, setSpeakers] = useState<SpeakerSample[]>([])
  const [error, setError] = useState<string | null>(null)
  const [focusMetric, setFocusMetric] = useState<FocusMetric | null>(null)
  const [teacherName, setTeacherName] = useState<string | null>(null)
  const [talkVoice, setTalkVoice] = useState<TalkVoice | null>(null)
  // Only used to decide whether to show the free-tier "X of 3 used this
  // month" line below — an org member could have district/pilot access
  // this client can't verify without a new API call, so the line is only
  // ever shown when we're certain: plain "free" plan, no organization.
  const [showFreeCapLine, setShowFreeCapLine] = useState(false)

  function refreshHistory() {
    getAudioSessions()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }

  useEffect(() => {
    refreshHistory()
    getProfile()
      .then((p) => {
        setFocusMetric(p.focusMetric)
        setTeacherName(p.name)
        setTalkVoice(p.talkVoice)
        setShowFreeCapLine(p.plan === 'free' && p.organizationId == null)
      })
      .catch(() => {})
  }, [])

  const freeRecordingsUsedThisMonth = useMemo(() => {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    return sessions.filter((s) => new Date(s.createdAt) >= startOfMonth).length
  }, [sessions])

  async function handleFocusMetricChange(metric: FocusMetric | null) {
    setFocusMetric(metric)
    try {
      await updateProfile({ focusMetric: metric })
    } catch {
      // best-effort — the selector already reflects the choice locally
    }
  }

  function handleExit() {
    setActive(null)
    setSpeakers([])
    setError(null)
    refreshHistory()
  }

  async function handleOpenSession(id: string) {
    try {
      const full = await getAudioSession(id)
      setActive(full)
    } catch {
      setError('Could not load that session.')
    }
  }

  async function handleDeleteSession(id: string) {
    const confirmed = window.confirm(
      "Permanently delete this recording's transcript and report? This cannot be undone.",
    )
    if (!confirmed) return
    try {
      await deleteAudioSession(id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
    } catch {
      setError('Could not delete that session.')
    }
  }

  // Setup/recording/paused stay on this same page and this same mounted
  // RecordingPanel instance — switching to SessionFlow's own tree for these
  // phases would unmount RecordingPanel mid-capture and silently orphan the
  // live MediaRecorder/stream refs. Only genuinely later phases (which no
  // longer touch the mic) hand off to SessionFlow.
  const isRecordingPhase = active === null || active.status === 'setup' || active.status === 'recording' || active.status === 'paused'

  if (active && !isRecordingPhase) {
    return (
      <SessionFlow
        session={active}
        speakers={speakers}
        onUpdate={setActive}
        onExit={handleExit}
        sessions={sessions}
        focusMetric={focusMetric}
        onFocusMetricChange={handleFocusMetricChange}
        talkVoice={talkVoice}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {!active && (
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-ink md:text-3xl">Lesson Debrief</h1>
          <p className="text-ink-soft">
            Record a class period, get a transcript, and see a coaching report. Audio is never saved — only
            the text.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-warm-500">{error}</p>}

      {!active && showFreeCapLine && (
        <p className="text-sm text-ink-soft">
          {freeRecordingsUsedThisMonth} of 3 free Lesson Debrief recordings used this month.
        </p>
      )}

      <RecordingPanel
        session={active}
        teacherName={teacherName}
        onUpdate={setActive}
        onSpeakers={setSpeakers}
        onExit={handleExit}
      />

      {!active && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Past sessions</h2>
          {historyLoading ? (
            <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
          ) : sessions.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
              Sessions you record will show up here.
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {sessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  onOpen={() => handleOpenSession(s.id)}
                  onDelete={() => handleDeleteSession(s.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SessionFlow({
  session,
  speakers,
  onUpdate,
  onExit,
  sessions,
  focusMetric,
  onFocusMetricChange,
  talkVoice,
}: {
  session: AudioSessionWithSegments
  speakers: SpeakerSample[]
  onUpdate: (s: AudioSessionWithSegments) => void
  onExit: () => void
  sessions: AudioSession[]
  focusMetric: FocusMetric | null
  onFocusMetricChange: (metric: FocusMetric | null) => void
  talkVoice: TalkVoice | null
}) {
  if (session.status === 'transcribing') {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <p className="text-sm text-ink-soft">Transcribing your session...</p>
      </div>
    )
  }
  if (session.status === 'tagging') {
    return <TagSpeakersPanel session={session} speakers={speakers} onUpdate={onUpdate} onExit={onExit} />
  }
  return (
    <ReportPanel
      session={session}
      onUpdate={onUpdate}
      onExit={onExit}
      sessions={sessions}
      focusMetric={focusMetric}
      onFocusMetricChange={onFocusMetricChange}
      talkVoice={talkVoice}
    />
  )
}

function RecordingPanel({
  session,
  teacherName = null,
  onUpdate,
  onSpeakers,
  onExit,
}: {
  session: AudioSessionWithSegments | null
  teacherName?: string | null
  onUpdate: (s: AudioSessionWithSegments) => void
  onSpeakers: (s: SpeakerSample[]) => void
  onExit: () => void
}) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'paused' | 'uploading'>('idle')
  const [elapsedSec, setElapsedSec] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const accumulatedSecRef = useRef(0)
  const runStartRef = useRef<number | null>(null)
  const intervalRef = useRef<number | null>(null)
  const mimeTypeRef = useRef('audio/webm')
  const uploadDurationRef = useRef(0)
  // Tracks the id of a session this exact call to handleRecord just
  // created, so a mic-permission failure right after can clean up that row
  // instead of leaving a dead "setup" entry behind — never touches a
  // session that already existed (e.g. re-opened from Past sessions).
  const justCreatedSessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // Deepgram's batch transcription endpoint has no progress/streaming
  // signal to poll, so this is a simulated estimate, not a real
  // measurement — scaled by how long the recording actually was, since a
  // longer class period genuinely takes longer to transcribe. Same
  // asymptotic-curve technique as TalkToMe.tsx's thinkingProgress: climbs
  // quickly, eases toward ~92%, and only ever reaches 100% implicitly by
  // disappearing the instant the real response arrives and phase moves on.
  useEffect(() => {
    if (phase !== 'uploading') {
      setUploadProgress(0)
      return
    }
    const estimatedMs = Math.max(3000, uploadDurationRef.current * 150)
    const start = Date.now()
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - start
      setUploadProgress(92 * (1 - Math.exp(-elapsed / estimatedMs)))
    }, 100)
    return () => window.clearInterval(interval)
  }, [phase])

  function tick() {
    if (runStartRef.current === null) return
    setElapsedSec(accumulatedSecRef.current + (Date.now() - runStartRef.current) / 1000)
  }

  async function handleRecord() {
    setError(null)
    justCreatedSessionIdRef.current = null
    if (!session) {
      try {
        const created = await createAudioSession({
          teacherName: teacherName || undefined,
          sessionDate: new Date().toISOString(),
          consentConfirmed: true,
        })
        justCreatedSessionIdRef.current = created.id
        onUpdate({ ...created, segments: [] })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start a new session. Please try again.')
        return
      }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
      const supported = candidates.find((t) => MediaRecorder.isTypeSupported(t))
      mimeTypeRef.current = supported ?? ''
      const recorder = supported ? new MediaRecorder(stream, { mimeType: supported }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start()
      recorderRef.current = recorder
      runStartRef.current = Date.now()
      intervalRef.current = window.setInterval(tick, 250)
      setPhase('recording')
    } catch {
      // A session row was just created above but the mic never actually
      // started — clean it up rather than leaving a dead "setup" entry
      // sitting in Past sessions forever. Only ever deletes a session this
      // exact call created, never one the teacher re-opened.
      if (justCreatedSessionIdRef.current) {
        const idToDelete = justCreatedSessionIdRef.current
        deleteAudioSession(idToDelete).catch(() => {})
        onExit()
      }
      setError('Could not access the microphone. Check your browser permissions and try again.')
    }
  }

  function handlePause() {
    recorderRef.current?.pause()
    if (runStartRef.current !== null) {
      accumulatedSecRef.current += (Date.now() - runStartRef.current) / 1000
      runStartRef.current = null
    }
    if (intervalRef.current) window.clearInterval(intervalRef.current)
    setPhase('paused')
  }

  function handleResume() {
    recorderRef.current?.resume()
    runStartRef.current = Date.now()
    intervalRef.current = window.setInterval(tick, 250)
    setPhase('recording')
  }

  async function handleStop() {
    const recorder = recorderRef.current
    if (!recorder || !session) return
    if (intervalRef.current) window.clearInterval(intervalRef.current)
    if (runStartRef.current !== null) {
      accumulatedSecRef.current += (Date.now() - runStartRef.current) / 1000
      runStartRef.current = null
    }
    const finalElapsed = accumulatedSecRef.current

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
    })
    recorder.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    await stopped

    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'audio/webm' })
    chunksRef.current = []
    uploadDurationRef.current = finalElapsed
    setPhase('uploading')
    setError(null)
    try {
      const { speakers } = await transcribeAudioSession(session.id, blob)
      onSpeakers(speakers)
      onUpdate({ ...session, status: 'tagging', durationSec: Math.round(finalElapsed) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed. Please try again.')
      setPhase('idle')
    }
  }

  const minutes = Math.floor(elapsedSec / 60)
  const seconds = Math.floor(elapsedSec % 60)
  const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-surface p-6">
        {session && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">
                {session.classSubject || teacherName || 'Recording'} {session.period ? `· ${session.period}` : ''}
              </p>
              <p className="text-xs text-ink-soft">{formatSessionDateTime(session.sessionDate)}</p>
            </div>
            {phase === 'idle' && (
              <button type="button" onClick={onExit} className="text-sm font-medium text-ink-soft hover:text-ink">
                Cancel
              </button>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2.5">
            {phase === 'recording' && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warm-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warm-500" />
              </span>
            )}
            {phase === 'paused' && <span className="h-2.5 w-2.5 rounded-full bg-ink-soft" />}
            <span className="font-mono text-4xl font-semibold text-ink">{timeLabel}</span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {phase === 'idle' && 'Ready to record'}
            {phase === 'recording' && 'Recording'}
            {phase === 'paused' && 'Paused'}
            {phase === 'uploading' && 'Transcribing your session...'}
          </p>

          <div className="flex items-center gap-4">
            {phase === 'idle' && (
              <button
                type="button"
                onClick={handleRecord}
                className="flex items-center gap-3 rounded-full bg-warm-500 px-10 py-6 text-lg font-semibold text-white transition-opacity hover:opacity-90"
              >
                <MicIcon className="h-6 w-6" />
                Record
              </button>
            )}
            {phase === 'recording' && (
              <>
                <button
                  type="button"
                  onClick={handlePause}
                  className="rounded-full border border-border px-8 py-5 text-base font-semibold text-ink transition-colors hover:border-brand-400 hover:text-brand-600"
                >
                  Pause
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  className="rounded-full bg-ink px-8 py-5 text-base font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Stop
                </button>
              </>
            )}
            {phase === 'paused' && (
              <>
                <button
                  type="button"
                  onClick={handleResume}
                  className="rounded-full bg-brand-500 px-8 py-5 text-base font-semibold text-white transition-colors hover:bg-brand-600"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  className="rounded-full bg-ink px-8 py-5 text-base font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Stop
                </button>
              </>
            )}
            {phase === 'uploading' && (
              <div className="flex w-48 flex-col items-center gap-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-[width] duration-150 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <span className="text-xs text-ink-soft">This can take a minute for a full class period.</span>
              </div>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-4 text-center text-sm text-warm-500">
            <UpgradeMessage text={error} />
          </p>
        )}
      </div>

      <p className="text-xs text-ink-soft">
        Audio is never saved — it's sent once for transcription and discarded immediately. Only the text
        transcript is kept.
      </p>
    </div>
  )
}

function TagSpeakersPanel({
  session,
  speakers,
  onUpdate,
  onExit,
}: {
  session: AudioSessionWithSegments
  speakers: SpeakerSample[]
  onUpdate: (s: AudioSessionWithSegments) => void
  onExit: () => void
}) {
  const [tagging, setTagging] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleTag(rawSpeakerTag: string) {
    setTagging(rawSpeakerTag)
    setError(null)
    try {
      const updated = await tagSpeaker(session.id, rawSpeakerTag)
      onUpdate(updated)
    } catch {
      setError('Could not tag that speaker. Please try again.')
      setTagging(null)
    }
  }

  // Defense-in-depth only — the /transcribe route now gives every distinct
  // raw speaker tag a card, so this should be unreachable in practice, but
  // a dead end with no way forward is worse than an unlikely one, so it
  // still gets a real escape hatch rather than a bare message.
  async function handleDeleteAndRetry() {
    setDeleting(true)
    try {
      await deleteAudioSession(session.id)
      onExit()
    } catch {
      setError('Could not delete this session. Please try again.')
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold text-ink">Which voice is the teacher?</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Automatic diarization can tell voices apart, but it can't reliably tell who's the teacher. Pick it
        below — everyone else will be grouped as Student.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {speakers.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-ink-soft">
              This recording couldn't be split into distinct speakers, so there's no one to tag here.
            </p>
            <button
              type="button"
              onClick={handleDeleteAndRetry}
              disabled={deleting}
              className="rounded-lg border border-warm-500 px-4 py-2 text-sm font-semibold text-warm-500 transition-colors hover:bg-warm-100 disabled:opacity-60"
            >
              {deleting ? 'Deleting...' : 'Delete this session and try recording again'}
            </button>
          </div>
        ) : (
          speakers.map((s) => (
            <div
              key={s.rawSpeakerTag}
              className="flex items-center justify-between gap-4 rounded-xl border border-border bg-canvas p-4"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{s.rawSpeakerTag}</p>
                <p className="mt-1 text-sm text-ink">"{s.sample}"</p>
              </div>
              <button
                type="button"
                onClick={() => handleTag(s.rawSpeakerTag)}
                disabled={tagging !== null}
                className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
              >
                {tagging === s.rawSpeakerTag ? 'Analyzing...' : 'This is the Teacher'}
              </button>
            </div>
          ))
        )}
      </div>
      {error && <p className="mt-4 text-sm text-warm-500">{error}</p>}
    </div>
  )
}

type ReportTab = 'summary' | 'insights' | 'reflect' | 'growth'
type InsightsSection = 'talk' | 'questions' | 'understanding' | 'content' | 'routines'

const REPORT_TABS: { key: ReportTab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'insights', label: 'Insights' },
  { key: 'reflect', label: 'Reflect' },
  { key: 'growth', label: 'My Growth' },
]

const INSIGHTS_SECTIONS: { key: InsightsSection; label: string }[] = [
  { key: 'talk', label: 'Talk & Participation' },
  { key: 'questions', label: 'Questions & Thinking' },
  { key: 'understanding', label: 'Understanding & Feedback' },
  { key: 'content', label: 'Content & Explanations' },
  { key: 'routines', label: 'Climate & Management' },
]

function insightsNavButtonClass(active: boolean) {
  return `rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
    active ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:bg-canvas hover:text-ink'
  }`
}

function InsightsNav({ section, onSelect }: { section: InsightsSection; onSelect: (s: InsightsSection) => void }) {
  return (
    <nav className="flex shrink-0 flex-col gap-0.5 lg:w-52">
      {INSIGHTS_SECTIONS.map(({ key, label }) => (
        <button key={key} type="button" onClick={() => onSelect(key)} className={insightsNavButtonClass(section === key)}>
          {label}
        </button>
      ))}
    </nav>
  )
}

function TabBar({ tab, onSelect }: { tab: ReportTab; onSelect: (t: ReportTab) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {REPORT_TABS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === key ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// Plain-language facts safe for the Reflect chat's coach to reference —
// only from highlights and confirmed-none metrics, never a missing state.
// This is the only place confidence-gated facts get turned into text for
// Claude; the backend never re-derives these states itself.
function buildReflectContext(
  session: AudioSessionWithSegments,
  cfuMetric: { state: string },
  redirectionMetric: { state: string },
  directiveMetric: { state: string },
  coverage: { isShort: boolean; recordedSec: number },
): string[] {
  const context: string[] = []

  // Told to Claude plainly rather than left implicit — a short recording
  // should read as a snapshot, not a full lesson, in every reply, not just
  // when a sparse highlight list happens to make that obvious.
  if (coverage.isShort) {
    context.push(`This was a short recording (${formatTime(coverage.recordedSec)}) — a snapshot, not the whole lesson.`)
  }

  ;(session.highlights ?? []).forEach((h) => {
    context.push(
      `At ${formatTime(h.timestampSec)}${h.durationSec != null ? ` (lasted ${Math.round(h.durationSec)}s)` : ''}, "${h.label}": "${h.excerpt}"`,
    )
  })

  if (cfuMetric.state === 'confirmed_none') {
    context.push(
      'No explicit checks for understanding were detected this session (confidently measured, not missing data).',
    )
  }
  if (redirectionMetric.state === 'confirmed_none') {
    context.push(
      'No redirection/behavior language was flagged this session (confidently measured, not missing data).',
    )
  }
  if (directiveMetric.state === 'confirmed_none') {
    context.push(
      'No clear task-instruction language was detected this session (confidently measured, not missing data).',
    )
  }

  return context.slice(0, 8)
}

// Grounded starting points for Reflect's conversation — real
// highlights/confirmed-zero metrics turned into a tappable invitation,
// rather than the one generic "Start reflecting" button. Same discipline
// as every other builder in this file: only ever built from real signal,
// capped at 3, empty when there's nothing to ground a question in (the
// always-present generic starting point covers that case).
function buildReflectStarterPrompts(
  highlights: AudioHighlight[] | null,
  cfuMetric: { state: string },
  redirectionMetric: { state: string },
): { label: string; focus: string }[] {
  const prompts: { label: string; focus: string }[] = []
  const byLabel = (label: string) => (highlights ?? []).find((h) => h.label === label)

  const followUp = byLabel('Follow-up / probing question')
  if (followUp) {
    prompts.push({
      label: 'Talk about a question you followed up on',
      focus: `the moment at ${formatTime(followUp.timestampSec)} where you asked a follow-up question: "${followUp.excerpt}"`,
    })
  }

  const cluster = byLabel('Redirection cluster')
  if (cluster) {
    prompts.push({
      label: 'Talk about that stretch of redirections',
      focus: `the cluster of redirections around ${formatTime(cluster.timestampSec)}`,
    })
  }

  const monologue = byLabel('Longest uninterrupted teacher monologue')
  if (monologue) {
    prompts.push({
      label: 'Talk about that longer stretch of talking',
      focus: `the longest stretch of you talking, around ${formatTime(monologue.timestampSec)}`,
    })
  }

  if (prompts.length < 3 && cfuMetric.state === 'confirmed_none') {
    prompts.push({
      label: 'Talk about checking for understanding',
      focus: 'why no explicit check for understanding came through this session, and what that might look like next time',
    })
  }
  if (prompts.length < 3 && redirectionMetric.state === 'confirmed_none') {
    prompts.push({
      label: 'Talk about how the room felt today',
      focus: 'how the classroom climate felt today, since no redirection language was detected',
    })
  }

  return prompts.slice(0, 3)
}

// Coach-voice interpretations of the category stats — deterministic
// templates, no Claude call (the analysis-time notes generation was
// removed for exactly this reason: two independent AI summaries of the
// same numbers felt redundant). Each returns null when the underlying
// metric's state is a missing one — never comment on missing data.
// Every talk-balance sentence in the app routes through judgeTalkBalance
// (reportConfidence.ts) so "balanced" can never be said when student talk is
// a confirmed zero — the old version here branched only on teacherTalkPct
// and could say "fairly balanced... students at 0%."
function buildVoiceBalanceCaption(judgment: TalkBalanceJudgment | null): string | null {
  if (!judgment) return null
  switch (judgment.kind) {
    case 'balanced':
      return `Talk time was fairly balanced today — you at ${judgment.teacherPct}%, students at ${judgment.studentPct}%.`
    case 'teacher-heavy':
      return `You did most of the talking today (${judgment.teacherPct}%) — look for a moment to hand the floor to students.`
    case 'student-heavy':
      return `Students had a strong share of the talk time today (${judgment.studentPct}%) — that's a lot of real student voice in the room.`
    case 'student-zero':
      return `You talked about ${judgment.teacherPct}% of the time; no student talk was separately detected this session.`
    case 'student-unmeasured':
      return `You talked about ${judgment.teacherPct}% of the time — student talk wasn't separately measured this session.`
    case 'student-thin':
      return `You talked ${judgment.teacherPct}% of the time, students only ${judgment.studentPct}% — worth watching next session.`
  }
}

function buildTalkInsight(
  session: AudioSessionWithSegments,
  studentSegmentsMetric: ConfidentMetric,
): string | null {
  let sentence = buildVoiceBalanceCaption(judgeTalkBalance(session.teacherTalkPct, session.studentTalkPct))
  if (studentSegmentsMetric.state === 'measured') {
    const count = Number(studentSegmentsMetric.display)
    if (Number.isFinite(count) && count > 0) {
      sentence = `${sentence ?? ''} Students spoke up in ${count} separate moment${count === 1 ? '' : 's'} today — that's real back-and-forth, even beyond the raw talk-time split.`.trim()
    }
  } else if (studentSegmentsMetric.state === 'confirmed_none' && sentence) {
    sentence += ' Students never separately spoke up this session.'
  }
  return sentence
}

function buildQuestioningInsight(
  session: AudioSessionWithSegments,
  higherOrderRatio: ConfidentMetric | null,
  followUpMetric: ConfidentMetric,
  waitTimeMetric: ConfidentMetric,
): string | null {
  if (!higherOrderRatio || isMissingState(higherOrderRatio.state)) return null
  let sentence: string
  if (higherOrderRatio.state === 'possible_detection') {
    sentence = `Only ${session.questionCount} question${session.questionCount === 1 ? '' : 's'} came through today — too few to say whether they leaned recall or higher-order.`
  } else if (session.higherOrderPct != null && session.higherOrderPct >= 40) {
    sentence = `A good chunk of today's questions pushed for real thinking (${session.higherOrderPct}% higher-order) — that's the harder kind of question to ask on the fly.`
  } else {
    sentence = "Most of today's questions were quick recall checks — a natural spot to slip in one 'why' or 'how' next time."
  }
  if (followUpMetric.state === 'measured') {
    sentence += ` You followed up on a question ${followUpMetric.display} time${followUpMetric.display === '1' ? '' : 's'} — that's a habit worth keeping.`
  } else if (followUpMetric.state === 'confirmed_none') {
    sentence += ' None of your questions got a follow-up today — a quick "say more about that" can go a long way.'
  }
  if (waitTimeMetric.state === 'measured' && session.avgWaitTimeSec != null) {
    sentence +=
      session.avgWaitTimeSec >= 3
        ? ` Your average wait time was ${session.avgWaitTimeSec.toFixed(1)}s — that's real thinking room.`
        : ` Your average wait time was ${session.avgWaitTimeSec.toFixed(1)}s — waiting a beat longer can bring more students into a response.`
  }
  return sentence
}

function buildCfuInsight(cfuMetric: { state: string }, feedbackRatio: ConfidentMetric): string | null {
  let sentence: string | null = null
  if (cfuMetric.state === 'measured') {
    sentence = 'You checked for understanding today — a good habit for catching confusion before it compounds.'
  } else if (cfuMetric.state === 'confirmed_none') {
    sentence = 'No explicit check for understanding was detected this session — even a quick thumbs-up check can catch confusion early.'
  }
  if (feedbackRatio.state === 'measured' && feedbackRatio.display.endsWith('%')) {
    const pct = Number.parseInt(feedbackRatio.display, 10)
    const clause =
      pct >= 50
        ? `Your feedback tended to be specific (${feedbackRatio.display}) rather than generic praise — that's what actually helps students improve.`
        : `Your feedback leaned generic (only ${feedbackRatio.display} specific) — naming exactly what a student did well tends to stick better.`
    sentence = sentence ? `${sentence} ${clause}` : clause
  }
  return sentence
}

function buildRoutinesInsight(
  directiveMetric: { state: string; display: string },
  hasRepeatedInstructionHighlight: boolean,
  transitionMetric: ConfidentMetric,
): string | null {
  let sentence: string | null = null
  if (directiveMetric.state === 'measured') {
    const base = `You gave clear, direct instructions ${directiveMetric.display} today — that kind of clarity helps routines run themselves.`
    sentence = hasRepeatedInstructionHighlight
      ? `${base} A couple needed repeating, though — worth double-checking they land the first time.`
      : base
  } else if (directiveMetric.state === 'confirmed_none') {
    sentence = "No task-instruction language was picked up today — if you gave directions, they may just have been phrased differently than what's detected here."
  }
  if (transitionMetric.state === 'measured') {
    const clause = `You used transition language ${transitionMetric.display} today, marking the shifts between activities.`
    sentence = sentence ? `${sentence} ${clause}` : clause
  }
  return sentence
}

function buildClimateInsight(
  redirectionMetric: { state: string; display: string },
  positiveCount: number | null,
  correctiveCount: number | null,
  nameMentionMetric: ConfidentMetric,
  hasRedirectionCluster: boolean,
  firstRedirectionTimestampSec: number | null,
): string | null {
  let sentence: string | null = null
  if (redirectionMetric.state === 'confirmed_none') {
    sentence = 'No redirection language was detected this session.'
  } else if (redirectionMetric.state === 'measured') {
    sentence = `You used redirection language ${redirectionMetric.display} today.`
    if (positiveCount != null && correctiveCount != null) {
      const toneTotal = positiveCount + correctiveCount
      if (toneTotal >= MIN_N_FOR_PERCENT) {
        if (positiveCount > correctiveCount * 2) {
          sentence += ' Positive language clearly outweighed corrective — that sets a warm tone alongside the redirects.'
        } else if (correctiveCount > positiveCount) {
          sentence += ' Corrective language outweighed positive today — a few more specific call-outs of what\'s going right could balance that.'
        }
      } else if (toneTotal > 0) {
        sentence +=
          ' Only a few tone-language moments came through today — too few to say whether positive or corrective language dominated.'
      }
    }
    if (hasRedirectionCluster) {
      sentence += ' A few of those redirections clustered close together — worth a look at what led into that stretch.'
    }
    if (firstRedirectionTimestampSec != null && firstRedirectionTimestampSec < 120) {
      sentence += ' The first one came quite early in the session — a rough start, or just day-one energy?'
    }
  }
  if (nameMentionMetric.state === 'measured') {
    const clause = `You used student names ${nameMentionMetric.display} today — a small thing that builds real relationship.`
    sentence = sentence ? `${sentence} ${clause}` : clause
  } else if (nameMentionMetric.state === 'confirmed_none' && sentence) {
    sentence += ' No student names came through in the transcript today.'
  }
  return sentence
}

// Content & Explanations has no coach-voice sentence today — stitches
// together whichever of stated-objective / a real-world connection /
// defined vocabulary were actually detected into one warm sentence. Null
// when lessonContent itself is null (session predates this field, or the
// Opening phase wasn't captured) — never speaks from nothing, same
// discipline as every other builder in this file.
function buildContentInsight(lessonContent: AudioLessonContent | null): string | null {
  if (!lessonContent) return null
  const parts: string[] = []
  if (lessonContent.statedObjective.found === true) parts.push('stated a clear objective at the start')
  if (lessonContent.connections.length > 0) {
    parts.push(
      lessonContent.connections.length === 1
        ? 'connected the lesson to something familiar'
        : `connected the lesson to something familiar ${lessonContent.connections.length} times`,
    )
  }
  if (lessonContent.vocabulary.length > 0) {
    parts.push(
      `defined ${lessonContent.vocabulary.length} key vocabulary term${lessonContent.vocabulary.length === 1 ? '' : 's'}`,
    )
  }
  if (parts.length === 0) {
    if (lessonContent.statedObjective.found === false) {
      return 'No stated objective, real-world connection, or defined vocabulary term was detected today — even one of these can anchor a lesson for students.'
    }
    return null
  }
  const joined =
    parts.length === 1
      ? parts[0]
      : parts.length === 2
        ? `${parts[0]} and ${parts[1]}`
        : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
  return `Nice work today — you ${joined}.`
}

function CoachNote({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <div className="flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
      <ChatBubbleIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
      <p className="text-sm text-ink">{text}</p>
    </div>
  )
}

// Summary's "spotlight" card — one themed headline + the existing coach
// note as its body, picking a single topic rather than stitching all
// three insights into one paragraph. Deterministic (no new Claude call),
// same discipline as every other coach note in this file.
function buildSpotlight(
  talkInsight: string | null,
  questioningInsight: string | null,
  cfuInsight: string | null,
): { headline: string; body: string } | null {
  if (questioningInsight) return { headline: 'A closer look at your questioning', body: questioningInsight }
  if (talkInsight) return { headline: 'A closer look at classroom talk', body: talkInsight }
  if (cfuInsight) return { headline: 'A closer look at checking for understanding', body: cfuInsight }
  return null
}

// A single candidate for "the one strength" or "the one coaching priority" —
// either a real moment (highlight, with a timestamp/excerpt) or an
// aggregate-metric observation (timestamp/excerpt null).
type NoticeCandidate = {
  id: string
  observation: string
  whyItMatters: string
  timestampSec: number | null
  excerpt: string | null
  durationSec: number | null
  weight: number
  focusMetric: FocusMetric | null
}

// Fixed tie-break order so ranking is deterministic across renders.
const CANDIDATE_ORDER = [
  'highlight-followup',
  'highlight-redirection',
  'highlight-repeated',
  'highlight-monologue',
  'talk-balance',
  'questioning',
  'wait-time',
  'cfu',
  'feedback',
]

function pickTop(candidates: NoticeCandidate[]): NoticeCandidate | null {
  if (!candidates.length) return null
  return [...candidates].sort(
    (a, b) => b.weight - a.weight || CANDIDATE_ORDER.indexOf(a.id) - CANDIDATE_ORDER.indexOf(b.id),
  )[0]
}

function highlightCandidates(
  highlights: AudioHighlight[] | null,
  label: string,
  id: string,
  weight: number,
  whyItMatters: string,
): NoticeCandidate[] {
  return (highlights ?? [])
    .filter((h) => h.label === label)
    .map((h) => ({
      id,
      observation: h.label,
      whyItMatters,
      timestampSec: h.timestampSec,
      excerpt: h.excerpt,
      durationSec: h.durationSec ?? null,
      weight,
      focusMetric: null,
    }))
}

// Deliberately restricted to Overview's own three categories (talk,
// questioning, checking-understanding) plus highlights — Climate & Routines
// metrics have no FocusMetric key today, so including them would break "Set
// as my focus" wiring and require extending FocusMetric/My Growth, which is
// out of scope here.
function buildStrengthCandidates(
  session: AudioSessionWithSegments,
  cfuMetric: ConfidentMetric,
  feedbackRatio: ConfidentMetric,
  higherOrderRatio: ConfidentMetric | null,
): NoticeCandidate[] {
  const candidates: NoticeCandidate[] = []

  candidates.push(
    ...highlightCandidates(
      session.highlights,
      'Follow-up / probing question',
      'highlight-followup',
      3,
      'Following up on a student answer pushes their thinking further instead of stopping at the first response.',
    ),
  )

  const hasEnoughDurationForTalkBalance =
    session.durationSec != null && session.durationSec >= MIN_DURATION_FOR_TALK_BALANCE_CANDIDATE_SEC

  const balance = judgeTalkBalance(session.teacherTalkPct, session.studentTalkPct)
  if (hasEnoughDurationForTalkBalance && balance?.kind === 'student-heavy') {
    candidates.push({
      id: 'talk-balance',
      observation: `Students had ${balance.studentPct}% of the talk time today`,
      whyItMatters: "That's a lot of real student voice in the room — a strong sign of student-centered discussion.",
      timestampSec: null,
      excerpt: null,
      durationSec: null,
      weight: 1,
      focusMetric: 'talkRatio',
    })
  }

  if (
    higherOrderRatio &&
    higherOrderRatio.state === 'measured' &&
    session.higherOrderPct != null &&
    session.higherOrderPct >= 40
  ) {
    candidates.push({
      id: 'questioning',
      observation: `${session.higherOrderPct}% of your questions were higher-order`,
      whyItMatters: "That's the harder kind of question to ask on the fly — it pushes for real thinking, not just recall.",
      timestampSec: null,
      excerpt: null,
      durationSec: null,
      weight: 1,
      focusMetric: 'higherOrderPct',
    })
  }

  if (hasEnoughDurationForTalkBalance && session.avgWaitTimeSec != null && session.avgWaitTimeSec >= 3) {
    candidates.push({
      id: 'wait-time',
      observation: `Your average wait time was ${session.avgWaitTimeSec}s`,
      whyItMatters: 'Giving students real time to think before answering leads to deeper, more complete responses.',
      timestampSec: null,
      excerpt: null,
      durationSec: null,
      weight: 1,
      focusMetric: 'avgWaitTime',
    })
  }

  if (cfuMetric.state === 'measured') {
    candidates.push({
      id: 'cfu',
      observation: 'You checked for understanding today',
      whyItMatters: 'Catching confusion before it compounds is one of the highest-leverage coaching moves.',
      timestampSec: null,
      excerpt: null,
      durationSec: null,
      weight: 1,
      focusMetric: 'cfuCount',
    })
  }

  if (feedbackRatio.state === 'measured' && feedbackRatio.display.endsWith('%')) {
    const pct = parseInt(feedbackRatio.display, 10)
    if (!Number.isNaN(pct) && pct >= 50) {
      candidates.push({
        id: 'feedback',
        observation: `${feedbackRatio.display} of your feedback was specific`,
        whyItMatters: 'Specific feedback gives students something concrete to act on, not just praise or correction.',
        timestampSec: null,
        excerpt: null,
        durationSec: null,
        weight: 1,
        focusMetric: null,
      })
    }
  }

  return candidates
}

function buildPriorityCandidates(
  session: AudioSessionWithSegments,
  cfuMetric: ConfidentMetric,
  feedbackRatio: ConfidentMetric,
  higherOrderRatio: ConfidentMetric | null,
): NoticeCandidate[] {
  const candidates: NoticeCandidate[] = []

  candidates.push(
    ...highlightCandidates(
      session.highlights,
      'Redirection cluster',
      'highlight-redirection',
      3,
      'A cluster of redirections close together can be a sign the room needs a different routine or transition in that moment.',
    ),
  )
  candidates.push(
    ...highlightCandidates(
      session.highlights,
      'Repeated instruction',
      'highlight-repeated',
      3,
      "When directions need repeating, it's worth double-checking they land clearly the first time.",
    ),
  )
  candidates.push(
    ...highlightCandidates(
      session.highlights,
      'Longest uninterrupted teacher monologue',
      'highlight-monologue',
      2,
      'A long stretch without a break in teacher talk is a natural spot to build in a check-in or a question.',
    ),
  )

  const hasEnoughDurationForTalkBalance =
    session.durationSec != null && session.durationSec >= MIN_DURATION_FOR_TALK_BALANCE_CANDIDATE_SEC

  const balance = judgeTalkBalance(session.teacherTalkPct, session.studentTalkPct)
  if (hasEnoughDurationForTalkBalance && balance?.kind === 'teacher-heavy') {
    candidates.push({
      id: 'talk-balance',
      observation: `You talked ${balance.teacherPct}% of the time today`,
      whyItMatters: 'Look for a moment to hand the floor to students — even a short turn-and-talk shifts the balance.',
      timestampSec: null,
      excerpt: null,
      durationSec: null,
      weight: 2,
      focusMetric: 'talkRatio',
    })
  }

  if (
    higherOrderRatio &&
    higherOrderRatio.state === 'measured' &&
    session.higherOrderPct != null &&
    session.higherOrderPct < 40
  ) {
    candidates.push({
      id: 'questioning',
      observation: `Most of today's questions were quick recall checks (${session.higherOrderPct}% higher-order)`,
      whyItMatters: "A natural spot to slip in one 'why' or 'how' question next time.",
      timestampSec: null,
      excerpt: null,
      durationSec: null,
      weight: 1,
      focusMetric: 'higherOrderPct',
    })
  }

  if (hasEnoughDurationForTalkBalance && session.avgWaitTimeSec != null && session.avgWaitTimeSec < 3) {
    candidates.push({
      id: 'wait-time',
      observation: `Your average wait time was ${session.avgWaitTimeSec}s`,
      whyItMatters: 'A few extra seconds of silence after a question gives more students time to formulate an answer.',
      timestampSec: null,
      excerpt: null,
      durationSec: null,
      weight: 1,
      focusMetric: 'avgWaitTime',
    })
  }

  if (cfuMetric.state === 'confirmed_none') {
    candidates.push({
      id: 'cfu',
      observation: 'No explicit check for understanding was detected this session',
      whyItMatters: 'Even a quick thumbs-up check can catch confusion early, before it compounds.',
      timestampSec: null,
      excerpt: null,
      durationSec: null,
      weight: 1,
      focusMetric: 'cfuCount',
    })
  }

  if (feedbackRatio.state === 'measured' && feedbackRatio.display.endsWith('%')) {
    const pct = parseInt(feedbackRatio.display, 10)
    if (!Number.isNaN(pct) && pct < 50) {
      candidates.push({
        id: 'feedback',
        observation: `Only ${feedbackRatio.display} of your feedback was specific`,
        whyItMatters: 'Specific feedback gives students something concrete to act on, not just praise or correction.',
        timestampSec: null,
        excerpt: null,
        durationSec: null,
        weight: 1,
        focusMetric: null,
      })
    }
  }

  return candidates
}

// Same duration-vs-timestamp disambiguation as formatCandidateHeadline
// below, for raw highlight objects (e.g. Reflect's "what stood out" list).
function formatHighlightHeadline(h: { label: string; timestampSec: number; durationSec?: number }): string {
  if (h.durationSec != null) {
    return `${h.label}: ${Math.round(h.durationSec)}s — occurred at ${formatTime(h.timestampSec)}`
  }
  return `${h.label} · ${formatTime(h.timestampSec)}`
}

// Always shows a duration and a timestamp as two distinct, explicitly
// labeled things — never a bare "label · 0:38" that leaves it ambiguous
// whether the number is how long something lasted or when it happened.
function formatCandidateHeadline(candidate: NoticeCandidate): string {
  if (candidate.durationSec != null && candidate.timestampSec != null) {
    return `${candidate.observation}: ${Math.round(candidate.durationSec)}s — occurred at ${formatTime(candidate.timestampSec)}`
  }
  if (candidate.timestampSec != null) {
    return `${candidate.observation} · ${formatTime(candidate.timestampSec)}`
  }
  return candidate.observation
}

// Replaces the old separate Strength + Coaching Priority cards with one
// consolidated "Moments worth revisiting" list — the proposal's own
// critique was that the report led with two always-present cards (plus a
// raw highlights list) saying similar things; one ranked list of up to 2
// moments, each labeled by which kind it is, says the same thing once.
function MomentsCard({
  strength,
  priority,
  coverage,
  onViewDiscourse,
}: {
  strength: NoticeCandidate | null
  priority: NoticeCandidate | null
  coverage: ReturnType<typeof getCoverage>
  onViewDiscourse: () => void
}) {
  const moments = [
    strength && { kind: 'Strength' as const, candidate: strength },
    priority && { kind: 'Coaching priority' as const, candidate: priority },
  ].filter((m): m is { kind: 'Strength' | 'Coaching priority'; candidate: NoticeCandidate } => m != null)

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Moments worth revisiting</h2>
      {moments.length > 0 ? (
        <div className="mt-3 flex flex-col gap-4">
          {moments.map(({ kind, candidate }) => (
            <div key={kind} className="flex flex-col gap-1.5">
              <span
                className={`text-xs font-semibold uppercase tracking-wide ${
                  kind === 'Strength' ? 'text-brand-600' : 'text-warm-500'
                }`}
              >
                {kind}
              </span>
              <p className="text-sm font-semibold text-ink">{formatCandidateHeadline(candidate)}</p>
              {candidate.excerpt && <p className="text-sm text-ink-soft">"{candidate.excerpt}"</p>}
              <p className="text-sm text-ink-soft">{candidate.whyItMatters}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-sm text-ink-soft">
            This recording was {formatTime(coverage.recordedSec)} — not enough measured evidence yet for a
            stand-out moment this session.
          </p>
          <button
            type="button"
            onClick={onViewDiscourse}
            className="self-start text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            See the full breakdown in Insights →
          </button>
        </div>
      )}
    </div>
  )
}

// One stacked bar (Teacher / Students / Silence — all in one, not two
// separate visualizations) plus a legend grid below it. "Silence / other"
// is deliberately one honest combined segment, not split into "silence"
// vs. "unclear audio" — the batch transcription API has no voice-activity
// signal to tell the two apart, so `silencePct` is already
// `100 - teacherPct - studentPct` upstream; splitting it further would be
// inventing precision the data can't back up.
function TalkParticipationBar({
  teacherPct,
  studentPct,
  silencePct,
  compact,
}: {
  teacherPct: number | null
  studentPct: number | null
  silencePct: number | null
  compact?: boolean
}) {
  const barHeight = compact ? 'h-3' : 'h-4'
  if (teacherPct == null) {
    return <HatchedBar label="Talk balance unavailable this session" className={barHeight} />
  }
  const remainder = Math.max(0, 100 - teacherPct - (studentPct ?? 0) - (silencePct ?? 0))
  return (
    <div className="flex flex-col gap-3">
      <div className={`flex w-full overflow-hidden rounded-full bg-canvas ${barHeight}`}>
        <div className="h-full bg-brand-500" style={{ width: `${teacherPct}%` }} />
        {studentPct != null && <div className="h-full bg-brand-500/45" style={{ width: `${studentPct}%` }} />}
        {silencePct != null ? (
          <div className="h-full bg-ink-soft/30" style={{ width: `${silencePct}%` }} />
        ) : (
          <div className="h-full" style={{ width: `${remainder}%`, ...HATCH_STYLE }} />
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" /> Teacher · {teacherPct}%
        </span>
        <span className="flex items-center gap-1.5">
          {studentPct != null ? (
            <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500/45" />
          ) : (
            <HatchedSwatch className="h-2 w-2" />
          )}
          Students · {studentPct != null ? `${studentPct}%` : 'unavailable'}
        </span>
        <span className="col-span-2 flex items-center gap-1.5">
          {silencePct != null ? (
            <span className="h-2 w-2 shrink-0 rounded-full bg-ink-soft/30" />
          ) : (
            <HatchedSwatch className="h-2 w-2" />
          )}
          Silence / other · {silencePct != null ? `${silencePct}%` : 'unavailable'}
        </span>
      </div>
    </div>
  )
}

// Summary's compact version of TalkParticipationBar — a card with a link
// out to the fuller Insights > Talk & Participation view.
function WhoWasHeardCard({
  teacherPct,
  studentPct,
  silencePct,
  onExplore,
}: {
  teacherPct: number | null
  studentPct: number | null
  silencePct: number | null
  onExplore: () => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold text-ink">Who was heard?</h2>
      <div className="mt-3">
        <TalkParticipationBar teacherPct={teacherPct} studentPct={studentPct} silencePct={silencePct} compact />
      </div>
      <p className="mt-3 text-xs text-ink-soft">Share of the full recording.</p>
      <button
        type="button"
        onClick={onExplore}
        className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        Explore talk & participation →
      </button>
    </div>
  )
}

// Summary's card for the questioning-volume snapshot — real counts only,
// no rate/percentage here (that's Insights > Questions & Thinking's job).
function QuestionsOpenedCard({
  questionsMetric,
  followUpMetric,
  onExplore,
}: {
  questionsMetric: ReturnType<typeof getCountMetric>
  followUpMetric: ReturnType<typeof getCountMetric>
  onExplore: () => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold text-ink">Questions that opened thinking</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-2xl font-semibold text-ink">{questionsMetric.display}</p>
          <p className="text-xs text-ink-soft">Questions detected</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-ink">{followUpMetric.display}</p>
          <p className="text-xs text-ink-soft">Follow-up questions</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onExplore}
        className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        Review the questions →
      </button>
    </div>
  )
}

// One next step: "Set as my focus" when the top priority maps to a
// trended My Growth metric, plus the single "Reflect with Wivoza" CTA —
// replaces the old TryThisNext (3 buttons) + AskWivozaCoachButton (a
// second, separate coaching entry point) with the one action the
// proposal asks for.
function NextStepCard({
  priority,
  onSetFocus,
  onGoReflect,
}: {
  priority: NoticeCandidate | null
  onSetFocus: (metric: FocusMetric) => void
  onGoReflect: () => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <span className="inline-block rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-brand-600">
        One next step
      </span>
      {priority && (
        <>
          <p className="mt-3 text-base font-semibold text-ink">{priority.observation}</p>
          <p className="mt-1 text-sm text-ink-soft">{priority.whyItMatters}</p>
          {priority.excerpt && (
            <blockquote className="mt-3 border-l-2 border-warm-500 pl-3 text-sm italic text-ink-soft">
              "{priority.excerpt}"
            </blockquote>
          )}
          {priority.focusMetric && (
            <button
              type="button"
              onClick={() => onSetFocus(priority.focusMetric as FocusMetric)}
              className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-400 hover:text-brand-600"
            >
              Set as my focus → My Growth
            </button>
          )}
        </>
      )}
      <button
        type="button"
        onClick={onGoReflect}
        className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
      >
        <ChatBubbleIcon className="h-4 w-4" />
        Reflect with Wivoza
      </button>
    </div>
  )
}

function ReportPanel({
  session,
  onUpdate,
  onExit,
  sessions,
  focusMetric,
  onFocusMetricChange,
  talkVoice,
}: {
  session: AudioSessionWithSegments
  onUpdate: (s: AudioSessionWithSegments) => void
  onExit: () => void
  sessions: AudioSession[]
  focusMetric: FocusMetric | null
  onFocusMetricChange: (metric: FocusMetric | null) => void
  talkVoice: TalkVoice | null
}) {
  const [tab, setTab] = useState<ReportTab>('summary')
  const [insightsSection, setInsightsSection] = useState<InsightsSection>('talk')
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null)
  const locked = session.status === 'locked'
  const [strengths, setStrengths] = useState(session.strengths ?? '')
  const [growthAreas, setGrowthAreas] = useState(session.growthAreas ?? '')
  const [nextStep, setNextStep] = useState(session.nextStep ?? '')
  const [followUpDate, setFollowUpDate] = useState(session.followUpDate ? session.followUpDate.slice(0, 10) : '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [locking, setLocking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reflectSending, setReflectSending] = useState(false)
  const [reflectError, setReflectError] = useState<{ kind: ReflectChatErrorKind; message: string } | null>(null)
  const [reflectDraft, setReflectDraft] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [summarizeError, setSummarizeError] = useState<string | null>(null)
  const [contentNotesSending, setContentNotesSending] = useState(false)
  const [contentNotesError, setContentNotesError] = useState<string | null>(null)
  const [classSummarySending, setClassSummarySending] = useState(false)
  const hasAttemptedClassSummaryRef = useRef(false)

  async function handleSaveNotes() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await updateAudioSession(session.id, {
        strengths,
        growthAreas,
        nextStep,
        followUpDate: followUpDate ? new Date(followUpDate).toISOString() : null,
      })
      onUpdate({ ...session, ...updated })
      setSaved(true)
    } catch {
      setError('Could not save your notes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleLock() {
    setLocking(true)
    setError(null)
    try {
      await handleSaveNotes()
      const updated = await updateAudioSession(session.id, { status: 'locked' })
      onUpdate({ ...session, ...updated })
    } catch {
      setError('Could not lock the report. Please try again.')
    } finally {
      setLocking(false)
    }
  }

  // focus, when passed, is a specific highlight/metric to open with (from
  // one of Reflect's grounded starting-point chips) — prepended as one
  // more plain-fact line ahead of the same context array, so Claude's own
  // generated opening question naturally leads with it. No backend change
  // needed: the route already accepts an arbitrary context: string[].
  async function handleStartReflect(focus?: string) {
    setReflectSending(true)
    setReflectError(null)
    try {
      const context = focus ? [`Start the conversation by asking about ${focus}.`, ...reflectContext] : reflectContext
      const updated = await sendReflectMessage(session.id, { context })
      onUpdate({ ...session, ...updated })
    } catch (err) {
      const kind = (err as { kind?: ReflectChatErrorKind })?.kind ?? 'other'
      setReflectError({ kind, message: (err as Error).message })
    } finally {
      setReflectSending(false)
    }
  }

  // overrideText lets voice mode submit a transcribed turn directly,
  // bypassing reflectDraft entirely — same convention as Ask.tsx's and
  // TalkToMe.tsx's own optional-override submit functions.
  async function handleSendReflect(overrideText?: string) {
    const usingOverride = overrideText != null
    const trimmed = (overrideText ?? reflectDraft).trim()
    if (!trimmed || reflectSending) return
    setReflectSending(true)
    setReflectError(null)
    if (!usingOverride) setReflectDraft('')
    try {
      const updated = await sendReflectMessage(session.id, { message: trimmed, context: reflectContext })
      onUpdate({ ...session, ...updated })
    } catch (err) {
      const kind = (err as { kind?: ReflectChatErrorKind })?.kind ?? 'other'
      setReflectError({ kind, message: (err as Error).message })
      if (!usingOverride) setReflectDraft(trimmed)
    } finally {
      setReflectSending(false)
    }
  }

  async function handleSummarizeReflect() {
    setSummarizing(true)
    setSummarizeError(null)
    try {
      const summary = await summarizeReflectConversation(session.id)
      if (summary.strengths != null) setStrengths(summary.strengths)
      if (summary.growthAreas != null) setGrowthAreas(summary.growthAreas)
      if (summary.nextStep != null) setNextStep(summary.nextStep)
      setSaved(false)
    } catch {
      setSummarizeError('Could not summarize your conversation. Please try again.')
    } finally {
      setSummarizing(false)
    }
  }

  async function handleGenerateContentNotes() {
    setContentNotesSending(true)
    setContentNotesError(null)
    try {
      const updated = await generateContentNotes(session.id)
      onUpdate({ ...session, ...updated })
    } catch (err) {
      setContentNotesError((err as Error).message || 'Could not generate content notes. Please try again.')
    } finally {
      setContentNotesSending(false)
    }
  }

  // Auto-generates the class content summary once, the first time the
  // teacher lands on Summary — no button, but capped at one attempt per
  // mount (via the ref) so a Claude/API hiccup doesn't retry in a loop,
  // and skipped for locked sessions since they can never accept the write.
  useEffect(() => {
    if (tab !== 'summary' || locked || session.classSummary != null || hasAttemptedClassSummaryRef.current) return
    hasAttemptedClassSummaryRef.current = true
    setClassSummarySending(true)
    generateClassSummary(session.id)
      .then((updated) => onUpdate({ ...session, ...updated }))
      .catch(() => {})
      .finally(() => setClassSummarySending(false))
  }, [tab, locked, session, onUpdate])

  const metrics = session.metricsDetail ?? {}
  const lessonContent = session.lessonContent
  const recordedSec = session.durationSec ?? 0
  const coverage = getCoverage(session.durationSec, session.phases)
  const num = (key: string) => (typeof metrics[key] === 'number' ? (metrics[key] as number) : null)

  // Talk & Participation
  const teacherTalkMetric = getPresenceMetric(session.teacherTalkPct)
  const studentTalkMetric = getPresenceMetric(session.studentTalkPct)
  const silencePct =
    session.teacherTalkPct != null && session.studentTalkPct != null
      ? Math.max(0, Math.round(100 - session.teacherTalkPct - session.studentTalkPct))
      : null
  const silenceMetric = getPresenceMetric(silencePct)
  const studentSegmentsMetric = getCountMetric({ count: num('studentVoiceSegments'), recordedSec })

  // Questioning & Thinking
  const questionsMetric = getCountMetric({ count: session.questionCount, recordedSec })
  const higherOrderCount = num('higherOrderQuestionCount')
  const higherOrderRatio =
    session.questionCount != null ? formatRatio(higherOrderCount ?? 0, session.questionCount) : null
  const followUpMetric = getCountMetric({ count: num('followUpQuestionCount'), recordedSec })
  const waitTimeMetric = getPresenceMetric(session.avgWaitTimeSec)

  // Checking Understanding
  const cfuMetric = getCountMetric({
    count: session.cfuCount,
    recordedSec,
    minDurationSec: MIN_DURATION_FOR_CFU_DETECTION_SEC,
  })
  const genericCount = num('genericFeedbackCount')
  const specificCount = num('specificFeedbackCount')
  const feedbackRatio =
    genericCount != null && specificCount != null && genericCount + specificCount > 0
      ? formatRatio(specificCount, genericCount + specificCount)
      : { state: 'not_measurable' as const, display: '—', reason: 'No feedback-after-response moments detected.' }

  // Classroom Routines
  const transitionMetric = getCountMetric({ count: num('transitionCount'), recordedSec })
  const directiveMetric = getCountMetric({ count: num('directiveCount'), recordedSec })

  // Climate & Tone
  const nameMentionMetric = getCountMetric({ count: num('nameMentionCount'), recordedSec })
  const uniqueNameCount = num('uniqueNameCount')
  const redirectionMetric = getCountMetric({ count: num('redirectionCount'), recordedSec })
  const positiveCount = num('positivePhraseCount')
  const correctiveCount = num('correctivePhraseCount')
  const toneRatio =
    positiveCount != null && correctiveCount != null && positiveCount + correctiveCount > 0
      ? formatRatio(positiveCount, positiveCount + correctiveCount)
      : { state: 'not_measurable' as const, display: '—', reason: 'No positive or corrective phrases detected.' }

  const reflectContext = buildReflectContext(session, cfuMetric, redirectionMetric, directiveMetric, coverage)

  const talkInsight = buildTalkInsight(session, studentSegmentsMetric)
  const questioningInsight = buildQuestioningInsight(session, higherOrderRatio, followUpMetric, waitTimeMetric)
  const cfuInsight = buildCfuInsight(cfuMetric, feedbackRatio)
  const contentInsight = buildContentInsight(lessonContent)
  const hasRepeatedInstructionHighlight = (session.highlights ?? []).some((h) => h.label === 'Repeated instruction')
  const hasRedirectionCluster = (session.highlights ?? []).some((h) => h.label === 'Redirection cluster')
  const firstRedirectionTimestampSec = num('firstRedirectionTimestampSec')
  const routinesInsight = buildRoutinesInsight(directiveMetric, hasRepeatedInstructionHighlight, transitionMetric)
  const climateInsight = buildClimateInsight(
    redirectionMetric,
    positiveCount,
    correctiveCount,
    nameMentionMetric,
    hasRedirectionCluster,
    firstRedirectionTimestampSec,
  )

  // Computed once here (not per-tab) so the shared header can show it on
  // every tab, not just Summary.
  const evidenceQuality = buildEvidenceQualityLine(coverage, [
    teacherTalkMetric,
    studentTalkMetric,
    silenceMetric,
    studentSegmentsMetric,
    questionsMetric,
    followUpMetric,
    waitTimeMetric,
    cfuMetric,
    feedbackRatio,
  ])

  function handleViewSource(sourceTab: ReportTab, sourceId: string, section?: InsightsSection) {
    setTab(sourceTab)
    if (section) setInsightsSection(section)
    setPendingScrollId(sourceId)
  }

  useEffect(() => {
    if (!pendingScrollId) return
    const timeout = setTimeout(() => {
      document.getElementById(pendingScrollId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setPendingScrollId(null)
    }, 50)
    return () => clearTimeout(timeout)
  }, [tab, insightsSection, pendingScrollId])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onExit} className="text-sm font-medium text-ink-soft hover:text-ink">
          ← Back to sessions
        </button>
        {locked && (
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-600">Locked</span>
        )}
      </div>

      {/* Persistent lesson identity + evidence-quality read — visible on
          every tab, not just Summary, so context never disappears when you
          navigate away from it. */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Lesson report</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-ink">
            {session.classSubject || 'New Recording'} {session.period ? `· ${session.period}` : ''}
          </h1>
          {coverage.isTinyRecording && (
            <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warm-500">
              Short excerpt
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          {session.teacherName ? `${session.teacherName} · ` : ''}
          {formatSessionDateTime(session.sessionDate)}
          {session.gradeLevel ? ` · ${session.gradeLevel}` : ''}
          {session.durationSec ? ` · ${formatTime(session.durationSec)}` : ''}
        </p>
        <p className={`mt-2 text-xs ${evidenceQuality.tone === 'warn' ? 'font-semibold text-warm-500' : 'text-ink-soft'}`}>
          {evidenceQuality.text}
        </p>
      </div>

      <TabBar tab={tab} onSelect={setTab} />

      {tab === 'summary' && (
        <SummaryTab
          session={session}
          coverage={coverage}
          silencePct={silencePct}
          questionsMetric={questionsMetric}
          higherOrderRatio={higherOrderRatio}
          followUpMetric={followUpMetric}
          cfuMetric={cfuMetric}
          feedbackRatio={feedbackRatio}
          onFocusMetricChange={onFocusMetricChange}
          talkInsight={talkInsight}
          questioningInsight={questioningInsight}
          cfuInsight={cfuInsight}
          classSummary={session.classSummary}
          classSummarySending={classSummarySending}
          onGoReflect={() => setTab('reflect')}
          onNavigateInsights={(section) => handleViewSource('insights', '', section)}
        />
      )}

      {tab === 'growth' && (
        <MyGrowthTab sessions={sessions} focusMetric={focusMetric} onFocusMetricChange={onFocusMetricChange} />
      )}

      {tab === 'reflect' && (
        <ReflectTab
          highlights={session.highlights}
          cfuMetric={cfuMetric}
          redirectionMetric={redirectionMetric}
          conversation={session.reflectConversation}
          sending={reflectSending}
          reflectError={reflectError}
          draft={reflectDraft}
          onDraftChange={setReflectDraft}
          onStart={handleStartReflect}
          onSend={handleSendReflect}
          locked={locked}
          talkVoice={talkVoice}
          strengths={strengths}
          growthAreas={growthAreas}
          nextStep={nextStep}
          followUpDate={followUpDate}
          onStrengthsChange={(v) => {
            setStrengths(v)
            setSaved(false)
          }}
          onGrowthAreasChange={(v) => {
            setGrowthAreas(v)
            setSaved(false)
          }}
          onNextStepChange={(v) => {
            setNextStep(v)
            setSaved(false)
          }}
          onFollowUpDateChange={(v) => {
            setFollowUpDate(v)
            setSaved(false)
          }}
          saving={saving}
          saved={saved}
          locking={locking}
          error={error}
          onSave={handleSaveNotes}
          onLock={handleLock}
          onSummarize={handleSummarizeReflect}
          summarizing={summarizing}
          summarizeError={summarizeError}
          focusMetric={focusMetric}
          onFocusMetricChange={onFocusMetricChange}
        />
      )}

      {tab === 'insights' && (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <InsightsNav section={insightsSection} onSelect={setInsightsSection} />
          <div className="min-w-0 flex-1">
            {insightsSection === 'talk' && (
              <TalkParticipationTab
                session={session}
                teacherTalkMetric={teacherTalkMetric}
                studentTalkMetric={studentTalkMetric}
                silencePct={silencePct}
                silenceMetric={silenceMetric}
                studentSegmentsMetric={studentSegmentsMetric}
                focusMetric={focusMetric}
                talkInsight={talkInsight}
              />
            )}

            {insightsSection === 'questions' && (
              <QuestionsThinkingTab
                questionCount={session.questionCount}
                questionLog={session.questionLog}
                questionsMetric={questionsMetric}
                higherOrderRatio={higherOrderRatio}
                higherOrderCount={higherOrderCount}
                followUpMetric={followUpMetric}
                waitTimeMetric={waitTimeMetric}
                avgWaitTimeSec={session.avgWaitTimeSec}
                focusMetric={focusMetric}
                questioningInsight={questioningInsight}
              />
            )}

            {insightsSection === 'understanding' && (
              <UnderstandingFeedbackTab
                cfuMetric={cfuMetric}
                feedbackRatio={feedbackRatio}
                focusMetric={focusMetric}
                cfuInsight={cfuInsight}
              />
            )}

            {insightsSection === 'content' && (
              <LessonContentTab
                session={session}
                lessonContent={lessonContent}
                contentInsight={contentInsight}
                contentNotes={session.contentNotes}
                isShort={coverage.isShort}
                sending={contentNotesSending}
                error={contentNotesError}
                onGenerate={handleGenerateContentNotes}
              />
            )}

            {insightsSection === 'routines' && (
              <ClimateRoutinesTab
                transitionMetric={transitionMetric}
                directiveMetric={directiveMetric}
                phases={session.phases}
                nameMentionMetric={nameMentionMetric}
                uniqueNameCount={uniqueNameCount}
                toneRatio={toneRatio}
                redirectionMetric={redirectionMetric}
                hasRedirectionCluster={hasRedirectionCluster}
                hasRepeatedInstructionHighlight={hasRepeatedInstructionHighlight}
                firstRedirectionTimestampSec={firstRedirectionTimestampSec}
                routinesInsight={routinesInsight}
                climateInsight={climateInsight}
              />
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-dashed border-border p-4 text-xs text-ink-soft">
        This report reflects what could be heard in your recording — talk patterns, questioning, and classroom
        routines. It doesn't capture lesson planning, materials, physical space, visual engagement, or anything
        outside class time. Automated counts above are suggestions to confirm or edit, not final judgments.
      </div>

      <Link
        to={`/audio-coaching/${session.id}/export`}
        className="self-start text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        Open printable report →
      </Link>
    </div>
  )
}

// Summary: a genuine 60-second read — one themed spotlight card, then a
// 2x2 grid (1 column on mobile) of compact cards linking out to the fuller
// detail in Insights. Lesson identity and the evidence-quality read now
// live in ReportPanel's shared header (visible on every tab), not here.
function SummaryTab({
  session,
  coverage,
  silencePct,
  questionsMetric,
  higherOrderRatio,
  followUpMetric,
  cfuMetric,
  feedbackRatio,
  onFocusMetricChange,
  talkInsight,
  questioningInsight,
  cfuInsight,
  classSummary,
  classSummarySending,
  onGoReflect,
  onNavigateInsights,
}: {
  session: AudioSessionWithSegments
  coverage: ReturnType<typeof getCoverage>
  silencePct: number | null
  questionsMetric: ReturnType<typeof getCountMetric>
  higherOrderRatio: ReturnType<typeof formatRatio> | null
  followUpMetric: ReturnType<typeof getCountMetric>
  cfuMetric: ReturnType<typeof getCountMetric>
  feedbackRatio: ConfidentMetric
  onFocusMetricChange: (metric: FocusMetric | null) => void
  talkInsight: string | null
  questioningInsight: string | null
  cfuInsight: string | null
  classSummary: string | null
  classSummarySending: boolean
  onGoReflect: () => void
  onNavigateInsights: (section: InsightsSection) => void
}) {
  const strength = pickTop(buildStrengthCandidates(session, cfuMetric, feedbackRatio, higherOrderRatio))
  const priority = pickTop(buildPriorityCandidates(session, cfuMetric, feedbackRatio, higherOrderRatio))
  // Tiny recordings omit Moments entirely when there's nothing real to
  // rank, rather than showing its empty-state fallback card — everywhere
  // else, MomentsCard's own fallback is fine.
  const showMoments = !coverage.isTinyRecording || strength != null || priority != null
  const spotlight = buildSpotlight(talkInsight, questioningInsight, cfuInsight)

  return (
    <div className="flex flex-col gap-6">
      {classSummary ? (
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold text-ink">This lesson</h2>
          <p className="mt-2 text-sm text-ink-soft">{classSummary}</p>
        </div>
      ) : classSummarySending ? (
        <div className="rounded-2xl border border-border bg-surface p-6">
          <p className="text-sm text-ink-soft">Putting together a summary of this lesson...</p>
        </div>
      ) : (
        spotlight && (
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold text-ink">{spotlight.headline}</h2>
            <p className="mt-2 text-sm text-ink-soft">{spotlight.body}</p>
          </div>
        )
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <WhoWasHeardCard
          teacherPct={session.teacherTalkPct}
          studentPct={session.studentTalkPct}
          silencePct={silencePct}
          onExplore={() => onNavigateInsights('talk')}
        />
        <QuestionsOpenedCard
          questionsMetric={questionsMetric}
          followUpMetric={followUpMetric}
          onExplore={() => onNavigateInsights('questions')}
        />
        {showMoments && (
          <MomentsCard
            strength={strength}
            priority={priority}
            coverage={coverage}
            onViewDiscourse={() => onNavigateInsights('talk')}
          />
        )}
        <NextStepCard priority={priority} onSetFocus={onFocusMetricChange} onGoReflect={onGoReflect} />
      </div>
    </div>
  )
}

function FocusSelector({
  focusMetric,
  onChange,
}: {
  focusMetric: FocusMetric | null
  onChange: (metric: FocusMetric | null) => void
}) {
  const [open, setOpen] = useState(false)

  function handleSelect(metric: FocusMetric | null) {
    onChange(metric)
    setOpen(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">My focus</span>
      <div className="relative self-start">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
            focusMetric
              ? 'border-brand-500 bg-brand-50 text-brand-600'
              : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
          }`}
        >
          {focusMetric ? FOCUS_METRIC_LABELS[focusMetric] : 'Choose a focus metric'}
          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
        {open && (
          <div className="absolute z-10 mt-1 w-72 rounded-lg border border-border bg-surface p-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className={`w-full rounded-lg px-3 py-1.5 text-left text-sm ${
                focusMetric == null ? 'font-semibold text-brand-600' : 'text-ink-soft hover:bg-canvas'
              }`}
            >
              No focus
            </button>
            {FOCUS_METRIC_GROUPS.map((group) => (
              <div key={group.category} className="mt-1">
                <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                  {group.category}
                </p>
                {group.metrics.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelect(key)}
                    className={`w-full rounded-lg px-3 py-1.5 text-left text-sm ${
                      focusMetric === key ? 'bg-brand-50 font-semibold text-brand-600' : 'text-ink hover:bg-canvas'
                    }`}
                  >
                    {FOCUS_METRIC_LABELS[key]}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MyGrowthTab({
  sessions,
  focusMetric,
  onFocusMetricChange,
}: {
  sessions: AudioSession[]
  focusMetric: FocusMetric | null
  onFocusMetricChange: (metric: FocusMetric | null) => void
}) {
  const analyzed = sessions
    .filter((s) => s.teacherTalkPct != null && s.durationSec != null)
    .slice()
    .sort((a, b) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime())
    .slice(-MAX_TREND_SESSIONS)

  if (analyzed.length < 2) {
    return (
      <div className="flex flex-col gap-4">
        <FocusSelector focusMetric={focusMetric} onChange={onFocusMetricChange} />
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
          Your growth trends will show up here after a couple more sessions. One session — especially a short
          one — is too noisy on its own to read much into.
        </div>
      </div>
    )
  }

  const labels = analyzed.map((s) =>
    new Date(s.sessionDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  )

  const teacherTalk = analyzed.map((s) => s.teacherTalkPct)
  const studentTalk = analyzed.map((s) => s.studentTalkPct)
  const higherOrder = analyzed.map((s) => ((s.questionCount ?? 0) < MIN_N_FOR_PERCENT ? null : s.higherOrderPct))
  const avgWaitTime = analyzed.map((s) => s.avgWaitTimeSec)
  const waitTimeValues = avgWaitTime.filter((v): v is number => v != null)
  const waitTimeMax = waitTimeValues.length ? Math.max(5, ...waitTimeValues) * 1.2 : 5

  const cfuFrequency = analyzed.map((s) => {
    const duration = s.durationSec ?? 0
    if (duration < MIN_DURATION_FOR_CFU_DETECTION_SEC) return null
    return Math.round(((s.cfuCount ?? 0) / (duration / 600)) * 10) / 10
  })
  const excludedCfuCount = cfuFrequency.filter((v) => v == null).length
  const cfuMax = Math.max(4, ...cfuFrequency.filter((v): v is number => v != null)) * 1.2

  // Plain per-10-minute frequency for phrase-matched counts — none of these
  // have an established minimum-duration detection floor elsewhere in the
  // app (unlike CFUs), so no exclusion beyond having a real duration.
  const followUpFrequency = analyzed.map((s) => perTenMin(s, metricsNum(s, 'followUpQuestionCount')))
  const redirectionFrequency = analyzed.map((s) => perTenMin(s, metricsNum(s, 'redirectionCount')))
  const directiveFrequency = analyzed.map((s) => perTenMin(s, metricsNum(s, 'directiveCount')))
  const nameMentionFrequency = analyzed.map((s) => perTenMin(s, metricsNum(s, 'nameMentionCount')))
  const followUpMax = frequencyMax(followUpFrequency)
  const redirectionMax = frequencyMax(redirectionFrequency)
  const directiveMax = frequencyMax(directiveFrequency)
  const nameMentionMax = frequencyMax(nameMentionFrequency)

  // Same MIN_N_FOR_PERCENT gate higherOrder already uses above — a ratio off
  // too few moments reads as more precise than it is.
  const toneRatio = analyzed.map((s) => {
    const positive = metricsNum(s, 'positivePhraseCount')
    const corrective = metricsNum(s, 'correctivePhraseCount')
    if (positive == null || corrective == null || positive + corrective < MIN_N_FOR_PERCENT) return null
    return Math.round((positive / (positive + corrective)) * 100)
  })
  const feedbackSpecificity = analyzed.map((s) => {
    const generic = metricsNum(s, 'genericFeedbackCount')
    const specific = metricsNum(s, 'specificFeedbackCount')
    if (generic == null || specific == null || generic + specific < MIN_N_FOR_PERCENT) return null
    return Math.round((specific / (generic + specific)) * 100)
  })

  const insight = buildTrendInsight(analyzed)

  const charts: { key: FocusMetric; node: React.ReactNode }[] = [
    {
      key: 'talkRatio',
      node: (
        <TrendChart
          title="Talk Ratio"
          unit="%"
          maxValue={100}
          labels={labels}
          series={[
            { label: 'You', colorVar: '--color-brand-500', values: teacherTalk },
            { label: 'Students', colorVar: '--color-warm-400', values: studentTalk },
          ]}
          emptyMessage="Not enough sessions with a measured talk split yet to trend this."
        />
      ),
    },
    {
      key: 'higherOrderPct',
      node: (
        <TrendChart
          title="Question Quality"
          unit="%"
          maxValue={100}
          labels={labels}
          series={[{ label: 'Higher-order questions', colorVar: '--color-brand-500', values: higherOrder }]}
          emptyMessage="Not enough questions asked yet in any single session to trend this reliably."
        />
      ),
    },
    {
      key: 'avgWaitTime',
      node: (
        <TrendChart
          title="Avg. Wait Time"
          unit="s"
          maxValue={waitTimeMax}
          labels={labels}
          series={[{ label: 'Your avg. wait time', colorVar: '--color-brand-500', values: avgWaitTime }]}
          emptyMessage="Not enough sessions with a measured average wait time yet to trend this."
        />
      ),
    },
    {
      key: 'cfuCount',
      node: (
        <>
          <TrendChart
            title="Checks for Understanding"
            unit="/10min"
            maxValue={cfuMax}
            labels={labels}
            series={[{ label: 'CFUs per 10 min', colorVar: '--color-brand-500', values: cfuFrequency }]}
            emptyMessage="Not enough sessions long enough to reliably detect checks for understanding yet."
          />
          {excludedCfuCount > 0 && (
            <p className="mt-2 text-xs text-ink-soft">
              {excludedCfuCount} session{excludedCfuCount === 1 ? '' : 's'} under{' '}
              {Math.round(MIN_DURATION_FOR_CFU_DETECTION_SEC / 60)} min excluded from this line — too short to
              reliably detect CFUs.
            </p>
          )}
        </>
      ),
    },
    {
      key: 'followUpQuestionCount',
      node: (
        <TrendChart
          title="Follow-up Questions"
          unit="/10min"
          maxValue={followUpMax}
          labels={labels}
          series={[{ label: 'Follow-ups per 10 min', colorVar: '--color-brand-500', values: followUpFrequency }]}
          emptyMessage="Not enough follow-up questions recorded yet to trend this."
        />
      ),
    },
    {
      key: 'redirectionCount',
      node: (
        <TrendChart
          title="Redirection Language"
          unit="/10min"
          maxValue={redirectionMax}
          labels={labels}
          series={[{ label: 'Redirections per 10 min', colorVar: '--color-brand-500', values: redirectionFrequency }]}
          emptyMessage="Not enough redirection language detected yet to trend this."
        />
      ),
    },
    {
      key: 'toneRatio',
      node: (
        <TrendChart
          title="Positive vs. Corrective Tone"
          unit="%"
          maxValue={100}
          labels={labels}
          series={[{ label: 'Share positive', colorVar: '--color-brand-500', values: toneRatio }]}
          emptyMessage="Not enough tone-language moments in any single session yet to trend this reliably."
        />
      ),
    },
    {
      key: 'directiveCount',
      node: (
        <TrendChart
          title="Clear Directions Given"
          unit="/10min"
          maxValue={directiveMax}
          labels={labels}
          series={[{ label: 'Directions per 10 min', colorVar: '--color-brand-500', values: directiveFrequency }]}
          emptyMessage="Not enough directive language detected yet to trend this."
        />
      ),
    },
    {
      key: 'nameMentionCount',
      node: (
        <TrendChart
          title="Student Names Used"
          unit="/10min"
          maxValue={nameMentionMax}
          labels={labels}
          series={[{ label: 'Name mentions per 10 min', colorVar: '--color-brand-500', values: nameMentionFrequency }]}
          emptyMessage="Not enough student-name mentions detected yet to trend this."
        />
      ),
    },
    {
      key: 'feedbackSpecificity',
      node: (
        <TrendChart
          title="Feedback Specificity"
          unit="%"
          maxValue={100}
          labels={labels}
          series={[{ label: 'Share specific', colorVar: '--color-brand-500', values: feedbackSpecificity }]}
          emptyMessage="Not enough feedback-after-response moments in any single session yet to trend this reliably."
        />
      ),
    },
  ]

  const focusedChart = focusMetric ? charts.find((c) => c.key === focusMetric) : undefined

  return (
    <div className="flex flex-col gap-6">
      <FocusSelector focusMetric={focusMetric} onChange={onFocusMetricChange} />

      {insight && (
        <div className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4">
          <ArrowUpIcon className="h-5 w-5 shrink-0 text-brand-600" />
          <p className="text-sm text-ink">{insight}</p>
        </div>
      )}

      {/* One chosen focus, across comparable recordings — not all 10 charts
          at once. */}
      {focusedChart ? (
        <div className="rounded-2xl border border-brand-400 bg-brand-50/40 p-6 ring-1 ring-brand-200">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-600">Your focus</p>
          {focusedChart.node}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
          Choose a focus above to see your growth trend for that metric.
        </div>
      )}

      <p className="text-xs text-ink-soft">
        Showing your last {analyzed.length} analyzed session{analyzed.length === 1 ? '' : 's'}. Short sessions
        add noise — read the overall direction, not any single point. This is compared only against your own
        history, not other teachers.
      </p>
    </div>
  )
}

const REFLECT_TURN_CAP = 8

function ReflectTab({
  highlights,
  cfuMetric,
  redirectionMetric,
  conversation,
  sending,
  reflectError,
  draft,
  onDraftChange,
  onStart,
  onSend,
  locked,
  talkVoice,
  strengths,
  growthAreas,
  nextStep,
  followUpDate,
  onStrengthsChange,
  onGrowthAreasChange,
  onNextStepChange,
  onFollowUpDateChange,
  saving,
  saved,
  locking,
  error,
  onSave,
  onLock,
  onSummarize,
  summarizing,
  summarizeError,
  focusMetric,
  onFocusMetricChange,
}: {
  highlights: AudioHighlight[] | null
  cfuMetric: { state: string }
  redirectionMetric: { state: string }
  conversation: AudioReflectMessage[] | null
  sending: boolean
  reflectError: { kind: ReflectChatErrorKind; message: string } | null
  draft: string
  onDraftChange: (v: string) => void
  onStart: (focus?: string) => void
  onSend: (overrideText?: string) => void
  locked: boolean
  talkVoice: TalkVoice | null
  strengths: string
  growthAreas: string
  nextStep: string
  followUpDate: string
  onStrengthsChange: (v: string) => void
  onGrowthAreasChange: (v: string) => void
  onNextStepChange: (v: string) => void
  onFollowUpDateChange: (v: string) => void
  saving: boolean
  saved: boolean
  locking: boolean
  error: string | null
  onSave: () => void
  onLock: () => void
  onSummarize: () => void
  summarizing: boolean
  summarizeError: string | null
  focusMetric: FocusMetric | null
  onFocusMetricChange: (metric: FocusMetric | null) => void
}) {
  const started = conversation != null && conversation.length > 0
  const userTurnCount = conversation?.filter((m) => m.role === 'user').length ?? 0
  const turnCapHit = userTurnCount >= REFLECT_TURN_CAP
  const lastAssistant = conversation ? [...conversation].reverse().find((m) => m.role === 'assistant') : null

  // A session that was already finished before (has saved notes) opens
  // straight into the review screen; otherwise starts on the conversation.
  const [reviewingNotes, setReviewingNotes] = useState(() => Boolean(strengths || growthAreas || nextStep))
  const [userTranscript, setUserTranscript] = useState<string | null>(null)

  // Voice mode — talk to Coach live instead of typing, replies auto-play.
  // Same useVoiceTurn hook and voicePlayback helpers Talk It Through uses,
  // just recolored to this report's own brand/warm/ink tokens instead of
  // Talk It Through's distinct cream/forest theme.
  const [voiceMode, setVoiceMode] = useState(false)
  const [muted, setMuted] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const spokenCountRef = useRef(0)
  const voiceModeRef = useRef(false)
  voiceModeRef.current = voiceMode
  const mutedRef = useRef(false)
  mutedRef.current = muted

  function handleVoiceTurnComplete(text: string) {
    if (!text) {
      if (voiceModeRef.current && !locked && !turnCapHit) start()
      return
    }
    setUserTranscript(text)
    onSend(text)
  }

  const {
    supported: voiceSupported,
    listening,
    level,
    fatalError: voiceFatalError,
    transcribing,
    start,
    close,
  } = useVoiceTurn(handleVoiceTurnComplete, 1400)

  useEffect(() => {
    if (voiceFatalError) setVoiceMode(false)
  }, [voiceFatalError])

  // Auto-play: the moment a new, not-yet-spoken assistant reply shows up
  // while in voice mode, speak it (unless muted), then resume listening —
  // same "record -> reply -> speak -> resume" loop Talk It Through uses.
  useEffect(() => {
    if (!voiceMode || !conversation) return
    if (conversation.length <= spokenCountRef.current) return
    const last = conversation[conversation.length - 1]
    if (last.role !== 'assistant') return
    spokenCountRef.current = conversation.length
    if (mutedRef.current || !audioRef.current) {
      if (!locked && !turnCapHit) start()
      return
    }
    setIsSpeaking(true)
    playQueue(audioRef.current, splitIntoSentences(last.text), talkVoice).then(() => {
      setIsSpeaking(false)
      if (voiceModeRef.current && !locked && !turnCapHit) start()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, voiceMode])

  // Releases the mic on unmount (e.g. leaving this tab or the report).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => close, [])

  // Fire-and-forget, same as TalkToMe.tsx's own priming — never awaited,
  // since the <audio> element has no source yet and this must never block
  // the actual state transition (starting the conversation, or entering
  // voice mode) behind however long play()/pause() takes to settle.
  function primeAudio() {
    const audio = audioRef.current
    if (!audio) return
    audio.muted = true
    audio
      .play()
      .then(() => {
        audio.pause()
        audio.currentTime = 0
        audio.muted = false
      })
      .catch((err) => {
        console.warn('[ReflectTab] audio unlock (priming) rejected', err)
        audio.muted = false
      })
  }

  function handleStartVoice(focus?: string) {
    primeAudio()
    setVoiceMode(true)
    onStart(focus)
  }

  function handleStartTyped() {
    setVoiceMode(false)
    onStart()
  }

  function handleSwitchToVoice() {
    primeAudio()
    setVoiceMode(true)
    if (!locked && !turnCapHit) start()
  }

  function handleSwitchToTyping() {
    close()
    setVoiceMode(false)
  }

  function handleFinish() {
    close()
    audioRef.current?.pause()
    setReviewingNotes(true)
    onSummarize()
  }

  const voiceStatus = transcribing
    ? 'Transcribing…'
    : sending
      ? 'Thinking…'
      : isSpeaking
        ? 'Coach is speaking'
        : listening
          ? level > 8
            ? 'Listening…'
            : "I'm listening — go ahead"
          : 'Paused'

  const starterPrompts = buildReflectStarterPrompts(highlights, cfuMetric, redirectionMetric)

  return (
    <div className="flex flex-col gap-6">
      {/* Persistent, hidden element — playQueue always plays a locally
          created blob: URL through it, never /api/tts directly. */}
      <audio ref={audioRef} crossOrigin="use-credentials" className="hidden" />

      {reviewingNotes ? (
        <div className="flex flex-col gap-6">
          <button
            type="button"
            onClick={() => setReviewingNotes(false)}
            className="self-start text-sm font-medium text-ink-soft hover:text-ink"
          >
            ← Back to conversation
          </button>

          {summarizing ? (
            <div className="rounded-2xl border border-border bg-surface p-8 text-center">
              <p className="text-sm text-ink-soft">Wrapping up your reflection…</p>
            </div>
          ) : (
            <>
              {summarizeError && <p className="text-sm text-warm-500">{summarizeError}</p>}

              <div className="rounded-2xl border border-border bg-surface p-6">
                <h2 className="text-sm font-semibold text-ink">My next step</h2>
                <p className="mt-1 text-sm text-ink-soft">Choose one focus for your next recording.</p>
                <div className="mt-3">
                  <FocusSelector focusMetric={focusMetric} onChange={onFocusMetricChange} />
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface p-6">
                <h2 className="text-sm font-semibold text-ink">Your reflection</h2>
                <div className="mt-4 flex flex-col gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-ink">What I noticed</span>
                    <textarea
                      value={strengths}
                      onChange={(e) => onStrengthsChange(e.target.value)}
                      disabled={locked}
                      rows={3}
                      className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-70"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-ink">What I want to explore</span>
                    <textarea
                      value={growthAreas}
                      onChange={(e) => onGrowthAreasChange(e.target.value)}
                      disabled={locked}
                      rows={3}
                      className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-70"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-ink">My next step</span>
                    <textarea
                      value={nextStep}
                      onChange={(e) => onNextStepChange(e.target.value)}
                      disabled={locked}
                      rows={2}
                      className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-70"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-ink">Follow-up date</span>
                    <input
                      type="date"
                      value={followUpDate}
                      onChange={(e) => onFollowUpDateChange(e.target.value)}
                      disabled={locked}
                      className="w-fit rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-70"
                    />
                  </label>
                </div>

                {!locked && (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={onSave}
                      disabled={saving}
                      className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
                    >
                      {saving ? 'Saving...' : 'Save notes'}
                    </button>
                    {saved && <span className="text-sm text-brand-600">Saved.</span>}
                    <button
                      type="button"
                      onClick={onLock}
                      disabled={locking}
                      className="ml-auto rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-60"
                    >
                      {locking ? 'Locking...' : 'Lock report'}
                    </button>
                  </div>
                )}
                {error && <p className="mt-3 text-sm text-warm-500">{error}</p>}
              </div>
            </>
          )}
        </div>
      ) : !started ? (
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-border bg-surface p-8 text-center">
          <div>
            <h2 className="text-lg font-semibold text-ink">Let's talk through this lesson</h2>
            <p className="mt-1.5 text-sm text-ink-soft">
              Pick something to start with, or just start talking — one question at a time, at your pace.
            </p>
          </div>

          {starterPrompts.length > 0 && (
            <div className="flex w-full flex-col gap-2">
              {starterPrompts.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handleStartVoice(p.focus)}
                  disabled={sending}
                  className="rounded-xl border border-border bg-canvas px-4 py-3 text-left text-sm text-ink transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-60"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {!locked && (
            <div className="flex w-full flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => handleStartVoice()}
                disabled={sending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
              >
                <MicIcon className="h-4 w-4" />
                {sending ? 'Starting...' : 'Start Talking'}
              </button>
              <button
                type="button"
                onClick={handleStartTyped}
                disabled={sending}
                className="text-sm font-medium text-ink-soft hover:text-ink"
              >
                Type instead
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex flex-col gap-3">
              {userTranscript && (
                <div className="rounded-xl bg-brand-50 px-4 py-2.5 text-sm text-ink">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">You</p>
                  <p className="mt-1">{userTranscript}</p>
                </div>
              )}
              {lastAssistant && (
                <div className="rounded-xl border border-border bg-canvas px-4 py-2.5 text-sm whitespace-pre-wrap text-ink">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Coach</p>
                  <p className="mt-1">{lastAssistant.text}</p>
                </div>
              )}
              {sending && <p className="text-sm text-ink-soft">Thinking...</p>}
            </div>

            {(reflectError || voiceFatalError) && (
              <p className="mt-3 text-sm text-warm-500">{reflectError?.message ?? voiceFatalError}</p>
            )}

            {voiceMode ? (
              <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      isSpeaking || sending || transcribing ? 'animate-pulse bg-brand-500' : 'bg-ink-soft'
                    }`}
                  />
                  <p className="text-sm text-ink-soft">{voiceStatus}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!locked && !turnCapHit && (
                    <button
                      type="button"
                      onClick={listening ? () => close() : () => start()}
                      className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-brand-400 hover:text-brand-600"
                    >
                      {listening ? 'Pause mic' : 'Resume'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      muted
                        ? 'border-warm-500 bg-warm-100 text-warm-500'
                        : 'border-border text-ink-soft hover:border-brand-400 hover:text-brand-600'
                    }`}
                  >
                    {muted ? 'Unmute coach' : 'Mute coach'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSwitchToTyping}
                    className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-brand-400 hover:text-brand-600"
                  >
                    Type instead
                  </button>
                  {!locked && (
                    <button
                      type="button"
                      onClick={handleFinish}
                      className="ml-auto rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-600"
                    >
                      Finish
                    </button>
                  )}
                </div>
                {locked ? (
                  <p className="text-xs text-ink-soft">This report is locked — the conversation is read-only.</p>
                ) : turnCapHit ? (
                  <p className="text-xs text-ink-soft">You've reached today's reflection limit for this session.</p>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 border-t border-border pt-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    setUserTranscript(draft.trim())
                    onSend()
                  }}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => onDraftChange(e.target.value)}
                      placeholder="Say what's on your mind..."
                      disabled={sending || locked || turnCapHit}
                      className="flex-1 rounded-lg border border-border bg-canvas px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={sending || locked || turnCapHit || !draft.trim()}
                      className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </form>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {voiceSupported && !locked && !turnCapHit && (
                    <button
                      type="button"
                      onClick={handleSwitchToVoice}
                      className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
                    >
                      <MicIcon className="h-3.5 w-3.5" />
                      Talk instead
                    </button>
                  )}
                  {!locked && (
                    <button
                      type="button"
                      onClick={handleFinish}
                      className="ml-auto rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-brand-400 hover:text-brand-600"
                    >
                      Finish
                    </button>
                  )}
                </div>
                {locked ? (
                  <p className="mt-2 text-xs text-ink-soft">This report is locked — the conversation is read-only.</p>
                ) : turnCapHit ? (
                  <p className="mt-2 text-xs text-ink-soft">
                    You've reached today's reflection limit for this session.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const CONTENT_NOTE_LABEL_STYLES: Record<string, string> = {
  Clarity: 'bg-brand-50 text-brand-600',
  Vocabulary: 'bg-brand-50 text-brand-600',
  'Engagement with content': 'bg-brand-50 text-brand-600',
  'Worth double-checking': 'bg-warm-100 text-warm-500',
}

function WordCloud({ words, colorClassName }: { words: AudioTopicTerm[]; colorClassName: string }) {
  if (words.length === 0) return null
  const counts = words.map((w) => w.count)
  const max = Math.max(...counts)
  const min = Math.min(...counts)
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
      {words.map((w) => {
        const ratio = max === min ? 1 : (w.count - min) / (max - min)
        const fontSize = 0.75 + ratio * 1.1
        const opacity = 0.55 + ratio * 0.45
        return (
          <span
            key={w.term}
            title={`${w.count} mentions`}
            className={`font-semibold leading-none ${colorClassName}`}
            style={{ fontSize: `${fontSize}rem`, opacity }}
          >
            {w.term}
          </span>
        )
      })}
    </div>
  )
}

function LessonContentTab({
  session,
  lessonContent,
  contentInsight,
  contentNotes,
  isShort,
  sending,
  error,
  onGenerate,
}: {
  session: AudioSession
  lessonContent: AudioLessonContent | null
  contentInsight: string | null
  contentNotes: AudioContentNotes | null
  isShort: boolean
  sending: boolean
  error: string | null
  onGenerate: () => void
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const subject = lessonContent?.subject ?? null
  const visibleNotes = contentNotes?.notes.filter((n) => !dismissed.has(n.id)) ?? []
  // Matches the spec's two named conditions exactly (0% or not measured) —
  // deliberately narrower than judgeTalkBalance's broader "thin" bucket,
  // since a small-but-real amount of student talk still earns its own cloud.
  const showStudentCloud = session.studentTalkPct != null && session.studentTalkPct !== 0

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-normal italic text-ink-soft">Flags & quotes only — not scored</p>
      <CoachNote text={contentInsight} />
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Topic terms detected</p>
          {!lessonContent ? (
            <p className="mt-1 text-sm text-ink-soft">No recurring subject-specific terms detected.</p>
          ) : Array.isArray(lessonContent.topicTerms) ? (
            lessonContent.topicTerms.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {lessonContent.topicTerms.map((term) => (
                  <span key={term} className="rounded-full border border-border bg-canvas px-3 py-1 text-xs text-ink">
                    {term}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-ink-soft">No recurring subject-specific terms detected.</p>
            )
          ) : (
            <>
              <div className={`mt-2 ${showStudentCloud ? 'grid grid-cols-1 gap-6 sm:grid-cols-2' : ''}`}>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">Teacher</p>
                  {lessonContent.topicTerms.teacher.length > 0 ? (
                    <div className="mt-1.5">
                      <WordCloud words={lessonContent.topicTerms.teacher} colorClassName="text-brand-600" />
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-ink-soft">No recurring terms detected.</p>
                  )}
                </div>
                {showStudentCloud && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-warm-500">Student</p>
                    {lessonContent.topicTerms.student.length > 0 ? (
                      <div className="mt-1.5">
                        <WordCloud words={lessonContent.topicTerms.student} colorClassName="text-warm-500" />
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-ink-soft">No recurring terms detected.</p>
                    )}
                  </div>
                )}
              </div>
              {!showStudentCloud && (
                <p className="mt-2 text-xs text-ink-soft">
                  Student language couldn't be analyzed this session (little or no separately-detected student talk).
                </p>
              )}
            </>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Stated objective</p>
          {!lessonContent || lessonContent.statedObjective.found === null ? (
            <p className="mt-1 text-sm text-ink-soft" title="Opening phase not captured.">
              — Opening phase not captured
            </p>
          ) : lessonContent.statedObjective.found ? (
            <p className="mt-1 text-sm text-ink">
              Detected: "{lessonContent.statedObjective.quote}"{' '}
              <span className="text-xs text-ink-soft">
                ({formatTime(lessonContent.statedObjective.timestampSec ?? 0)})
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">Not detected in the Opening phase.</p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Real-world / prior-knowledge connections
          </p>
          {lessonContent && lessonContent.connections.length > 0 ? (
            <div className="mt-2 flex flex-col gap-1.5">
              {lessonContent.connections.map((c, i) => (
                <p key={i} className="text-sm text-ink">
                  "{c.quote}" <span className="text-xs text-ink-soft">({formatTime(c.timestampSec)})</span>
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">None detected.</p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Defined vocabulary</p>
          {lessonContent && lessonContent.vocabulary.length > 0 ? (
            <div className="mt-2 flex flex-col gap-1.5">
              {lessonContent.vocabulary.map((v, i) => (
                <p key={i} className="text-sm text-ink">
                  "{v.quote}" <span className="text-xs text-ink-soft">({formatTime(v.timestampSec)})</span>
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">None detected.</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Content Specialist Notes</h2>
        {subject == null ? (
          <p className="text-sm text-ink-soft">
            Not enough subject-specific content detected to generate notes this session.
          </p>
        ) : !contentNotes ? (
          <button
            type="button"
            onClick={onGenerate}
            disabled={sending}
            className="self-start rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
          >
            {sending ? 'Generating...' : 'Generate content specialist notes'}
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-ink-soft">
              These notes are generated from a short audio excerpt and may miss context. They're meant as a
              starting point for your own reflection, not a factual review — please use your own subject
              expertise as the final word.
            </p>
            {isShort && (
              <p className="text-xs font-semibold text-warm-500">
                This session is under {Math.round(SHORT_SESSION_THRESHOLD_SEC / 60)} minutes — content feedback
                from a short sample is especially limited.
              </p>
            )}
            {visibleNotes.length === 0 ? (
              <p className="text-sm text-ink-soft">No notes to show.</p>
            ) : (
              visibleNotes.map((note) => (
                <div key={note.id} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${CONTENT_NOTE_LABEL_STYLES[note.label] ?? 'bg-canvas text-ink-soft'}`}
                    >
                      {note.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDismissed((prev) => new Set(prev).add(note.id))}
                      aria-label="Dismiss note"
                      className="shrink-0 text-ink-soft hover:text-ink"
                    >
                      ×
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-ink">{note.text}</p>
                  <p className="mt-2 text-xs text-ink-soft">
                    "{note.excerpt}" ({formatTime(note.timestampSec)})
                  </p>
                </div>
              ))
            )}
          </div>
        )}
        {error && <p className="text-sm text-warm-500">{error}</p>}
      </div>
    </div>
  )
}

function ClimateRoutinesTab({
  transitionMetric,
  directiveMetric,
  phases,
  nameMentionMetric,
  uniqueNameCount,
  toneRatio,
  redirectionMetric,
  hasRedirectionCluster,
  hasRepeatedInstructionHighlight,
  firstRedirectionTimestampSec,
  routinesInsight,
  climateInsight,
}: {
  transitionMetric: ReturnType<typeof getCountMetric>
  directiveMetric: ReturnType<typeof getCountMetric>
  phases: AudioPhase[] | null
  nameMentionMetric: ReturnType<typeof getCountMetric>
  uniqueNameCount: number | null
  toneRatio: ConfidentMetric
  redirectionMetric: ReturnType<typeof getCountMetric>
  hasRedirectionCluster: boolean
  hasRepeatedInstructionHighlight: boolean
  firstRedirectionTimestampSec: number | null
  routinesInsight: string | null
  climateInsight: string | null
}) {
  const firstRedirectionDisplay =
    redirectionMetric.state === 'confirmed_none'
      ? 'Not needed this session'
      : firstRedirectionTimestampSec != null
        ? formatTime(firstRedirectionTimestampSec)
        : '—'
  const firstRedirectionMuted = redirectionMetric.state === 'confirmed_none' ? false : firstRedirectionTimestampSec == null

  return (
    <div className="flex flex-col gap-6">
      <CategorySection title="Routines" coverage={categoryCoverage([transitionMetric, directiveMetric])}>
        <Stat
          label="Your transitions"
          value={transitionMetric.display}
          muted={isMissingState(transitionMetric.state)}
          reason={transitionMetric.reason}
        />
        <Stat
          label="Clear directions given"
          value={directiveMetric.display}
          muted={isMissingState(directiveMetric.state)}
          reason={directiveMetric.reason ?? "Count only — clarity isn't judged automatically."}
        />
        <Stat
          label="Repeated instruction"
          value={isMissingState(directiveMetric.state) ? '—' : hasRepeatedInstructionHighlight ? 'Detected' : 'None detected'}
          muted={isMissingState(directiveMetric.state)}
          reason={
            isMissingState(directiveMetric.state)
              ? directiveMetric.reason
              : 'Flags the same direction repeated within 90 seconds — a sign it may not have landed the first time.'
          }
        />
      </CategorySection>
      <CoachNote text={routinesInsight} />

      {/* Session Phases lives here now, alongside Routines, rather than on
          a separate "Discourse Details" screen it used to need a cross-link
          to reach. */}
      {phases && phases.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Session phases</h2>
          <div className="mt-3 flex flex-col gap-2">
            {phases.map((p, i) => {
              const isSliver = p.endSec - p.startSec < MIN_PHASE_DURATION_SEC
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${
                    isSliver ? 'border-dashed border-border/60 bg-canvas' : 'border-border bg-surface'
                  }`}
                >
                  <span className={`w-28 shrink-0 text-sm font-medium ${isSliver ? 'text-ink-soft' : 'text-ink'}`}>
                    {p.label}
                  </span>
                  <span className="text-sm text-ink-soft">
                    {formatTime(p.startSec)} – {formatTime(p.endSec)}
                    {isSliver && ' · too brief to treat as a real phase'}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            These boundaries are an automated estimate — treat them as a starting point.
          </p>
        </div>
      )}

      <CategorySection
        title="Climate & Tone"
        coverage={categoryCoverage([nameMentionMetric, toneRatio, redirectionMetric])}
      >
        <Stat
          label="Student names used"
          value={
            nameMentionMetric.state === 'measured' && uniqueNameCount != null
              ? `${nameMentionMetric.display} mentions · ${uniqueNameCount} distinct`
              : nameMentionMetric.display
          }
          muted={isMissingState(nameMentionMetric.state)}
          reason={
            nameMentionMetric.reason ??
            "Distinct names are a text-pattern guess, not a verified roster match — two students sharing a first name would count as one."
          }
        />
        <Stat
          label="Your positive / corrective ratio"
          value={toneRatio.display}
          muted={isMissingState(toneRatio.state)}
          reason={toneRatio.reason}
          sub={isConfidentState(toneRatio.state) ? 'share positive' : undefined}
        />
        <div id="stat-redirection">
          <Stat
            label="Your redirection language"
            value={redirectionMetric.display}
            muted={isMissingState(redirectionMetric.state)}
            reason={redirectionMetric.reason ?? 'Count only — tone isn\'t judged automatically.'}
          />
        </div>
        <Stat
          label="Redirection cluster"
          value={isMissingState(redirectionMetric.state) ? '—' : hasRedirectionCluster ? 'Detected' : 'None detected'}
          muted={isMissingState(redirectionMetric.state)}
          reason={
            isMissingState(redirectionMetric.state)
              ? redirectionMetric.reason
              : 'Flags back-to-back redirections close together — a possible sign the room needed a different routine in that moment.'
          }
        />
        <Stat
          label="Time to first redirection"
          value={firstRedirectionDisplay}
          muted={firstRedirectionMuted}
          reason={
            firstRedirectionMuted
              ? (redirectionMetric.reason ?? 'Not available for this session — analyzed before this was tracked.')
              : undefined
          }
        />
      </CategorySection>
      <CoachNote text={climateInsight} />
    </div>
  )
}

// Chart #2 — Pacing & Rhythm Timeline: buckets the session's already-fetched
// per-utterance segments (session.segments, sent with every getAudioSession
// call) into equal-duration bins spanning the full recording, and colors
// each by whether teacher or student speech dominated it. A bin with no
// segment overlap at all (a real coverage gap) hatches rather than being
// skipped — the timeline always spans the full lesson duration.
const PACING_TIMELINE_BINS = 24

type PacingBin = 'teacher' | 'student' | 'unavailable'

function buildPacingTimeline(segments: TranscriptSegment[], durationSec: number): PacingBin[] {
  const binSec = durationSec / PACING_TIMELINE_BINS
  const bins: PacingBin[] = []
  for (let i = 0; i < PACING_TIMELINE_BINS; i++) {
    const binStart = i * binSec
    const binEnd = binStart + binSec
    let teacherSec = 0
    let studentSec = 0
    for (const seg of segments) {
      const overlap = Math.min(seg.endSec, binEnd) - Math.max(seg.startSec, binStart)
      if (overlap <= 0) continue
      if (seg.speakerLabel === 'Teacher') teacherSec += overlap
      else if (seg.speakerLabel === 'Student') studentSec += overlap
    }
    bins.push(teacherSec === 0 && studentSec === 0 ? 'unavailable' : teacherSec >= studentSec ? 'teacher' : 'student')
  }
  return bins
}

function PacingTimeline({ segments, durationSec }: { segments: TranscriptSegment[]; durationSec: number | null }) {
  if (durationSec == null || durationSec <= 0 || segments.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <h3 className="text-sm font-semibold text-ink">Pacing &amp; rhythm</h3>
        <div className="mt-3">
          <HatchedBar label="Pacing timeline unavailable this session." className="h-6 rounded-lg" />
        </div>
      </div>
    )
  }
  const bins = buildPacingTimeline(segments, durationSec)
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h3 className="text-sm font-semibold text-ink">Pacing &amp; rhythm</h3>
      <div className="mt-3 flex h-6 w-full overflow-hidden rounded-lg">
        {bins.map((bin, i) =>
          bin === 'unavailable' ? (
            <div key={i} className="h-full flex-1" style={HATCH_STYLE} />
          ) : (
            <div key={i} className={`h-full flex-1 ${bin === 'teacher' ? 'bg-brand-500' : 'bg-warm-400'}`} />
          ),
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-soft">
        <span>0:00</span>
        <span>{formatTime(durationSec)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-brand-500" /> Teacher-heavy
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-warm-400" /> Student-heavy
        </span>
        <span className="flex items-center gap-1.5">
          <HatchedSwatch /> Unavailable
        </span>
      </div>
    </div>
  )
}

// Chart #3 — Questioning & Thinking Mix: the only two question types this
// app actually detects are recall and higher-order (see questionLog/
// higherOrderQuestionCount in audioAnalysis.ts) — shown as fractions, matching
// this report's existing small-N convention, never a percentage.
function QuestioningMixChart({
  higherOrderCount,
  totalCount,
  state,
}: {
  higherOrderCount: number | null
  totalCount: number | null
  state: MetricState
}) {
  const unavailable = isMissingState(state) || totalCount == null || higherOrderCount == null
  // A distribution bar reads as a stable rate even at the smallest sample —
  // "1 of 1 higher-order" fills the whole bar exactly like "18 of 18" would.
  // Below the same MIN_N_FOR_PERCENT floor the rest of this report already
  // uses for a percentage, show the plain count instead of the chart.
  const tooFewToCharacterize = !unavailable && state === 'possible_detection'
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">Questioning mix</h3>
      {unavailable ? (
        <div className="mt-2">
          <HatchedBar label="Question-type mix unavailable this session." />
        </div>
      ) : tooFewToCharacterize ? (
        <p className="mt-2 text-sm text-ink-soft">
          {totalCount} question{totalCount === 1 ? '' : 's'} detected ({higherOrderCount} higher-order) — too few to
          characterize the mix as a pattern.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2.5">
          {(
            [
              { label: 'Recall', count: totalCount - higherOrderCount },
              { label: 'Higher-order', count: higherOrderCount },
            ] as const
          ).map((row) => (
            <div key={row.label} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-xs font-medium text-ink-soft">
                <span>{row.label}</span>
                <span>
                  {row.count} of {totalCount}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-canvas">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${totalCount > 0 ? (row.count / totalCount) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TalkParticipationTab({
  session,
  teacherTalkMetric,
  studentTalkMetric,
  silencePct,
  silenceMetric,
  studentSegmentsMetric,
  focusMetric,
  talkInsight,
}: {
  session: AudioSessionWithSegments
  teacherTalkMetric: ReturnType<typeof getPresenceMetric>
  studentTalkMetric: ReturnType<typeof getPresenceMetric>
  silencePct: number | null
  silenceMetric: ReturnType<typeof getPresenceMetric>
  studentSegmentsMetric: ReturnType<typeof getCountMetric>
  focusMetric: FocusMetric | null
  talkInsight: string | null
}) {
  const exampleHighlight = (session.highlights ?? []).find((h) => h.label === 'Follow-up / probing question')

  return (
    <div className="flex flex-col gap-6">
      <PacingTimeline segments={session.segments} durationSec={session.durationSec} />

      <CategorySection
        title="Talk & Participation"
        coverage={categoryCoverage([teacherTalkMetric, studentTalkMetric, silenceMetric, studentSegmentsMetric])}
      >
        <div id="stat-talkRatio">
          <Stat
            label="Your talk time"
            value={session.teacherTalkPct != null ? `${session.teacherTalkPct}%` : teacherTalkMetric.display}
            muted={isMissingState(teacherTalkMetric.state)}
            reason={teacherTalkMetric.reason}
            focused={focusMetric === 'talkRatio'}
          />
        </div>
        <Stat
          label="Student talk time"
          value={session.studentTalkPct != null ? `${session.studentTalkPct}%` : studentTalkMetric.display}
          muted={isMissingState(studentTalkMetric.state)}
          reason={studentTalkMetric.reason}
        />
        <Stat
          label="Silence / other"
          value={silencePct != null ? `${silencePct}%` : silenceMetric.display}
          muted={isMissingState(silenceMetric.state)}
          reason={silenceMetric.reason}
        />
        <Stat
          label="Student voice segments"
          value={studentSegmentsMetric.display}
          muted={isMissingState(studentSegmentsMetric.state)}
          reason={studentSegmentsMetric.reason}
        />
      </CategorySection>
      <CoachNote text={talkInsight} />

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h3 className="text-sm font-semibold text-ink">Who was audible in this recording?</h3>
        <div className="mt-3">
          <TalkParticipationBar
            teacherPct={session.teacherTalkPct}
            studentPct={session.studentTalkPct}
            silencePct={silencePct}
          />
        </div>
        <p className="mt-4 border-t border-border pt-3 text-xs text-ink-soft">
          Talk time describes the recording. It does not show how many students participated or whether they were
          engaged.
        </p>
      </div>

      {exampleHighlight && (
        <div>
          <h3 className="text-sm font-semibold text-ink">Review an exchange</h3>
          <div className="mt-2 rounded-xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
              {formatHighlightHeadline(exampleHighlight)}
            </p>
            <p className="mt-1.5 text-sm text-ink">"{exampleHighlight.excerpt}"</p>
          </div>
        </div>
      )}
    </div>
  )
}

function WaitTimeChips({ questionLog }: { questionLog: AudioQuestionLogEntry[] | null }) {
  const waits = (questionLog ?? []).map((q) => q.waitTimeSec).filter((w): w is number => w != null)
  if (waits.length === 0) return null
  const mean = Math.round((waits.reduce((a, b) => a + b, 0) / waits.length) * 10) / 10
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">Wait time after a question</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {waits.map((w, i) => (
          <span key={i} className="rounded-lg border border-border bg-canvas px-3 py-1.5 text-sm font-medium text-ink">
            {w}s
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        Mean {mean} seconds · {waits.length} usable question-response interval{waits.length === 1 ? '' : 's'}.
      </p>
    </div>
  )
}

function QuestionsThinkingTab({
  questionCount,
  questionLog,
  questionsMetric,
  higherOrderRatio,
  higherOrderCount,
  followUpMetric,
  waitTimeMetric,
  avgWaitTimeSec,
  focusMetric,
  questioningInsight,
}: {
  questionCount: number | null
  questionLog: AudioQuestionLogEntry[] | null
  questionsMetric: ReturnType<typeof getCountMetric>
  higherOrderRatio: ReturnType<typeof formatRatio> | null
  higherOrderCount: number | null
  followUpMetric: ReturnType<typeof getCountMetric>
  waitTimeMetric: ReturnType<typeof getPresenceMetric>
  avgWaitTimeSec: number | null
  focusMetric: FocusMetric | null
  questioningInsight: string | null
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-soft">
        {questionCount != null
          ? `You asked ${questionCount} question${questionCount === 1 ? '' : 's'} this session.`
          : 'No question data for this session.'}
      </p>

      <CategorySection
        title="Questioning & Thinking"
        coverage={categoryCoverage([questionsMetric, followUpMetric, waitTimeMetric])}
      >
        <div id="stat-higherOrderPct">
          <Stat
            label="Questions you asked"
            value={questionsMetric.display}
            muted={isMissingState(questionsMetric.state)}
            reason={questionsMetric.reason}
            sub={higherOrderRatio ? `${higherOrderRatio.display} higher-order` : undefined}
            focused={focusMetric === 'higherOrderPct'}
          />
        </div>
        <Stat
          label="Your follow-up questions"
          value={followUpMetric.display}
          muted={isMissingState(followUpMetric.state)}
          reason={followUpMetric.reason}
        />
        <div id="stat-avgWaitTime">
          <Stat
            label="Your avg. wait time"
            value={avgWaitTimeSec != null ? `${avgWaitTimeSec}s` : waitTimeMetric.display}
            muted={isMissingState(waitTimeMetric.state)}
            reason={waitTimeMetric.reason}
            focused={focusMetric === 'avgWaitTime'}
          />
        </div>
      </CategorySection>
      <CoachNote text={questioningInsight} />
      <QuestioningMixChart
        higherOrderCount={higherOrderCount}
        totalCount={questionCount}
        state={higherOrderRatio?.state ?? 'not_measurable'}
      />
      <WaitTimeChips questionLog={questionLog} />

      {questionLog === null ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
          Not available for this session — analyzed before per-question detail was tracked.
        </div>
      ) : !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-start rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-400 hover:text-brand-600"
        >
          Show full question-by-question breakdown
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="self-start text-sm font-medium text-ink-soft hover:text-ink"
          >
            Hide breakdown
          </button>
          {questionLog.length === 0 ? (
            <p className="text-sm text-ink-soft">No individual questions were detected this session.</p>
          ) : (
            questionLog.map((q, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  <span>{formatTime(q.timestampSec)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      q.type === 'higher_order' ? 'bg-brand-50 text-brand-600' : 'bg-canvas text-ink-soft'
                    }`}
                  >
                    {q.type === 'higher_order' ? 'Higher-order' : 'Recall'}
                  </span>
                  <span className="normal-case font-normal">
                    {q.waitTimeSec != null ? `${q.waitTimeSec}s wait` : 'wait not measured'}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-ink">"{q.text}"</p>
                {q.followUps.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5 border-l-2 border-border pl-3">
                    {q.followUps.map((f, j) => (
                      <p key={j} className="text-sm text-ink-soft">
                        <span className="text-xs font-semibold uppercase tracking-wide">
                          {formatTime(f.timestampSec)}
                        </span>{' '}
                        "{f.text}"
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function UnderstandingFeedbackTab({
  cfuMetric,
  feedbackRatio,
  focusMetric,
  cfuInsight,
}: {
  cfuMetric: ReturnType<typeof getCountMetric>
  feedbackRatio: ConfidentMetric
  focusMetric: FocusMetric | null
  cfuInsight: string | null
}) {
  return (
    <div className="flex flex-col gap-6">
      <CategorySection title="Checking Understanding" coverage={categoryCoverage([cfuMetric, feedbackRatio])}>
        <div id="stat-cfu">
          <Stat
            label="Your checks for understanding"
            value={cfuMetric.display}
            muted={isMissingState(cfuMetric.state)}
            reason={cfuMetric.reason}
            focused={focusMetric === 'cfuCount'}
          />
        </div>
        <Stat
          label="Your feedback specificity"
          value={feedbackRatio.display}
          muted={isMissingState(feedbackRatio.state)}
          reason={feedbackRatio.reason}
          sub={isConfidentState(feedbackRatio.state) ? 'specific of total feedback moments' : undefined}
        />
      </CategorySection>
      <CoachNote text={cfuInsight} />
    </div>
  )
}

function CategorySection({
  title,
  coverage,
  children,
}: {
  title: string
  coverage: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h2 className="flex items-baseline justify-between text-sm font-semibold uppercase tracking-wide text-ink-soft">
        <span>{title}</span>
        <span className="text-xs font-normal normal-case text-ink-soft">{coverage}</span>
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-4 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-3">
        {children}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  muted,
  reason,
  focused,
}: {
  label: string
  value: string
  sub?: string
  muted?: boolean
  reason?: string
  focused?: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
        {focused && (
          <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600">
            Your focus
          </span>
        )}
      </div>
      <p
        className={`mt-1 text-xl font-semibold ${muted ? 'text-ink-soft' : 'text-ink'}`}
        title={reason}
      >
        {value}
      </p>
      {muted && reason ? (
        <p className="text-xs text-ink-soft">{reason}</p>
      ) : (
        sub && <p className="text-xs text-ink-soft">{sub}</p>
      )}
    </div>
  )
}

function SessionCard({
  session,
  onOpen,
  onDelete,
}: {
  session: AudioSession
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
      <button type="button" onClick={onOpen} className="flex-1 text-left">
        <p className="text-sm font-semibold text-ink">
          {session.classSubject || 'New Recording'} {session.period ? `· ${session.period}` : ''}
        </p>
        <p className="mt-0.5 text-xs text-ink-soft">
          {formatSessionDateTime(session.sessionDate)} ·{' '}
          {session.status === 'locked'
            ? 'Locked'
            : session.status === 'analyzed'
              ? 'Ready to review'
              : 'In progress'}
          {session.teacherTalkPct != null ? ` · ${session.teacherTalkPct}% teacher talk` : ''}
        </p>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 text-xs font-medium text-ink-soft hover:text-warm-500"
      >
        Delete
      </button>
    </div>
  )
}

const MAX_TREND_SESSIONS = 20

function metricsNum(s: AudioSession, key: string): number | null {
  const v = s.metricsDetail?.[key]
  return typeof v === 'number' ? v : null
}

function perTenMin(s: AudioSession, count: number | null): number | null {
  const duration = s.durationSec ?? 0
  return count == null || duration <= 0 ? null : Math.round((count / (duration / 600)) * 10) / 10
}

function frequencyMax(values: (number | null)[]): number {
  const nums = values.filter((v): v is number => v != null)
  return Math.max(4, ...nums) * 1.2
}

function buildTrendInsight(sessions: AudioSession[]): string | null {
  if (sessions.length < 3) return null

  const withTalk = sessions.filter((s) => s.teacherTalkPct != null)
  if (withTalk.length >= 3) {
    const delta = withTalk[withTalk.length - 1].teacherTalkPct! - withTalk[0].teacherTalkPct!
    if (delta <= -8) {
      return `Your talk time is down ${Math.abs(Math.round(delta))} points since your first tracked session — more room for student voice.`
    }
  }

  const withQuestions = sessions.filter(
    (s) => (s.questionCount ?? 0) >= MIN_N_FOR_PERCENT && s.higherOrderPct != null,
  )
  if (withQuestions.length >= 3) {
    const delta = withQuestions[withQuestions.length - 1].higherOrderPct! - withQuestions[0].higherOrderPct!
    if (delta >= 10) {
      return `Your higher-order questions are up ${Math.round(delta)} points since your first tracked session — nice trend.`
    }
  }

  return null
}

type TrendSeries = { label: string; colorVar: string; values: (number | null)[] }

function TrendChart({
  title,
  unit,
  maxValue,
  labels,
  series,
  emptyMessage,
}: {
  title: string
  unit: string
  maxValue: number
  labels: string[]
  series: TrendSeries[]
  emptyMessage?: string
}) {
  const width = 600
  const height = 140
  const padX = 8
  const padY = 14
  const usableW = width - padX * 2
  const usableH = height - padY * 2
  const n = labels.length

  const totalValid = series.reduce((sum, s) => sum + s.values.filter((v) => v != null).length, 0)
  const latestBySeries = series.map((s) => {
    const vals = s.values.filter((v): v is number => v != null)
    return vals.length ? vals[vals.length - 1] : null
  })

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <div className="flex items-center gap-3">
          {series.map((s, i) => (
            <span key={s.label} className="flex items-center gap-1.5 text-xs text-ink-soft">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `var(${s.colorVar})` }} />
              {s.label}
              {latestBySeries[i] != null ? `: ${latestBySeries[i]}${unit}` : ''}
            </span>
          ))}
        </div>
      </div>

      {totalValid < 2 ? (
        <p className="mt-4 text-sm text-ink-soft">{emptyMessage ?? 'Not enough data yet.'}</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            height={height}
            preserveAspectRatio="none"
            className="mt-3"
          >
            {series.map((s, seriesIndex) => {
              const coords = s.values.map((v, i) => ({
                x: n > 1 ? padX + (i / (n - 1)) * usableW : padX + usableW / 2,
                y: v == null ? null : padY + usableH - (Math.min(v, maxValue) / maxValue) * usableH,
              }))
              const segments: string[] = []
              let current: string[] = []
              coords.forEach((c) => {
                if (c.y == null) {
                  if (current.length > 1) segments.push(current.join(' '))
                  current = []
                } else {
                  current.push(`${current.length === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
                }
              })
              if (current.length > 1) segments.push(current.join(' '))

              return (
                <g key={s.label}>
                  {segments.map((d, i) => (
                    <path
                      key={i}
                      d={d}
                      fill="none"
                      stroke={`var(${s.colorVar})`}
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                  ))}
                  {coords.map((c, i) =>
                    c.y == null ? null : (
                      <circle key={i} cx={c.x} cy={c.y} r={3} fill={`var(${s.colorVar})`} />
                    ),
                  )}
                  {/* Chart #4 — sessions with no measured value for this metric never
                      dip the line to zero: the path above already breaks into a gap
                      (see the segment-building loop), and a dashed hollow marker
                      fills that gap so it reads as "not measured," not "measured
                      zero." A native <title> carries the "no data" label without
                      permanently cluttering a dense multi-session chart. */}
                  {coords.map((c, i) => {
                    if (c.y != null) return null
                    // Multiple series share the same x-axis — stagger gap markers
                    // vertically by series so simultaneous gaps don't sit exactly
                    // on top of one another.
                    const midY = padY + usableH / 2 + (seriesIndex - (series.length - 1) / 2) * 9
                    return (
                      <g key={`gap-${i}`}>
                        <title>no data</title>
                        <DashedLinePoint cx={c.x} cy={midY} colorVar={s.colorVar} />
                        {series.length === 1 && <NoDataLabel x={c.x} y={midY + 11} />}
                      </g>
                    )
                  })}
                </g>
              )
            })}
          </svg>
          <div className="mt-1 flex justify-between text-[11px] text-ink-soft">
            <span>{labels[0]}</span>
            <span>{labels[labels.length - 1]}</span>
          </div>
        </>
      )}
    </div>
  )
}
