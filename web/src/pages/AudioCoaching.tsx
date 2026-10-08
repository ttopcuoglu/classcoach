import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowUpIcon, ChatBubbleIcon, ChecklistIcon, HeartIcon, KebabIcon, LockIcon, MicIcon, PlayIcon } from '../components/icons'
import { DashedLinePoint, HatchedBar, HatchedSwatch, NoDataLabel } from '../components/unavailableChart'
import { UpgradeMessage } from '../components/UpgradeMessage'
import { ProgressRing, ThinkingIndicator, WorkingRing } from '../components/ProgressRing'
import { NumberedCard } from '../components/AnswerSection'
import { ACCENT_CYCLE, ACCENTS, StatTile, type Accent } from '../components/report'
import { useVoiceTurn } from '../hooks/useVoiceTurn'
import { useSimulatedProgress } from '../hooks/useSimulatedProgress'
import { UPLOAD_STAGE, transcribeEstimateSec, transcribeHint, transcribeStage } from '../lib/transcribeStages'
import { HATCH_STYLE } from '../lib/chartPatterns'
import { FOCUS_METRIC_GROUPS, FOCUS_METRIC_LABELS } from '../lib/focusMetrics'
import { createPlaybackQueue, primeAudioElement, splitIntoSentences, type PlaybackQueue } from '../lib/voicePlayback'
import {
  createAudioSession,
  deleteAudioSession,
  generateClassSummary,
  generateRubricLens,
  getAudioSession,
  getAudioSessions,
  getProfile,
  sendReflectMessage,
  summarizeReflectConversation,
  tagSpeakers,
  startTranscription,
  getSpeakerSamples,
  updateAudioSession,
  updateProfile,
  generateContentNotes,
  type AudioCfuLogEntry,
  type AudioContentNotes,
  type AudioDirectiveLogEntry,
  type AudioFeedbackLogEntry,
  type AudioHighlight,
  type AudioLessonContent,
  type AudioQuestionLogEntry,
  type AudioReflectMessage,
  type AudioRedirectionLogEntry,
  type AudioRubricLens,
  type AudioSession,
  type AudioSessionWithSegments,
  type AudioToneLogEntry,
  type ApiError,
  type FocusMetric,
  type ReflectChatErrorKind,
  type SpeakerSample,
  type TalkVoice,
  type TranscriptSegment,
} from '../lib/api'
import {
  buildEvidenceQualityLine,
  categoryCoverage,
  evidenceTier,
  EVIDENCE_TIER_LABELS,
  formatRatio,
  getCoverage,
  getCountMetric,
  getFollowUpMetric,
  feedbackMeasurable,
  getPresenceMetric,
  hasEnoughWaitTimeSamples,
  isConfidentState,
  isMissingState,
  judgeTalkBalance,
  MIN_DURATION_FOR_CFU_DETECTION_SEC,
  MIN_DURATION_FOR_TALK_BALANCE_CANDIDATE_SEC,
  MIN_CFU_FOR_STRENGTH,
  MIN_N_FOR_PERCENT,
  SHORT_SESSION_THRESHOLD_SEC,
  STUDENT_TALK_CAVEAT,
  waitTimeMetric as waitTimeMetricOf,
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
  // Home's "Your growth" card links here with #my-growth. Growth trends used
  // to live only inside an opened report's My Growth tab, so that card
  // landed on the recording page with no growth in sight.
  const location = useLocation()
  const growthLinked = location.hash === '#my-growth'
  const growthRef = useRef<HTMLDivElement>(null)
  const scrolledToGrowth = useRef(false)

  function refreshHistory() {
    getAudioSessions()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }

  // A row that says "Processing" has to stop saying it without being asked.
  // Only while something is actually running, so an idle list makes no
  // requests at all.
  const hasTranscribing = sessions.some((s) => s.status === 'transcribing')
  useEffect(() => {
    if (!hasTranscribing) return
    const poll = window.setInterval(() => {
      getAudioSessions().then(setSessions).catch(() => {})
    }, 5000)
    return () => window.clearInterval(poll)
  }, [hasTranscribing])

  useEffect(() => {
    refreshHistory()
    getProfile()
      .then((p) => {
        setFocusMetric(p.focusMetric)
        setTeacherName(p.name)
        setTalkVoice(p.talkVoice)
        setShowFreeCapLine(!p.plusAccess && p.organizationId == null)
      })
      .catch(() => {})
  }, [])

  // Wait for the session list so the section is at its final height before
  // scrolling — otherwise it would jump once the trends render.
  useEffect(() => {
    // Once only — closing a report later shouldn't yank the page back here.
    if (growthLinked && !historyLoading && !active && !scrolledToGrowth.current) {
      scrolledToGrowth.current = true
      growthRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [growthLinked, historyLoading, active])

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

  /// `message` is for the one case where leaving IS the news: a session that
  /// stopped existing while it was being watched. Everything else exits
  /// silently and clears whatever was on screen.
  function handleExit(message?: string) {
    setActive(null)
    setSpeakers([])
    setError(message ?? null)
    refreshHistory()
  }

  async function handleOpenSession(id: string) {
    // isRecordingPhase sends "setup" to the record panel, and a session whose
    // upload has not landed yet is still "setup" — so opening one armed Record
    // with a session that already had a lesson in it. On iOS that truncated the
    // audio outright; here the second upload lands on the same session and
    // replaces the first lesson's transcript. Either way a lesson is lost.
    const row = sessions.find((s) => s.id === id)
    if (row?.status === 'transcribing') {
      setError('That lesson is still being transcribed. It will open as soon as it is ready.')
      return
    }
    if (row && sessionHasRecording(row) && ['setup', 'recording', 'paused'].includes(row.status)) {
      setError('That lesson is still being sent. It will open once the server has it.')
      return
    }
    setError(null)
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
        onSpeakers={setSpeakers}
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
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta-600">Wivoza · Coaching</p>
          <h1 className="font-heading text-3xl font-extrabold text-forest md:text-4xl">
            Lesson Debrief<span className="text-gold">.</span>
          </h1>
          <p className="text-ink-soft">
            Record a class period, get a transcript, and see a coaching report. Audio is never saved — only
            the text.
          </p>
          <Link
            to="/guide/lesson-debrief"
            className="mt-1 w-fit text-xs font-medium text-ink-soft underline decoration-hairline underline-offset-4 hover:text-terracotta"
          >
            New to this? Read the teacher's guide
          </Link>
        </div>
      )}

      {error && <p className="text-sm text-terracotta-600">{error}</p>}

      {!active && showFreeCapLine && (
        <p className="text-sm text-ink-soft">
          {freeRecordingsUsedThisMonth} of 3 free Lesson Debrief recordings used this month.
        </p>
      )}

      <RecordingPanel
        session={active}
        teacherName={teacherName}
        onUpdate={setActive}
        onExit={handleExit}
      />

      {!active && (
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Past sessions</h2>
          {historyLoading ? (
            <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
          ) : sessions.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-hairline bg-cream-card/60 p-6 text-center text-sm text-ink-soft">
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

      {/* Shown once there's a session to track, or whenever Home's "Your
          growth" card sent the teacher here — then even with no sessions yet
          it explains that trends start after a couple of recordings. */}
      {!active && !historyLoading && (sessions.length > 0 || growthLinked) && (
        <div id="my-growth" ref={growthRef} className="scroll-mt-6">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">My Growth</h2>
          <MyGrowthTab sessions={sessions} focusMetric={focusMetric} onFocusMetricChange={handleFocusMetricChange} />
        </div>
      )}
    </div>
  )
}

function SessionFlow({
  session,
  speakers,
  onUpdate,
  onSpeakers,
  onExit,
  sessions,
  focusMetric,
  onFocusMetricChange,
  talkVoice,
}: {
  session: AudioSessionWithSegments
  speakers: SpeakerSample[]
  onUpdate: (s: AudioSessionWithSegments) => void
  onSpeakers: (s: SpeakerSample[]) => void
  onExit: (message?: string) => void
  sessions: AudioSession[]
  focusMetric: FocusMetric | null
  onFocusMetricChange: (metric: FocusMetric | null) => void
  talkVoice: TalkVoice | null
}) {
  if (session.status === 'transcribing') {
    return <TranscribingPanel session={session} onUpdate={onUpdate} onSpeakers={onSpeakers} onExit={onExit} />
  }
  if (session.status === 'failed') {
    return (
      <div className="rounded-3xl bg-forest p-8 text-center">
        <p className="text-sm text-cream">
          {session.failureReason ?? 'Transcription failed. Please try again.'}
        </p>
        <button
          type="button"
          onClick={() => onExit()}
          className="mt-4 rounded-full bg-cream px-6 py-2.5 text-sm font-semibold text-forest"
        >
          Back to sessions
        </button>
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

/// Whether this session already holds a recording.
///
/// A "setup" row that does is one whose upload has not landed yet — the server
/// only learns a recording exists when it arrives — not an empty session
/// waiting to be recorded into. The two are indistinguishable by status alone,
/// which is what made opening one destructive.
function sessionHasRecording(session: { durationSec: number | null; transcribeStartedAt?: string | null }): boolean {
  return session.transcribeStartedAt != null || session.durationSec != null
}

function RecordingPanel({
  session,
  teacherName = null,
  onUpdate,
  onExit,
}: {
  session: AudioSessionWithSegments | null
  teacherName?: string | null
  onUpdate: (s: AudioSessionWithSegments) => void
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
  // A laptop/Chromebook's own idle-sleep or screensaver can suspend the tab
  // (and the mic stream with it) mid-recording — the Wake Lock API is the
  // one thing a web page can do to prevent that, mirroring the iOS app's
  // UIBackgroundModes=audio fix for the same underlying problem. Not
  // supported everywhere, so every call is best-effort and silently a
  // no-op when unavailable or denied — recording must never depend on it.
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
    } catch {
      // Denied, unsupported in this context, or the page isn't visible
      // right now — recording continues regardless, just without this
      // extra protection against the screen sleeping.
    }
  }

  async function releaseWakeLock() {
    try {
      await wakeLockRef.current?.release()
    } catch {
      // Already released (e.g. the tab was hidden) — nothing to do.
    }
    wakeLockRef.current = null
  }

  // The only window where leaving actually destroys a lesson.
  //
  // The transcribing screen is deliberately safe to close — that work outlives
  // the request that started it. Until the upload has landed, though, the
  // recording exists only as a MediaRecorder blob in this tab's memory. Web has
  // no RecordingStore to offer it back the way iOS does, so a reload at minute
  // 40 of a lesson loses all of it, silently and unrecoverably. Paused counts:
  // a paused recording is just as unsaved as a running one.
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused' && phase !== 'uploading') return
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      // Browsers show their own wording and ignore any custom string, but
      // returnValue still has to be set for the prompt to appear at all.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [phase])

  useEffect(() => {
    // A wake lock is released automatically whenever the document goes
    // hidden (switching tabs, minimizing) — re-acquire it once the teacher
    // comes back if a recording is still actively running, so a brief
    // tab-switch doesn't permanently lose the protection for the rest of
    // a long class period.
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && phase === 'recording' && !wakeLockRef.current) {
        requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [phase])

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      releaseWakeLock()
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
    // Upload only now — the transcription's own eight minutes moved to the
    // server. Bandwidth-bound and unknowable, so this is a rough 0.02x of the
    // recording's length: fast enough not to crawl, slow enough not to sit at
    // 92% for most of the transfer.
    const estimatedMs = Math.max(2000, uploadDurationRef.current * 20)
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
    // Only a session with no recording of its own is safe to reuse. The panel
    // can be handed one by the list, so "a session is set" was never the same
    // as "this session is empty" — recording into one that already held a
    // lesson sent a second upload to it and overwrote the first.
    if (!session || sessionHasRecording(session)) {
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
      requestWakeLock()
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
    releaseWakeLock()
  }

  function handleResume() {
    recorderRef.current?.resume()
    runStartRef.current = Date.now()
    intervalRef.current = window.setInterval(tick, 250)
    setPhase('recording')
    requestWakeLock()
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
    releaseWakeLock()

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
      await startTranscription(session.id, blob, finalElapsed)
      // Handed over. Deepgram's eight minutes happen server-side now, so the
      // teacher goes back to the list and the row reports it — they can shut
      // the laptop.
      onUpdate({
        ...session,
        status: 'transcribing',
        durationSec: Math.round(finalElapsed),
        transcribeStartedAt: new Date().toISOString(),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your recording. Please try again.')
      setPhase('idle')
    }
  }

  const minutes = Math.floor(elapsedSec / 60)
  const seconds = Math.floor(elapsedSec % 60)
  const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-3xl bg-forest p-6 text-cream sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Record a lesson</p>
        {session && (
          <div className="flex items-center justify-between">
            <div>
              <p className="mt-2 font-heading text-xl font-bold text-cream">
                {session.classSubject || teacherName || 'Recording'} {session.period ? `· ${session.period}` : ''}
              </p>
              <p className="text-xs text-cream/70">{formatSessionDateTime(session.sessionDate)}</p>
            </div>
            {phase === 'idle' && (
              <button type="button" onClick={() => onExit()} className="text-sm font-medium text-cream/70 hover:text-cream">
                Cancel
              </button>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2.5">
            {phase === 'recording' && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-terracotta opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-terracotta" />
              </span>
            )}
            {phase === 'paused' && <span className="h-2.5 w-2.5 rounded-full bg-gold" />}
            <span className="font-mono text-5xl font-semibold text-cream">{timeLabel}</span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cream/70">
            {phase === 'idle' && 'Ready to record'}
            {phase === 'recording' && 'Recording'}
            {phase === 'paused' && 'Paused'}
            {phase === 'uploading' && `${UPLOAD_STAGE}\u2026`}
          </p>

          <div className="flex items-center gap-4">
            {phase === 'idle' && (
              <button
                type="button"
                onClick={handleRecord}
                className="flex items-center gap-3 rounded-full bg-terracotta px-10 py-6 text-lg font-semibold text-cream shadow-lg transition-colors hover:bg-terracotta/90"
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
                  className="rounded-full border border-cream/40 px-8 py-5 text-base font-semibold text-cream transition-colors hover:border-cream hover:bg-cream/10"
                >
                  Pause
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  className="rounded-full bg-cream px-8 py-5 text-base font-semibold text-forest transition-opacity hover:opacity-90"
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
                  className="rounded-full bg-terracotta px-8 py-5 text-base font-semibold text-cream transition-colors hover:bg-terracotta/90"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  className="rounded-full bg-cream px-8 py-5 text-base font-semibold text-forest transition-opacity hover:opacity-90"
                >
                  Stop
                </button>
              </>
            )}
            {phase === 'uploading' && (
              <div className="text-gold">
                <ProgressRing
                  progress={uploadProgress}
                  size={88}
                  label={UPLOAD_STAGE}
                  hint="Once this finishes you can leave — the rest happens on our side."
                />
              </div>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-4 text-center text-sm text-peach-tint">
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

/// The screen between Stop and tagging, now that transcription outlives the
/// request that started it.
///
/// Nothing here is load-bearing: the work is running on the server whether or
/// not this component is mounted, so a teacher who closes the tab and comes
/// back to a "Processing" row loses nothing. That is the whole point of the
/// change — the percentage is company, not a leash.
function TranscribingPanel({
  session,
  onUpdate,
  onSpeakers,
  onExit,
}: {
  session: AudioSessionWithSegments
  onUpdate: (s: AudioSessionWithSegments) => void
  onSpeakers: (s: SpeakerSample[]) => void
  onExit: (message?: string) => void
}) {
  const progress = useTranscriptionProgress(session)

  useEffect(() => {
    let cancelled = false
    const poll = window.setInterval(async () => {
      try {
        const latest = await getAudioSession(session.id)
        if (cancelled || latest.status === 'transcribing') return
        if (latest.status === 'tagging') {
          const { speakers } = await getSpeakerSamples(session.id)
          if (cancelled) return
          onSpeakers(speakers)
        }
        onUpdate(latest)
      } catch (e) {
        // A session that stops existing mid-transcription is the server
        // throwing away a recording it found no speech in. That is the only
        // thing a 404 can mean here, and it is the teacher's one chance to be
        // told — there will be no row left to explain it afterwards.
        if (!cancelled && (e as ApiError).status === 404) {
          window.clearInterval(poll)
          onExit('No speech was detected in that recording, so nothing was saved. If you expected speech, check which microphone your browser is using.')
          return
        }
        // Any other failed poll changes nothing — the job is server-side, and
        // the next tick will pick the answer up.
      }
    }, 5000)
    return () => {
      cancelled = true
      window.clearInterval(poll)
    }
  }, [session.id, onSpeakers, onUpdate])

  return (
    <div className="rounded-3xl bg-forest p-8 text-center text-cream">
      <div className="flex justify-center text-gold">
        <ProgressRing
          progress={progress}
          size={88}
          label={transcribeStage(progress)}
          hint={transcribeHint(session.durationSec ?? 0)}
        />
      </div>
      <p className="mt-5 text-sm text-cream/80">
        You can close this page — your recording keeps processing, and it will be waiting for you here.
      </p>
      <button
        type="button"
        onClick={() => onExit()}
        className="mt-4 rounded-full bg-cream px-6 py-2.5 text-sm font-semibold text-forest transition-opacity hover:opacity-90"
      >
        Back to sessions
      </button>
    </div>
  )
}

/// How far along a server-side transcription is, from when it started and how
/// long the recording was. Same asymptotic curve and same 0.15x factor as the
/// upload ring, but anchored to a timestamp in the database rather than to
/// when this component mounted — so the number is the same on the phone that
/// recorded it and the laptop opened ten minutes later, and survives a reload.
function useTranscriptionProgress(session: AudioSession): number {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    function compute() {
      const startedAt = session.transcribeStartedAt ? Date.parse(session.transcribeStartedAt) : NaN
      if (!Number.isFinite(startedAt)) return 0
      const tau = transcribeEstimateSec(session.durationSec ?? 0) * 1000
      return 92 * (1 - Math.exp(-(Date.now() - startedAt) / tau))
    }
    setProgress(compute())
    const tick = window.setInterval(() => setProgress(compute()), 500)
    return () => window.clearInterval(tick)
  }, [session.transcribeStartedAt, session.durationSec])

  return progress
}

// "7 min 7 s · 113 turns" — the two numbers that make the teacher obvious.
function speakerActivity(speaker: SpeakerSample): string | null {
  if (speaker.totalSec == null || speaker.utteranceCount == null) return null
  const secs = Math.round(speaker.totalSec)
  const spoken = secs >= 60 ? `${Math.floor(secs / 60)} min ${secs % 60} s` : `${secs} s`
  return `${spoken} · ${speaker.utteranceCount} turn${speaker.utteranceCount === 1 ? '' : 's'}`
}

function TagSpeakersPanel({
  session,
  speakers,
  onUpdate,
  onExit,
  onCancel,
}: {
  session: AudioSessionWithSegments
  speakers: SpeakerSample[]
  onUpdate: (s: AudioSessionWithSegments) => void
  onExit: () => void
  /** Set when re-tagging an already-analyzed session, so there's a way back. */
  onCancel?: () => void
}) {
  // The server sorts by talk time, so the first card is the voice that spoke
  // most — nearly always the teacher. Preselecting it turns the common case
  // into a confirmation; a teacher who tagged the 35-second voice instead of
  // the 7-minute one got a report with their talk shares swapped.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(speakers[0] ? [speakers[0].rawSpeakerTag] : []),
  )
  const [tagging, setTagging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  function toggle(rawSpeakerTag: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(rawSpeakerTag)) next.delete(rawSpeakerTag)
      else next.add(rawSpeakerTag)
      return next
    })
  }

  async function handleAnalyze() {
    setTagging(true)
    setError(null)
    try {
      const updated = await tagSpeakers(session.id, Array.from(selected))
      onUpdate(updated)
    } catch {
      // The analysis carries on server-side after a client gives up waiting,
      // so ask what actually happened before blaming the tagging.
      try {
        const latest = await getAudioSession(session.id)
        if (latest.status === 'analyzed') {
          onUpdate(latest)
          return
        }
      } catch {
        // fall through to the honest error below
      }
      setError('Could not tag those speakers. Please try again.')
      setTagging(false)
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
    <div className="rounded-2xl border border-hairline bg-cream-card p-6">
      <h2 className="font-heading text-xl font-bold text-forest">Which voice is the teacher?</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Automatic diarization can tell voices apart, but it can't reliably tell who's the teacher — and it
        sometimes splits one teacher into two voices. The voice that spoke the most is picked for you, since
        that's usually the teacher. Change it if that's not you, and select every voice that is; everyone else
        will be grouped as Student.
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
              className="rounded-lg border border-terracotta px-4 py-2 text-sm font-semibold text-terracotta-600 transition-colors hover:bg-peach-tint disabled:opacity-60"
            >
              {deleting ? 'Deleting...' : 'Delete this session and try recording again'}
            </button>
          </div>
        ) : (
          speakers.map((s) => {
            const isTeacher = selected.has(s.rawSpeakerTag)
            return (
              <div
                key={s.rawSpeakerTag}
                className={`flex items-center justify-between gap-4 rounded-xl border-2 p-4 transition-colors ${
                  isTeacher ? 'border-terracotta bg-peach-tint' : 'border-transparent bg-mint-tint/50'
                }`}
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    {s.rawSpeakerTag}
                    {speakerActivity(s) ? <span className="normal-case tracking-normal"> · {speakerActivity(s)}</span> : null}
                  </p>
                  <p className="mt-1 text-sm text-ink">"{s.sample}"</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(s.rawSpeakerTag)}
                  disabled={tagging}
                  aria-pressed={isTeacher}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
                    isTeacher
                      ? 'border-terracotta bg-terracotta text-cream hover:bg-terracotta/90'
                      : 'border-terracotta text-terracotta-600 hover:bg-peach-tint'
                  }`}
                >
                  {isTeacher ? '✓ Teacher' : 'This is the Teacher'}
                </button>
              </div>
            )
          })
        )}
      </div>
      {speakers.length > 0 && (
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={selected.size === 0 || tagging}
          className="mt-4 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-forest/90 disabled:bg-hairline disabled:text-ink-soft"
        >
          {tagging ? 'Analyzing...' : 'Analyze session'}
        </button>
      )}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={tagging}
          className="ml-4 text-sm font-medium text-ink-soft hover:text-ink disabled:opacity-60"
        >
          Cancel
        </button>
      )}
      <WorkingRing active={tagging} estimatedMs={4000} label="Analyzing your session" className="mt-4 text-forest" />
      {error && <p className="mt-4 text-sm text-terracotta-600">{error}</p>}
    </div>
  )
}

// What to call a recording in a list. "Untitled lesson" was accurate and
// useless — every card said it — while analysis already works out what the
// lesson covered, in lessonContent.summary. One sentence only: this is a card
// title, and the report shows the summary in full anyway.
function sessionTitle(session: { lessonContent?: AudioLessonContent | null; classSubject?: string | null; period?: string | null }): string {
  const summary = session.lessonContent?.summary?.trim()
  if (summary) {
    // A sentence end counts only when a space or the end follows, and not in
    // the first few words, or "Mr." and "e.g." end the title.
    const match = /^.{20,}?[.!?](?=\s|$)/.exec(summary)
    let out = match ? match[0] : summary
    if (out.length > 90) {
      const clipped = out.slice(0, 90)
      out = clipped.slice(0, clipped.lastIndexOf(' ') > 0 ? clipped.lastIndexOf(' ') : 90) + '…'
    }
    out = out.replace(/[\s.]+$/, '')
    if (out) return out
  }
  // Recordings analyzed before the lesson summary shipped (2026-09-28) have
  // none, but most detected a subject — "Science" beats "Untitled lesson" for
  // telling two old recordings apart.
  return session.classSubject || session.lessonContent?.subject || session.period || 'Untitled lesson'
}

type ReportTab = 'summary' | 'insights' | 'reflect' | 'growth'
// Four sections, organised by how much a microphone can actually hear.
// Everything the teacher says is captured well; everything that depends on
// students answering out loud is not. Questioning and checking were two
// sections that failed together whenever the room was quiet, leaving a
// teacher reading two apologies for one cause — they are one section with two
// halves now, and Rubric Lens is a lens over the whole report rather than a
// section competing with them.
type InsightsSection = 'talk' | 'questions' | 'content' | 'routines'
type ReflectPath = 'full_report' | 'specific_moment' | 'how_it_felt' | 'ask_question'

const REFLECT_PATH_CARDS: {
  key: ReflectPath
  icon: React.ReactNode
  iconBg: string
  title: string
  description: string
  recommended?: boolean
}[] = [
  {
    key: 'full_report',
    icon: <ChecklistIcon className="h-5 w-5 text-forest" />,
    iconBg: 'bg-mint-tint/60',
    title: "Talk through today's highlights",
    description: 'A strength to keep, and a moment worth revisiting',
    recommended: true,
  },
  {
    key: 'specific_moment',
    icon: <PlayIcon className="h-5 w-5 text-terracotta" />,
    iconBg: 'bg-peach-tint',
    title: 'Explore a specific moment',
    description: 'Discuss a timestamp or classroom interaction',
  },
  {
    key: 'how_it_felt',
    icon: <HeartIcon className="h-5 w-5 text-gold" />,
    iconBg: 'bg-gold-tint',
    title: 'Reflect on how the lesson felt',
    description: 'Begin with your own experience',
  },
  {
    key: 'ask_question',
    icon: <ChatBubbleIcon className="h-5 w-5 text-forest" />,
    iconBg: 'bg-mint-tint',
    title: 'Ask the coach a question',
    description: "Start with what's on your mind",
  },
]

const REPORT_TABS: { key: ReportTab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'insights', label: 'Insights' },
  { key: 'reflect', label: 'Reflect' },
  { key: 'growth', label: 'My Growth' },
]

const INSIGHTS_SECTIONS: { key: InsightsSection; label: string }[] = [
  { key: 'talk', label: 'Talk & Participation' },
  { key: 'questions', label: 'Questioning & Checking' },
  { key: 'content', label: 'Clarity & Content' },
  { key: 'routines', label: 'Climate & Routines' },
]

// The printed report's numbers, one-line descriptions and colours for these
// four sections (see AudioCoachingExport), so the screen and the paper look
// like one report and a teacher holding the printout can find "section 3" here.
//
// One honest gap: the printout skips Clarity & Content when a lesson produced
// no content quotes, so on those lessons its Climate & Routines is numbered 3
// while this screen, which always lists all four, still says 4.
const INSIGHTS_SECTION_META: Record<InsightsSection, { n: number; blurb: string; accent: Accent }> = {
  talk: { n: 1, blurb: 'Who was heard, and for how long.', accent: ACCENTS.terracotta },
  questions: { n: 2, blurb: 'What you asked, how you checked, and how you responded.', accent: ACCENTS.gold },
  content: { n: 3, blurb: 'What the lesson said it was about, in its own words.', accent: ACCENTS.forest },
  routines: { n: 4, blurb: 'Counts, not scores. There is no such thing as a correct number here.', accent: ACCENTS.terracotta },
}

// Lets the stat groups inside a section tint themselves with that section's
// colour without every Insights tab having to pass it down by hand.
const SectionAccentContext = createContext<Accent>(ACCENTS.mint)

function SubsectionHeading({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="mb-4 border-l-4 border-gold pl-3">
      <h3 className="font-heading text-lg font-bold text-forest">{title}</h3>
      <p className="text-sm text-ink-soft">{blurb}</p>
    </div>
  )
}

function InsightsSectionHeader({ section }: { section: InsightsSection }) {
  const meta = INSIGHTS_SECTION_META[section]
  const label = INSIGHTS_SECTIONS.find((s) => s.key === section)?.label ?? ''
  return (
    <div className="mb-6 flex items-center gap-4">
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${meta.accent.band} font-heading text-xl font-bold text-cream`}
      >
        {meta.n}
      </span>
      <div>
        <h2 className="font-heading text-2xl font-extrabold leading-tight text-forest">{label}</h2>
        <p className="mt-0.5 text-sm text-ink-soft">{meta.blurb}</p>
      </div>
    </div>
  )
}

// Same bridge the printed report uses: an unmeasurable value shows a dash with
// its reason, never a zero.
function SummaryStat({ label, metric, unit, accent }: { label: string; metric: ConfidentMetric; unit?: string; accent: Accent }) {
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

function insightsNavButtonClass(active: boolean) {
  return `rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
    active ? 'bg-cream-card font-semibold text-forest shadow-sm' : 'text-ink-soft hover:bg-cream-card/60 hover:text-ink'
  }`
}

function InsightsNav({ section, onSelect }: { section: InsightsSection; onSelect: (s: InsightsSection) => void }) {
  return (
    <nav className="flex shrink-0 flex-col gap-0.5 lg:w-52">
      {INSIGHTS_SECTIONS.map(({ key, label }) => (
        <button key={key} type="button" onClick={() => onSelect(key)} className={insightsNavButtonClass(section === key)}>
          <span className="flex items-center gap-2.5">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${INSIGHTS_SECTION_META[key].accent.band} text-xs font-bold text-cream`}
            >
              {INSIGHTS_SECTION_META[key].n}
            </span>
            {label}
          </span>
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
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-terracotta/40 ${
            tab === key ? 'bg-forest text-cream' : 'text-ink-soft hover:text-ink'
          }`}
        >
          {label === 'My Growth' ? (
            <>
              <span className="hidden sm:inline">My Growth</span>
              <span className="sm:hidden">Growth</span>
            </>
          ) : (
            label
          )}
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
      'None of the common spoken check-for-understanding phrases (like "thumbs up" or "turn and talk") were heard this session. Only those spoken phrases are detected, so a silent, written, or differently worded check would not show up — don\'t treat this as proof no check happened.',
    )
  }
  if (redirectionMetric.state === 'confirmed_none') {
    context.push(
      'None of the common spoken redirection phrases (like "eyes on me") were heard this session. Nonverbal or differently worded redirection would not show up.',
    )
  }
  if (directiveMetric.state === 'confirmed_none') {
    context.push(
      'None of the common task-instruction phrases (like "open your" or "turn to page") were heard this session. Directions phrased differently would not show up.',
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
): { label: string; focus: string; timestampSec: number | null }[] {
  const prompts: { label: string; focus: string; timestampSec: number | null }[] = []
  const byLabel = (label: string) => (highlights ?? []).find((h) => h.label === label)

  const followUp = byLabel('Follow-up / probing question')
  if (followUp) {
    prompts.push({
      label: 'Talk about a question you followed up on',
      focus: `the moment at ${formatTime(followUp.timestampSec)} where you asked a follow-up question: "${followUp.excerpt}"`,
      timestampSec: followUp.timestampSec,
    })
  }

  const cluster = byLabel('Redirection cluster')
  if (cluster) {
    prompts.push({
      label: 'Talk about that stretch of redirections',
      focus: `the cluster of redirections around ${formatTime(cluster.timestampSec)}`,
      timestampSec: cluster.timestampSec,
    })
  }

  const monologue = byLabel('Longest uninterrupted teacher monologue')
  if (monologue) {
    prompts.push({
      label: 'Talk about that longer stretch of talking',
      focus: `the longest stretch of you talking, around ${formatTime(monologue.timestampSec)}`,
      timestampSec: monologue.timestampSec,
    })
  }

  if (prompts.length < 3 && cfuMetric.state === 'confirmed_none') {
    prompts.push({
      label: 'Talk about checking for understanding',
      focus: 'how they checked for understanding today, since none of the common spoken check phrases came through in the recording',
      timestampSec: null,
    })
  }
  if (prompts.length < 3 && redirectionMetric.state === 'confirmed_none') {
    prompts.push({
      label: 'Talk about how the room felt today',
      focus: 'how the classroom climate felt today, since none of the common redirection phrases came through',
      timestampSec: null,
    })
  }

  return prompts.slice(0, 3)
}

// Real transcript text around a moment's timestamp — the "show me the
// evidence" reveal. A plain data lookup, no chat turn/network call: the
// transcript is already loaded with the session.
function buildTranscriptWindow(
  segments: TranscriptSegment[],
  timestampSec: number,
  windowSec = 15,
): TranscriptSegment[] {
  return segments
    .filter((s) => s.startSec >= timestampSec - windowSec && s.startSec <= timestampSec + windowSec)
    .sort((a, b) => a.startSec - b.startSec)
}

// A feedback moment is specifically the ONE teacher turn right after a
// student turn — not a window of surrounding talk, which in a
// densely-packed transcript can sweep in unrelated lines (the opening
// statement, a later follow-up question) that look like more "moments"
// than were actually counted. Returns exactly the pair that was counted,
// or [] if the segment isn't found.
function buildFeedbackExchange(segments: TranscriptSegment[], timestampSec: number): TranscriptSegment[] {
  const ordered = [...segments].sort((a, b) => a.startSec - b.startSec)
  const idx = ordered.findIndex((s) => s.startSec === timestampSec)
  if (idx <= 0) return []
  return [ordered[idx - 1], ordered[idx]]
}

// A single phrase-matched teacher turn — a check for understanding, a
// clear direction, a positive/corrective tone moment, a redirection — is
// its own segment, full stop; anything before it just happens to be
// nearby in time and is often a completely unrelated exchange (see the
// "What is one half plus one half?" / "One whole!" pair that a plain +/-15s
// window pulled in ahead of an unrelated "Turn and talk..." CFU prompt).
// The one thing worth keeping is a student's response immediately after,
// since that's a genuine reaction to the moment, not surrounding noise.
function buildSingleTurnExchange(segments: TranscriptSegment[], timestampSec: number): TranscriptSegment[] {
  const ordered = [...segments].sort((a, b) => a.startSec - b.startSec)
  const idx = ordered.findIndex((s) => s.startSec === timestampSec)
  if (idx === -1) return []
  const exchange = [ordered[idx]]
  if (idx + 1 < ordered.length && ordered[idx + 1].speakerLabel === 'Student') {
    exchange.push(ordered[idx + 1])
  }
  return exchange
}

// A "longest uninterrupted teacher monologue" highlight's own timestamp is
// only the START of that stretch — a symmetric +/-15s window centered on
// it mostly misses a genuinely long monologue (e.g. a real 40s stretch)
// while still pulling in whatever unrelated line happens to sit just
// before it starts. Return the actual span instead: every segment from
// startSec up to (but not including) startSec + durationSec, which by
// construction is exactly the run of consecutive teacher turns that made
// up the monologue (a student turn would have already ended the streak).
function buildMonologueExchange(
  segments: TranscriptSegment[],
  startSec: number,
  durationSec: number,
): TranscriptSegment[] {
  return segments
    .filter((s) => s.startSec >= startSec && s.startSec < startSec + durationSec)
    .sort((a, b) => a.startSec - b.startSec)
}

// A "follow-up / probing question" highlight's timestamp is only the
// follow-up itself — the exchange that actually makes it a follow-up (the
// root question and its first answer) sits before it, at a distance a
// generic time window can't reliably bound. questionLog already links a
// follow-up back to its root question by timestamp, so reconstruct the
// real 4-part exchange (root question, its answer, the follow-up, its
// answer) from that instead of guessing from proximity.
function buildFollowUpExchange(
  segments: TranscriptSegment[],
  questionLog: AudioQuestionLogEntry[] | null,
  followUpTimestampSec: number,
): TranscriptSegment[] {
  const root = (questionLog ?? []).find((q) => q.followUps.some((f) => f.timestampSec === followUpTimestampSec))
  if (!root) return []
  const ordered = [...segments].sort((a, b) => a.startSec - b.startSec)
  const pickWithAnswer = (ts: number): TranscriptSegment[] => {
    const idx = ordered.findIndex((s) => s.startSec === ts)
    if (idx === -1) return []
    const pair = [ordered[idx]]
    if (idx + 1 < ordered.length && ordered[idx + 1].speakerLabel === 'Student') pair.push(ordered[idx + 1])
    return pair
  }
  return [...pickWithAnswer(root.timestampSec), ...pickWithAnswer(followUpTimestampSec)]
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
    case 'teacher-leaning':
      return `Teacher talk was higher than student talk today (you at ${judgment.teacherPct}%, students at ${judgment.studentPct}%) — a good opportunity to build in longer stretches of student thinking and discussion.`
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
    sentence += ' No separately identifiable student voice was captured this session.'
  }
  return sentence ? `${sentence} ${STUDENT_TALK_CAVEAT}` : sentence
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
    sentence = `A good chunk of today's questions pushed for real thinking (${higherOrderRatio.display} higher-order) — that's the harder kind of question to ask on the fly.`
  } else {
    sentence = "Most of today's questions were quick recall checks — a natural spot to slip in one 'why' or 'how' next time."
  }
  if (followUpMetric.state === 'measured') {
    sentence += ` You followed up on a question ${followUpMetric.display} time${followUpMetric.display === '1' ? '' : 's'} — that's a habit worth keeping.`
  } else if (followUpMetric.state === 'confirmed_none') {
    sentence += ' No follow-up questions were detected after a student answer today — a quick "say more about that" can go a long way.'
  }
  if (waitTimeMetric.state === 'measured' && session.avgWaitTimeSec != null && hasEnoughWaitTimeSamples(session.metricsDetail)) {
    sentence +=
      session.avgWaitTimeSec >= 3
        ? ` Your average wait time was ${session.avgWaitTimeSec.toFixed(1)}s — that's real thinking room.`
        : ` Your average wait time was ${session.avgWaitTimeSec.toFixed(1)}s — waiting a beat longer can bring more students into a response.`
  }
  return sentence
}

function buildCfuInsight(
  cfuMetric: { state: string; display: string },
  feedbackRatio: ConfidentMetric,
  specificFeedbackCount: number | null,
  feedbackTotal: number | null,
): string | null {
  const parts: string[] = []
  if (
    feedbackRatio.state === 'measured' &&
    specificFeedbackCount != null &&
    feedbackTotal != null &&
    feedbackTotal > 0
  ) {
    parts.push(
      specificFeedbackCount / feedbackTotal >= 0.5
        ? `Your feedback was consistently specific, with ${specificFeedbackCount} of ${feedbackTotal} moments connected to something identifiable in a student's response or work.`
        : `Only ${specificFeedbackCount} of ${feedbackTotal} feedback moments connected to something identifiable in a student's response or work.`,
    )
  }
  if (cfuMetric.state === 'measured') {
    const count = cfuMetric.display
    parts.push(
      `${count} verbal check${count === '1' ? '' : 's'} for understanding ${count === '1' ? 'was' : 'were'} also detected.`,
    )
  } else if (cfuMetric.state === 'confirmed_none') {
    parts.push('None of the common spoken check-for-understanding phrases came through this session.')
  }
  return parts.length > 0 ? parts.join(' ') : null
}

function buildRoutinesInsight(
  directiveMetric: ConfidentMetric,
  hasRepeatedInstructionHighlight: boolean,
  transitionMetric: ConfidentMetric,
): string | null {
  const counted: string[] = []
  if (transitionMetric.state === 'measured') {
    counted.push(`${transitionMetric.display} transition cue${transitionMetric.display === '1' ? '' : 's'}`)
  }
  if (directiveMetric.state === 'measured') {
    counted.push(`${directiveMetric.display} clear direction moment${directiveMetric.display === '1' ? '' : 's'}`)
  }
  const parts: string[] = []
  if (counted.length > 0) {
    parts.push(`${counted.join(' and ')} ${counted.length === 1 && counted[0].startsWith('1 ') ? 'was' : 'were'} detected.`)
  } else if (transitionMetric.state === 'confirmed_none' && directiveMetric.state === 'confirmed_none') {
    parts.push('None of the common transition or task-instruction phrases came through this session — directions phrased differently wouldn\'t show up here.')
  }
  if (directiveMetric.state === 'measured') {
    parts.push(
      hasRepeatedInstructionHighlight
        ? 'One direction was repeated within a short window — worth checking it landed the first time.'
        : 'No repeated directions were clearly identified in the transcript.',
    )
  }
  return parts.length > 0 ? parts.join(' ') : null
}

function buildClimateInsight(
  redirectionMetric: ConfidentMetric,
  positiveCount: number | null,
  correctiveCount: number | null,
  nameMentionMetric: ConfidentMetric,
  uniqueNameCount: number | null,
): string | null {
  const parts: string[] = []
  if (redirectionMetric.state === 'confirmed_none') {
    parts.push('None of the common redirection phrases came through this session.')
  } else if (redirectionMetric.state === 'measured') {
    parts.push(
      `${redirectionMetric.display} redirection moment${redirectionMetric.display === '1' ? ' was' : 's were'} detected.`,
    )
  }
  if (positiveCount != null && correctiveCount != null) {
    const toneTotal = positiveCount + correctiveCount
    if (toneTotal >= MIN_N_FOR_PERCENT) {
      parts.push(
        `${positiveCount} of ${toneTotal} clearly classified classroom-language moment${toneTotal === 1 ? ' was' : 's were'} positive.`,
      )
    } else if (toneTotal > 0) {
      parts.push(
        `${positiveCount} of ${toneTotal} clearly classified classroom-language moments ${positiveCount === 1 ? 'was' : 'were'} positive — too few to say whether positive or corrective language dominated overall.`,
      )
    }
  }
  if (nameMentionMetric.state === 'measured' && uniqueNameCount != null) {
    parts.push(`Student names were used ${nameMentionMetric.display} times across ${uniqueNameCount} distinct names.`)
  } else if (nameMentionMetric.state === 'confirmed_none') {
    parts.push('No student names came through in the transcript this session.')
  }
  return parts.length > 0 ? parts.join(' ') : null
}

// Content & Explanations has no coach-voice sentence today — stitches
// together whichever of stated-objective / a real-world connection /
// defined vocabulary were actually detected into one warm sentence. Null
// when lessonContent itself is null (session predates this field, or the
// start of the lesson wasn't captured) — never speaks from nothing, same
// discipline as every other builder in this file.
// A written narrative, split for display. Any newline starts a new paragraph,
// not only a blank line: a summary whose paragraphs were separated by single
// newlines used to render as one unbroken block of text, because that is what
// a <p> does with a bare newline.
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function CoachNote({ text }: { text: string | null }) {
  if (!text) return null
  const paragraphs = splitParagraphs(text)
  return (
    <div className="flex items-start gap-3 rounded-xl border border-mint-tint bg-mint-tint/60 p-4">
      <ChatBubbleIcon className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
      <div className="flex flex-col gap-2">
        {paragraphs.map((para, i) => (
          <p key={i} className="text-sm text-ink">
            {para}
          </p>
        ))}
      </div>
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

// One generic, always-safe coaching nudge per focus metric — deliberately
// static (not derived from this session's own data), so it's never wrong
// to show regardless of how the session actually went.
const FOCUS_METRIC_TRY_NEXT: Record<FocusMetric, string> = {
  talkRatio: 'Look for one moment to hand the floor to students — even a 30-second turn-and-talk shifts the balance.',
  higherOrderPct: "Turn one factual question into a 'why' or 'how' question.",
  avgWaitTime: 'After you ask a question, count silently to five before calling on anyone.',
  cfuCount: 'Build in one quick check for understanding — a thumbs-up, a whiteboard hold-up, a quick poll.',
  followUpQuestionCount: "When a student answers, try one follow-up: \"Say more about that\" or \"What makes you think so?\"",
  redirectionCount: 'If you do need to redirect, a brief 1:1 aside can land more privately than a whole-class call-out.',
  toneRatio: 'After a correction, look for one genuine positive to name in the same stretch.',
  directiveCount: 'Pair a spoken direction with a visual or written cue for students who need a second channel.',
  nameMentionCount: "Using a student's name when you call on them makes the invitation feel personal.",
  feedbackSpecificity: 'After a student responds, name what was effective and offer one next step.',
}

type FocusSnapshot = {
  label: string
  tier: ReturnType<typeof evidenceTier>
  statusLine: string | null
  capturedLine: string
  // The bare formatted value ("42.6%", "2.8s"), with no label prefix, for
  // a big-stat visual treatment — null when there's nothing confident to
  // show a number for (talk ratio uses its own dedicated bar instead of
  // this, see SummaryTab).
  valueText: string | null
  tryNextTip: string
}

// Only talkRatio and avgWaitTime are backed by getPresenceMetric, whose
// .display is a bare, unitless number ("42.6", not "42.6%") — every other
// focus metric is backed by formatRatio (already embeds its own "%") or
// getCountMetric (a plain count needs no unit). Appending a suffix to
// those would double up or add a nonsensical unit, so this only covers
// the two that are actually missing one.
const FOCUS_METRIC_UNIT_SUFFIX: Partial<Record<FocusMetric, string>> = {
  talkRatio: '%',
  avgWaitTime: 's',
}

// Summary's "My Focus" card — a plain, always-honest snapshot of where the
// teacher's chosen focus stands this session. Reuses the same coach-voice
// insight sentence already computed for the matching Insights category
// (never invents new copy) and the metric's own ConfidentMetric display/
// reason for the literal captured-value line, labeled with the metric's
// own name rather than a generic "What was captured" (which read as
// unitless and unclear on its own, e.g. "What was captured: 42.6").
function buildFocusSnapshot(
  focusMetric: FocusMetric | null,
  metric: ConfidentMetric,
  statusLine: string | null,
): FocusSnapshot | null {
  if (!focusMetric) return null
  const label = FOCUS_METRIC_LABELS[focusMetric]
  const confident = isConfidentState(metric.state)
  return {
    label,
    tier: evidenceTier(metric.state),
    statusLine,
    capturedLine: confident
      ? `${label}: ${metric.display}${FOCUS_METRIC_UNIT_SUFFIX[focusMetric] ?? ''}`
      : `${label}: ${metric.reason ?? 'not enough usable evidence'}`,
    valueText: confident ? `${metric.display}${FOCUS_METRIC_UNIT_SUFFIX[focusMetric] ?? ''}` : null,
    tryNextTip: FOCUS_METRIC_TRY_NEXT[focusMetric],
  }
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
  /** What the report actually measured, for Reflect's coach when the label alone carries no data. */
  detail?: string
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

function pickTop(candidates: NoticeCandidate[], preferredFocusMetric?: FocusMetric | null): NoticeCandidate | null {
  if (!candidates.length) return null
  const sorted = [...candidates].sort(
    (a, b) => b.weight - a.weight || CANDIDATE_ORDER.indexOf(a.id) - CANDIDATE_ORDER.indexOf(b.id),
  )
  if (preferredFocusMetric) {
    const focused = sorted.find((c) => c.focusMetric === preferredFocusMetric)
    if (focused) return focused
  }
  return sorted[0]
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

  if (
    hasEnoughDurationForTalkBalance &&
    hasEnoughWaitTimeSamples(session.metricsDetail) &&
    session.avgWaitTimeSec != null &&
    session.avgWaitTimeSec >= 3
  ) {
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

  // Stated with its number so this claim cannot drift away from the count the
  // teacher is reading two cards below it.
  if (cfuMetric.state === 'measured' && (session.cfuCount ?? 0) >= MIN_CFU_FOR_STRENGTH) {
    candidates.push({
      id: 'cfu',
      observation: `You checked for understanding ${session.cfuCount} times today`,
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
        focusMetric: 'feedbackSpecificity',
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
      observation: `You had ${balance.teacherPct}% of the talk the recording picked up today`,
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

  if (
    hasEnoughDurationForTalkBalance &&
    hasEnoughWaitTimeSamples(session.metricsDetail) &&
    session.avgWaitTimeSec != null &&
    session.avgWaitTimeSec < 3
  ) {
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

  // Only spoken check phrases are detectable, so a zero from a short clip
  // is too thin to headline as the one thing to work on.
  if (cfuMetric.state === 'confirmed_none' && hasEnoughDurationForTalkBalance) {
    candidates.push({
      id: 'cfu',
      observation: 'None of the common spoken check-for-understanding phrases came through this session',
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
        focusMetric: 'feedbackSpecificity',
      })
    }
  }

  return candidates
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
// Its own section, not one row of a two-row "Moments" card — the report's
// own strength claim, grounded in a real quote/timestamp rather than a
// paraphrase, so it can stand as the page's one dedicated "here's what to
// keep doing" moment.
function StrengthCard({
  n,
  strength,
  coverage,
  onViewDiscourse,
}: {
  n: number
  strength: NoticeCandidate | null
  coverage: ReturnType<typeof getCoverage>
  onViewDiscourse: () => void
}) {
  return (
    <NumberedCard n={n} title="A strength to keep" subtitle="Something that worked in this lesson — keep doing it">
      {strength ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-ink">{formatCandidateHeadline(strength)}</p>
          {strength.excerpt && <p className="text-sm text-ink-soft">"{strength.excerpt}"</p>}
          <p className="text-sm text-ink-soft">{strength.whyItMatters}</p>
          {/* One Discuss action per page — see DiscussFooter. */}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-soft">
            This recording was {formatTime(coverage.recordedSec)} — not enough measured evidence yet for a
            stand-out strength this session.
          </p>
          <button
            type="button"
            onClick={onViewDiscourse}
            className="self-start text-sm font-medium text-forest hover:text-terracotta-600"
          >
            See the full breakdown in Insights →
          </button>
        </div>
      )}
    </NumberedCard>
  )
}

// One card inside the "Evidence from the lesson" section — the Summary's
// single growth-oriented pick (the focus-aware top priority), with the
// "Set as my focus" shortcut when it maps to a trended My Growth metric.
function EvidenceMomentCard({
  moment,
  onSetFocus,
}: {
  moment: NoticeCandidate
  onSetFocus: (metric: FocusMetric) => void
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-cream-card p-6 md:col-span-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">A moment to revisit</span>
      <p className="mt-1.5 text-sm font-semibold text-ink">{formatCandidateHeadline(moment)}</p>
      {moment.excerpt && <p className="mt-1 text-sm text-ink-soft">"{moment.excerpt}"</p>}
      <p className="mt-1 text-sm text-ink-soft">{moment.whyItMatters}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
        {/* One Discuss action per page — see DiscussFooter. */}
        {moment.focusMetric && (
          <button
            type="button"
            onClick={() => onSetFocus(moment.focusMetric as FocusMetric)}
            className="text-sm font-medium text-forest hover:text-terracotta-600"
          >
            Set as my focus → My Growth
          </button>
        )}
      </div>
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
      <div className={`flex w-full overflow-hidden rounded-full bg-cream ${barHeight}`}>
        <div className="h-full bg-terracotta" style={{ width: `${teacherPct}%` }} />
        {studentPct != null && <div className="h-full bg-gold" style={{ width: `${studentPct}%` }} />}
        {silencePct != null ? (
          <div className="h-full bg-hairline" style={{ width: `${silencePct}%` }} />
        ) : (
          <div className="h-full" style={{ width: `${remainder}%`, ...HATCH_STYLE }} />
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-terracotta" /> Teacher · {teacherPct}%
        </span>
        <span className="flex items-center gap-1.5">
          {studentPct != null ? (
            <span className="h-2 w-2 shrink-0 rounded-full bg-gold" />
          ) : (
            <HatchedSwatch className="h-2 w-2" />
          )}
          Students · {studentPct != null ? `${studentPct}%` : 'unavailable'}
        </span>
        <span className="col-span-2 flex items-center gap-1.5">
          {silencePct != null ? (
            <span className="h-2 w-2 shrink-0 rounded-full bg-hairline" />
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
    <div className="rounded-2xl border border-hairline bg-cream-card p-6">
      <h2 className="text-sm font-semibold text-ink">Who was heard?</h2>
      <div className="mt-3">
        <TalkParticipationBar teacherPct={teacherPct} studentPct={studentPct} silencePct={silencePct} compact />
      </div>
      <p className="mt-3 text-xs text-ink-soft">Share of the full recording.</p>
      <button
        type="button"
        onClick={onExplore}
        className="mt-3 text-sm font-medium text-forest hover:text-terracotta-600"
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
    <div className="rounded-2xl border border-hairline bg-cream-card p-6">
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
        className="mt-3 text-sm font-medium text-forest hover:text-terracotta-600"
      >
        Review the questions →
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
  // TEMPORARY preview params — removed before commit.
  const [tab, setTab] = useState<ReportTab>('summary')
  const [insightsSection, setInsightsSection] = useState<InsightsSection>('talk')
  const [rubricOpen, setRubricOpen] = useState(false)
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null)
  const locked = session.status === 'locked'
  const [strengths, setStrengths] = useState(session.strengths ?? '')
  const [growthAreas, setGrowthAreas] = useState(session.growthAreas ?? '')
  const [nextStep, setNextStep] = useState(session.nextStep ?? '')
  const [followUpDate, setFollowUpDate] = useState(session.followUpDate ? session.followUpDate.slice(0, 10) : '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reflectSending, setReflectSending] = useState(false)
  const [reflectError, setReflectError] = useState<{ kind: ReflectChatErrorKind; message: string } | null>(null)
  const [reflectDraft, setReflectDraft] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [summarizeError, setSummarizeError] = useState<string | null>(null)
  const [contentNotesSending, setContentNotesSending] = useState(false)
  const [contentNotesError, setContentNotesError] = useState<string | null>(null)
  const [rubricLensSending, setRubricLensSending] = useState(false)
  const [rubricLensError, setRubricLensError] = useState<string | null>(null)
  const [classSummarySending, setClassSummarySending] = useState(false)
  // Re-tagging an analyzed report: null until the teacher asks for it.
  const [retagSpeakers, setRetagSpeakers] = useState<SpeakerSample[] | null>(null)
  const [retagLoading, setRetagLoading] = useState(false)
  const [retagError, setRetagError] = useState<string | null>(null)
  const hasAttemptedClassSummaryRef = useRef(false)
  const [externalFocus, setExternalFocus] = useState<{
    label: string
    focus: string
    detail: string | null
    timestampSec: number | null
  } | null>(null)

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


  // focus, when passed, is a specific highlight/metric to open with (from
  // one of Reflect's grounded starting-point chips) — prepended as one
  // more plain-fact line ahead of the same context array, so Claude's own
  // generated opening question naturally leads with it. No backend change
  // needed: the route already accepts an arbitrary context: string[].
  async function handleStartReflect(focus?: string, spoken = false) {
    setReflectSending(true)
    setReflectError(null)
    try {
      const context = focus ? [`Start the conversation by asking about ${focus}.`, ...reflectContext] : reflectContext
      const updated = await sendReflectMessage(session.id, { context, spoken })
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
  async function handleSendReflect(overrideText?: string, extraContext: string[] = [], spoken = false) {
    const usingOverride = overrideText != null
    const trimmed = (overrideText ?? reflectDraft).trim()
    if (!trimmed || reflectSending) return
    setReflectSending(true)
    setReflectError(null)
    if (!usingOverride) setReflectDraft('')
    try {
      const updated = await sendReflectMessage(session.id, {
        message: trimmed,
        context: [...extraContext, ...reflectContext],
        spoken,
      })
      onUpdate({ ...session, ...updated })
    } catch (err) {
      const kind = (err as { kind?: ReflectChatErrorKind })?.kind ?? 'other'
      setReflectError({ kind, message: (err as Error).message })
      if (!usingOverride) setReflectDraft(trimmed)
    } finally {
      setReflectSending(false)
    }
  }

  // Finishing a conversation writes the debrief. It used to only fill the
  // boxes and wait for a "Save notes" press, so a teacher who talked to Coach
  // and then closed the tab lost the thing they had the conversation for.
  //
  // It is re-runnable on purpose: come back a week later, say one more thing,
  // finish again, and the debrief is rewritten from the whole conversation.
  async function handleSummarizeReflect() {
    setSummarizing(true)
    setSummarizeError(null)
    try {
      const summary = await summarizeReflectConversation(session.id)
      const next = {
        strengths: summary.strengths ?? strengths,
        growthAreas: summary.growthAreas ?? growthAreas,
        nextStep: summary.nextStep ?? nextStep,
      }
      setStrengths(next.strengths)
      setGrowthAreas(next.growthAreas)
      setNextStep(next.nextStep)
      const updated = await updateAudioSession(session.id, {
        ...next,
        followUpDate: followUpDate ? new Date(followUpDate).toISOString() : null,
      })
      onUpdate({ ...session, ...updated })
      setSaved(true)
    } catch {
      setSummarizeError('Could not write your debrief. Please try again.')
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

  async function handleGenerateRubricLens() {
    setRubricLensSending(true)
    setRubricLensError(null)
    try {
      const updated = await generateRubricLens(session.id)
      onUpdate({ ...session, ...updated })
    } catch (err) {
      setRubricLensError((err as Error).message || 'Could not build the rubric lens. Please try again.')
    } finally {
      setRubricLensSending(false)
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
  const recordedSec = session.durationSec ?? 0
  const coverage = getCoverage(session.durationSec, session.phases)
  const num = (key: string) => (typeof metrics[key] === 'number' ? (metrics[key] as number) : null)

  // Talk & Participation
  const teacherTalkMetric = getPresenceMetric(session.teacherTalkPct)
  const studentTalkMetric = getPresenceMetric(session.studentTalkPct)
  // One decimal, like the two talk shares it is shown beside — rounded to a
  // whole number it made the three add up to 100.4.
  const silencePct =
    session.teacherTalkPct != null && session.studentTalkPct != null
      ? Math.max(0, Math.round((100 - session.teacherTalkPct - session.studentTalkPct) * 10) / 10)
      : null
  const silenceMetric = getPresenceMetric(silencePct)
  const studentSegmentsMetric = getCountMetric({ count: num('studentVoiceSegments'), recordedSec })

  // Questioning & Thinking
  const questionsMetric = getCountMetric({ count: session.questionCount, recordedSec })
  const higherOrderCount = num('higherOrderQuestionCount')
  const higherOrderRatio =
    session.questionCount != null ? formatRatio(higherOrderCount ?? 0, session.questionCount) : null
  const followUpMetric = getFollowUpMetric({
    count: num('followUpQuestionCount'),
    studentVoiceSegments: num('studentVoiceSegments'),
    recordedSec,
  })
  const waitTimeMetric = waitTimeMetricOf(session.avgWaitTimeSec, session.questionCount)

  // Checking Understanding
  const cfuMetric = getCountMetric({
    count: session.cfuCount,
    recordedSec,
    minDurationSec: MIN_DURATION_FOR_CFU_DETECTION_SEC,
  })
  const genericCount = num('genericFeedbackCount')
  const specificCount = num('specificFeedbackCount')
  const feedbackRatio = !feedbackMeasurable(num('studentVoiceSegments'))
    ? {
        state: 'limited_evidence' as const,
        display: '—',
        reason: "Too little student voice came through to read how you responded to it.",
      }
    : genericCount != null && specificCount != null && genericCount + specificCount > 0
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

  // The written narrative when the report has one, and the rule-assembled
  // sentence as the fallback for reports made before it existed. The
  // rule-based version can only restate the metrics; the written one can say
  // that a 9.3% higher-order figure undercounts the thinking actually asked
  // for, which is the more useful thing for a teacher to read.
  const talkInsight = session.talkNarrative ?? buildTalkInsight(session, studentSegmentsMetric)
  const questioningInsight =
    session.questionsNarrative ?? buildQuestioningInsight(session, higherOrderRatio, followUpMetric, waitTimeMetric)
  const feedbackTotal = genericCount != null && specificCount != null ? genericCount + specificCount : null
  const cfuInsight = buildCfuInsight(cfuMetric, feedbackRatio, specificCount, feedbackTotal)
  const hasRepeatedInstructionHighlight = (session.highlights ?? []).some((h) => h.label === 'Repeated instruction')
  const routinesInsight = buildRoutinesInsight(directiveMetric, hasRepeatedInstructionHighlight, transitionMetric)
  const climateInsight = buildClimateInsight(
    redirectionMetric,
    positiveCount,
    correctiveCount,
    nameMentionMetric,
    uniqueNameCount,
  )

  // Summary's "My Focus" card — maps the teacher's chosen focus to its
  // backing metric and the matching already-computed coach-voice sentence.
  const focusSnapshot: FocusSnapshot | null = (() => {
    switch (focusMetric) {
      case 'talkRatio':
        return buildFocusSnapshot(focusMetric, teacherTalkMetric, talkInsight)
      case 'higherOrderPct':
        return buildFocusSnapshot(
          focusMetric,
          higherOrderRatio ?? { state: 'not_measurable', display: '—', reason: 'No questions were detected to classify.' },
          questioningInsight,
        )
      case 'avgWaitTime':
        return buildFocusSnapshot(focusMetric, waitTimeMetric, questioningInsight)
      case 'followUpQuestionCount':
        return buildFocusSnapshot(focusMetric, followUpMetric, questioningInsight)
      case 'cfuCount':
        return buildFocusSnapshot(focusMetric, cfuMetric, cfuInsight)
      case 'feedbackSpecificity':
        return buildFocusSnapshot(focusMetric, feedbackRatio, cfuInsight)
      case 'redirectionCount':
        return buildFocusSnapshot(focusMetric, redirectionMetric, climateInsight)
      case 'toneRatio':
        return buildFocusSnapshot(focusMetric, toneRatio, climateInsight)
      case 'nameMentionCount':
        return buildFocusSnapshot(focusMetric, nameMentionMetric, climateInsight)
      case 'directiveCount':
        return buildFocusSnapshot(focusMetric, directiveMetric, routinesInsight)
      default:
        return null
    }
  })()

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

  function handleDiscussWithCoach(candidate: NoticeCandidate) {
    setTab('reflect')
    // "this moment" is right for one timestamped excerpt and wrong for a whole
    // page — a teacher pressing Discuss at the foot of Checks & Feedback is
    // not asking about a moment, they are asking about what they just read.
    const aboutAMoment = candidate.timestampSec != null || candidate.excerpt != null
    setExternalFocus({
      label: candidate.observation,
      focus: aboutAMoment
        ? [
            `this moment: ${candidate.observation}`,
            candidate.excerpt ? `("${candidate.excerpt}")` : null,
            candidate.timestampSec != null ? `around ${formatTime(candidate.timestampSec)}` : null,
          ]
            .filter(Boolean)
            .join(' ')
        : `what the report says about ${candidate.observation}`,
      detail: candidate.detail ?? null,
      timestampSec: candidate.timestampSec,
    })
  }

  useEffect(() => {
    if (!pendingScrollId) return
    const timeout = setTimeout(() => {
      document.getElementById(pendingScrollId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setPendingScrollId(null)
    }, 50)
    return () => clearTimeout(timeout)
  }, [tab, insightsSection, pendingScrollId])

  async function handleRetag() {
    setRetagLoading(true)
    setRetagError(null)
    try {
      const { speakers } = await getSpeakerSamples(session.id)
      setRetagSpeakers(speakers)
    } catch {
      setRetagError("Couldn't load this session's voices. Please try again.")
    } finally {
      setRetagLoading(false)
    }
  }

  // Tagging the wrong voice swaps every teacher/student number in the report,
  // and there was no way back short of deleting the recording.
  if (retagSpeakers) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft">
          Re-tagging rebuilds this report from the same transcript — your notes and reflection stay.
        </p>
        <TagSpeakersPanel
          session={session}
          speakers={retagSpeakers}
          onUpdate={(updated) => {
            setRetagSpeakers(null)
            onUpdate(updated)
          }}
          onExit={onExit}
          onCancel={() => setRetagSpeakers(null)}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => onExit()} className="text-sm font-medium text-ink-soft hover:text-ink">
          ← Back to sessions
        </button>
        <div className="flex items-center gap-3">
          {!locked && (
            <button
              type="button"
              onClick={handleRetag}
              disabled={retagLoading}
              className="text-sm font-medium text-ink-soft hover:text-terracotta-600 disabled:opacity-60"
            >
              {retagLoading ? 'Loading voices...' : "Wrong speaker? Fix who's who"}
            </button>
          )}
          {locked && (
            <span className="rounded-full bg-mint-tint/60 px-3 py-1 text-xs font-semibold text-forest">Locked</span>
          )}
        </div>
      </div>
      {retagError && <p className="text-sm text-terracotta-600">{retagError}</p>}

      {/* Persistent lesson identity + evidence-quality read — visible on
          every tab, not just Summary, so context never disappears when you
          navigate away from it. Styled as the printed report's cover, so the
          screen and the paper open the same way. */}
      <header className="overflow-hidden rounded-3xl bg-forest p-7 text-cream sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Wivoza · Lesson Debrief</p>
            <h1 className="mt-3 font-heading text-3xl font-extrabold leading-tight sm:text-4xl">
              {sessionTitle(session)}
              {session.period ? <span className="text-gold"> · {session.period}</span> : null}
            </h1>
            <p className="mt-2 text-sm text-cream/70">
              {session.teacherName ? `${session.teacherName} · ` : ''}
              {formatSessionDateTime(session.sessionDate)}
              {session.gradeLevel ? ` · ${session.gradeLevel}` : ''}
              {session.durationSec ? ` · ${formatTime(session.durationSec)}` : ''}
            </p>
            <p className={`mt-3 text-xs ${evidenceQuality.tone === 'warn' ? 'font-semibold text-gold' : 'text-cream/60'}`}>
              {evidenceQuality.text}
            </p>
            {coverage.isTinyRecording && (
              <span className="mt-4 inline-block rounded-full bg-gold px-3 py-1 text-xs font-bold uppercase tracking-wide text-forest">
                Short excerpt
              </span>
            )}
          </div>
          <Link
            to={`/audio-coaching/${session.id}/export`}
            className="shrink-0 rounded-full bg-cream px-4 py-2.5 text-sm font-semibold text-forest transition-opacity hover:opacity-90"
          >
            Print / Save as PDF
          </Link>
        </div>
      </header>

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
          onNavigateInsights={(section) => handleViewSource('insights', '', section)}
          onDiscussWithCoach={handleDiscussWithCoach}
          focusMetric={focusMetric}
          focusSnapshot={focusSnapshot}
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
          error={error}
          onSave={handleSaveNotes}
          onSummarize={handleSummarizeReflect}
          summarizing={summarizing}
          summarizeError={summarizeError}
          focusMetric={focusMetric}
          onFocusMetricChange={onFocusMetricChange}
          segments={session.segments}
          externalFocus={externalFocus}
          onExternalFocusHandled={() => setExternalFocus(null)}
        />
      )}

      {tab === 'insights' && (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <InsightsNav section={insightsSection} onSelect={setInsightsSection} />
          <div className="min-w-0 flex-1">
            {/* A lens over the whole report rather than a section of its own:
                it rearranges evidence the other four sections already hold. */}
            <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-hairline bg-cream-card p-4">
              <button
                type="button"
                onClick={() => setRubricOpen((open) => !open)}
                className="flex items-center justify-between gap-3 text-left"
              >
                <span>
                  <span className="text-sm font-semibold text-forest">Rubric lens</span>
                  <span className="ml-2 text-xs text-ink-soft">
                    This lesson seen through your evaluation framework. Evidence, not a rating.
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-terracotta-600">
                  {rubricOpen ? 'Hide' : 'Show'}
                </span>
              </button>
              {rubricOpen && (
                <RubricLensTab
                  rubricLens={session.rubricLens}
                  locked={locked}
                  isShort={coverage.isShort}
                  sending={rubricLensSending}
                  error={rubricLensError}
                  onGenerate={handleGenerateRubricLens}
                />
              )}
            </div>
            <InsightsSectionHeader section={insightsSection} />
            <SectionAccentContext.Provider value={INSIGHTS_SECTION_META[insightsSection].accent}>
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
                onDiscussWithCoach={handleDiscussWithCoach}
              />
            )}

            {insightsSection === 'questions' && (
              <div className="flex flex-col gap-8">
                <div>
                  <SubsectionHeading
                    title="What you asked"
                    blurb="Questions, what they asked of students, and the checks you ran."
                  />
                  <QuestionsThinkingTab
                questionCount={session.questionCount}
                questionLog={session.questionLog}
                questionsMetric={questionsMetric}
                higherOrderRatio={higherOrderRatio}
                higherOrderCount={higherOrderCount}
                followUpMetric={followUpMetric}
                waitTimeMetric={waitTimeMetric}
                avgWaitTimeSec={session.avgWaitTimeSec}
                waitTimeSampleCount={session.metricsDetail?.waitTimeSampleCount ?? null}
                thinkingTaskCount={session.metricsDetail?.thinkingTaskCount ?? null}
                focusMetric={focusMetric}
                    questioningInsight={questioningInsight}
                    highlights={session.highlights}
                  />
                </div>
                <div>
                  <SubsectionHeading
                    title="How you responded"
                    blurb="Wait time, follow-ups, and your responses to what students said — all of it limited by how much of the room the microphone reached."
                  />
                  <UnderstandingFeedbackTab
                    checksNarrative={session.checksNarrative ?? null}
                    cfuLog={session.cfuLog}
                    feedbackLog={session.feedbackLog}
                    segments={session.segments}
                    specificFeedbackCount={specificCount}
                    feedbackTotal={feedbackTotal}
                  />
                </div>
              </div>
            )}

            {insightsSection === 'content' && (
              <LessonContentTab
                lessonContent={session.lessonContent}
                contentNotes={session.contentNotes}
                narrative={session.contentNarrative ?? null}
                isShort={coverage.isShort}
                sending={contentNotesSending}
                error={contentNotesError}
                onGenerate={handleGenerateContentNotes}
              />
            )}

            {insightsSection === 'routines' && (
              <ClimateRoutinesTab
                transitionMetric={transitionMetric}
                nameMentionMetric={nameMentionMetric}
                climateNarrative={session.climateNarrative ?? null}
                directiveLog={session.directiveLog}
                toneLog={session.toneLog}
                redirectionLog={session.redirectionLog}
                segments={session.segments}
              />
            )}


            <DiscussFooter
              label="Discuss this with Wivoza Coach"
              onClick={() =>
                handleDiscussWithCoach({
                  id: `insights-${insightsSection}`,
                  observation: `${INSIGHTS_SECTIONS.find((s) => s.key === insightsSection)?.label ?? 'This section'} in this lesson`,
                  whyItMatters: "Let's talk through what this part of the report showed.",
                  timestampSec: null,
                  excerpt: null,
                  durationSec: null,
                  weight: 0,
                  focusMetric: null,
                  // The words the teacher just read, so the coach opens about
                  // THIS page rather than about the lesson in general. Without
                  // it the coach only ever got the section's name.
                  detail: narrativeForSection(session, insightsSection) ?? undefined,
                })
              }
            />
            </SectionAccentContext.Provider>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-dashed border-hairline p-4 text-xs text-ink-soft">
        This report reflects what could be heard in your recording — talk patterns, questioning, and classroom
        routines. It doesn't capture lesson planning, materials, physical space, visual engagement, or anything
        outside class time. Automated counts above are suggestions to confirm or edit, not final judgments.
      </div>

      <Link
        to={`/audio-coaching/${session.id}/export`}
        className="self-start text-sm font-medium text-forest hover:text-terracotta-600"
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
  onNavigateInsights,
  onDiscussWithCoach,
  focusMetric,
  focusSnapshot,
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
  onNavigateInsights: (section: InsightsSection) => void
  onDiscussWithCoach: (candidate: NoticeCandidate) => void
  focusMetric: FocusMetric | null
  focusSnapshot: FocusSnapshot | null
}) {
  const classSummaryProgress = useSimulatedProgress(classSummarySending, 14000)
  const strengthCandidates = buildStrengthCandidates(session, cfuMetric, feedbackRatio, higherOrderRatio)
  const priorityCandidates = buildPriorityCandidates(session, cfuMetric, feedbackRatio, higherOrderRatio)
  const strength = pickTop(strengthCandidates)
  // No separate "One next step" card any more — Reflect is its own tab — so
  // the focus-aware top priority is the moment to revisit.
  const momentToRevisit = pickTop(priorityCandidates, focusMetric)
  const spotlight = buildSpotlight(talkInsight, questioningInsight, cfuInsight)

  // Four sections, in the order a teacher actually wants to read them:
  // what happened, what went well, what to focus on, and the evidence
  // behind it — rather than a stack of similarly-weighted cards with no
  // throughline. Talking it through lives in the Reflect tab.
  return (
    <div className="flex flex-col gap-5">
      {/* 1. Lesson at a glance */}
      <NumberedCard n={1} title="Lesson at a glance" subtitle="What happened in this lesson, and the four numbers behind it">
        {classSummary ? (
          // Three paragraphs now — content, strengths, then what to weigh —
          // so blank lines have to survive rather than collapsing into a wall.
          <div className="flex flex-col gap-3">
            {splitParagraphs(classSummary).map((para, i) => (
              <p key={i} className="text-base leading-relaxed text-ink">
                {para.trim()}
              </p>
            ))}
          </div>
        ) : classSummarySending ? (
          <div className="flex justify-center rounded-xl bg-cream-card/60 p-6 text-forest">
            <ProgressRing
              progress={classSummaryProgress}
              label="Putting together a summary of this lesson"
              hint="Reading the whole transcript, not just the start."
            />
          </div>
        ) : (
          spotlight && (
            <>
              <p className="text-sm font-semibold text-ink">{spotlight.headline}</p>
              <p className="mt-1 text-base leading-relaxed text-ink">{spotlight.body}</p>
            </>
          )
        )}

        {/* Silence sits with the two talk shares because without it they look
            like a split of the talking when they are shares of the recording —
            22.6% and 7.9% read as a missing 70% rather than as a room that was
            quiet or working. The three add up to the whole recording. */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <SummaryStat label="You spoke" metric={getPresenceMetric(session.teacherTalkPct)} unit="%" accent={ACCENTS.terracotta} />
          <SummaryStat label="Students spoke" metric={getPresenceMetric(session.studentTalkPct)} unit="%" accent={ACCENTS.gold} />
          <SummaryStat label="Silence / other" metric={getPresenceMetric(silencePct)} unit="%" accent={ACCENTS.mint} />
          <SummaryStat label="Questions" metric={questionsMetric} accent={ACCENTS.mint} />
          <SummaryStat label="Avg. wait" metric={waitTimeMetricOf(session.avgWaitTimeSec, session.questionCount)} unit="s" accent={ACCENTS.forest} />
        </div>
      </NumberedCard>

      {/* 2. A strength to keep */}
      <StrengthCard
        n={2}
        strength={strength}
        coverage={coverage}
        onViewDiscourse={() => onNavigateInsights('talk')}
      />

      {/* 3. Your focus */}
      {focusSnapshot && (
        <NumberedCard
          n={3}
          title={`My focus · ${focusSnapshot.label}`}
          subtitle="The one area you chose to work on, in this lesson"
          aside={
            <span className="shrink-0 rounded-full bg-cream-card px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-terracotta-600">
              {EVIDENCE_TIER_LABELS[focusSnapshot.tier]}
            </span>
          }
        >
          {focusMetric === 'talkRatio' && session.teacherTalkPct != null ? (
            <div className="rounded-xl bg-cream-card/60 p-4">
              <TalkParticipationBar
                teacherPct={session.teacherTalkPct}
                studentPct={session.studentTalkPct}
                silencePct={silencePct}
                compact
              />
            </div>
          ) : (
            focusSnapshot.valueText && (
              <p className="text-3xl font-semibold text-ink">{focusSnapshot.valueText}</p>
            )
          )}
          {focusSnapshot.statusLine && <p className="mt-3 text-sm text-ink">{focusSnapshot.statusLine}</p>}
          <p className="mt-2 text-sm text-ink-soft">{focusSnapshot.capturedLine}</p>
          <p className="mt-1 text-sm text-ink-soft">Try next time: {focusSnapshot.tryNextTip}</p>
          <button
            type="button"
            onClick={() =>
              onDiscussWithCoach({
                id: 'focus-metric',
                observation: `${focusSnapshot.label} — your current focus`,
                whyItMatters: focusSnapshot.statusLine ?? focusSnapshot.tryNextTip,
                timestampSec: null,
                excerpt: null,
                durationSec: null,
                weight: 0,
                focusMetric,
                detail: [focusSnapshot.capturedLine, focusSnapshot.statusLine].filter(Boolean).join(' '),
              })
            }
            className="mt-3 text-sm font-medium text-forest hover:text-terracotta-600"
          >
            Discuss this focus →
          </button>
        </NumberedCard>
      )}

      {/* 4. Evidence from the lesson */}
      <NumberedCard
        n={focusSnapshot ? 4 : 3}
        title="Evidence from the lesson"
        subtitle="The moments and numbers behind these notes — open any one to see more"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
          {momentToRevisit && (
            <EvidenceMomentCard moment={momentToRevisit} onSetFocus={onFocusMetricChange} />
          )}
        </div>
      </NumberedCard>

      <DiscussFooter
        label="Discuss this with Wivoza Coach"
        onClick={() =>
          onDiscussWithCoach({
            id: 'summary',
            observation: 'The summary of this lesson',
            whyItMatters: "Let's talk through what this report showed.",
            timestampSec: momentToRevisit?.timestampSec ?? null,
            excerpt: momentToRevisit?.excerpt ?? null,
            durationSec: null,
            weight: 0,
            focusMetric: null,
            // What the teacher just read at the top of the page.
            detail: classSummary ?? undefined,
          })
        }
      />
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
              ? 'border-terracotta bg-peach-tint/50 text-forest'
              : 'border-hairline bg-cream text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
          }`}
        >
          {focusMetric ? FOCUS_METRIC_LABELS[focusMetric] : 'Choose a focus metric'}
          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
        {open && (
          <div className="absolute z-10 mt-1 w-72 rounded-lg border border-hairline bg-cream-card p-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className={`w-full rounded-lg px-3 py-1.5 text-left text-sm ${
                focusMetric == null ? 'font-semibold text-forest' : 'text-ink-soft hover:bg-cream'
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
                      focusMetric === key ? 'bg-mint-tint/60 font-semibold text-forest' : 'text-ink hover:bg-cream'
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
        <div className="rounded-2xl border border-dashed border-hairline p-6 text-center text-sm text-ink-soft">
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
            { label: 'You', colorVar: '--color-terracotta', values: teacherTalk },
            { label: 'Students', colorVar: '--color-gold', values: studentTalk },
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
          series={[{ label: 'Higher-order questions', colorVar: '--color-terracotta', values: higherOrder }]}
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
          series={[{ label: 'Your avg. wait time', colorVar: '--color-terracotta', values: avgWaitTime }]}
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
            series={[{ label: 'CFUs per 10 min', colorVar: '--color-terracotta', values: cfuFrequency }]}
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
          series={[{ label: 'Follow-ups per 10 min', colorVar: '--color-terracotta', values: followUpFrequency }]}
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
          series={[{ label: 'Redirections per 10 min', colorVar: '--color-terracotta', values: redirectionFrequency }]}
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
          series={[{ label: 'Share positive', colorVar: '--color-terracotta', values: toneRatio }]}
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
          series={[{ label: 'Directions per 10 min', colorVar: '--color-terracotta', values: directiveFrequency }]}
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
          series={[{ label: 'Name mentions per 10 min', colorVar: '--color-terracotta', values: nameMentionFrequency }]}
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
          series={[{ label: 'Share specific', colorVar: '--color-terracotta', values: feedbackSpecificity }]}
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
        <div className="flex items-center gap-3 rounded-2xl bg-mint-tint/50 p-5">
          <ArrowUpIcon className="h-5 w-5 shrink-0 text-forest" />
          <p className="text-sm text-ink">{insight}</p>
        </div>
      )}

      {/* One chosen focus, across comparable recordings — not all 10 charts
          at once. */}
      {focusedChart ? (
        <div className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-6">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Your focus</p>
          {focusedChart.node}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-hairline p-6 text-center text-sm text-ink-soft">
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

const REFLECT_TURN_CAP = 12

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
  error,
  onSave,
  onSummarize,
  summarizing,
  summarizeError,
  focusMetric,
  onFocusMetricChange,
  segments,
  externalFocus,
  onExternalFocusHandled,
}: {
  highlights: AudioHighlight[] | null
  cfuMetric: { state: string }
  redirectionMetric: { state: string }
  conversation: AudioReflectMessage[] | null
  sending: boolean
  reflectError: { kind: ReflectChatErrorKind; message: string } | null
  draft: string
  onDraftChange: (v: string) => void
  onStart: (focus?: string, spoken?: boolean) => void
  onSend: (overrideText?: string, extraContext?: string[], spoken?: boolean) => void
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
  error: string | null
  onSave: () => void
  onSummarize: () => void
  summarizing: boolean
  summarizeError: string | null
  focusMetric: FocusMetric | null
  onFocusMetricChange: (metric: FocusMetric | null) => void
  segments: TranscriptSegment[]
  externalFocus: { label: string; focus: string; detail: string | null; timestampSec: number | null } | null
  onExternalFocusHandled: () => void
}) {
  const started = conversation != null && conversation.length > 0
  const userTurnCount = conversation?.filter((m) => m.role === 'user').length ?? 0
  const turnCapHit = userTurnCount >= REFLECT_TURN_CAP
  const lastAssistant = conversation ? [...conversation].reverse().find((m) => m.role === 'assistant') : null

  // A session that was already finished before (has saved notes) opens
  // straight into the review screen. A conversation already in progress
  // picks up where it left off — leaving for the report and coming back
  // must not drop the teacher onto the starting screen again. Only a
  // session with no conversation yet opens on the starting screen.
  const [reviewingNotes, setReviewingNotes] = useState(() => Boolean(strengths || growthAreas || nextStep))
  const [showStartScreen, setShowStartScreen] = useState(() => !started)
  const [userTranscript, setUserTranscript] = useState<string | null>(
    () => [...(conversation ?? [])].reverse().find((m) => m.role === 'user')?.text ?? null,
  )
  // "Let's discuss another moment" opens this picker inside the conversation instead of
  // sending the teacher back to the starting screen.
  const [pickingTopic, setPickingTopic] = useState(false)

  // Starting-screen path selection — picking a card only selects it
  // (per spec, never immediately starts anything); "Start Talking"/"Type
  // instead" below read the current selection to decide how the
  // conversation opens.
  const [selectedPath, setSelectedPath] = useState<ReflectPath>('full_report')
  const [selectedMomentIndex, setSelectedMomentIndex] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  // Which moment (if any) the current stretch of conversation is anchored
  // to — drives "Show me the evidence" (only offered once a real
  // timestamp is known) and the transcript-window reveal below it.
  const [currentTimestampSec, setCurrentTimestampSec] = useState<number | null>(null)
  const [showTranscriptWindow, setShowTranscriptWindow] = useState(false)

  // Active-session chrome: a lightweight elapsed timer and an explicit
  // Pause (distinct from voice mode's own mic-level Pause/Resume, since
  // typed conversations have no mic to pause) plus a confirmation step
  // before Finish, matching the reference design's own dialog copy —
  // a plain window.confirm can't carry custom button labels, so this is
  // a small purpose-built dialog instead of this app's usual
  // window.confirm pattern.
  const [elapsedSec, setElapsedSec] = useState(0)
  const [sessionPaused, setSessionPaused] = useState(false)
  const [showFinishConfirm, setShowFinishConfirm] = useState(false)

  useEffect(() => {
    if (showStartScreen || reviewingNotes || sessionPaused) return
    const interval = window.setInterval(() => setElapsedSec((s) => s + 1), 1000)
    return () => window.clearInterval(interval)
  }, [showStartScreen, reviewingNotes, sessionPaused])

  // Voice mode — talk to Coach live instead of typing, replies auto-play.
  // Same useVoiceTurn hook and voicePlayback helpers Talk It Through uses,
  // just recolored to this report's own brand/warm/ink tokens instead of
  // Talk It Through's distinct cream/forest theme.
  const [voiceMode, setVoiceMode] = useState(false)
  const [muted, setMuted] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  // Replies already in the conversation when this tab opens are never read
  // aloud again — only new ones are.
  const spokenCountRef = useRef(conversation?.length ?? 0)
  // The reply currently being read aloud, so Finish, switching topic and
  // leaving the tab can cut Coach off mid-sentence rather than letting the
  // rest of the queue play out.
  const playbackRef = useRef<PlaybackQueue | null>(null)
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
    onSend(text, [], voiceModeRef.current)
  }

  const {
    supported: voiceSupported,
    listening,
    level,
    fatalError: voiceFatalError,
    transcribing,
    start,
    close,
  } = useVoiceTurn(handleVoiceTurnComplete)

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
    const sentences = splitIntoSentences(last.text)
    if (sentences.length === 0) return
    setIsSpeaking(true)
    const queue = createPlaybackQueue(audioRef.current, talkVoice)
    playbackRef.current = queue
    for (const sentence of sentences) queue.push(sentence)
    queue.end()
    queue.finished.then(() => {
      // A cancelled queue was stopped on purpose (Finish, switching topic,
      // leaving) — don't reopen the mic behind the teacher's back.
      if (playbackRef.current !== queue) return
      playbackRef.current = null
      setIsSpeaking(false)
      if (voiceModeRef.current && !locked && !turnCapHit) start()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, voiceMode])

  // Stops Coach mid-sentence and releases the mic.
  function stopCoach() {
    playbackRef.current?.cancel()
    playbackRef.current = null
    audioRef.current?.pause()
    setIsSpeaking(false)
    close()
  }

  // Leaving this tab or the report silences Coach and releases the mic.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => stopCoach, [])

  // Fire-and-forget, same as TalkToMe.tsx's own priming — never awaited, so
  // it can't block the actual state transition (starting the conversation,
  // or entering voice mode) behind however long the unlock takes to settle.
  function primeAudio() {
    const audio = audioRef.current
    if (audio) primeAudioElement(audio)
  }

  const starterPrompts = buildReflectStarterPrompts(highlights, cfuMetric, redirectionMetric)

  // What the selected path tells Coach to open with — only meaningful the
  // first time a conversation starts; resuming an existing one (below)
  // never re-invokes this. Also yields the moment's timestamp, when the
  // path is anchored to one, so "Show me the evidence" is available from
  // the very first reply of that conversation.
  function resolveSelectedPath(): { focus: string | undefined; timestampSec: number | null } {
    switch (selectedPath) {
      case 'full_report':
        return {
          focus:
            'the session as a whole — open by naming one genuine strength from the facts below and one moment worth revisiting, each grounded in specific evidence, before landing on a question',
          timestampSec: null,
        }
      case 'specific_moment': {
        const prompt = starterPrompts[selectedMomentIndex]
        return {
          focus: prompt?.focus ?? "a specific moment from today's lesson that stood out",
          timestampSec: prompt?.timestampSec ?? null,
        }
      }
      case 'how_it_felt':
        return {
          focus:
            "how the lesson felt to the teacher, from their own perspective — invite them to share their own take on it before referencing any of the measured data",
          timestampSec: null,
        }
      case 'ask_question':
        return {
          focus:
            "whatever's on the teacher's mind about this lesson — invite them to ask you anything, rather than leading with an observation yourself",
          timestampSec: null,
        }
    }
  }

  // A conversation already exists (the teacher picked a path here before,
  // or resumed via the menu) — these buttons just resume it. The backend
  // would otherwise reject a second "start" call on a non-empty
  // conversation (it expects a real message once one exists).
  function handleStartVoice() {
    primeAudio()
    setVoiceMode(true)
    if (started) setShowStartScreen(false)
    else {
      const { focus, timestampSec } = resolveSelectedPath()
      setCurrentTimestampSec(timestampSec)
      // spoken: this opener is played aloud, so Coach has to be told the
      // teacher is listening rather than reading. Without it the one reply
      // a teacher hears first was written to be read on a screen.
      onStart(focus, true)
    }
  }

  function handleStartTyped() {
    setVoiceMode(false)
    if (started) setShowStartScreen(false)
    else {
      const { focus, timestampSec } = resolveSelectedPath()
      setCurrentTimestampSec(timestampSec)
      onStart(focus)
    }
  }

  // A change-topic / "Let's discuss another moment" action returns to the
  // path-selection screen without touching the conversation itself —
  // exactly the existing "Continue previous debrief" menu item's own
  // resume mechanism, run in reverse.
  function handleChangeTopic() {
    stopCoach()
    setShowTranscriptWindow(false)
    setPickingTopic(true)
  }

  // Switching topic is just the next turn of the same conversation.
  function handlePickTopic(message: string, timestampSec: number | null) {
    setPickingTopic(false)
    setCurrentTimestampSec(timestampSec)
    setUserTranscript(message)
    onSend(message, [], voiceModeRef.current)
  }

  function handleCancelTopicPicker() {
    setPickingTopic(false)
    if (voiceMode && !sessionPaused && !locked && !turnCapHit) start()
  }

  // Consumes a "Discuss this" click from Summary's Moments card. If a
  // conversation is already running, this becomes a real, visible turn;
  // otherwise it seeds the opening question exactly like a starting-screen
  // path does.
  useEffect(() => {
    if (!externalFocus) return
    setShowStartScreen(false)
    setShowTranscriptWindow(false)
    // Reflect opens on the debrief once one exists, which is right when the
    // teacher navigates there themselves and wrong when they arrive by
    // pressing Discuss: they asked to talk about a section and were shown
    // their saved notes instead, on every section, not just the one where it
    // was noticed.
    setReviewingNotes(false)
    // "Discuss this with Wivoza Coach" should feel like talking to someone
    // about the class, not filling in a box. The start screen's own voice
    // button set this and the external entry never did, so every arrival from
    // the report landed in typing. If the browser refuses to play audio
    // without a direct gesture, the existing voiceFatalError path drops back
    // to typing — no worse than before.
    primeAudio()
    setVoiceMode(true)
    setCurrentTimestampSec(externalFocus.timestampSec)
    // The label alone ("Follow-up questions — your current focus") carries
    // no data, and mid-conversation the coach once answered with its earlier
    // talk-balance reply instead — so the switch is spelled out, along with
    // whatever the report actually measured for the new topic.
    // Same framing the first-conversation branch uses. Without it, a teacher
    // who already has a conversation — which is everyone with a debrief — got
    // the page's text with none of the instruction about how to treat it, and
    // the coach was free to re-derive a reading that contradicts the page.
    const measured = externalFocus.detail
      ? ` This is the report's own reading of that section, which the teacher has just finished reading: "${externalFocus.detail}" Open about this specifically. Treat it as accurate and build on it — do not re-derive your own reading from the raw numbers and do not contradict it.`
      : ''
    if (started) {
      onSend(
        `Let's discuss this: ${externalFocus.label}`,
        [`The teacher just switched to a new topic: ${externalFocus.label}.${measured}`],
        true,
      )
    } else {
      onStart(
        externalFocus.detail
          ? `${externalFocus.focus}. This is the report's own reading, which the teacher has just finished reading, quoted here: "${externalFocus.detail}". Open about this specifically rather than about the lesson in general. Treat it as accurate and build on it — do not re-derive your own reading from the raw numbers and do not contradict it, or the teacher hears one thing on the page and the opposite from you.`
          : externalFocus.focus,
        true,
      )
    }
    onExternalFocusHandled()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalFocus])

  function handleSwitchToVoice() {
    primeAudio()
    setVoiceMode(true)
    if (!locked && !turnCapHit) start()
  }

  function handleSwitchToTyping() {
    close()
    setVoiceMode(false)
  }

  function handleTogglePause() {
    if (sessionPaused) {
      setSessionPaused(false)
      if (voiceMode && !locked && !turnCapHit) start()
    } else {
      setSessionPaused(true)
      if (voiceMode) stopCoach()
    }
  }

  /// Coming back to a finished debrief and picking the conversation up again:
  /// the report closes, voice comes back on, and the mic opens, so the teacher
  /// can simply start talking.
  function handleResumeConversation() {
    setReviewingNotes(false)
    primeAudio()
    setVoiceMode(true)
    if (!locked && !turnCapHit) start()
  }

  function handleFinish() {
    stopCoach()
    setVoiceMode(false)
    setPickingTopic(false)
    setShowFinishConfirm(false)
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

  return (
    <div className="flex flex-col gap-6">
      {/* Persistent element — playQueue always plays a locally created
          blob: URL through it, never /api/tts directly. Must render as a
          genuinely laid-out element, not display:none — Chromium's own UA
          stylesheet has `audio:not([controls]) { display: none !important
          }`, which no inline/author style can override (confirmed: setting
          display:block inline still computed to none until `controls` was
          added). Without a real layout box, Chrome's background-media
          power-saving policy also suspends the element, rejecting play()
          with "video-only background media was paused to save power" the
          moment it's called — the exact, confirmed cause of this playing
          fine on Safari (no such policy) and silently failing on Chrome.
          The `controls` attribute escapes that UA rule; opacity/size/
          position then hide the native player UI without display:none
          ever coming back into play. */}
      <audio
        ref={audioRef}
        crossOrigin="use-credentials"
        controls
        style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />

      {reviewingNotes ? (
        <div className="flex flex-col gap-6">
          {/* Finishing turns voice off. This used to only hide the report, so
              a teacher who came back landed in the transcript with nobody
              speaking and nobody listening, and no way to tell what to press.
              It resumes the conversation properly — and it is a primary
              action now, not a back link, because carrying on is the point of
              coming back. */}
          {!locked && (
            <button
              type="button"
              onClick={handleResumeConversation}
              className="self-start rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90"
            >
              Carry on the conversation →
            </button>
          )}
          {locked && (
            <button
              type="button"
              onClick={() => setReviewingNotes(false)}
              className="self-start text-sm font-medium text-ink-soft hover:text-ink"
            >
              ← Back to conversation
            </button>
          )}

          {summarizing ? (
            <div className="rounded-2xl border border-hairline bg-cream-card p-8">
              <WorkingRing
                active
                estimatedMs={12000}
                label="Wrapping up your reflection"
                hint="Pulling your notes from the conversation."
                className="text-forest"
              />
            </div>
          ) : (
            <>
              {summarizeError && <p className="text-sm text-terracotta-600">{summarizeError}</p>}

              {/* The teacher's own notes, in the same numbered sections as every
                  other takeaway. They stay editable until the report is locked. */}
              <NumberedCard n={1} title="What I noticed" subtitle="What stood out to you in this lesson">
                <textarea
                  aria-label="What I noticed"
                  onBlur={onSave}
                  value={strengths}
                  onChange={(e) => onStrengthsChange(e.target.value)}
                  disabled={locked}
                  rows={3}
                  className="w-full rounded-lg border border-hairline bg-cream-card px-3.5 py-2.5 text-sm text-ink focus:border-terracotta focus:outline-none disabled:opacity-70"
                />
              </NumberedCard>

              <NumberedCard n={2} title="What I want to explore" subtitle="A question or pattern you'd like to understand better">
                <textarea
                  aria-label="What I want to explore"
                  onBlur={onSave}
                  value={growthAreas}
                  onChange={(e) => onGrowthAreasChange(e.target.value)}
                  disabled={locked}
                  rows={3}
                  className="w-full rounded-lg border border-hairline bg-cream-card px-3.5 py-2.5 text-sm text-ink focus:border-terracotta focus:outline-none disabled:opacity-70"
                />
              </NumberedCard>

              <NumberedCard n={3} title="My next step" subtitle="One thing to try, and when to look back at how it went">
                <div className="flex flex-col gap-3">
                  <textarea
                    aria-label="My next step"
                    onBlur={onSave}
                    value={nextStep}
                    onChange={(e) => onNextStepChange(e.target.value)}
                    disabled={locked}
                    rows={2}
                    className="w-full rounded-lg border border-hairline bg-cream-card px-3.5 py-2.5 text-sm text-ink focus:border-terracotta focus:outline-none disabled:opacity-70"
                  />
                  <label className="flex flex-wrap items-center gap-2.5">
                    <span className="text-sm font-medium text-ink">Follow-up date</span>
                    <input
                      type="date"
                      onBlur={onSave}
                      value={followUpDate}
                      onChange={(e) => onFollowUpDateChange(e.target.value)}
                      disabled={locked}
                      className="w-fit rounded-lg border border-hairline bg-cream-card px-3.5 py-2.5 text-sm text-ink focus:border-terracotta focus:outline-none disabled:opacity-70"
                    />
                  </label>
                </div>
              </NumberedCard>

              <NumberedCard n={4} title="Focus for my next recording" subtitle="Choose one area — My Growth will track it across lessons">
                <FocusSelector focusMetric={focusMetric} onChange={onFocusMetricChange} />
              </NumberedCard>

              {/* No "Save notes" and no "Lock report". The debrief is written
                  when the conversation finishes and saved with it; an edit
                  saves itself when the field loses focus. A teacher wanted to
                  talk, finish, and have a debrief — not to file it. And
                  locking made a living document final, when the point is that
                  coming back and saying one more thing rewrites it. */}
              {!locked && (
                <p className="text-sm text-ink-soft">
                  {saving ? 'Saving…' : saved ? 'Saved. Come back any time — carry on the conversation and this rewrites itself.' : ''}
                </p>
              )}
              {error && <p className="text-sm text-terracotta-600">{error}</p>}
            </>
          )}
        </div>
      ) : showStartScreen ? (
        <div className="relative mx-auto w-full max-w-2xl rounded-2xl border border-hairline bg-cream-card p-6 sm:p-8">
          {started && (
            <div className="absolute right-5 top-5 sm:right-6 sm:top-6">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Debrief options"
                className="rounded-full p-1.5 text-ink-soft transition-colors hover:bg-cream hover:text-ink"
              >
                <KebabIcon className="h-5 w-5" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-xl border border-hairline bg-cream-card p-1.5 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        setShowStartScreen(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-cream"
                    >
                      <ChatBubbleIcon className="h-4 w-4 text-ink-soft" />
                      Continue previous debrief
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <span className="inline-block rounded-full bg-peach-tint px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-terracotta-600">
            Interactive Debrief
          </span>
          <h2 className="mt-3 font-heading text-2xl font-extrabold text-forest sm:text-3xl">Let's debrief your lesson</h2>
          <p className="mt-1.5 max-w-lg text-sm text-ink-soft">
            Your coach will use your report, ask one question at a time, and help you choose a practical next
            step.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {REFLECT_PATH_CARDS.map((path) => (
              <button
                key={path.key}
                type="button"
                onClick={() => setSelectedPath(path.key)}
                className={`relative flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
                  selectedPath === path.key
                    ? 'border-terracotta bg-peach-tint/50'
                    : 'border-hairline bg-cream hover:border-terracotta/40'
                }`}
              >
                {path.recommended && (
                  <span className="absolute right-4 top-4 rounded-full bg-forest px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Recommended
                  </span>
                )}
                <span className={`flex h-10 w-10 items-center justify-center rounded-full ${path.iconBg}`}>
                  {path.icon}
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{path.title}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">{path.description}</p>
                </div>
              </button>
            ))}
          </div>

          {selectedPath === 'specific_moment' && starterPrompts.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {starterPrompts.map((p, i) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setSelectedMomentIndex(i)}
                  className={`rounded-xl border px-4 py-2.5 text-left text-sm transition-colors ${
                    selectedMomentIndex === i
                      ? 'border-terracotta bg-peach-tint/50 text-forest'
                      : 'border-hairline bg-cream text-ink hover:border-terracotta/40'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {!locked && (
            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handleStartVoice}
                disabled={sending}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-terracotta px-5 py-3.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
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
              <WorkingRing active={sending} estimatedMs={8000} label="Starting your debrief" className="text-forest" />
              <p className="mt-1 text-xs text-ink-soft">Your debrief is private and saved automatically.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-hairline bg-cream-card p-6">
            <div className="mb-4 flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    locked || sessionPaused ? 'bg-ink-soft' : 'animate-pulse bg-terracotta'
                  }`}
                />
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  {locked ? 'Read-only' : sessionPaused ? 'Paused' : 'In progress'}
                </p>
                <span className="text-xs text-ink-soft">· {formatTime(elapsedSec)}</span>
              </div>
              {!locked && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTogglePause}
                    className="rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
                  >
                    {sessionPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFinishConfirm(true)}
                    className="rounded-full bg-terracotta px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-terracotta/90"
                  >
                    Finish Debrief
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {userTranscript && (
                <div className="rounded-xl bg-mint-tint/60 px-4 py-2.5 text-sm text-ink">
                  <p className="text-xs font-semibold uppercase tracking-wide text-forest">You</p>
                  <p className="mt-1">{userTranscript}</p>
                </div>
              )}
              {lastAssistant && (
                <div className="rounded-xl border border-hairline bg-cream px-4 py-2.5 text-sm whitespace-pre-wrap text-ink">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Coach</p>
                  <p className="mt-1">{lastAssistant.text}</p>
                </div>
              )}
              <ThinkingIndicator active={sending} />

              {lastAssistant && !sending && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSend('Tell me more about that.')}
                    disabled={locked || turnCapHit}
                    className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600 disabled:opacity-50"
                  >
                    Tell me more
                  </button>
                  {currentTimestampSec != null && (
                    <button
                      type="button"
                      onClick={() => setShowTranscriptWindow((v) => !v)}
                      className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
                    >
                      {showTranscriptWindow ? 'Hide the evidence' : 'Show me the evidence'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onSend('How could I improve this?')}
                    disabled={locked || turnCapHit}
                    className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600 disabled:opacity-50"
                  >
                    Help me improve this
                  </button>
                  <button
                    type="button"
                    onClick={handleChangeTopic}
                    disabled={locked}
                    className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600 disabled:opacity-50"
                  >
                    Let's discuss another moment
                  </button>
                </div>
              )}

              {pickingTopic && (
                <div className="rounded-xl border border-terracotta/30 bg-peach-tint/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">
                      What would you like to talk about next?
                    </p>
                    <button
                      type="button"
                      onClick={handleCancelTopicPicker}
                      className="text-xs font-medium text-ink-soft hover:text-ink"
                    >
                      Keep going
                    </button>
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    {starterPrompts.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => handlePickTopic(`Let's switch to another moment: ${p.label}.`, p.timestampSec ?? null)}
                        className="rounded-xl border border-hairline bg-cream-card px-4 py-2.5 text-left text-sm text-ink transition-colors hover:border-terracotta/40"
                      >
                        {p.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handlePickTopic('Can we talk about how the lesson felt to me overall?', null)}
                      className="rounded-xl border border-hairline bg-cream-card px-4 py-2.5 text-left text-sm text-ink transition-colors hover:border-terracotta/40"
                    >
                      How the lesson felt overall
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePickTopic("I'd like to talk about something else from this lesson.", null)}
                      className="rounded-xl border border-hairline bg-cream-card px-4 py-2.5 text-left text-sm text-ink transition-colors hover:border-terracotta/40"
                    >
                      Something else on my mind
                    </button>
                  </div>
                </div>
              )}

              {showTranscriptWindow && currentTimestampSec != null && (
                <div className="rounded-xl border border-hairline bg-cream p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    Transcript around {formatTime(currentTimestampSec)}
                  </p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {buildTranscriptWindow(segments, currentTimestampSec).map((s) => (
                      <p key={s.id} className="text-sm text-ink-soft">
                        <span className="font-semibold text-ink">{s.speakerLabel}:</span> {s.text}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {(reflectError || voiceFatalError) && (
              <p className="mt-3 text-sm text-terracotta-600">{reflectError?.message ?? voiceFatalError}</p>
            )}

            {voiceMode ? (
              <div className="mt-4 flex flex-col gap-3 border-t border-hairline pt-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      isSpeaking || sending || transcribing ? 'animate-pulse bg-terracotta' : 'bg-ink-soft'
                    }`}
                  />
                  <p className="text-sm text-ink-soft">{sessionPaused ? 'Paused' : voiceStatus}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      muted
                        ? 'border-terracotta bg-peach-tint text-terracotta-600'
                        : 'border-hairline text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
                    }`}
                  >
                    {muted ? 'Unmute coach' : 'Mute coach'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSwitchToTyping}
                    className="rounded-full border border-hairline px-3.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
                  >
                    Type instead
                  </button>
                </div>
                {locked ? (
                  <p className="text-xs text-ink-soft">This report is locked — the conversation is read-only.</p>
                ) : turnCapHit ? (
                  <p className="text-xs text-ink-soft">You've reached today's reflection limit for this session.</p>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 border-t border-hairline pt-4">
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
                      disabled={sending || locked || turnCapHit || sessionPaused}
                      className="flex-1 rounded-lg border border-hairline bg-cream px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={sending || locked || turnCapHit || sessionPaused || !draft.trim()}
                      className="rounded-full bg-terracotta px-4 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
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
                      className="flex items-center gap-1.5 text-xs font-semibold text-forest hover:text-terracotta-600"
                    >
                      <MicIcon className="h-3.5 w-3.5" />
                      Talk instead
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

      {showFinishConfirm && (
        // A custom dialog rather than this app's usual window.confirm — the
        // design calls for specific, non-default button labels
        // ("Continue Debrief" / "Finish and Create Summary"), which a
        // native confirm() can't provide.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4"
          onClick={() => setShowFinishConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-cream-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-heading text-lg font-bold text-forest">Finish this debrief?</h3>
            <p className="mt-1.5 text-sm text-ink-soft">
              Your coach will write your debrief and save it. You can come back any time, carry on the
              conversation, and it will be rewritten.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowFinishConfirm(false)}
                className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
              >
                Continue Debrief
              </button>
              <button
                type="button"
                onClick={handleFinish}
                className="rounded-lg bg-terracotta px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-terracotta/90"
              >
                Finish and write my debrief
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/// Clarity & Content is one narrative now: Content Specialist Notes.
///
/// It used to be a list of separate detections — topic-term clouds, the stated
/// objective, real-world connections, defined vocabulary, then a notes block —
/// each of which could read "None detected" while the lesson plainly contained
/// the thing. A teacher tying ratios to cooking saw "Real-world connections:
/// none". Everything still detected feeds the narrative instead of being
/// listed beside it, so the section says what a subject specialist who
/// listened would say, about the content and about how it was delivered.
const CONTENT_NOTE_LABEL_STYLES: Record<string, string> = {
  'What worked': 'bg-mint-tint/60 text-forest',
  'Where it could go further': 'bg-gold-tint text-terracotta-600',
  'Worth double-checking': 'bg-peach-tint text-terracotta-600',
  // Labels from before specialist notes were strengths-and-next-steps.
  Clarity: 'bg-mint-tint/60 text-forest',
  Vocabulary: 'bg-mint-tint/60 text-forest',
  'Engagement with content': 'bg-mint-tint/60 text-forest',
}
/// Content Specialist Notes, and nothing else.
///
/// The section used to list separate detections — topic-term clouds, the
/// stated objective, real-world connections, defined vocabulary — each of
/// which could read "None detected" while the lesson plainly contained the
/// thing. The subject expertise is what a teacher came here for; the page
/// closes with the same Discuss action every other page does.
function LessonContentTab({
  lessonContent,
  contentNotes,
  narrative,
  isShort,
  sending,
  error,
  onGenerate,
}: {
  lessonContent: AudioLessonContent | null
  contentNotes: AudioContentNotes | null
  narrative: string | null
  isShort: boolean
  sending: boolean
  error: string | null
  onGenerate: () => void
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const visibleNotes = contentNotes?.notes.filter((n) => !dismissed.has(n.id)) ?? []
  const connections = lessonContent?.connections ?? []

  const connectionIdeas = lessonContent?.connectionIdeas ?? contentNotes?.connectionIdeas ?? []

  return (
    <div className="flex flex-col gap-5">
      {/* Every other Insights page opens with its paragraph; this one opened
          with a bare heading and a button. */}
      {narrative && <CoachNote text={narrative} />}

      {/* Only when the lesson actually contained one. The old section printed
          "None detected" over a lesson built on a cooking example, which said
          more about the detector than the teaching — so silence is the right
          answer when nothing was found. */}
      {connections.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
            Real-world / prior-knowledge connections
          </h2>
          {connections.map((c) => (
            <div key={`${c.timestampSec}-${c.quote.slice(0, 24)}`} className="rounded-xl border border-hairline bg-cream-card p-4">
              <p className="text-sm text-ink">"{c.quote}"</p>
              <p className="mt-1 text-xs text-ink-soft">{formatTime(c.timestampSec)}</p>
            </div>
          ))}
        </div>
      )}

      {connectionIdeas.length > 0 && (
        <div className="rounded-xl border border-hairline bg-gold-tint/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">
            Ways into this topic · ideas for next time
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Suggestions from a specialist in {lessonContent?.subject || contentNotes?.subject || 'this subject'}, not a
            reading of your lesson.
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5">
            {connectionIdeas.map((idea) => (
              <li key={idea.slice(0, 32)} className="text-sm text-ink">
                {idea}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Content Specialist Notes</h2>
      {/* Offered for every lesson. This used to be hidden whenever no subject
          was detected, which a keyword scan of ~45 words decided — so a lesson
          on moon phases was told it had no subject-specific content. The
          server answers if a recording really caught too little to work from. */}
      {!contentNotes ? (
        <>
          <button
            type="button"
            onClick={onGenerate}
            disabled={sending}
            className="self-start rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
          >
            {sending ? 'Generating...' : 'Generate content specialist notes'}
          </button>
          <WorkingRing active={sending} estimatedMs={14000} label="Writing content specialist notes" className="text-forest" />
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-ink-soft">
            These notes are generated from a short audio excerpt and may miss context. They're meant as a starting
            point for your own reflection, not a factual review — please use your own subject expertise as the
            final word.
          </p>
          {isShort && (
            <p className="text-xs font-semibold text-terracotta-600">
              This session is under {Math.round(SHORT_SESSION_THRESHOLD_SEC / 60)} minutes — content feedback from a
              short sample is especially limited.
            </p>
          )}
          {(contentNotes.misconceptions ?? []).length > 0 && (
            <div className="rounded-xl border border-hairline bg-mint-tint/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-forest">
                Teaching this topic · where students usually get stuck
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                Subject knowledge about {contentNotes.subject || 'this topic'}, not a reading of your lesson — you may
                well have covered it.
              </p>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5">
                {(contentNotes.misconceptions ?? []).map((m) => (
                  <li key={m.slice(0, 32)} className="text-sm text-ink">
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Notes are written once and kept. Without this, a teacher whose
              notes were written by an older version of the specialist had no
              way to ask for the current one. */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onGenerate}
              disabled={sending}
              className="self-start text-sm font-medium text-ink-soft hover:text-terracotta-600 disabled:opacity-60"
            >
              {sending ? 'Writing new notes...' : 'Write these notes again ↻'}
            </button>
          </div>
          <WorkingRing active={sending} estimatedMs={16000} label="Writing content specialist notes" className="text-forest" />
          {visibleNotes.length === 0 ? (
            <p className="text-sm text-ink-soft">No notes to show.</p>
          ) : (
            visibleNotes.map((note) => (
              <div key={note.id} className="rounded-xl border border-hairline bg-cream-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${CONTENT_NOTE_LABEL_STYLES[note.label] ?? 'bg-cream text-ink-soft'}`}
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
      {error && <p className="text-sm text-terracotta-600">{error}</p>}
    </div>
  )
}

// On demand only — nothing here is built until the teacher asks, and once
// built it's kept (see the /:id/rubric-lens route). Never shows a level.
function RubricLensTab({
  rubricLens,
  locked,
  isShort,
  sending,
  error,
  onGenerate,
}: {
  rubricLens: AudioRubricLens | null
  locked: boolean
  isShort: boolean
  sending: boolean
  error: string | null
  onGenerate: () => void
}) {
  if (!rubricLens) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-hairline bg-cream-card p-6">
          <p className="font-heading text-lg font-bold text-forest">See this lesson through the Danielson Framework</p>
          <p className="mt-2 text-sm text-ink">
            Rubric Lens sorts what your recording captured under Danielson's Domain 2 (Learning Environments) and
            Domain 3 (Learning Experiences). For each component you get the moments that show it and one next step to
            try.
          </p>
          <ul className="mt-3 flex flex-col gap-1 text-sm text-ink-soft">
            <li>· Evidence and next steps only. It never gives a level or a score.</li>
            <li>· Only what audio can show. Anything visual, like room setup, is left out.</li>
            <li>· Only you see it.</li>
          </ul>
          {locked ? (
            <p className="mt-5 text-sm text-ink-soft">This report is locked, so a rubric lens can't be added to it.</p>
          ) : (
            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={onGenerate}
                disabled={sending}
                className="self-start rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
              >
                {sending ? 'Building your rubric lens...' : 'View through Danielson rubric'}
              </button>
              <WorkingRing active={sending} estimatedMs={30000} label="Matching your lesson to the framework" className="text-forest" />
            </div>
          )}
        </div>
        {error && <p className="text-sm text-terracotta-600">{error}</p>}
      </div>
    )
  }

  const domains = [...new Set(rubricLens.components.map((c) => c.domain))]

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-dashed border-hairline p-4 text-xs text-ink-soft">
        {rubricLens.frameworkName}, Domains 2 and 3. This organizes what your recording captured under each component.
        It isn't a rating, and a thin section only means audio couldn't show much there, not that it didn't happen.
        {isShort && (
          <span className="mt-1 block font-semibold text-terracotta-600">
            This session is under {Math.round(SHORT_SESSION_THRESHOLD_SEC / 60)} minutes, so there is less evidence to
            work with.
          </span>
        )}
      </div>

      {/* A colour band per domain, but no numbers of our own: the framework
          already numbers its components (2a, 3b...), and a second count
          beside those could read as a score. */}
      {domains.map((domain, i) => (
        <section key={domain} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className={`h-7 w-1.5 shrink-0 rounded-full ${ACCENT_CYCLE[i % ACCENT_CYCLE.length].band}`} />
            <h3 className="font-heading text-lg font-bold leading-tight text-forest">{domain}</h3>
          </div>
          {rubricLens.components
            .filter((c) => c.domain === domain)
            .map((component) => (
              <div key={component.code} className="rounded-2xl border border-hairline bg-cream-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-gold px-2 py-0.5 text-xs font-bold text-forest">{component.code}</span>
                  <p className="font-heading text-base font-bold text-forest">{component.name}</p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      component.audibility === 'strong' ? 'bg-mint-tint/60 text-forest' : 'bg-cream text-ink-soft'
                    }`}
                  >
                    {component.audibility === 'strong' ? 'Audio shows this well' : 'Audio shows part of this'}
                  </span>
                </div>
                <p className="mt-3 text-sm text-ink">{component.summary}</p>
                {component.evidence.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {component.evidence.map((item, i) => (
                      <div key={i} className="border-l-2 border-gold/60 pl-3">
                        <p className="text-sm text-ink">"{item.text}"</p>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {formatTime(item.timestampSec)} · {item.kind}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {component.nextStep && (
                  <div className="mt-4 rounded-xl bg-gold-tint/50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Next step to try</p>
                    <p className="mt-1 text-sm text-ink">{component.nextStep}</p>
                  </div>
                )}
              </div>
            ))}
          {rubricLens.notObservable
            .filter((c) => c.domain === domain)
            .map((c) => (
              <div key={c.code} className="rounded-2xl border border-dashed border-hairline p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-hairline px-2 py-0.5 text-xs font-bold text-ink-soft">{c.code}</span>
                  <p className="font-heading text-base font-bold text-ink-soft">{c.name}</p>
                </div>
                <p className="mt-2 text-sm text-ink-soft">Not in a recording. {c.reason}</p>
              </div>
            ))}
        </section>
      ))}
    </div>
  )
}

function ClimateRoutinesTab({
  transitionMetric,
  nameMentionMetric,
  climateNarrative,
  directiveLog,
  toneLog,
  redirectionLog,
  segments,
}: {
  transitionMetric: ReturnType<typeof getCountMetric>
  nameMentionMetric: ReturnType<typeof getCountMetric>
  climateNarrative: string | null
  directiveLog: AudioDirectiveLogEntry[] | null
  toneLog: AudioToneLogEntry[] | null
  redirectionLog: AudioRedirectionLogEntry[] | null
  segments: TranscriptSegment[]
}) {
  const [showAllEvidence, setShowAllEvidence] = useState(false)


  const directiveCandidates: NoticeCandidate[] = (directiveLog ?? []).map((entry, i) => ({
    id: `directive-log-${i}`,
    observation: 'Clear direction',
    whyItMatters: 'Clear, specific directions help students know exactly what to do next.',
    timestampSec: entry.timestampSec,
    excerpt: entry.text,
    durationSec: null,
    weight: 0,
    focusMetric: 'directiveCount',
  }))
  const positiveCandidates: NoticeCandidate[] = (toneLog ?? [])
    .filter((entry) => entry.kind === 'positive')
    .map((entry, i) => ({
      id: `positive-log-${i}`,
      observation: 'Positive language',
      whyItMatters: "Naming what's going well reinforces it and helps build trust.",
      timestampSec: entry.timestampSec,
      excerpt: entry.text,
      durationSec: null,
      weight: 0,
      focusMetric: 'toneRatio',
    }))
  const redirectionCandidates: NoticeCandidate[] = (redirectionLog ?? []).map((entry, i) => ({
    id: `redirection-log-${i}`,
    observation: 'Redirection',
    whyItMatters: 'A brief, direct redirection keeps the lesson moving without dwelling on it.',
    timestampSec: entry.timestampSec,
    excerpt: entry.text,
    durationSec: null,
    weight: 0,
    focusMetric: 'redirectionCount',
  }))
  // One example of each kind shown first, so a teacher sees real variety
  // before expanding — not three of whichever kind happens to be most
  // frequent in a row.
  const firstOfEach = [directiveCandidates[0], positiveCandidates[0], redirectionCandidates[0]].filter(
    (c): c is NoticeCandidate => c != null,
  )
  const remaining = [
    ...directiveCandidates.slice(1),
    ...positiveCandidates.slice(1),
    ...redirectionCandidates.slice(1),
  ].sort((a, b) => (a.timestampSec ?? 0) - (b.timestampSec ?? 0))
  const evidenceCandidates = [...firstOfEach, ...remaining]
  const visibleCandidates = showAllEvidence ? evidenceCandidates : firstOfEach

  const hasTransitionEvidence = transitionMetric.state === 'measured'
  const hasNameEvidence = nameMentionMetric.state === 'measured'
  const strengthText = hasTransitionEvidence
    ? hasNameEvidence
      ? 'You used concise transition language and frequently addressed students by name.'
      : 'You used concise transition language to mark the shifts between activities.'
    : hasNameEvidence
      ? 'You frequently addressed students by name.'
      : null

  return (
    <div className="flex flex-col gap-6">
      {/* Narrative first. The counters here match fixed phrases, so on a
          well-run lesson most of them are zero — "turn and talk for thirty
          seconds" is a clear direction that "clear directions: 0" does not
          recognise. Leading with numbers that are artefacts of the detector
          taught teachers to read their own lesson as a list of failures, so
          the numbers card is gone and what is left is what was actually
          heard. */}
      {climateNarrative && <CoachNote text={climateNarrative} />}

      {evidenceCandidates.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-ink">Evidence from the transcript</h3>
          <p className="mt-0.5 text-sm text-ink-soft">Your own words, at the moment you said them.</p>
          <div className="mt-3 flex flex-col gap-4">
            {visibleCandidates.map((candidate) => (
              <EvidenceItemCard
                key={candidate.id}
                candidate={candidate}
                segments={segments}
              />
            ))}
          </div>
          {evidenceCandidates.length > firstOfEach.length && (
            <button
              type="button"
              onClick={() => setShowAllEvidence((v) => !v)}
              className="mt-3 w-full rounded-xl border border-hairline bg-cream-card px-4 py-3 text-sm font-semibold text-forest transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
            >
              {showAllEvidence ? 'Show fewer moments' : `Show all ${evidenceCandidates.length} moments`}
            </button>
          )}
        </div>
      )}

      {/* Full width. This was a two-column grid built for a pair of cards; with
          one card in it the next step sat in a half-width column beside empty
          space, narrower than everything above it. */}
      <div className="flex flex-col gap-6">
        {strengthText && (
          <div className="rounded-2xl border border-hairline bg-cream-card p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-forest">Strength to keep</p>
            <p className="mt-2 text-sm text-ink">{strengthText}</p>
          </div>
        )}

        <div className="rounded-2xl border border-hairline bg-cream-card p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-forest">One next step</p>
          <p className="mt-2 text-sm text-ink">
            At one transition, give students three pieces of information: what to do, how long they have, and what
            should be ready when time ends.
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Example: "With your partner, identify one example of the change we discussed. You have 60 seconds. Be
            ready to support your answer with a quotation."
          </p>
        </div>
      </div>
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
      <div className="rounded-2xl border border-hairline bg-cream-card p-6">
        <h3 className="text-sm font-semibold text-ink">Talk flow across the lesson</h3>
        <div className="mt-3">
          <HatchedBar label="Talk flow unavailable this session." className="h-6 rounded-lg" />
        </div>
      </div>
    )
  }
  const bins = buildPacingTimeline(segments, durationSec)
  return (
    <div className="rounded-2xl border border-hairline bg-cream-card p-6">
      <h3 className="text-sm font-semibold text-ink">Talk flow across the lesson</h3>
      <div className="mt-3 flex h-6 w-full overflow-hidden rounded-lg">
        {bins.map((bin, i) =>
          bin === 'unavailable' ? (
            <div key={i} className="h-full flex-1" style={HATCH_STYLE} />
          ) : (
            // Same teacher/student colors as TalkParticipationBar below, so
            // the timeline and the distribution bar read as one consistent
            // color language rather than two different "student" colors.
            <div key={i} className={`h-full flex-1 ${bin === 'teacher' ? 'bg-terracotta' : 'bg-gold'}`} />
          ),
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-soft">
        <span>0:00</span>
        <span>{formatTime(durationSec)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-terracotta" /> Teacher-heavy
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-gold" /> Student-heavy
        </span>
        <span className="flex items-center gap-1.5">
          {/* Not labeled "unclear audio" — this bucket also covers genuine
              silence (think-time, quiet reading), which the pipeline has
              no way to tell apart from audio that just didn't diarize. */}
          <HatchedSwatch /> No dominant speaker
        </span>
      </div>
    </div>
  )
}

// Chart #3 — Questioning & Thinking Mix: the only two question types this
// app actually detects are recall and higher-order (see questionLog/
// higherOrderQuestionCount in audioAnalysis.ts) — shown as fractions, matching
// this report's existing small-N convention, never a percentage.
// Small "i" hover/focus tooltip — same pattern already established in
// AdminDashboard.tsx, reused here verbatim rather than a new convention.
function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={0}
        aria-label={text}
        className="flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-ink-soft/40 text-[9px] font-semibold text-ink-soft"
      >
        i
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-56 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  )
}

// One stacked bar (Recall / Higher-order, same visual language as
// TalkParticipationBar's Teacher/Student segments) instead of two
// separate bars — makes the split easier to compare at a glance.
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
  const recallCount = unavailable ? 0 : totalCount - higherOrderCount
  const recallPct = unavailable || totalCount === 0 ? 0 : Math.round((recallCount / totalCount) * 100)
  const higherOrderPct = unavailable || totalCount === 0 ? 0 : Math.round((higherOrderCount / totalCount) * 100)
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-semibold text-ink">Questioning mix</h3>
        <InfoTooltip text="Higher-order questions invite students to analyze, justify, interpret, connect, evaluate, or create — not simply remember information." />
      </div>
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
        <div className="mt-3">
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-cream">
            <div className="h-full bg-gold" style={{ width: `${recallPct}%` }} />
            <div className="h-full bg-terracotta" style={{ width: `${higherOrderPct}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-gold" /> Recall · {recallCount} · {recallPct}%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-terracotta" /> Higher-order · {higherOrderCount} ·{' '}
              {higherOrderPct}%
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// Shared by "Review an exchange" and the "Longest teacher-talk stretch"
// card below — a highlight with the real transcript turns around it
// (since there's no audio to play back, the transcript itself is the
// evidence) plus a "why it matters" line and a way to bring it into a
// live conversation with Coach.
function TranscriptEvidenceCard({
  candidate,
  segments,
  questionLog,
}: {
  candidate: NoticeCandidate
  segments: TranscriptSegment[]
  questionLog: AudioQuestionLogEntry[] | null
}) {
  // Each highlight type has its own precise, reconstructable exchange — a
  // generic time window either misses the real span (a monologue) or can't
  // tell which nearby line is actually part of it (a follow-up question's
  // root question and answer aren't always close enough to guess at).
  const window =
    candidate.timestampSec == null
      ? []
      : candidate.observation === 'Longest uninterrupted teacher monologue'
        ? buildMonologueExchange(segments, candidate.timestampSec, candidate.durationSec ?? 0)
        : candidate.observation === 'Follow-up / probing question'
          ? buildFollowUpExchange(segments, questionLog, candidate.timestampSec)
          : buildTranscriptWindow(segments, candidate.timestampSec)
  return (
    <div className="rounded-2xl border border-hairline bg-cream-card p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-forest">
        {formatCandidateHeadline(candidate)}
      </p>
      {window.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {window.map((s, i) => (
            <p key={i} className="text-sm text-ink">
              <span className="font-medium">{s.speakerLabel}:</span> "{s.text}"
            </p>
          ))}
        </div>
      ) : (
        candidate.excerpt && <p className="mt-2 text-sm text-ink">"{candidate.excerpt}"</p>
      )}
      <p className="mt-2 text-sm text-ink-soft">{candidate.whyItMatters}</p>
      {/* The page carries one Discuss action at its end — see DiscussFooter. */}
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
  onDiscussWithCoach,
}: {
  session: AudioSessionWithSegments
  teacherTalkMetric: ReturnType<typeof getPresenceMetric>
  studentTalkMetric: ReturnType<typeof getPresenceMetric>
  silencePct: number | null
  silenceMetric: ReturnType<typeof getPresenceMetric>
  studentSegmentsMetric: ReturnType<typeof getCountMetric>
  focusMetric: FocusMetric | null
  talkInsight: string | null
  onDiscussWithCoach: (candidate: NoticeCandidate) => void
}) {
  const exampleCandidate = highlightCandidates(
    session.highlights,
    'Follow-up / probing question',
    'talk-exchange',
    0,
    'Following up on a student answer pushes their thinking further instead of stopping at the first response.',
  )[0]
  const monologueCandidate = highlightCandidates(
    session.highlights,
    'Longest uninterrupted teacher monologue',
    'talk-monologue',
    0,
    'A long stretch without a break in teacher talk is a natural spot to build in a check-in or a question.',
  )[0]

  return (
    <div className="flex flex-col gap-6">
      <p className="flex items-center gap-2 rounded-xl border border-hairline bg-cream px-4 py-2.5 text-xs text-ink-soft">
        <LockIcon className="h-3.5 w-3.5 shrink-0" />
        Audio is never saved — it's sent once for transcription and discarded immediately. Only the transcript and
        these insights are kept.
      </p>

      {/* Narrative first, as in every other section: the reading before the
          numbers it was drawn from. */}
      {talkInsight && <CoachNote text={talkInsight} />}

      <PacingTimeline segments={session.segments} durationSec={session.durationSec} />

      {/* Talk distribution — the stats and the bar used to show the same
          three percentages twice, once as text and once as a bar+legend. */}
      <div className="rounded-2xl border border-hairline bg-cream-card p-6">
        <h2 className="flex items-baseline justify-between text-sm font-semibold uppercase tracking-wide text-ink-soft">
          <span>Talk distribution</span>
          <span className="text-xs font-normal normal-case text-ink-soft">
            {categoryCoverage([teacherTalkMetric, studentTalkMetric, silenceMetric, studentSegmentsMetric])}
          </span>
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div id="stat-talkRatio">
            <Stat
              label="Teacher talk"
              value={session.teacherTalkPct != null ? `${session.teacherTalkPct}%` : teacherTalkMetric.display}
              muted={isMissingState(teacherTalkMetric.state)}
              reason={teacherTalkMetric.reason}
              focused={focusMetric === 'talkRatio'}
            />
          </div>
          <Stat
            label="Student talk"
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
            label="Student speaking moments"
            value={studentSegmentsMetric.display}
            muted={isMissingState(studentSegmentsMetric.state)}
            reason={studentSegmentsMetric.reason}
          />
        </div>
        <div className="mt-4">
          <TalkParticipationBar
            teacherPct={session.teacherTalkPct}
            studentPct={session.studentTalkPct}
            silencePct={silencePct}
          />
        </div>
        <p className="mt-4 border-t border-hairline pt-3 text-xs text-ink-soft">
          "Student speaking moments" counts separate moments student voice was detected — not the number of
          individual students who participated. Talk time describes the recording; it doesn't show how many
          students took part or whether they were engaged.
        </p>
      </div>

      {talkInsight && (
        <div>
          <button
            type="button"
            onClick={() =>
              onDiscussWithCoach({
                id: 'talk-balance',
                observation: 'Talk balance this session',
                whyItMatters: talkInsight,
                timestampSec: null,
                excerpt: null,
                durationSec: null,
                weight: 0,
                focusMetric: 'talkRatio',
              })
            }
            className="mt-2 text-sm font-medium text-forest hover:text-terracotta-600"
          >
            Reflect on talk balance →
          </button>
        </div>
      )}

      {exampleCandidate && (
        <div>
          <h3 className="text-sm font-semibold text-ink">Review an exchange</h3>
          <div className="mt-2">
            <TranscriptEvidenceCard
              candidate={exampleCandidate}
              segments={session.segments}
              questionLog={session.questionLog}
            />
          </div>
        </div>
      )}

      {monologueCandidate && (
        <TranscriptEvidenceCard
          candidate={monologueCandidate}
          segments={session.segments}
          questionLog={session.questionLog}
        />
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
      <h3 className="text-sm font-semibold text-ink">Measured wait times</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {waits.map((w, i) => (
          <span key={i} className="rounded-lg border border-hairline bg-cream px-3 py-1.5 text-sm font-medium text-ink">
            {w}s
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-soft">Average: {mean} seconds.</p>
      <p className="mt-1.5 text-sm text-ink-soft">Try next: {FOCUS_METRIC_TRY_NEXT.avgWaitTime}</p>
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
  waitTimeSampleCount,
  thinkingTaskCount,
  focusMetric,
  questioningInsight,
  highlights,
}: {
  questionCount: number | null
  questionLog: AudioQuestionLogEntry[] | null
  questionsMetric: ReturnType<typeof getCountMetric>
  higherOrderRatio: ReturnType<typeof formatRatio> | null
  higherOrderCount: number | null
  followUpMetric: ReturnType<typeof getCountMetric>
  waitTimeMetric: ReturnType<typeof getPresenceMetric>
  avgWaitTimeSec: number | null
  waitTimeSampleCount: number | null
  thinkingTaskCount: number | null
  focusMetric: FocusMetric | null
  questioningInsight: string | null
  highlights: AudioHighlight[] | null
}) {
  const [expanded, setExpanded] = useState(false)
  // Older sessions predate waitTimeSampleCount; their root-question count is the best available.
  const measurableWaitCount = waitTimeSampleCount ?? (questionLog ?? []).filter((q) => q.waitTimeSec != null).length
  const strengthCandidate = highlightCandidates(
    highlights,
    'Follow-up / probing question',
    'questions-strength',
    0,
    'Following up on a student answer pushes their thinking further instead of stopping at the first response.',
  )[0]

  return (
    <div className="flex flex-col gap-6">
      {/* Narrative first, as in every other section. */}
      {questioningInsight && <CoachNote text={questioningInsight} />}

      <p className="text-sm text-ink-soft">
        {questionCount != null
          ? `You asked ${questionCount} question${questionCount === 1 ? '' : 's'} this session.`
          : 'No question data for this session.'}
      </p>

      <CategorySection
        title="The numbers"
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
        <div id="stat-higherOrderCount">
          <Stat
            label="Higher-order questions"
            value={higherOrderCount != null ? String(higherOrderCount) : '—'}
            muted={higherOrderCount == null}
            reason={higherOrderCount == null ? 'This session was analyzed before questions were classified.' : undefined}
            sub={higherOrderRatio && higherOrderCount != null ? `${higherOrderRatio.display} of your questions` : undefined}
          />
        </div>
        {/* A lesson can be built on reasoning without a single higher-order
            question in it — a simulation task can ask for more thinking than
            anything said out loud did. */}
        <Stat
          label="Thinking tasks"
          value={thinkingTaskCount != null ? String(thinkingTaskCount) : '—'}
          muted={thinkingTaskCount == null}
          reason={
            thinkingTaskCount == null
              ? 'This session was analyzed before thinking tasks were read from the transcript.'
              : undefined
          }
          sub="Things students had to reason through"
        />
        <Stat
          label="Your follow-up questions"
          value={followUpMetric.display}
          muted={isMissingState(followUpMetric.state)}
          reason={followUpMetric.reason}
          focused={focusMetric === 'followUpQuestionCount'}
        />
        <div id="stat-avgWaitTime">
          <Stat
            label="Your avg. wait time"
            value={avgWaitTimeSec != null ? `${avgWaitTimeSec}s` : waitTimeMetric.display}
            muted={isMissingState(waitTimeMetric.state)}
            reason={waitTimeMetric.reason}
            sub={
              !isMissingState(waitTimeMetric.state) && measurableWaitCount > 0
                ? `Based on ${measurableWaitCount} measurable question-response interval${measurableWaitCount === 1 ? '' : 's'}`
                : undefined
            }
            focused={focusMetric === 'avgWaitTime'}
          />
        </div>
      </CategorySection>

      <QuestioningMixChart
        higherOrderCount={higherOrderCount}
        totalCount={questionCount}
        state={higherOrderRatio?.state ?? 'not_measurable'}
      />

      <div>
        {strengthCandidate && (
          <div className="mt-3 rounded-xl border border-hairline bg-cream-card p-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-forest">Strength to keep</span>
            <p className="mt-1 text-sm text-ink">{formatCandidateHeadline(strengthCandidate)}</p>
            {strengthCandidate.excerpt && (
              <p className="mt-1 text-sm text-ink-soft">"{strengthCandidate.excerpt}"</p>
            )}
          </div>
        )}
      </div>

      <WaitTimeChips questionLog={questionLog} />

      {questionLog === null ? (
        <div className="rounded-2xl border border-dashed border-hairline p-6 text-center text-sm text-ink-soft">
          Not available for this session — analyzed before per-question detail was tracked.
        </div>
      ) : !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-start rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
        >
          Show question sequences
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Question sequences</h3>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-sm font-medium text-ink-soft hover:text-ink"
            >
              Hide
            </button>
          </div>
          {questionLog.length === 0 ? (
            <p className="text-sm text-ink-soft">No individual questions were detected this session.</p>
          ) : (
            questionLog.map((q, i) => (
              <div key={i} className="rounded-xl border border-hairline bg-cream-card p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  <span>Initial question</span>
                  <span>{formatTime(q.timestampSec)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      q.type === 'higher_order' ? 'bg-mint-tint/60 text-forest' : 'bg-cream text-ink-soft'
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
                  <div className="mt-2 flex flex-col gap-1.5 border-l-2 border-hairline pl-3">
                    {q.followUps.map((f, j) => (
                      <p key={j} className="text-sm text-ink-soft">
                        <span className="text-xs font-semibold uppercase tracking-wide">
                          Follow-up · {formatTime(f.timestampSec)}
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

      <div className="rounded-2xl border border-hairline bg-cream-card p-6">
        <span className="inline-block rounded-full bg-mint-tint/60 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-forest">
          One next step
        </span>
        <p className="mt-3 text-sm text-ink">
          Choose one recall question and follow it with: "What makes you say that?" or "What evidence supports your
          thinking?"
        </p>
      </div>
    </div>
  )
}

const CFU_DETECTION_LIMITATION =
  'Spoken checks only — hand signals and written work are invisible to a recording.'


function specificFeedbackShare(specificFeedbackCount: number | null, feedbackTotal: number | null): number | null {
  if (specificFeedbackCount == null || feedbackTotal == null || feedbackTotal <= 0) return null
  return specificFeedbackCount / feedbackTotal
}

type UnderstandingNextStep = {
  headline: string
  example: string
  discussLabel: string
  discussWhyItMatters: string
}

function buildUnderstandingNextStep(feedbackShare: number | null): UnderstandingNextStep {
  if (feedbackShare != null && feedbackShare < 0.5) {
    return {
      headline: 'Name something specific the next time you give feedback.',
      example: 'Instead of "good job," point to the exact thing a student did well or should reconsider.',
      discussLabel: 'Feedback specificity this session',
      discussWhyItMatters: "Let's talk through how to make feedback more specific next time.",
    }
  }
  return {
    headline: 'At one transition point, ask students to restate the key idea in their own words before moving on.',
    example:
      'A quick verbal check — like "in one sentence, explain what we just covered" — takes seconds and surfaces confusion early.',
    discussLabel: 'Checking for understanding this session',
    discussWhyItMatters: "Let's talk through where to build in a quick check for understanding.",
  }
}

function EvidenceItemCard({
  candidate,
  segments,
}: {
  candidate: NoticeCandidate
  segments: TranscriptSegment[]
}) {
  // Both kinds of evidence here are one precise, real exchange — not a
  // window of surrounding talk, which in a densely-packed transcript can
  // sweep in unrelated lines (an unconnected question-and-answer that
  // just happens to fall nearby in time) that make a single moment look
  // like it's citing several.
  const isFeedback = candidate.observation === 'Specific feedback'
  const window =
    candidate.timestampSec == null
      ? []
      : isFeedback
        ? buildFeedbackExchange(segments, candidate.timestampSec)
        : buildSingleTurnExchange(segments, candidate.timestampSec)
  return (
    <div className="rounded-2xl border border-hairline bg-cream-card p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-forest">
        {formatCandidateHeadline(candidate)}
      </p>
      {window.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {window.map((s, i) => (
            <p key={i} className="text-sm text-ink">
              <span className="font-medium">{s.speakerLabel}:</span> "{s.text}"
            </p>
          ))}
        </div>
      ) : (
        candidate.excerpt && <p className="mt-2 text-sm text-ink">"{candidate.excerpt}"</p>
      )}
      <p className="mt-2 text-sm text-ink-soft">{candidate.whyItMatters}</p>
      {/* The page carries one Discuss action at its end — see DiscussFooter. */}
    </div>
  )
}

function UnderstandingFeedbackTab({
  checksNarrative,
  cfuLog,
  feedbackLog,
  segments,
  specificFeedbackCount,
  feedbackTotal,
}: {
  checksNarrative: string | null
  cfuLog: AudioCfuLogEntry[] | null
  feedbackLog: AudioFeedbackLogEntry[] | null
  segments: TranscriptSegment[]
  specificFeedbackCount: number | null
  feedbackTotal: number | null
}) {
  const [showAllEvidence, setShowAllEvidence] = useState(false)
  const feedbackShare = specificFeedbackShare(specificFeedbackCount, feedbackTotal)

  const cfuCandidates: NoticeCandidate[] = (cfuLog ?? []).map((entry, i) => ({
    id: `cfu-log-${i}`,
    observation: 'Check for understanding',
    whyItMatters: entry.whatItChecked,
    timestampSec: entry.timestampSec,
    excerpt: entry.text,
    durationSec: null,
    weight: 0,
    focusMetric: 'cfuCount',
  }))
  const feedbackCandidates: NoticeCandidate[] = (feedbackLog ?? [])
    .filter((entry) => entry.kind === 'specific')
    .map((entry, i) => ({
      id: `feedback-log-${i}`,
      observation: 'Specific feedback',
      whyItMatters:
        "Naming something specific in a student's response gives clearer information than general praise alone.",
      timestampSec: entry.timestampSec,
      excerpt: entry.text,
      durationSec: null,
      weight: 0,
      focusMetric: 'feedbackSpecificity',
    }))
  const evidenceCandidates = [...cfuCandidates, ...feedbackCandidates].sort(
    (a, b) => (a.timestampSec ?? 0) - (b.timestampSec ?? 0),
  )
  const visibleCandidates = showAllEvidence ? evidenceCandidates : evidenceCandidates.slice(0, 1)

  const nextStep = buildUnderstandingNextStep(feedbackShare)

  return (
    <div className="flex flex-col gap-6">
      {/* Narrative first, and no numbers card. "3 verbal checks" and "6 of 11"
          are counts of fixed phrases — a check made by reading over shoulders
          leaves no trace — so leading with them put a detector's blind spots
          at the top of a teacher's own lesson. The narrative says when the
          checks happened and what the feedback did with a student's answer,
          which is the part worth reading first. */}
      {checksNarrative && <CoachNote text={checksNarrative} />}

      {evidenceCandidates.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-ink">Evidence from the lesson</h3>
          <p className="mt-0.5 text-sm text-ink-soft">
            Your own words, at the moment you said them. {CFU_DETECTION_LIMITATION}
          </p>
          <div className="mt-3 flex flex-col gap-4">
            {visibleCandidates.map((candidate) => (
              <EvidenceItemCard
                key={candidate.id}
                candidate={candidate}
                segments={segments}
              />
            ))}
          </div>
          {evidenceCandidates.length > 1 && (
            <button
              type="button"
              onClick={() => setShowAllEvidence((v) => !v)}
              className="mt-3 w-full rounded-xl border border-hairline bg-cream-card px-4 py-3 text-sm font-semibold text-forest transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
            >
              {showAllEvidence ? 'Show fewer moments' : `Show all ${evidenceCandidates.length} moments`}
            </button>
          )}
        </div>
      )}

      {/* "Strength to keep" printed the specific-feedback ratio for a third
          time on one screen, and the Summary tab already names a strength. */}
      <div>
        <div className="rounded-2xl border border-hairline bg-cream-card p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-forest">One next step</p>
          <p className="mt-2 text-sm text-ink">{nextStep.headline}</p>
          <p className="mt-1 text-sm text-ink-soft">{nextStep.example}</p>
          {/* One Discuss action per page — see DiscussFooter. */}
        </div>
      </div>
    </div>
  )
}

/// One way to reach the coach, at the end of a page.
///
/// Every card used to carry its own — "Discuss with Wivoza" under each piece
/// of evidence, "Plan a check with Wivoza", "Plan a transition with Wivoza" —
/// so a single screen offered the same action five times in five wordings.
/// Repeating an invitation does not make it more inviting.
/// The narrative a teacher is looking at on an Insights sub-page, handed to
/// Coach so "Discuss this" opens about that page rather than about the lesson
/// in the abstract. Clarity & Content has notes rather than a narrative, so
/// its own text is joined instead.
function narrativeForSection(session: AudioSession, section: InsightsSection): string | null {
  switch (section) {
    case 'talk':
      return session.talkNarrative ?? null
    case 'questions':
      return [session.questionsNarrative, session.checksNarrative].filter(Boolean).join(' ') || null

    case 'routines':
      return session.climateNarrative ?? null
    case 'content': {
      const notes = session.contentNotes?.notes ?? []
      return notes.length > 0 ? notes.map((n) => `${n.label}: ${n.text}`).join(' ') : null
    }
    default:
      return null
  }
}

function DiscussFooter({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 w-full rounded-2xl border border-hairline bg-cream-card px-5 py-4 text-left text-sm font-semibold text-forest transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
    >
      {label} →
    </button>
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
  const accent = useContext(SectionAccentContext)
  return (
    <div>
      <h2 className="flex items-baseline justify-between text-sm font-semibold uppercase tracking-wide text-ink-soft">
        <span>{title}</span>
        <span className="text-xs font-normal normal-case text-ink-soft">{coverage}</span>
      </h2>
      <div className={`mt-3 grid grid-cols-2 gap-4 rounded-2xl ${accent.chip} p-6 sm:grid-cols-3`}>
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
  label: React.ReactNode
  value: string
  sub?: string
  muted?: boolean
  reason?: string
  focused?: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
        {focused && (
          <span className="rounded-full bg-mint-tint/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-forest">
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
  // Transcription runs on the server, so this row is where a teacher who shut
  // the laptop the moment they pressed Stop finds out how it is going.
  const transcribeProgress = useTranscriptionProgress(session)
  const status =
    session.status === 'locked'
      ? { label: 'Locked', className: 'bg-cream text-ink-soft' }
      : session.status === 'analyzed'
        ? { label: 'Ready to review', className: 'bg-mint-tint text-forest' }
        : session.status === 'transcribing'
          ? {
              label: `Processing · ${Math.round(transcribeProgress)}%`,
              className: 'bg-gold-tint text-forest',
            }
          : session.status === 'failed'
            ? { label: "Couldn't process", className: 'bg-peach-tint text-terracotta-600' }
            : session.status === 'tagging'
              ? { label: 'Identify your voice', className: 'bg-gold-tint text-forest' }
              : { label: 'In progress', className: 'bg-gold-tint text-forest' }
  return (
    <div className="group flex items-center justify-between gap-4 rounded-2xl border border-hairline bg-cream-card p-4 transition-colors hover:border-terracotta/40 sm:p-5">
      <button type="button" onClick={onOpen} className="flex flex-1 items-center gap-4 text-left">
        <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-forest text-gold sm:flex">
          <MicIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-heading text-base font-bold text-forest">
            {sessionTitle(session)}
            {session.period ? <span className="text-terracotta"> · {session.period}</span> : ''}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>{status.label}</span>
            <span>{formatSessionDateTime(session.sessionDate)}</span>
            {session.teacherTalkPct != null && <span>· {session.teacherTalkPct}% teacher talk</span>}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 text-xs font-medium text-ink-soft hover:text-terracotta-600"
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

  // A lower teacher share alone doesn't mean more student voice — it also
  // drops when more of a recording is silence or goes uncaptured (once shown
  // as "more room for student voice" with students at 0% in every session).
  // Only credit students when their own share actually rose.
  const withTalk = sessions.filter((s) => s.teacherTalkPct != null && s.studentTalkPct != null)
  if (withTalk.length >= 3) {
    const first = withTalk[0]
    const last = withTalk[withTalk.length - 1]
    const teacherDelta = last.teacherTalkPct! - first.teacherTalkPct!
    const studentDelta = last.studentTalkPct! - first.studentTalkPct!
    if (teacherDelta <= -8 && studentDelta >= 5) {
      return `Your talk time is down ${Math.abs(Math.round(teacherDelta))} points since your first tracked session, and students' is up ${Math.round(studentDelta)} — more room for student voice.`
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
