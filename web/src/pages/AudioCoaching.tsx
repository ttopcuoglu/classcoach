import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpIcon, MicIcon, WarningIcon } from '../components/icons'
import {
  createAudioSession,
  deleteAudioSession,
  getAudioSession,
  getAudioSessions,
  getProfile,
  tagSpeaker,
  transcribeAudioSession,
  updateAudioSession,
  type AudioSession,
  type AudioSessionWithSegments,
  type SpeakerSample,
} from '../lib/api'
import {
  categoryCoverage,
  formatRatio,
  getCoverage,
  getCountMetric,
  getPresenceMetric,
  MIN_DURATION_FOR_CFU_DETECTION_SEC,
  MIN_N_FOR_PERCENT,
  SHORT_SESSION_THRESHOLD_SEC,
} from '../lib/reportConfidence'

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function AudioCoaching() {
  const [view, setView] = useState<'sessions' | 'trends'>('sessions')
  const [sessions, setSessions] = useState<AudioSession[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [active, setActive] = useState<AudioSessionWithSegments | null>(null)
  const [speakers, setSpeakers] = useState<SpeakerSample[]>([])
  const [error, setError] = useState<string | null>(null)

  function refreshHistory() {
    getAudioSessions()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }

  useEffect(() => {
    refreshHistory()
  }, [])

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

  if (active) {
    return (
      <SessionFlow
        session={active}
        speakers={speakers}
        onSpeakers={setSpeakers}
        onUpdate={setActive}
        onExit={handleExit}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Audio Coaching</h1>
        <p className="text-ink-soft">
          Record a class period, get a transcript, and see a coaching report. Audio is never saved — only
          the text.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setView('sessions')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            view === 'sessions' ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Sessions
        </button>
        <button
          type="button"
          onClick={() => setView('trends')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            view === 'trends' ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Trends
        </button>
      </div>

      {error && <p className="text-sm text-warm-500">{error}</p>}

      {view === 'trends' ? (
        <TrendsView sessions={sessions} loading={historyLoading} />
      ) : (
        <>
          <SetupForm onCreated={(session) => setActive({ ...session, segments: [] })} />

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
        </>
      )}
    </div>
  )
}

function SetupForm({ onCreated }: { onCreated: (session: AudioSession) => void }) {
  const [teacherName, setTeacherName] = useState('')
  const [classSubject, setClassSubject] = useState('')
  const [period, setPeriod] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getProfile()
      .then((profile) => {
        if (profile.name) setTeacherName(profile.name)
        const firstGrade = profile.gradeLevels?.split(',')[0]?.trim()
        if (firstGrade) setGradeLevel(firstGrade)
      })
      .catch(() => {})
  }, [])

  async function handleStart() {
    if (creating) return
    setCreating(true)
    setError(null)
    try {
      const session = await createAudioSession({
        teacherName: teacherName || undefined,
        classSubject: classSubject || undefined,
        period: period || undefined,
        gradeLevel: gradeLevel || undefined,
        sessionDate: sessionDate ? new Date(sessionDate).toISOString() : undefined,
        consentConfirmed: true,
      })
      onCreated(session)
    } catch {
      setError('Could not start a new session. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold text-ink">New recording</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Teacher name</span>
          <input
            value={teacherName}
            onChange={(e) => setTeacherName(e.target.value)}
            className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Class / subject</span>
          <input
            value={classSubject}
            onChange={(e) => setClassSubject(e.target.value)}
            placeholder="e.g. 7th grade Science"
            className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Period</span>
          <input
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="e.g. Period 3"
            className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Grade level</span>
          <input
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            placeholder="e.g. 7th grade"
            className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-ink">Date</span>
          <input
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            className="w-fit rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={handleStart}
        disabled={creating}
        className="mt-4 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
      >
        {creating ? 'Starting...' : 'Continue to recording'}
      </button>
      {error && <p className="mt-3 text-sm text-warm-500">{error}</p>}
    </div>
  )
}

function SessionFlow({
  session,
  speakers,
  onSpeakers,
  onUpdate,
  onExit,
}: {
  session: AudioSessionWithSegments
  speakers: SpeakerSample[]
  onSpeakers: (s: SpeakerSample[]) => void
  onUpdate: (s: AudioSessionWithSegments) => void
  onExit: () => void
}) {
  if (session.status === 'setup' || session.status === 'recording' || session.status === 'paused') {
    return (
      <RecordingPanel session={session} onUpdate={onUpdate} onSpeakers={onSpeakers} onExit={onExit} />
    )
  }
  if (session.status === 'transcribing') {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <p className="text-sm text-ink-soft">Transcribing your session...</p>
      </div>
    )
  }
  if (session.status === 'tagging') {
    return <TagSpeakersPanel session={session} speakers={speakers} onUpdate={onUpdate} />
  }
  return <ReportPanel session={session} onUpdate={onUpdate} onExit={onExit} />
}

function RecordingPanel({
  session,
  onUpdate,
  onSpeakers,
  onExit,
}: {
  session: AudioSessionWithSegments
  onUpdate: (s: AudioSessionWithSegments) => void
  onSpeakers: (s: SpeakerSample[]) => void
  onExit: () => void
}) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'paused' | 'uploading'>('idle')
  const [elapsedSec, setElapsedSec] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const accumulatedSecRef = useRef(0)
  const runStartRef = useRef<number | null>(null)
  const intervalRef = useRef<number | null>(null)
  const mimeTypeRef = useRef('audio/webm')

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function tick() {
    if (runStartRef.current === null) return
    setElapsedSec(accumulatedSecRef.current + (Date.now() - runStartRef.current) / 1000)
  }

  async function handleRecord() {
    setError(null)
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
    if (!recorder) return
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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">
              {session.classSubject || 'Untitled class'} {session.period ? `· ${session.period}` : ''}
            </p>
            <p className="text-xs text-ink-soft">
              {session.teacherName ? `${session.teacherName} · ` : ''}
              {new Date(session.sessionDate).toLocaleDateString()}
            </p>
          </div>
          {phase === 'idle' && (
            <button type="button" onClick={onExit} className="text-sm font-medium text-ink-soft hover:text-ink">
              Cancel
            </button>
          )}
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2.5">
            {phase === 'recording' && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warm-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warm-500" />
              </span>
            )}
            {phase === 'paused' && <span className="h-2.5 w-2.5 rounded-full bg-ink-soft" />}
            <span className="font-mono text-3xl font-semibold text-ink">{timeLabel}</span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {phase === 'idle' && 'Ready to record'}
            {phase === 'recording' && 'Recording'}
            {phase === 'paused' && 'Paused'}
            {phase === 'uploading' && 'Transcribing your session...'}
          </p>

          <div className="flex items-center gap-3">
            {phase === 'idle' && (
              <button
                type="button"
                onClick={handleRecord}
                className="flex items-center gap-2 rounded-full bg-warm-500 px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                <MicIcon className="h-4 w-4" />
                Record
              </button>
            )}
            {phase === 'recording' && (
              <>
                <button
                  type="button"
                  onClick={handlePause}
                  className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand-400 hover:text-brand-600"
                >
                  Pause
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
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
                  className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Stop
                </button>
              </>
            )}
            {phase === 'uploading' && (
              <span className="text-sm text-ink-soft">This can take a minute for a full class period.</span>
            )}
          </div>
        </div>

        {error && <p className="mt-4 text-center text-sm text-warm-500">{error}</p>}
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
}: {
  session: AudioSessionWithSegments
  speakers: SpeakerSample[]
  onUpdate: (s: AudioSessionWithSegments) => void
}) {
  const [tagging, setTagging] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold text-ink">Which voice is the teacher?</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Automatic diarization can tell voices apart, but it can't reliably tell who's the teacher. Pick it
        below — everyone else will be grouped as Student.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {speakers.length === 0 ? (
          <p className="text-sm text-ink-soft">No distinct speakers were detected.</p>
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

function ReportPanel({
  session,
  onUpdate,
  onExit,
}: {
  session: AudioSessionWithSegments
  onUpdate: (s: AudioSessionWithSegments) => void
  onExit: () => void
}) {
  const locked = session.status === 'locked'
  const [strengths, setStrengths] = useState(session.strengths ?? '')
  const [growthAreas, setGrowthAreas] = useState(session.growthAreas ?? '')
  const [nextStep, setNextStep] = useState(session.nextStep ?? '')
  const [followUpDate, setFollowUpDate] = useState(session.followUpDate ? session.followUpDate.slice(0, 10) : '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [locking, setLocking] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
  const higherOrderRatio =
    session.questionCount != null ? formatRatio(num('higherOrderQuestionCount') ?? 0, session.questionCount) : null
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
      : { state: 'unavailable' as const, display: '—', reason: 'No feedback-after-response moments detected.' }

  // Classroom Routines
  const transitionMetric = getCountMetric({ count: num('transitionCount'), recordedSec })

  // Climate & Tone
  const nameMentionMetric = getCountMetric({ count: num('nameMentionCount'), recordedSec })
  const redirectionMetric = getCountMetric({ count: num('redirectionCount'), recordedSec })
  const positiveCount = num('positivePhraseCount')
  const correctiveCount = num('correctivePhraseCount')
  const toneRatio =
    positiveCount != null && correctiveCount != null && positiveCount + correctiveCount > 0
      ? formatRatio(positiveCount, positiveCount + correctiveCount)
      : { state: 'unavailable' as const, display: '—', reason: 'No positive or corrective phrases detected.' }

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

      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Coverage: {formatTime(coverage.recordedSec)} recorded of {formatTime(coverage.totalSec)}
          {coverage.uncapturedPhases.length > 0 && (
            <> · Not meaningfully captured: {coverage.uncapturedPhases.join(', ')}</>
          )}
        </p>
        {coverage.isShort && (
          <div className="flex items-start gap-3 rounded-xl border-2 border-warm-500 bg-warm-100 p-4">
            <WarningIcon className="mt-0.5 h-5 w-5 shrink-0 text-warm-500" />
            <p className="text-sm font-semibold text-warm-500">
              Session under {Math.round(SHORT_SESSION_THRESHOLD_SEC / 60)} minutes — treat metrics as indicative,
              not conclusive.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold text-ink">
          {session.classSubject || 'Untitled class'} {session.period ? `· ${session.period}` : ''}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {session.teacherName ? `${session.teacherName} · ` : ''}
          {new Date(session.sessionDate).toLocaleDateString()}
          {session.gradeLevel ? ` · ${session.gradeLevel}` : ''}
          {session.durationSec ? ` · ${formatTime(session.durationSec)}` : ''}
        </p>
      </div>

      <CategorySection
        title="Talk & Participation"
        coverage={categoryCoverage([teacherTalkMetric, studentTalkMetric, silenceMetric, studentSegmentsMetric])}
      >
        <Stat label="Teacher talk" value={session.teacherTalkPct != null ? `${session.teacherTalkPct}%` : '—'} />
        <Stat label="Student talk" value={session.studentTalkPct != null ? `${session.studentTalkPct}%` : '—'} />
        <Stat label="Silence / other" value={silencePct != null ? `${silencePct}%` : '—'} />
        <Stat
          label="Student voice segments"
          value={studentSegmentsMetric.display}
          muted={studentSegmentsMetric.state === 'unavailable'}
          reason={studentSegmentsMetric.reason}
        />
      </CategorySection>

      <CategorySection
        title="Questioning & Thinking"
        coverage={categoryCoverage([questionsMetric, followUpMetric, waitTimeMetric])}
      >
        <Stat
          label="Questions"
          value={questionsMetric.display}
          muted={questionsMetric.state === 'unavailable'}
          reason={questionsMetric.reason}
          sub={higherOrderRatio ? `${higherOrderRatio.display} higher-order` : undefined}
        />
        <Stat
          label="Follow-up questions"
          value={followUpMetric.display}
          muted={followUpMetric.state === 'unavailable'}
          reason={followUpMetric.reason}
        />
        <Stat label="Avg. wait time" value={session.avgWaitTimeSec != null ? `${session.avgWaitTimeSec}s` : '—'} />
      </CategorySection>

      <CategorySection title="Checking Understanding" coverage={categoryCoverage([cfuMetric, feedbackRatio])}>
        <Stat
          label="Checks for understanding"
          value={cfuMetric.display}
          muted={cfuMetric.state === 'unavailable'}
          reason={cfuMetric.reason}
        />
        <Stat
          label="Feedback specificity"
          value={feedbackRatio.display}
          muted={feedbackRatio.state === 'unavailable'}
          reason={feedbackRatio.reason}
          sub={feedbackRatio.state !== 'unavailable' ? 'specific of total feedback moments' : undefined}
        />
      </CategorySection>

      <div>
        <h2 className="flex items-baseline justify-between text-sm font-semibold uppercase tracking-wide text-ink-soft">
          <span>Classroom Routines</span>
          <span className="text-xs font-normal normal-case text-ink-soft">
            {categoryCoverage([transitionMetric, getPresenceMetric(session.phases?.length ? 1 : null)])}
          </span>
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-4 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-3">
          <Stat
            label="Transitions"
            value={transitionMetric.display}
            muted={transitionMetric.state === 'unavailable'}
            reason={transitionMetric.reason}
          />
        </div>

        {session.phases && session.phases.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Session phases</p>
            <div className="mt-2 flex flex-col gap-2">
              {session.phases.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5"
                >
                  <span className="w-28 shrink-0 text-sm font-medium text-ink">{p.label}</span>
                  <span className="text-sm text-ink-soft">
                    {formatTime(p.startSec)} – {formatTime(p.endSec)}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              These boundaries are an automated estimate — treat them as a starting point.
            </p>
          </div>
        )}
      </div>

      <CategorySection
        title="Climate & Tone"
        coverage={categoryCoverage([nameMentionMetric, toneRatio, redirectionMetric])}
      >
        <Stat
          label="Student names used"
          value={nameMentionMetric.display}
          muted={nameMentionMetric.state === 'unavailable'}
          reason={nameMentionMetric.reason}
        />
        <Stat
          label="Positive / corrective"
          value={toneRatio.display}
          muted={toneRatio.state === 'unavailable'}
          reason={toneRatio.reason}
          sub={toneRatio.state !== 'unavailable' ? 'share positive' : undefined}
        />
        <Stat
          label="Redirection language"
          value={redirectionMetric.display}
          muted={redirectionMetric.state === 'unavailable'}
          reason={redirectionMetric.reason ?? 'Count only — tone isn\'t judged automatically.'}
        />
      </CategorySection>

      <div>
        <h2 className="flex items-baseline justify-between text-sm font-semibold uppercase tracking-wide text-ink-soft">
          <span>Lesson Content</span>
          <span className="text-xs font-normal normal-case italic text-ink-soft">Flags & quotes only — not scored</span>
        </h2>
        <div className="mt-3 flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Topic terms detected</p>
            {lessonContent && lessonContent.topicTerms.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {lessonContent.topicTerms.map((term) => (
                  <span
                    key={term}
                    className="rounded-full border border-border bg-canvas px-3 py-1 text-xs text-ink"
                  >
                    {term}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-ink-soft">No recurring subject-specific terms detected.</p>
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
      </div>

      {session.highlights && session.highlights.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Highlights</h2>
          <div className="mt-3 flex flex-col gap-3">
            {session.highlights.map((h, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                  {h.label} · {formatTime(h.timestampSec)}
                </p>
                <p className="mt-1.5 text-sm text-ink">"{h.excerpt}"</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-ink">Reflecting on your session</h2>
        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Strengths</span>
            <textarea
              value={strengths}
              onChange={(e) => {
                setStrengths(e.target.value)
                setSaved(false)
              }}
              disabled={locked}
              rows={3}
              className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-70"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Growth areas</span>
            <textarea
              value={growthAreas}
              onChange={(e) => {
                setGrowthAreas(e.target.value)
                setSaved(false)
              }}
              disabled={locked}
              rows={3}
              className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-70"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Next step</span>
            <textarea
              value={nextStep}
              onChange={(e) => {
                setNextStep(e.target.value)
                setSaved(false)
              }}
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
              onChange={(e) => {
                setFollowUpDate(e.target.value)
                setSaved(false)
              }}
              disabled={locked}
              className="w-fit rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-70"
            />
          </label>
        </div>

        {!locked && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSaveNotes}
              disabled={saving}
              className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save notes'}
            </button>
            {saved && <span className="text-sm text-brand-600">Saved.</span>}
            <button
              type="button"
              onClick={handleLock}
              disabled={locking}
              className="ml-auto rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-60"
            >
              {locking ? 'Locking...' : 'Lock report'}
            </button>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-warm-500">{error}</p>}
      </div>

      <div className="rounded-xl border border-dashed border-border p-4 text-xs text-ink-soft">
        This report reflects what could be heard in the recording — talk patterns, questioning, and classroom
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
}: {
  label: string
  value: string
  sub?: string
  muted?: boolean
  reason?: string
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
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
          {session.classSubject || 'Untitled class'} {session.period ? `· ${session.period}` : ''}
        </p>
        <p className="mt-0.5 text-xs text-ink-soft">
          {new Date(session.sessionDate).toLocaleDateString()} ·{' '}
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

function TrendsView({ sessions, loading }: { sessions: AudioSession[]; loading: boolean }) {
  if (loading) {
    return <p className="text-center text-sm text-ink-soft">Loading...</p>
  }

  const analyzed = sessions
    .filter((s) => s.teacherTalkPct != null && s.durationSec != null)
    .slice()
    .sort((a, b) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime())
    .slice(-MAX_TREND_SESSIONS)

  if (analyzed.length < 2) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
        Trends need at least 2 analyzed sessions to show a pattern. One session — especially a short one — is
        too noisy on its own to read much into.
      </div>
    )
  }

  const labels = analyzed.map((s) =>
    new Date(s.sessionDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  )

  const teacherTalk = analyzed.map((s) => s.teacherTalkPct)
  const studentTalk = analyzed.map((s) => s.studentTalkPct)

  const higherOrder = analyzed.map((s) => ((s.questionCount ?? 0) < MIN_N_FOR_PERCENT ? null : s.higherOrderPct))

  const cfuFrequency = analyzed.map((s) => {
    const duration = s.durationSec ?? 0
    if (duration < MIN_DURATION_FOR_CFU_DETECTION_SEC) return null
    return Math.round(((s.cfuCount ?? 0) / (duration / 600)) * 10) / 10
  })
  const excludedCfuCount = cfuFrequency.filter((v) => v == null).length
  const cfuMax = Math.max(4, ...cfuFrequency.filter((v): v is number => v != null)) * 1.2

  const insight = buildTrendInsight(analyzed)

  return (
    <div className="flex flex-col gap-6">
      {insight && (
        <div className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4">
          <ArrowUpIcon className="h-5 w-5 shrink-0 text-brand-600" />
          <p className="text-sm text-ink">{insight}</p>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface p-6">
        <TrendChart
          title="Talk Ratio"
          unit="%"
          maxValue={100}
          labels={labels}
          series={[
            { label: 'Teacher', colorVar: '--color-brand-500', values: teacherTalk },
            { label: 'Student', colorVar: '--color-warm-400', values: studentTalk },
          ]}
        />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <TrendChart
          title="Question Quality"
          unit="%"
          maxValue={100}
          labels={labels}
          series={[{ label: 'Higher-order questions', colorVar: '--color-brand-500', values: higherOrder }]}
          emptyMessage="Not enough questions asked yet in any single session to trend this reliably."
        />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <TrendChart
          title="Checks for Understanding"
          unit="/10min"
          maxValue={cfuMax}
          labels={labels}
          series={[{ label: 'CFUs per 10 min', colorVar: '--color-brand-500', values: cfuFrequency }]}
        />
        {excludedCfuCount > 0 && (
          <p className="mt-2 text-xs text-ink-soft">
            {excludedCfuCount} session{excludedCfuCount === 1 ? '' : 's'} under{' '}
            {Math.round(MIN_DURATION_FOR_CFU_DETECTION_SEC / 60)} min excluded from this line — too short to
            reliably detect CFUs.
          </p>
        )}
      </div>

      <p className="text-xs text-ink-soft">
        Showing your last {analyzed.length} analyzed session{analyzed.length === 1 ? '' : 's'}. Short sessions
        add noise — read the overall direction, not any single point.
      </p>
    </div>
  )
}

function buildTrendInsight(sessions: AudioSession[]): string | null {
  if (sessions.length < 3) return null

  const withTalk = sessions.filter((s) => s.teacherTalkPct != null)
  if (withTalk.length >= 3) {
    const delta = withTalk[withTalk.length - 1].teacherTalkPct! - withTalk[0].teacherTalkPct!
    if (delta <= -8) {
      return `Teacher talk time is down ${Math.abs(Math.round(delta))} points since your first tracked session — more room for student voice.`
    }
  }

  const withQuestions = sessions.filter(
    (s) => (s.questionCount ?? 0) >= MIN_N_FOR_PERCENT && s.higherOrderPct != null,
  )
  if (withQuestions.length >= 3) {
    const delta = withQuestions[withQuestions.length - 1].higherOrderPct! - withQuestions[0].higherOrderPct!
    if (delta >= 10) {
      return `Higher-order questions are up ${Math.round(delta)} points since your first tracked session — nice trend.`
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
            {series.map((s) => {
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
                    c.y == null ? null : <circle key={i} cx={c.x} cy={c.y} r={3} fill={`var(${s.colorVar})`} />,
                  )}
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
