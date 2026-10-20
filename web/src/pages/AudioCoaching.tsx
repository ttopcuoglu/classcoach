import { cloneElement, createContext, isValidElement, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowUpIcon, ChatBubbleIcon, ChecklistIcon, HeartIcon, KebabIcon, MicIcon, PlayIcon } from '../components/icons'
import BroughtStudentsIn from '../components/BroughtStudentsIn'
import TalkFlowStrip, { FLOW_COLOR, type ShareSlice } from '../components/TalkFlowStrip'
import { DashedLinePoint, NoDataLabel } from '../components/unavailableChart'
import { UpgradeMessage } from '../components/UpgradeMessage'
import { ProgressRing, ThinkingIndicator, WorkingRing } from '../components/ProgressRing'
import { NumberedCard } from '../components/AnswerSection'
import { ACCENT_CYCLE, ACCENTS, type Accent } from '../components/report'
import { useVoiceTurn } from '../hooks/useVoiceTurn'
import { useSimulatedProgress } from '../hooks/useSimulatedProgress'
import { UPLOAD_STAGE, transcribeEstimateSec, transcribeHint, transcribeStage } from '../lib/transcribeStages'
import { HATCH_STYLE } from '../lib/chartPatterns'
import { FOCUS_METRIC_GROUPS, FOCUS_METRIC_LABELS } from '../lib/focusMetrics'
import { setPlanningPrefill } from '../lib/communicationsPrefill'
import { MIN_STRETCH_TO_SHOW_SEC, longestTeacherStretch } from '../lib/teacherStretch'
import { createPlaybackQueue, primeAudioElement, splitIntoSentences, type PlaybackQueue } from '../lib/voicePlayback'
import {
  createAudioSession,
  deleteAudioSession,
  generateClassSummary,
  generateHardLook,
  generateMomentToRevisit,
  generateNextSteps,
  generateRubricLens,
  getAudioSession,
  getAudioSessions,
  getProfile,
  streamReflectMessage,
  summarizeReflectConversation,
  tagSpeakers,
  startTranscription,
  getSpeakerSamples,
  updateAudioSession,
  updateProfile,
  generateContentNotes,
  type AudioContentNotes,
  type AudioHighlight,
  type AudioLessonContent,
  type AudioReflectMessage,
  type AudioTeachingMoves,
  type AudioHardLook,
  type AudioRubricLens,
  type AudioSession,
  type AudioSessionWithSegments,
  type ApiError,
  type FocusMetric,
  type ReflectChatErrorKind,
  type SpeakerSample,
  type TalkVoice,
  type TranscriptSegment,
} from '../lib/api'
import { THIN_AUDIBLE_SHARE_PCT, useCaptureMonitor } from '../hooks/useCaptureMonitor'
import {
  buildEvidenceQualityLine,
  formatRatio,
  getCoverage,
  getCountMetric,
  getFollowUpMetric,
  feedbackMeasurable,
  getPresenceMetric,
  hasEnoughWaitTimeSamples,
  isMissingState,
  judgeTalkBalance,
  MIN_DURATION_FOR_CFU_DETECTION_SEC,
  MIN_N_FOR_PERCENT,
  MIN_WAIT_TIME_SAMPLES,
  TINY_RECORDING_THRESHOLD_SEC,
  SHORT_SESSION_THRESHOLD_SEC,
  STUDENT_TALK_CAVEAT,
  waitTimeMetric as waitTimeMetricOf,
  type ConfidentMetric,
  type TalkBalanceJudgment,
  leadingSilenceNote,
  CONVERSATIONAL_WPM,
} from '../lib/reportConfidence'
import { buildNextTimeItems, type NoticeCandidate } from '../lib/reportHighlights'

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
  const hasRunningJob = sessions.some((s) => s.status === 'transcribing' || s.status === 'analyzing')
  useEffect(() => {
    if (!hasRunningJob) return
    const poll = window.setInterval(() => {
      getAudioSessions().then(setSessions).catch(() => {})
    }, 5000)
    return () => window.clearInterval(poll)
  }, [hasRunningJob])

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
  if (session.status === 'analyzing') {
    return (
      <AnalyzingPanel
        session={session}
        onUpdate={onUpdate}
        onFailed={(message) => onUpdate({ ...session, status: 'tagging', failureReason: message })}
      />
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
  // The same stream as streamRef, in state, because the capture monitor is a
  // hook and a ref change does not re-run it.
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null)
  // The audible share as it stood when the teacher pressed Stop. Shown while
  // the upload runs — the last moment they are looking at this screen, and
  // the only chance to say "do not trust the report you are about to get"
  // before it arrives looking authoritative.
  const [thinCaptureSharePct, setThinCaptureSharePct] = useState<number | null>(null)
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
  // What the mic is actually picking up, live. A teacher who can see the bar
  // move knows the phone is hearing them; one who cannot is told so while
  // they are still in the room and can move it.
  const capture = useCaptureMonitor(liveStream, phase === 'recording')

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
      setLiveStream(stream)
      setThinCaptureSharePct(null)
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
    // Both read before the monitor is torn down by setLiveStream(null).
    const levelTrace = capture.trace
    setThinCaptureSharePct(
      capture.audibleSharePct != null && capture.audibleSharePct < THIN_AUDIBLE_SHARE_PCT
        ? capture.audibleSharePct
        : null,
    )

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
    })
    recorder.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setLiveStream(null)
    await stopped

    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'audio/webm' })
    chunksRef.current = []
    uploadDurationRef.current = finalElapsed
    setPhase('uploading')
    setError(null)
    try {
      await startTranscription(session.id, blob, finalElapsed, levelTrace)
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

          {phase === 'uploading' && thinCaptureSharePct != null && (
            <div className="w-full max-w-sm rounded-xl border border-gold/50 bg-gold/10 p-3">
              <p className="text-xs text-cream">
                The microphone heard sound for only about {thinCaptureSharePct}% of this recording, so the report from
                it is likely to be thin. Next time, keeping the phone on you rather than on a desk is the single biggest
                difference.
              </p>
            </div>
          )}

          {phase === 'recording' && (
            <div className="w-full max-w-xs">
              {/* Deliberately a plain level bar and not a verdict. It shows
                  loudness, which catches a phone in a bag or across the room
                  — not a loud room that will still transcribe to nothing. */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-cream/20">
                <div
                  className="h-full rounded-full bg-cream transition-[width] duration-100"
                  style={{ width: `${Math.max(2, capture.level)}%` }}
                />
              </div>
              <p className="mt-2 text-center text-[11px] text-cream/60">
                {capture.unavailable
                  ? 'Recording — input level unavailable in this browser.'
                  : capture.warnQuiet
                    ? 'Hearing almost nothing for the last minute. Is the phone near you and uncovered?'
                    : 'What the microphone is picking up'}
              </p>
            </div>
          )}

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
/// Waiting on the analysis, which runs server-side. Same shape as
/// TranscribingPanel below and for the same reason: the job outlives the
/// request that started it, so the page polls rather than holds a connection.
function AnalyzingPanel({
  session,
  onUpdate,
  onFailed,
}: {
  session: AudioSessionWithSegments
  onUpdate: (s: AudioSessionWithSegments) => void
  onFailed: (message: string) => void
}) {
  useEffect(() => {
    let cancelled = false
    const startedAt = Date.now()
    const poll = window.setInterval(async () => {
      try {
        const latest = await getAudioSession(session.id)
        if (cancelled || latest.status === 'analyzing') {
          // The server's own sweep releases a job whose process died; this is
          // only so a page left open overnight stops asking.
          if (!cancelled && Date.now() - startedAt > 20 * 60 * 1000) {
            window.clearInterval(poll)
            onFailed('The analysis did not finish. Please try again.')
          }
          return
        }
        if (latest.status === 'analyzed' || latest.status === 'locked') onUpdate(latest)
        else onFailed(latest.failureReason ?? 'The analysis did not finish. Please try again.')
      } catch {
        // A failed poll changes nothing — the job is server-side and the next
        // tick picks the answer up.
      }
    }, 4000)
    return () => {
      cancelled = true
      window.clearInterval(poll)
    }
  }, [session.id, onUpdate, onFailed])

  return (
    <div className="rounded-3xl bg-forest p-8 text-center text-cream">
      <div className="flex justify-center text-gold">
        <WorkingRing active estimatedMs={30000} label="Reading your lesson" hint="Usually under a minute." />
      </div>
      <p className="mt-5 text-sm text-cream/80">
        You can close this page — the report keeps building, and it will be waiting for you here.
      </p>
    </div>
  )
}

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
      await tagSpeakers(session.id, Array.from(selected))
      // Straight into the analyzing panel, which polls. The request only
      // starts the work now, so there is nothing left to wait for here.
      onUpdate({ ...session, status: 'analyzing', failureReason: null })
    } catch {
      // The tagging may still have landed before the connection broke, so ask
      // what actually happened before blaming it.
      try {
        const latest = await getAudioSession(session.id)
        if (latest.status !== 'tagging') {
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
      {session.failureReason && <p className="mt-2 text-sm text-terracotta-600">{session.failureReason}</p>}
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

type ReportTab = 'summary' | 'insights' | 'specialist' | 'rubric' | 'reflect' | 'growth'
// Four sections, organised by how much a microphone can actually hear.
// Everything the teacher says is captured well; everything that depends on
// students answering out loud is not. Questioning and checking were two
// sections that failed together whenever the room was quiet, leaving a
// teacher reading two apologies for one cause — they are one section with two
// halves now, and Rubric Lens is a lens over the whole report rather than a
// section competing with them.
type InsightsSection = 'talk' | 'questions' | 'content' | 'routines' | 'topic'
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
  // Ideas for teaching the subject, not a read of the lesson — so it is not
  // one of the Insights sections, which are.
  { key: 'specialist', label: 'Content Specialist' },
  // A whole-report view, like every tab here except Insights — which is why it
  // sits at this level. It spent a while at the foot of the Insights column,
  // where a report-scoped thing repeated under all four sections and belonged
  // to none of them, and a teacher who came looking for it had to scroll a
  // section to the end to find it.
  { key: 'rubric', label: 'Rubric lens' },
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
  routines: { n: 4, blurb: 'Directions, praise and redirections, as they sounded.', accent: ACCENTS.terracotta },
  // Lavender, the colour this page always used for ideas that are not a read
  // of the lesson.
  topic: {
    n: 5,
    blurb: 'A specialist’s ideas for teaching this subject.',
    accent: { band: 'bg-[#6E62A0]', chip: 'bg-[#ECE8F4]', tint: 'bg-[#ECE8F4]/50', ink: 'text-[#6E62A0]' },
  },
}

// Lets the stat groups inside a section tint themselves with that section's
// colour without every Insights tab having to pass it down by hand.
const SectionAccentContext = createContext<Accent>(ACCENTS.mint)

function InsightsSectionHeader({ section, inCard }: { section: InsightsSection; inCard?: boolean }) {
  const meta = INSIGHTS_SECTION_META[section]
  const label = section === 'topic' ? 'Content Specialist' : (INSIGHTS_SECTIONS.find((s) => s.key === section)?.label ?? '')
  return (
    <div className={`${inCard ? '' : 'mb-6 '}flex items-center gap-4`}>
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${meta.accent.band} font-heading text-xl font-bold text-cream`}
      >
        {section === 'topic' ? '✦' : meta.n}
      </span>
      <div>
        <h2 className="font-heading text-2xl font-extrabold leading-tight text-forest">{label}</h2>
        <p className="mt-0.5 text-sm text-ink-soft">{meta.blurb}</p>
      </div>
    </div>
  )
}

/// The sections as pills across the top; each opens as its own page.
const INSIGHTS_PILL_LABEL: Record<InsightsSection, string> = {
  talk: 'Talk & Participation',
  questions: 'Questioning',
  content: 'Clarity',
  routines: 'Climate',
  topic: 'Content Specialist',
}

function InsightsNav({ section, onSelect }: { section: InsightsSection; onSelect: (s: InsightsSection) => void }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Insights sections">
      {INSIGHTS_SECTIONS.map(({ key }) => {
        const on = section === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-current={on ? 'page' : undefined}
            className={`flex items-center gap-2 rounded-full border bg-cream-card py-1.5 pl-1.5 pr-3.5 text-sm transition-colors ${
              on ? 'border-forest font-semibold text-forest' : 'border-hairline text-ink hover:border-forest/40'
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${INSIGHTS_SECTION_META[key].accent.band} text-xs font-bold text-cream`}
            >
              {INSIGHTS_SECTION_META[key].n}
            </span>
            {INSIGHTS_PILL_LABEL[key] ?? key}
          </button>
        )
      })}
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

// Coach-voice interpretations of the category stats — deterministic
// templates, no Claude call (the analysis-time notes generation was
// removed for exactly this reason: two independent AI summaries of the
// same numbers felt redundant). Each returns null when the underlying
// metric's state is a missing one — never comment on missing data.
// Every talk-balance sentence in the app routes through judgeTalkBalance
// (reportConfidence.ts) so "balanced" can never be said when student talk is
// a confirmed zero — the old version here branched only on teacherTalkPct
// and could say "fairly balanced... students at 0%."
// A microphone cannot tell a discussion from a room talking over itself.
// Both raise the student share and both produce many short student turns, and
// for a while this file read the second as proof of the first: a loud,
// unmanaged class was told it had "a lot of real student voice in the room"
// and "real back-and-forth". The praise fired most readily in exactly the case
// it should not, because students only out-talk a teacher on the recording
// when they are loud enough and close enough to register.
//
// So talk time is reported here and never appraised. What the share means
// needs to know whether the talk was about the lesson, which is what
// studentTalkFocus answers; until that is present, the honest sentence states
// the split and stops.
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
      return `Students had ${judgment.studentPct}% of the talk time today, against your ${judgment.teacherPct}% — a recording can't tell discussion from people talking over each other, so this is a share, not a verdict.`
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
      sentence = `${sentence ?? ''} Students were audible in ${count} separate moment${count === 1 ? '' : 's'}.`.trim()
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

/// The opening of a note: whole sentences, up to about three lines of text.
/// Always at least one sentence, however long it runs.
function noteOpening(text: string): string {
  const sentences = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/)
  let opening = sentences[0] ?? ''
  for (const sentence of sentences.slice(1, 3)) {
    if (opening.length + sentence.length + 1 > 330) break
    opening += ` ${sentence}`
  }
  return opening
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

// Fixed tie-break order so ranking is deterministic across renders.



// Deliberately restricted to Overview's own three categories (talk,
// questioning, checking-understanding) plus highlights — Climate & Routines
// metrics have no FocusMetric key today, so including them would break "Set
// as my focus" wiring and require extending FocusMetric/My Growth, which is
// out of scope here.

// Always shows a duration and a timestamp as two distinct, explicitly
// labeled things — never a bare "label · 0:38" that leaves it ambiguous
// whether the number is how long something lasted or when it happened.

// One card inside the "Evidence from the lesson" section — the Summary's
// single growth-oriented pick (the focus-aware top priority), with the
// "Set as my focus" shortcut when it maps to a trended My Growth metric.
// The moment comes from a read of the transcript (the server's
// momentToRevisit.ts), not from ranking the report's counts — that ranking put
// "longest monologue" on almost every lesson. Three of the four statuses are
// the read declining to name one, and each says why rather than leaving a gap
// the teacher has to interpret.


/// The quiet / could-not-make-out split as percentages of the recording,
/// from the seconds the analysis stored. Null whenever there is no envelope
/// behind it, which is every recording made before envelopes existed — the
/// combined "Silence or other" slice is the honest answer there.
function nonSpeechSplit(
  metricsDetail: AudioSessionWithSegments['metricsDetail'],
  durationSec: number | null,
): { quietPct: number; unresolvedPct: number } | null {
  const quiet = metricsDetail?.quietSec
  const unresolved = metricsDetail?.unresolvedSec
  if (quiet == null || unresolved == null || !durationSec || durationSec <= 0) return null
  return { quietPct: (quiet / durationSec) * 100, unresolvedPct: (unresolved / durationSec) * 100 }
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
  const [hardLookOpen, setHardLookOpen] = useState(false)
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
  // Coach's reply as it is written, so the teacher reads the first sentence
  // while the rest is still coming instead of watching an indicator.
  const [reflectStreaming, setReflectStreaming] = useState<string | null>(null)
  const [reflectError, setReflectError] = useState<{ kind: ReflectChatErrorKind; message: string } | null>(null)
  const [reflectDraft, setReflectDraft] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [summarizeError, setSummarizeError] = useState<string | null>(null)
  const [contentNotesSending, setContentNotesSending] = useState(false)
  const [contentNotesError, setContentNotesError] = useState<string | null>(null)
  const [rubricLensSending, setRubricLensSending] = useState(false)
  const [rubricLensError, setRubricLensError] = useState<string | null>(null)
  const [hardLookSending, setHardLookSending] = useState(false)
  const [hardLookError, setHardLookError] = useState<string | null>(null)
  const [classSummarySending, setClassSummarySending] = useState(false)
  // Re-tagging an analyzed report: null until the teacher asks for it.
  const [retagSpeakers, setRetagSpeakers] = useState<SpeakerSample[] | null>(null)
  const [retagLoading, setRetagLoading] = useState(false)
  const [retagError, setRetagError] = useState<string | null>(null)
  const hasAttemptedClassSummaryRef = useRef(false)
  const hasAttemptedMomentRef = useRef(false)
  // Only the setter: the read still runs for "Try next time", but nothing
  // shows a pending state for it now that the Evidence card has gone.
  const [, setMomentSending] = useState(false)
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
      const updated = await streamReflectMessage(session.id, { context, spoken }, (sentence) =>
        setReflectStreaming((prev) => (prev ? `${prev} ${sentence}` : sentence)),
      )
      onUpdate({ ...session, ...updated })
    } catch (err) {
      const kind = (err as { kind?: ReflectChatErrorKind })?.kind ?? 'other'
      setReflectError({ kind, message: (err as Error).message })
    } finally {
      setReflectSending(false)
      setReflectStreaming(null)
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
      const updated = await streamReflectMessage(
        session.id,
        { message: trimmed, context: [...extraContext, ...reflectContext], spoken },
        (sentence) => setReflectStreaming((prev) => (prev ? `${prev} ${sentence}` : sentence)),
      )
      onUpdate({ ...session, ...updated })
    } catch (err) {
      const kind = (err as { kind?: ReflectChatErrorKind })?.kind ?? 'other'
      setReflectError({ kind, message: (err as Error).message })
      if (!usingOverride) setReflectDraft(trimmed)
    } finally {
      setReflectSending(false)
      setReflectStreaming(null)
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

  // Content Specialist Notes used to wait for a button. They feed "Try next
  // time" on Summary, so a report without them is asked for them once, on
  // opening — quietly: if this fails the button in Clarity & Content is still
  // there and says why when pressed.
  const hasAttemptedContentNotesRef = useRef(false)
  useEffect(() => {
    if (locked || session.contentNotes != null || hasAttemptedContentNotesRef.current) return
    hasAttemptedContentNotesRef.current = true
    setContentNotesSending(true)
    generateContentNotes(session.id)
      .then((updated) => onUpdate({ ...session, ...updated }))
      .catch(() => {})
      .finally(() => setContentNotesSending(false))
  }, [locked, session, onUpdate])

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

  async function handleGenerateHardLook() {
    setHardLookSending(true)
    setHardLookError(null)
    try {
      const updated = await generateHardLook(session.id)
      onUpdate({ ...session, ...updated })
    } catch (err) {
      setHardLookError((err as Error).message || 'Could not finish the hard look. Please try again.')
    } finally {
      setHardLookSending(false)
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

  // The same arrangement for the moment to revisit: new reports arrive with
  // one, and a report analyzed before it existed is read the first time its
  // Summary is opened. The server keeps whatever comes back, so this is one
  // read per lesson, ever.
  useEffect(() => {
    if (tab !== 'summary' || locked || session.momentToRevisit != null || hasAttemptedMomentRef.current) return
    hasAttemptedMomentRef.current = true
    setMomentSending(true)
    generateMomentToRevisit(session.id)
      .then((updated) => onUpdate({ ...session, ...updated }))
      .catch(() => {})
      .finally(() => setMomentSending(false))
  }, [tab, locked, session, onUpdate])

  // And for "Try next time": a report summarized before those lines existed
  // gets them written from the notes it already has, the first time it is
  // opened. Waits for the summary, which brings its own on new reports.
  const hasAttemptedNextStepsRef = useRef(false)
  useEffect(() => {
    if (locked || session.nextSteps != null || session.classSummary == null || hasAttemptedNextStepsRef.current) return
    hasAttemptedNextStepsRef.current = true
    generateNextSteps(session.id)
      .then((updated) => onUpdate({ ...session, ...updated }))
      .catch(() => {})
  }, [locked, session, onUpdate])

  // The hard read of one section, as the last row under the evidence it was
  // drawn from. Null on a locked report that never had one.
  const sectionHardLook =
    locked && !session.hardLook ? null : (
      <SectionHardLook
        section={insightsSection}
        hardLook={session.hardLook}
        locked={locked}
        sending={hardLookSending}
        error={hardLookError}
        onGenerate={handleGenerateHardLook}
      />
    )

  // Discuss the section on screen with the coach, opened about THIS page.
  const discussSection = (section: InsightsSection) =>
    handleDiscussWithCoach({
      id: `insights-${section}`,
      observation: `${section === 'topic' ? 'Content Specialist' : (INSIGHTS_SECTIONS.find((s) => s.key === section)?.label ?? 'This section')} in this lesson`,
      whyItMatters: "Let's talk through what this part of the report showed.",
      timestampSec: null,
      excerpt: null,
      durationSec: null,
      weight: 0,
      focusMetric: null,
      // The words the teacher just read, so the coach opens about
      // THIS page rather than about the lesson in general. Without
      // it the coach only ever got the section's name.
      detail: narrativeForSection(session, section) ?? undefined,
    })
  const discussThisSection = () => discussSection(insightsSection)

  const metrics = session.metricsDetail ?? {}
  const recordedSec = session.durationSec ?? 0
  const coverage = getCoverage(session.durationSec, session.phases, session.metricsDetail)
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
  const directiveMetric = getCountMetric({ count: num('directiveCount'), recordedSec })

  // Climate & Tone
  const redirectionMetric = getCountMetric({ count: num('redirectionCount'), recordedSec })
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

  // Summary's "My Focus" card — maps the teacher's chosen focus to its
  // backing metric and the matching already-computed coach-voice sentence.

  // Computed once here (not per-tab) so the shared header can show it on
  // every tab, not just Summary.
  const evidenceQuality = buildEvidenceQualityLine(coverage, [
    teacherTalkMetric,
    studentTalkMetric,
    silenceMetric,
    studentSegmentsMetric,
    questionsMetric,
    followUpMetric,
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
          onUpdate={onUpdate}
          talkInsight={talkInsight}
          questioningInsight={questioningInsight}
          cfuInsight={cfuInsight}
          classSummary={session.classSummary}
          classSummarySending={classSummarySending}
          hardLookDoor={
            locked && !session.hardLook ? null : (
              <div className="flex flex-col gap-3 rounded-2xl border border-hairline bg-cream-card p-4">
                <button
                  type="button"
                  onClick={() => setHardLookOpen((open) => !open)}
                  className="flex items-center justify-between gap-3 text-left"
                >
                  <span>
                    <span className="text-sm font-semibold text-forest">The Hard Look</span>
                    <span className="ml-2 text-xs text-ink-soft">
                      The least generous honest reading of the whole lesson. For when you want it straight.
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-terracotta-600">{hardLookOpen ? 'Hide' : 'Show'}</span>
                </button>
                {hardLookOpen && (
                  <HardLookTab
                    hardLook={session.hardLook}
                    locked={locked}
                    sending={hardLookSending}
                    error={hardLookError}
                    onGenerate={handleGenerateHardLook}
                  />
                )}
              </div>
            )
          }
          onNavigateInsights={(section) => handleViewSource('insights', '', section)}
          onDiscussWithCoach={handleDiscussWithCoach}
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
          streamingReply={reflectStreaming}
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
        <div className="flex flex-col gap-5">
          <InsightsNav section={insightsSection} onSelect={setInsightsSection} />
          <div className="min-w-0">
            {/* Heading first, always. The two lenses used to sit above it, so
                choosing "Talk & Participation" showed two unrelated cards and
                then, fourth down the page, the heading for the thing you had
                just chosen — with its name already printed in the picker above.
                Lenses now come after the content they are lenses on. */}
            {/* Talk & Participation carries its own header, inside its card. */}
            <SectionAccentContext.Provider value={INSIGHTS_SECTION_META[insightsSection].accent}>
            {insightsSection === 'talk' && (
              <TalkParticipationTab
                session={session}
                silencePct={silencePct}
                talkInsight={talkInsight}
                lastRow={sectionHardLook}
                onDiscuss={discussThisSection}
              />
            )}

            {insightsSection === 'questions' && (
              <QuestioningCheckingTab
                session={session}
                questioningInsight={questioningInsight}
                nextStep={session.nextSteps?.questions}
                lastRow={sectionHardLook}
                onDiscuss={discussThisSection}
              />
            )}

            {insightsSection === 'content' && (
              <LessonContentTab
                lessonContent={session.lessonContent}
                contentNotes={session.contentNotes}
                teachingMoves={session.teachingMoves ?? null}
                narrative={session.contentNarrative ?? null}
                lastRow={sectionHardLook}
                onDiscuss={discussThisSection}
              />
            )}

            {insightsSection === 'routines' && (
              <ClimateRoutinesTab
                session={session}
                climateNarrative={session.climateNarrative ?? null}
                nextStep={session.nextSteps?.climate}
                lastRow={sectionHardLook}
                onDiscuss={discussThisSection}
              />
            )}


            {/* Talk & Participation has this in its card's footer. */}

            </SectionAccentContext.Provider>
          </div>
        </div>
      )}

      {tab === 'specialist' && (
        <SectionAccentContext.Provider value={INSIGHTS_SECTION_META.topic.accent}>
          <TopicTab
            lessonContent={session.lessonContent}
            contentNotes={session.contentNotes}
            isShort={coverage.isShort}
            sending={contentNotesSending}
            error={contentNotesError}
            onGenerate={handleGenerateContentNotes}
            onDiscuss={() => discussSection('topic')}
          />
        </SectionAccentContext.Provider>
      )}

      {/* Its own tab rather than a card inside Insights: it reads the whole
          lesson against a framework whose nine components do not map onto the
          four sections, so unlike the Hard Look it cannot be split across
          them. Nothing is collapsed here — a teacher who opened this tab has
          already said what they want. */}
      {tab === 'rubric' && (
        <RubricLensTab
          rubricLens={session.rubricLens}
          locked={locked}
          isShort={coverage.isShort}
          sending={rubricLensSending}
          error={rubricLensError}
          onGenerate={handleGenerateRubricLens}
        />
      )}

      <div className="rounded-xl border border-dashed border-hairline p-4 text-xs text-ink-soft">
        This report reflects what could be heard in your recording — talk patterns, questioning, and classroom
        routines. It doesn't capture lesson planning, materials, physical space, visual engagement, or anything
        outside class time. Automated counts above are suggestions to confirm or edit, not final judgments. Audio is
        never saved: it's sent once for transcription and discarded, and only the transcript and these insights are
        kept.
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
/// Which Try next time item each headline section suggests as the focus, and
/// which Insights section each item opens.
const HEADLINE_SECTION_ITEM: Record<'talk' | 'questions' | 'content' | 'routines', string> = {
  talk: 'talk',
  questions: 'questions',
  content: 'content-further',
  routines: 'climate',
}
const ITEM_SECTION: Record<string, InsightsSection> = {
  talk: 'talk',
  questions: 'questions',
  'content-further': 'content',
  'content-worked': 'content',
  climate: 'routines',
}
/// "Keep doing" is something to keep, not a change to aim at.
const FOCUSABLE = (id: string) => id !== 'content-worked'

/// Try next time: what the report suggests, from every section, in one list —
/// and the hand-off to Planning Coach with the ones the teacher chooses.
function TryNextTimeList({
  session,
  focusText,
  focusId,
  onMakeFocus,
}: {
  session: AudioSessionWithSegments
  focusText?: string | null
  focusId?: string | null
  onMakeFocus: (id: string) => void
}) {
  const navigate = useNavigate()
  // The one focus has its own card above; it goes to planning first.
  const items = buildNextTimeItems(session).filter((item) => item.id !== focusId)
  const [choosing, setChoosing] = useState(false)
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  if (items.length === 0 && !focusText) return null
  const chosen = items.filter((item) => !skipped.has(item.id))

  function toggle(id: string) {
    setSkipped((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function planNextLesson() {
    setPlanningPrefill({
      subject: session.classSubject ?? session.lessonContent?.subject ?? undefined,
      gradeLevel: session.gradeLevel ?? undefined,
      additionalContext: [
        'From the debrief of my last lesson with this class, build these into the plan:',
        ...(focusText ? [`- My one focus: ${focusText}`] : []),
        ...chosen.map((item) => `- ${item.lead ? `${item.lead}: ` : ''}${item.text}`),
      ].join('\n'),
      source: `${sessionTitle(session)}, ${new Date(session.sessionDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
    })
    navigate('/lesson-planning')
  }

  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-peach-tint/70 p-5 sm:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[#8E3F22]">Try next time</p>
        <p className="mt-0.5 text-sm text-ink-soft">
          {focusText ? 'The rest of what this report suggests, alongside your one focus.' : 'What this report suggests, from every section, in one list.'}
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id}>
            <label className={`flex items-start gap-3 ${choosing ? 'cursor-pointer' : ''}`}>
              {choosing && (
                <input
                  type="checkbox"
                  checked={!skipped.has(item.id)}
                  onChange={() => toggle(item.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-forest"
                />
              )}
              <span>
                <span className="block text-xs font-semibold uppercase tracking-wide text-terracotta-600">{item.from}</span>
                <span className="mt-0.5 block text-sm text-ink">{item.text}</span>
                {!choosing && FOCUSABLE(item.id) && (
                  <button
                    type="button"
                    onClick={() => onMakeFocus(item.id)}
                    className="mt-1 text-xs font-semibold text-[#8E3F22] hover:underline"
                  >
                    Make this my focus
                  </button>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="border-t border-[#E8C9B4] pt-4">
        {!choosing ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-sm font-semibold text-ink">Would you like to plan your next class with this in mind?</p>
            <button
              type="button"
              onClick={() => setChoosing(true)}
              className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-cream transition-colors hover:bg-forest/90"
            >
              Yes, choose what to include
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={planNextLesson}
              disabled={chosen.length === 0}
              className="rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
            >
              Plan the next lesson with {chosen.length === items.length ? 'all of these' : `${chosen.length} of these`} →
            </button>
            <button type="button" onClick={() => setChoosing(false)} className="text-sm font-medium text-ink-soft hover:text-ink">
              Not now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryTab({
  session,
  talkInsight,
  questioningInsight,
  cfuInsight,
  classSummary,
  classSummarySending,
  hardLookDoor,
  onNavigateInsights,
  onDiscussWithCoach,
  onUpdate,
}: {
  session: AudioSessionWithSegments
  onUpdate: (s: AudioSessionWithSegments) => void
  talkInsight: string | null
  questioningInsight: string | null
  cfuInsight: string | null
  classSummary: string | null
  classSummarySending: boolean
  /// The whole-lesson Hard Look. It used to open the Insights tab, above the
  /// section a teacher had just chosen; each section still carries its own
  /// part, and the whole of it is asked for here, once.
  hardLookDoor: React.ReactNode
  onNavigateInsights: (section: InsightsSection) => void
  onDiscussWithCoach: (candidate: NoticeCandidate) => void
}) {
  const classSummaryProgress = useSimulatedProgress(classSummarySending, 14000)
  const spotlight = buildSpotlight(talkInsight, questioningInsight, cfuInsight)
  const moves = session.teachingMoves
  const detail = (session.metricsDetail ?? {}) as Record<string, unknown>

  const heard = typeof detail.answersHeardCount === 'number' ? detail.answersHeardCount : null
  const followed = typeof detail.answersFollowedUpCount === 'number' ? detail.answersFollowedUpCount : null

  // One focus: the Try the teacher made their focus; else the one in the
  // section the headline's pattern points to; else questioning, talk, climate
  // in that order. Any Try next time item but "keep doing" can be the focus.
  const tryItems = buildNextTimeItems(session)
  const headlineSection = session.teachingMoves?.headline?.section
  const suggested =
    (headlineSection && tryItems.find((item) => item.id === HEADLINE_SECTION_ITEM[headlineSection])) ||
    tryItems.find((item) => item.id === 'questions') ||
    tryItems.find((item) => item.id === 'talk') ||
    tryItems.find((item) => item.id === 'climate') ||
    null
  const chosenId = session.lessonFocus?.next?.itemId
  const chosenFocus = tryItems.find((item) => item.id === chosenId && FOCUSABLE(item.id)) ?? null
  const focus = chosenFocus ?? suggested
  const focusSection = focus ? ITEM_SECTION[focus.id] : undefined
  const withGoal = focus?.id === 'questions' && heard != null && followed != null && heard >= 3 && followed < heard
  const goalTarget = withGoal ? Math.min(heard!, followed! + 2) : 0
  // Saved with the lesson; shown at once, and put back if the save fails.
  async function chooseFocus(itemId: string | null) {
    const before = session.lessonFocus ?? null
    onUpdate({ ...session, lessonFocus: itemId ? { next: { itemId, chosenAt: new Date().toISOString() } } : null })
    window.scrollTo({ top: 0, behavior: 'smooth' })
    try {
      await updateAudioSession(session.id, { focusItemId: itemId })
    } catch {
      onUpdate({ ...session, lessonFocus: before })
    }
  }

  // The four section cards — each number the one its section leads with.
  const nonSpeech = nonSpeechSplit(session.metricsDetail, session.durationSec)
  const shares = recordingShares(session.teacherTalkPct, session.studentTalkPct, nonSpeech)
  const invitationCount = (moves?.participation?.invitations ?? moves?.invitations ?? []).length
  const questions = classifyQuestions(session)
  const mixCount = (k: MixKey) => questions.filter((q) => q.mix === k).length
  const beyond = mixCount('explain') + mixCount('reasoning')
  const arc = moves?.arc ?? []
  const explanations = (moves?.explanations ?? []).length
  const keyTerms = session.lessonContent?.keyTerms ?? []
  const directions = moves?.directions ?? []
  const complete = directions.filter((d) => d.parts.length === 4).length
  const redirections = moves?.redirections ?? []
  const actionable = redirections.filter((r) => r.clarity === 'actionable').length
  const arcDuration = arc.length > 0 ? arc[arc.length - 1].endSec - arc[0].startSec : 0

  // Keep doing: a reasoning question, else one of the talk moves.
  const reasoningQ = questions.find((q) => q.mix === 'reasoning') ?? questions.find((q) => q.mix === 'explain')
  const keep: KeepLine | null = reasoningQ
    ? {
        text:
          mixCount('reasoning') > 0
            ? `Your “why” questions. ${mixCount('reasoning')} asked students to justify, compare or judge, not just answer.`
            : `${mixCount('explain')} of your questions asked students to explain why or how.`,
        quote: reasoningQ.quote,
        timestampSec: reasoningQ.timestampSec,
      }
    : null

  const sectionCard = (
    n: number,
    color: string,
    title: string,
    section: InsightsSection,
    stat: React.ReactNode,
    viz: React.ReactNode,
    take: string | null,
  ) => (
    <button
      type="button"
      onClick={() => onNavigateInsights(section)}
      className="flex flex-col gap-3 rounded-3xl border-[1.5px] border-transparent bg-cream-card p-5 text-left transition-colors hover:border-hairline"
    >
      <span className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl font-heading text-base font-bold text-cream" style={{ background: color }}>
          {n}
        </span>
        <span className="font-heading text-lg font-bold text-forest">{title}</span>
      </span>
      <span className="font-heading text-3xl font-extrabold leading-none text-forest">{stat}</span>
      <span className="flex h-3.5 gap-1">{viz}</span>
      {take && <span className="text-sm leading-relaxed text-ink">{take}</span>}
      <span className="mt-auto text-sm font-semibold text-terracotta-600">Open {title} →</span>
    </button>
  )
  const hatch = <i className="flex-1 rounded-sm border border-dashed border-[#9C9486]" style={HATCH_STYLE} />

  return (
    <div className="flex flex-col gap-4">
      {/* The lesson summary, whole: what the lesson was about, what went
          well, and what might be worth a look — three paragraphs, at the
          teacher's request, not folded to a line. The short pattern headline
          is not shown; it still picks the suggested focus below. */}
      {classSummary ? (
        <SummaryNoteCard text={classSummary} />
      ) : classSummarySending ? (
        <div className="flex justify-center rounded-3xl bg-mint-tint/70 p-6 text-forest">
          <ProgressRing progress={classSummaryProgress} label="Putting together a summary of this lesson" hint="Reading the whole transcript, not just the start." />
        </div>
      ) : (
        spotlight && <CoachNoteCard text={`${spotlight.headline} ${spotlight.body}`} />
      )}

      {/* Your one focus for next lesson. */}
      {focus && (
        <div className="grid items-center gap-5 rounded-3xl bg-peach-tint p-6 shadow-[6px_6px_0_var(--color-gold)] sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#8E3F22]">Your one focus for next lesson</p>
            <p className="mt-1.5 text-lg leading-relaxed text-ink">{focus.text}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#6E4A3A]">
              {focusSection ? (
                <button type="button" onClick={() => onNavigateInsights(focusSection)} className="hover:underline">
                  From {focus.from.split(' · ').pop()} →
                </button>
              ) : (
                <span>From {focus.from.split(' · ').pop()}</span>
              )}
              <span>
                {chosenFocus
                  ? 'Your choice'
                  : headlineSection && suggested?.id === HEADLINE_SECTION_ITEM[headlineSection]
                    ? 'Suggested: where today’s pattern points'
                    : 'Suggested'}
                {' · '}
                {/* With no suggestion to go back to, the way out is to clear it. */}
                {chosenFocus && suggested?.id !== chosenFocus.id ? (
                  <button type="button" onClick={() => void chooseFocus(null)} className="font-semibold hover:underline">
                    {suggested ? 'Back to the suggestion' : 'Clear my focus'}
                  </button>
                ) : (
                  'pick another from Try next time below'
                )}
              </span>
            </div>
          </div>
          {withGoal && (
            <div className="flex flex-col items-start gap-2">
              <span className="flex max-w-[260px] flex-wrap gap-1.5" role="img" aria-label={`Aim: ${goalTarget} of ${heard} answers followed up, ${followed} today`}>
                {Array.from({ length: heard! }, (_, i) => {
                  const filled = i < followed!
                  const goal = !filled && i < goalTarget
                  return (
                    <i
                      key={i}
                      className={`inline-block h-5 w-5 rounded-full border-2 ${goal ? 'border-dashed' : ''}`}
                      style={{
                        borderColor: filled || goal ? '#B4593A' : '#D8B9A4',
                        background: filled ? '#B4593A' : 'var(--color-cream-card)',
                      }}
                    />
                  )
                })}
              </span>
              <span className="text-sm text-ink-soft">
                {followed} of {heard} followed up today → aim for {goalTarget}
              </span>
            </div>
          )}
        </div>
      )}

      {/* One card per section: one fraction, its own picture, one sentence. */}
      <div className="grid gap-4 sm:grid-cols-2">
        {sectionCard(
          1,
          '#C96A45',
          'Talk & Participation',
          'talk',
          session.teacherTalkPct != null ? (
            <>
              {Math.round(session.teacherTalkPct)}%<small className="ml-1.5 font-sans text-sm font-medium text-ink-soft">of the recording was your voice</small>
            </>
          ) : (
            '—'
          ),
          shares.length > 0
            ? shares.filter((x) => x.pct >= 0.5).map((x) => (
                <i key={x.kind} className="rounded-sm" style={{ flex: x.pct, ...(x.kind === 'unknown' ? HATCH_STYLE : { background: FLOW_COLOR[x.kind as Exclude<typeof x.kind, 'unknown'>] }) }} />
              ))
            : hatch,
          invitationCount > 0 ? `You opened the floor ${invitationCount} time${invitationCount === 1 ? '' : 's'}.` : null,
        )}
        {sectionCard(
          2,
          '#E2BC5C',
          'Questioning & Checking',
          'questions',
          questions.length > 0 ? (
            <>
              {beyond} of {questions.length}
              <small className="ml-1.5 font-sans text-sm font-medium text-ink-soft">questions went beyond recall</small>
            </>
          ) : (
            '—'
          ),
          questions.length > 0
            ? (Object.keys(MIX) as MixKey[])
                .filter((k) => mixCount(k) > 0)
                .map((k) => <i key={k} className="rounded-sm" style={{ flex: mixCount(k), background: MIX[k].color }} />)
            : hatch,
          heard != null && followed != null && heard >= 3 ? `You followed up on ${followed} of ${heard} answers the recording could hear.` : null,
        )}
        {sectionCard(
          3,
          '#1F3A2E',
          'Clarity & Content',
          'content',
          arc.length > 0 ? (
            <>
              {arc.length}
              <small className="ml-1.5 font-sans text-sm font-medium text-ink-soft">
                stages: {arc.map((x) => ARC_ROLE_LABEL[x.role].toLowerCase()).join(' → ')}
              </small>
            </>
          ) : (
            '—'
          ),
          arc.length > 0
            ? arc.map((x, i) => (
                <i key={i} className="rounded-sm" style={{ flex: Math.max(1, x.endSec - x.startSec) / Math.max(1, arcDuration), background: ['#CFC6B4', '#7FAE93', '#1F3A2E', '#2E5E46'][i % 4] }} />
              ))
            : hatch,
          [
            explanations > 0 ? `You opened the content up ${explanations} time${explanations === 1 ? '' : 's'}.` : null,
            keyTerms.length > 0 ? `${keyTerms.filter((t) => t.studentCount > 0).length} of ${keyTerms.length} key terms heard from students.` : null,
          ]
            .filter(Boolean)
            .join(' ') || null,
        )}
        {sectionCard(
          4,
          '#C96A45',
          'Climate & Routines',
          'routines',
          directions.length === 1 ? (
            <>
              {directions[0].parts.length} of 4
              <small className="ml-1.5 font-sans text-sm font-medium text-ink-soft">parts named in your one set of directions</small>
            </>
          ) : directions.length > 1 ? (
            <>
              {complete} of {directions.length}
              <small className="ml-1.5 font-sans text-sm font-medium text-ink-soft">directions named all four parts</small>
            </>
          ) : (
            '—'
          ),
          directions.length > 0
            ? [...directions]
                .sort((x, y) => x.timestampSec - y.timestampSec)
                .map((d, i) => <i key={i} className="flex-1 rounded-sm" style={{ background: d.parts.length === 4 ? '#1F3A2E' : d.parts.length >= 2 ? '#7FAE93' : '#CFC6B4' }} />)
            : hatch,
          redirections.length === 1
            ? actionable === 1
              ? 'Your one redirection told students what to do.'
              : 'Your one redirection said what to stop, not what to do instead.'
            : redirections.length > 1
              ? `${actionable} of ${redirections.length} redirections told students what to do.`
              : null,
        )}
      </div>

      {/* Keep doing. */}
      {keep && (
        <div className="flex flex-col gap-2 rounded-3xl bg-mint-tint/70 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-forest">Keep doing</p>
          <p className="text-base text-ink">{keep.text}</p>
          <p className="text-sm text-ink-soft">
            “{keep.quote}” <span className="font-mono text-xs">{formatTime(keep.timestampSec)}</span>
          </p>
        </div>
      )}

      <TryNextTimeList session={session} focusText={focus?.text} focusId={focus?.id} onMakeFocus={(id) => void chooseFocus(id)} />

      {hardLookDoor}

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <span className="text-sm text-ink-soft">🔒 Audio was used for transcription only and is not stored.</span>
        <DiscussFooter
          compact
          label="Discuss with Wivoza Coach"
          onClick={() =>
            onDiscussWithCoach({
              id: 'summary',
              observation: 'The summary of this lesson',
              whyItMatters: "Let's talk through what this report showed.",
              timestampSec: null,
              excerpt: null,
              durationSec: null,
              weight: 0,
              focusMetric: null,
              detail: classSummary ?? undefined,
            })
          }
        />
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
  // Tiny recordings are tests, not lessons — a one-minute clip and a
  // thirty-nine-minute period sat on the same line as if they were the same
  // kind of thing, and half of a real teacher's recordings are tests.
  const analyzed = sessions
    .filter(
      (s) =>
        s.teacherTalkPct != null &&
        s.durationSec != null &&
        s.durationSec >= TINY_RECORDING_THRESHOLD_SEC,
    )
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

  const cfuFrequency = analyzed.map((s) => {
    const duration = s.durationSec ?? 0
    if (duration < MIN_DURATION_FOR_CFU_DETECTION_SEC) return null
    return Math.round(((s.cfuCount ?? 0) / (duration / 600)) * 10) / 10
  })
  const cfuMax = Math.max(4, ...cfuFrequency.filter((v): v is number => v != null)) * 1.2

  // Plain per-10-minute frequency for phrase-matched counts — none of these
  // have an established minimum-duration detection floor elsewhere in the
  // app (unlike CFUs), so no exclusion beyond having a real duration.
  const followUpFrequency = analyzed.map((s) => perTenMin(s, metricsNum(s, 'followUpQuestionCount')))
  const followUpMax = frequencyMax(followUpFrequency)


  const teacherPace = analyzed.map((s) => metricsNum(s, 'teacherWordsPerMinute'))
  const paceMax = Math.max(220, ...teacherPace.filter((v): v is number => v != null)) * 1.1
  const longestMonologue = analyzed.map((s) => {
    const sec = metricsNum(s, 'longestTeacherMonologueSec')
    return sec == null ? null : Math.round((sec / 60) * 10) / 10
  })
  const monologueMax = Math.max(4, ...longestMonologue.filter((v): v is number => v != null)) * 1.2
  // Below the sample floor the average is a reading of one or two exchanges,
  // which the rest of the report refuses to treat as a habit — so does this.
  const waitTime2 = analyzed.map((s) =>
    (metricsNum(s, 'waitTime2SampleCount') ?? 0) >= MIN_WAIT_TIME_SAMPLES ? metricsNum(s, 'waitTime2Sec') : null,
  )
  const waitTime2Max = Math.max(4, ...waitTime2.filter((v): v is number => v != null)) * 1.2
  // Count AND total on one chart rather than a share on its own: a share is
  // 100% when one question was asked and one was higher-order, which reads as
  // a triumph. The gap between the two lines is the recall questions, and it
  // cannot lie that way.
  const higherOrderCount = analyzed.map((s) => metricsNum(s, 'higherOrderQuestionCount'))
  const allQuestions = analyzed.map((s) => s.questionCount ?? null)
  const questionMax = Math.max(6, ...allQuestions.filter((v): v is number => v != null)) * 1.15

  const insight = buildTrendInsight(analyzed)

  // Seven, not ten. Each one earned its place on three tests measured against
  // real lessons: is there a value on most of them, is it about something the
  // teacher controls, and does movement mean the same thing every time? What
  // went: wait time after a question (measurable on a quarter of lessons),
  // tone ratio and feedback specificity (fewer still, and the limit is per
  // lesson so more lessons never fix it), redirections (rise with a hard group
  // as readily as with anything the teacher did), and the plain counts of
  // directions and names (no better direction to move in).
  const charts: { key: FocusMetric; node: React.ReactNode }[] = [
    {
      key: 'teacherPace',
      node: (
        <TrendChart
          title="Your pace"
          unit=" wpm"
          maxValue={paceMax}
          labels={labels}
          series={[{ label: 'Words a minute', colorVar: '--color-terracotta', values: teacherPace }]}
          emptyMessage="Not enough of your own speech captured yet to measure a pace."
        />
      ),
    },
    {
      key: 'talkRatio',
      node: (
        <TrendChart
          title="Your share of the talk"
          unit="%"
          maxValue={100}
          labels={labels}
          series={[{ label: 'You', colorVar: '--color-terracotta', values: teacherTalk }]}
          emptyMessage="Not enough sessions with a measured talk split yet to trend this."
        />
      ),
    },
    {
      key: 'longestMonologue',
      node: (
        <TrendChart
          title="Longest unbroken stretch"
          unit=" min"
          maxValue={monologueMax}
          labels={labels}
          series={[{ label: 'Minutes', colorVar: '--color-terracotta', values: longestMonologue }]}
          emptyMessage="Not enough sessions yet to trend this."
        />
      ),
    },
    {
      key: 'waitTime2',
      node: (
        <TrendChart
          title="Pause after an answer"
          unit="s"
          maxValue={waitTime2Max}
          labels={labels}
          series={[{ label: 'Seconds', colorVar: '--color-terracotta', values: waitTime2 }]}
          emptyMessage="Not enough exchanges where a student answered and you replied, yet."
        />
      ),
    },
    {
      key: 'followUpQuestionCount',
      node: (
        <TrendChart
          title="Follow-up questions"
          unit=" per 10 min"
          maxValue={followUpMax}
          labels={labels}
          series={[{ label: 'Follow-ups', colorVar: '--color-terracotta', values: followUpFrequency }]}
          emptyMessage="Not enough follow-up questions detected yet to trend this."
        />
      ),
    },
    {
      key: 'higherOrderPct',
      node: (
        <TrendChart
          title="Higher-order questions"
          unit=""
          maxValue={questionMax}
          labels={labels}
          series={[
            { label: 'Higher-order', colorVar: '--color-terracotta', values: higherOrderCount },
            { label: 'All questions', colorVar: '--color-hairline', values: allQuestions },
          ]}
          emptyMessage="No questions detected yet to trend."
        />
      ),
    },
    {
      key: 'cfuCount',
      node: (
        <TrendChart
          title="Checks for understanding"
          unit=" per 10 min"
          maxValue={cfuMax}
          labels={labels}
          series={[{ label: 'Checks', colorVar: '--color-terracotta', values: cfuFrequency }]}
          emptyMessage="Not enough sessions long enough to detect checks yet."
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
        Showing your last {analyzed.length} analyzed session{analyzed.length === 1 ? '' : 's'} over{' '}
        {Math.round(TINY_RECORDING_THRESHOLD_SEC / 60)} minutes — shorter recordings are left out, since a
        one-minute clip and a full period are not the same kind of thing. A gap in a line means that lesson had
        no measurable value, never a measured zero. Read the overall direction, not any single point, and this is
        compared only against your own history, never other teachers.
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
  streamingReply,
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
  /// Coach's reply as it is being written, before the saved turn replaces it.
  streamingReply: string | null
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
              {(streamingReply ?? lastAssistant?.text) && (
                <div className="rounded-xl border border-hairline bg-cream px-4 py-2.5 text-sm whitespace-pre-wrap text-ink">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Coach</p>
                  <p className="mt-1">{streamingReply ?? lastAssistant?.text}</p>
                </div>
              )}
              {/* Only until the first sentence lands — after that the words
                  themselves are the progress. */}
              <ThinkingIndicator active={sending && !streamingReply} />

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

const ARC_ROLE_LABEL = { opened: 'Opened with', built: 'Built', applied: 'Applied to', practiced: 'Practiced', closed: 'Closed with' } as const
const EXPLANATION_LABEL: Record<string, string> = { example: 'Gave an example', analogy: 'Used an analogy', vocabulary: 'Gave a meaning', modeling: 'Thought aloud' }
const CONNECTION_LABEL: Record<string, string> = { prior: 'Linked to earlier learning', purpose: 'Said why it matters', closing: 'Drew it together' }

type PickItem = { tag: string; text?: string; quote?: string; timestampSec?: number }
type PickOption = {
  key: string
  label: string
  desc: string
  items: PickItem[]
  /// A lesson-specific finding, shown above the description.
  finding?: string | null
  /// Anything else the panel should say before its moments.
  note?: React.ReactNode
}

/// A row of pill buttons, one per category, and the chosen category's items
/// below — "Examples & explanations · 4", tap to switch.
function CategoryPicker({ options, tone, hint }: { options: PickOption[]; tone: 'forest' | 'lavender'; hint?: string }) {
  const shown = options.filter((o) => o.items.length > 0)
  const [selected, setSelected] = useState(shown[0]?.key ?? '')
  const current = shown.find((o) => o.key === selected) ?? shown[0]
  if (!current) return null
  const on = tone === 'forest' ? { bg: '#1F3A2E' } : { bg: '#6E62A0' }
  return (
    <>
      <div className="flex flex-wrap gap-2" role="group">
        {shown.map((o) => {
          const active = o.key === current.key
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(o.key)}
              className={`flex min-h-[40px] items-center gap-2 rounded-full border-[1.5px] px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-terracotta/40 ${active ? 'text-cream' : 'border-hairline bg-cream-card text-ink'}`}
              style={active ? { background: on.bg, borderColor: on.bg } : undefined}
            >
              {o.label}
              <span className={`rounded-full px-2 text-xs ${active ? 'bg-white/20 text-cream' : 'bg-cream text-ink-soft'}`}>{o.items.length}</span>
            </button>
          )
        })}
      </div>
      <div className={`flex flex-col gap-3 rounded-2xl p-4 ${tone === 'forest' ? 'bg-cream' : 'bg-[#ECE8F4]'}`} aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <b className="text-sm text-forest">
            {current.label} · {current.items.length}
          </b>
          {hint && <span className="text-xs text-ink-soft">{hint}</span>}
        </div>
        {current.finding && <p className="-mt-1 text-sm font-semibold text-ink">{current.finding}</p>}
        <p className="-mt-1 text-sm text-ink-soft">{current.desc}</p>
        {current.note}
        {current.items.map((it, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 rounded-xl bg-cream-card px-3.5 py-3 text-sm text-ink">
            <div>
              <span className="mb-1 block text-xs font-semibold text-ink-soft">{it.tag}</span>
              {it.text && <span className="block">{it.text}</span>}
              {it.quote && <span className={`block ${it.text ? 'mt-1 text-ink-soft' : ''}`}>“{it.quote}”</span>}
            </div>
            {it.timestampSec != null && <span className="shrink-0 font-mono text-xs text-ink-soft">{formatTime(it.timestampSec)}</span>}
          </div>
        ))}
      </div>
    </>
  )
}

/// Content Specialist: a specialist's ideas for teaching the subject — notes on
/// moments of this lesson, ways in next time, where students get stuck. Never
/// a read of the lesson itself, and labelled so.
function TopicTab({
  lessonContent,
  contentNotes,
  isShort,
  sending,
  error,
  onGenerate,
  onDiscuss,
}: {
  lessonContent: AudioLessonContent | null
  contentNotes: AudioContentNotes | null
  isShort: boolean
  sending: boolean
  error: string | null
  onGenerate: () => void
  onDiscuss: () => void
}) {
  const subject = lessonContent?.subject || contentNotes?.subject || 'this subject'
  const notes = contentNotes?.notes ?? []
  const topicOptions: PickOption[] = [
    {
      key: 'notes',
      label: 'Specialist notes',
      desc: `What a ${subject} specialist would want you to know, from excerpts of this lesson.`,
      items: notes.map((n) => ({ tag: n.label, text: n.text, quote: n.excerpt, timestampSec: n.timestampSec })),
    },
    {
      key: 'ways',
      label: 'Ways in, next time',
      desc: 'Other entry points into this content.',
      items: (lessonContent?.connectionIdeas ?? contentNotes?.connectionIdeas ?? []).map((t) => ({ tag: 'Way in', text: t })),
    },
    {
      key: 'stuck',
      label: 'Where students get stuck',
      desc: 'Common misconceptions on this topic — you may well have covered them.',
      items: (contentNotes?.misconceptions ?? []).map((t) => ({ tag: 'Misconception', text: t })),
    },
  ]
  return (
    <SectionShell
      section="topic"
      note={null}
      keep={null}
      tryNext={null}
      lastRow={null}
      onDiscuss={onDiscuss}
      howToRead={
        <p className="text-sm text-ink-soft">
          These are a specialist's ideas for teaching {subject}, written from excerpts of what you said. They may miss
          context, they are a starting point for your own reflection rather than a review, and your subject expertise is
          the final word.
        </p>
      }
    >
      <div className="flex flex-col gap-4">
        <span className="self-start rounded-full bg-[#ECE8F4] px-3 py-1 text-xs font-semibold text-[#6E62A0]">
          ✦ Ideas for teaching {subject}, not a read of this lesson
        </span>
        {isShort && contentNotes && (
          <p className="text-xs font-semibold text-terracotta-600">
            This session is under {Math.round(SHORT_SESSION_THRESHOLD_SEC / 60)} minutes — content feedback from a short
            sample is especially limited.
          </p>
        )}
        {!contentNotes ? (
          <>
            <button
              type="button"
              onClick={onGenerate}
              disabled={sending}
              className="self-start rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
            >
              {sending ? 'Writing the notes…' : 'Generate content specialist notes'}
            </button>
            <WorkingRing active={sending} estimatedMs={14000} label="Writing content specialist notes" className="text-forest" />
          </>
        ) : (
          <>
            <CategoryPicker options={topicOptions} tone="lavender" />
            <button
              type="button"
              onClick={onGenerate}
              disabled={sending}
              className="self-start text-sm font-medium text-ink-soft hover:text-terracotta-600 disabled:opacity-60"
            >
              {sending ? 'Writing new notes...' : 'Write these notes again ↻'}
            </button>
            <WorkingRing active={sending} estimatedMs={16000} label="Writing content specialist notes" className="text-forest" />
          </>
        )}
        {error && <p className="text-sm text-terracotta-600">{error}</p>}
      </div>
    </SectionShell>
  )
}

/// Clarity & Content: how the lesson moved, what you did to make the content
/// clear (your own words), ideas about the topic (a specialist's, not a read
/// of this lesson), and the academic vocabulary as an optional extra.
function LessonContentTab({
  lessonContent,
  contentNotes,
  teachingMoves,
  narrative,
  lastRow,
  onDiscuss,
}: {
  lessonContent: AudioLessonContent | null
  contentNotes: AudioContentNotes | null
  teachingMoves: AudioTeachingMoves | null
  narrative: string | null
  lastRow: React.ReactNode
  onDiscuss: () => void
}) {
  const arc = teachingMoves?.arc ?? []
  const explanations = teachingMoves?.explanations ?? []
  const ties = teachingMoves?.connections ?? []
  const connections = lessonContent?.connections ?? []
  const lessonOptions: PickOption[] = [
    {
      key: 'opened',
      label: 'Examples & explanations',
      desc: 'How you introduced the content and made it approachable — examples, analogies, meanings, thinking aloud.',
      items: explanations.map((e) => ({ tag: EXPLANATION_LABEL[e.kind] ?? 'Example or explanation', quote: e.quote, timestampSec: e.timestampSec })),
    },
    {
      key: 'tied',
      label: 'Linking ideas',
      desc: 'How you linked parts of the lesson to each other, to earlier learning, and to why it matters.',
      items: ties.map((c) => ({ tag: CONNECTION_LABEL[c.kind] ?? 'Linked ideas', quote: c.quote, timestampSec: c.timestampSec })),
    },
    {
      key: 'connections',
      label: 'Real-world connections',
      desc: 'Links you made to other texts, lessons, or students’ lives.',
      items: connections.map((c) => ({ tag: 'Connection', quote: c.quote, timestampSec: c.timestampSec })),
    },
  ]
  const lessonCount = lessonOptions.reduce((n, o) => n + o.items.length, 0)

  const subject = lessonContent?.subject || contentNotes?.subject || 'this subject'
  const notes = contentNotes?.notes ?? []

  const keyTerms = lessonContent?.keyTerms ?? []
  const studentUsed = keyTerms.filter((t) => t.studentCount > 0)
  const onlyYou = keyTerms.filter((t) => t.studentCount === 0)
  const pips = (n: number, color: string) => (
    <span className="flex flex-wrap gap-1">
      {Array.from({ length: Math.min(n, 10) }, (_, i) => (
        <i key={i} className="inline-block h-3 w-3 rounded-full" style={{ background: color }} />
      ))}
      {n > 10 && <span className="text-xs text-ink-soft">+{n - 10}</span>}
    </span>
  )

  const worked = notes.find((n) => n.label === 'What worked')
  const keep: KeepLine | null = worked
    ? { text: worked.text, quote: worked.excerpt, timestampSec: worked.timestampSec }
    : explanations[0]
      ? { text: `You ${(EXPLANATION_LABEL[explanations[0].kind] ?? 'opened the content up').toLowerCase()} to make the content concrete.`, quote: explanations[0].quote, timestampSec: explanations[0].timestampSec }
      : null
  const tryNext = notes.find((n) => n.label === 'Where it could go further')?.text

  return (
    <SectionShell
      section="content"
      note={narrative}
      keep={keep}
      tryNext={tryNext}
      lastRow={lastRow}
      onDiscuss={onDiscuss}
      howToRead={
        <>
          <p className="text-sm text-ink-soft">
            "From your lesson" is your own words, found in the transcript. Ideas for teaching {subject} — the specialist's
            notes, ways in, and where students get stuck — are in the Content Specialist tab.
          </p>
          {keyTerms.length > 0 && (
            <p className="text-sm text-ink-soft">
              Vocabulary is counted from the transcript, so read the counts as "at least": unusual terms are the words a
              recording most often mishears, and student counts include only what the microphone picked up.
            </p>
          )}
        </>
      }
    >
      {/* How the lesson moved — only where the arc read found its stages. */}
      {arc.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="font-heading text-xl font-bold text-forest">How the lesson moved</p>
          <div className="flex flex-col gap-1.5 sm:flex-row">
            {arc.map((s, i) => (
              <div
                key={i}
                className={`flex-1 rounded-xl bg-cream px-3.5 py-3 ${i === 0 ? 'sm:rounded-l-2xl' : ''} ${i === arc.length - 1 ? 'sm:rounded-r-2xl' : ''}`}
              >
                <span className="text-xs font-bold uppercase tracking-wide text-terracotta-600">{ARC_ROLE_LABEL[s.role]}</span>
                <p className="mt-0.5 text-sm font-semibold leading-snug text-ink">{s.title}</p>
                <span className="mt-1 block font-mono text-xs text-ink-soft">
                  {formatTime(s.startSec)}–{i === arc.length - 1 ? 'end' : formatTime(s.endSec)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* From your lesson: your own words, by what they did. */}
      <div className="flex flex-col gap-4 border-t border-dashed border-hairline pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-heading text-xl font-bold text-forest">From your lesson</p>
          <span className="text-sm text-ink-soft">
            {lessonCount} moment{lessonCount === 1 ? '' : 's'}
          </span>
        </div>
        <p className="text-base font-semibold text-ink">What you did to make the content clear, in your own words.</p>
        {lessonCount === 0 ? (
          <p className="text-sm text-ink-soft">None of these were found in this lesson.</p>
        ) : (
          <CategoryPicker options={lessonOptions} tone="forest" hint="Tap a category to see its moments" />
        )}
      </div>

      {/* Optional: the academic vocabulary and who said it. */}
      {keyTerms.length > 0 && (
        <details className="group rounded-2xl border-[1.5px] border-hairline">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-4 px-5 py-4 marker:hidden">
            <span className="flex-1">
              <b className="block font-heading text-lg text-forest">Academic vocabulary</b>
              <span className="text-sm text-ink-soft">
                {studentUsed.length} of {keyTerms.length} key terms were heard from students.
              </span>
            </span>
            <span className="rounded-full border border-hairline px-2.5 py-1 text-xs font-bold tracking-wide text-ink-soft">OPTIONAL</span>
            <RowChevron className="group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-1.5 px-5 pb-5">
            <div className="flex flex-wrap gap-x-5 gap-y-1 pb-1 text-sm text-ink">
              <span className="flex items-center gap-2"><i className="inline-block h-3 w-3 rounded-full bg-forest" />You</span>
              <span className="flex items-center gap-2"><i className="inline-block h-3 w-3 rounded-full bg-gold" />Students</span>
              <span className="text-ink-soft">Each dot = one time said</span>
            </div>
            {[
              { title: `STUDENTS USED THESE · ${studentUsed.length}`, rows: studentUsed },
              { title: `ONLY YOU SAID THESE · ${onlyYou.length}`, rows: onlyYou },
            ]
              .filter((g) => g.rows.length > 0)
              .map((g) => (
                <div key={g.title}>
                  <p className="mt-2.5 text-xs font-bold tracking-wide text-forest">{g.title}</p>
                  {g.rows.map((t) => (
                    <div key={t.term} className="grid grid-cols-2 items-center gap-3 border-b border-dashed border-hairline py-2 text-sm sm:grid-cols-[200px_1fr_1fr]">
                      <span className="col-span-2 sm:col-span-1">
                        {t.term}
                        {t.studentCount > t.teacherCount && (
                          <span className="ml-2 rounded bg-mint-tint px-2 py-0.5 text-xs font-bold text-forest">students led</span>
                        )}
                      </span>
                      {pips(t.teacherCount, 'var(--color-forest)')}
                      {t.studentCount > 0 ? (
                        pips(t.studentCount, 'var(--color-gold)')
                      ) : (
                        <span className="justify-self-start rounded border-[1.5px] border-dashed border-[#C9BFAD] px-2 text-xs text-ink-soft">not heard</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </details>
      )}
    </SectionShell>
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

/// The hard read of one section, shown under that section's own evidence.
///
/// The findings are grouped by section already, so a teacher who had just read
/// Questioning & Checking had to scroll back up the page to a collapsed card
/// and find the questioning group inside it. This puts each section's
/// criticism directly beneath the numbers and quotes it was drawn from.
///
/// Collapsed by default, like the whole-lesson entry: a teacher who has not
/// chosen this should not meet it on the way past. Opening it before one
/// exists offers to build it, so any section is a way in — it is one call and
/// one document either way.
function SectionHardLook({
  section,
  hardLook,
  locked,
  sending,
  error,
  onGenerate,
  bare,
}: {
  section: InsightsSection
  hardLook: AudioHardLook | null
  locked: boolean
  sending: boolean
  error: string | null
  onGenerate: () => void
  /// Shown already open, with no row of its own — when a button elsewhere
  /// (Talk & Participation's footer) is what opened it.
  bare?: boolean
}) {
  const [open, setOpen] = useState(!!bare)
  const critiques = (hardLook?.critiques ?? []).filter((c) => c.section === section)
  const cleared = (hardLook?.cleared ?? []).find((c) => c.section === section)

  // Nothing to offer and nothing to show: a locked report can't gain one.
  if (locked && !hardLook) return null

  return (
    // The last row of the section's list, like the evidence rows above it:
    // a card of its own made the hard reading the loudest thing on a page it
    // is meant to be an option on.
    <div className={`flex flex-col ${bare ? 'pt-4' : ''}`}>
      {!bare && <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center justify-between gap-3 py-3 text-left text-sm font-semibold text-forest hover:text-terracotta-600"
      >
        <span>The hard look on this section</span>
        <RowChevron className={open ? 'rotate-180' : ''} />
      </button>}

      {open && !hardLook && (
        <div className="flex flex-col gap-3 pb-5">
          <p className="text-sm text-ink">
            This reads the same evidence again as a demanding reader looking for what could have been better, across
            the whole lesson. Every criticism has to point at something you actually said, it can come back with
            nothing, and only you see it.
          </p>
          <button
            type="button"
            onClick={onGenerate}
            disabled={sending}
            className="self-start rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
          >
            {sending ? 'Taking the hard look...' : 'Give it to me straight'}
          </button>
          <WorkingRing
            active={sending}
            estimatedMs={30000}
            label="Looking for what could be better"
            className="text-forest"
          />
          {error && <p className="text-sm text-terracotta-600">{error}</p>}
        </div>
      )}

      {open && hardLook && (
        <div className="flex flex-col gap-3 pb-5">
          {critiques.map((critique, i) => (
            <div key={`${critique.section}-${i}`} className="rounded-xl border border-hairline p-4">
              <p className="font-heading text-base font-bold leading-snug text-forest">{critique.headline}</p>
              <p className="mt-2 text-sm text-ink">{critique.critique}</p>
              {critique.evidence.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {critique.evidence.map((item, j) => (
                    <div key={j} className="border-l-2 border-terracotta/50 pl-3">
                      <p className="text-sm text-ink">"{item.text}"</p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {formatTime(item.timestampSec)} · {item.kind}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {critique.likelyCost && (
                <div className="mt-3 rounded-xl bg-cream p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">What it likely cost</p>
                  <p className="mt-1 text-sm text-ink">{critique.likelyCost}</p>
                </div>
              )}
              {critique.nextStep && (
                <div className="mt-2 rounded-xl bg-gold-tint/50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Try instead</p>
                  <p className="mt-1 text-sm text-ink">{critique.nextStep}</p>
                </div>
              )}
            </div>
          ))}
          {critiques.length === 0 && (
            <p className="text-sm text-ink">
              {cleared?.reason ??
                'It had no reading for this section. That is a gap in the hard look rather than a verdict on your lesson.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// On demand only, and written once (see the /:id/hard-look route). The
// teacher asked for the unsentimental version, so this does not soften what
// it found — but it also shows, by name, every section where it could not
// make a case. That second half is the point: a critic who always finds
// something is a generator, and a teacher works that out fast.
function HardLookTab({
  hardLook,
  locked,
  sending,
  error,
  onGenerate,
}: {
  hardLook: AudioHardLook | null
  locked: boolean
  sending: boolean
  error: string | null
  onGenerate: () => void
}) {
  const sectionLabel = (key: AudioHardLook['critiques'][number]['section']) =>
    INSIGHTS_SECTIONS.find((s) => s.key === key)?.label ?? key

  if (!hardLook) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-hairline bg-cream-card p-6">
          <p className="font-heading text-lg font-bold text-forest">Ask for the version that doesn't go easy on you</p>
          <p className="mt-2 text-sm text-ink">
            The rest of this report is written to be useful on a hard day. This one isn't. It goes back through the same
            four sections as a demanding reader looking for what could have been better, and says it plainly.
          </p>
          <ul className="mt-3 flex flex-col gap-1 text-sm text-ink-soft">
            <li>· Every criticism has to point at something you actually said. No evidence, no criticism.</li>
            <li>· It can come back with nothing. Sections it can't make a case against are named as such.</li>
            <li>· Only you see it. It reaches no evaluator and changes nothing in your report.</li>
            <li>· Written once and kept, so it can't be re-rolled into a kinder answer.</li>
          </ul>
          {locked ? (
            <p className="mt-5 text-sm text-ink-soft">This report is locked, so a hard look can't be added to it.</p>
          ) : (
            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={onGenerate}
                disabled={sending}
                className="self-start rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
              >
                {sending ? 'Taking the hard look...' : 'Give it to me straight'}
              </button>
              <WorkingRing active={sending} estimatedMs={30000} label="Looking for what could be better" className="text-forest" />
            </div>
          )}
        </div>
        {error && <p className="text-sm text-terracotta-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-dashed border-hairline p-4 text-xs text-ink-soft">
        The hardest reading these recordings support. It only presses on things it can point at, so a quiet section
        means the audio didn't carry a case — not that the lesson was flawless, and not that it was poor. Quotes come
        from automatic transcription, so a line may be garbled even when the point behind it holds.
      </div>

      {hardLook.critiques.length === 0 ? (
        <div className="rounded-2xl border border-hairline bg-mint-tint/40 p-5">
          <p className="font-heading text-base font-bold text-forest">Nothing here it can make a hard case against.</p>
          <p className="mt-2 text-sm text-ink">
            On what the microphone caught, none of these sections support a criticism worth your time. That is a real
            result, and it is the reason to trust this section on a lesson where it does find something.
          </p>
        </div>
      ) : (
        /* Grouped by section rather than one flat list: a section now carries
           several findings, and repeating its name above each one read as a
           pile of complaints rather than a reading of that part of the lesson. */
        INSIGHTS_SECTIONS.filter((section) =>
          hardLook.critiques.some((c) => c.section === section.key),
        ).map((section) => (
          <section key={section.key} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="h-7 w-1.5 shrink-0 rounded-full bg-terracotta" />
              <h3 className="font-heading text-lg font-bold leading-tight text-forest">{section.label}</h3>
            </div>
            {hardLook.critiques
              .filter((c) => c.section === section.key)
              .map((critique, i) => (
                <div key={`${critique.section}-${i}`} className="rounded-2xl border border-hairline bg-cream-card p-5">
                  <p className="font-heading text-base font-bold leading-snug text-forest">{critique.headline}</p>
                  <p className="mt-2 text-sm text-ink">{critique.critique}</p>
                  {critique.evidence.length > 0 && (
                    <div className="mt-4 flex flex-col gap-2">
                      {critique.evidence.map((item, j) => (
                        <div key={j} className="border-l-2 border-terracotta/50 pl-3">
                          <p className="text-sm text-ink">"{item.text}"</p>
                          <p className="mt-0.5 text-xs text-ink-soft">
                            {formatTime(item.timestampSec)} · {item.kind}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {critique.likelyCost && (
                    <div className="mt-4 rounded-xl bg-cream p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">What it likely cost</p>
                      <p className="mt-1 text-sm text-ink">{critique.likelyCost}</p>
                    </div>
                  )}
                  {critique.nextStep && (
                    <div className="mt-2 rounded-xl bg-gold-tint/50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">
                        Try instead
                      </p>
                      <p className="mt-1 text-sm text-ink">{critique.nextStep}</p>
                    </div>
                  )}
                </div>
              ))}
          </section>
        ))
      )}

      {/* Shown whenever anything was cleared, including alongside criticisms:
          a teacher reading two hard paragraphs deserves to know the other two
          sections were looked at just as hard and came back empty. Shown on an
          all-clear too, because "this looks fine" and "I couldn't hear enough
          to judge" are different results and the reason says which. */}
      {hardLook.cleared.length > 0 && (
        <div className="rounded-2xl border border-hairline p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Looked at just as hard, no case to make
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {hardLook.cleared.map((cleared) => (
              <div key={cleared.section}>
                <p className="text-sm font-semibold text-forest">{sectionLabel(cleared.section)}</p>
                <p className="text-sm text-ink-soft">{cleared.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const ROUTINE_LABEL: Record<string, string> = {
  start: 'Starting work',
  transition: 'Changing activities',
  materials: 'Materials',
  help: 'Getting help',
  finish: 'Finishing',
  other: 'Directions',
}
const PART_WORD: Record<string, string> = { task: 'what to do', steps: 'the steps', time: 'how long', product: 'what to hand in' }

/// Climate & Routines: directions and routines, redirection and the
/// expectation it carried, and encouragement — from your own words. Language
/// that might discourage participation is not judged here: a transcript
/// cannot hear tone, and a student's line can be filed as yours. That reading
/// belongs to The hard look, which a teacher chooses to open.
function ClimateRoutinesTab({
  session,
  climateNarrative,
  nextStep,
  lastRow,
  onDiscuss,
}: {
  session: AudioSessionWithSegments
  climateNarrative: string | null
  nextStep: string | null | undefined
  lastRow: React.ReactNode
  onDiscuss: () => void
}) {
  const moves = session.teachingMoves
  // 1. Directions & routines.
  const directions = moves?.directions ?? []
  const typeAt = (sec: number) => moves?.routines?.directionTypes.find((d) => d.timestampSec === sec)?.type
  const complete = directions.filter((d) => d.parts.length === 4)
  const directionRows: Evidence[] = [...directions]
    .sort((x, y) => y.parts.length - x.parts.length || x.timestampSec - y.timestampSec)
    .map((d) => {
      const t = typeAt(d.timestampSec)
      const named = d.parts.length === 0 ? 'named none of the four' : `named ${d.parts.map((p) => PART_WORD[p] ?? p).join(', ')}`
      const tag = `${t ? `${ROUTINE_LABEL[t]} · ` : ''}${named}`
      return { quote: d.quote, timestampSec: d.timestampSec, tag: tag[0].toUpperCase() + tag.slice(1) }
    })
  const byType = new Map<string, number>()
  for (const d of directions) {
    const t = typeAt(d.timestampSec)
    if (t && t !== 'other') byType.set(t, (byType.get(t) ?? 0) + 1)
  }
  const missingTime = directions.filter((d) => !d.parts.includes('time')).length
  const directionFinding =
    directions.length === 0
      ? null
      : directions.length === 1
        ? `Your one set of directions ${directions[0].parts.length === 0 ? 'named none of the four parts' : `named ${directions[0].parts.map((p) => PART_WORD[p] ?? p).join(', ')}`}.`
        : `${complete.length} of your ${directions.length} direction${directions.length === 1 ? '' : 's'} named all four: what to do, the steps, how long, and what to hand in.${
          missingTime > 0 && complete.length < directions.length ? ` ${missingTime} didn’t say how long.` : ''
        }`

  // 2. Redirection & expectations.
  const redirections = moves?.redirections ?? (session.redirectionLog ?? []).map((r) => ({ quote: r.text, timestampSec: r.timestampSec, clarity: null }))
  const actionable = redirections.filter((r) => r.clarity === 'actionable')
  const vague = redirections.filter((r) => r.clarity === 'vague')
  const redirectRows: Evidence[] = [...actionable, ...vague, ...redirections.filter((r) => !r.clarity)].map((r) => ({
    quote: r.quote,
    timestampSec: r.timestampSec,
    tag: r.clarity === 'actionable' ? 'Said what to do' : r.clarity === 'vague' ? 'Said only what to stop' : 'Redirection',
  }))
  const redirectFinding =
    redirections.length === 0
      ? null
      : redirections.length === 1 && redirections[0].clarity
        ? redirections[0].clarity === 'actionable'
          ? 'Your one redirection told students what to do.'
          : 'Your one redirection said what to stop, not what to do instead.'
        : actionable.length + vague.length > 0
        ? `${actionable.length} of your ${redirections.length} redirection${redirections.length === 1 ? '' : 's'} told students what to do, not just what to stop.`
        : `${redirections.length} redirection${redirections.length === 1 ? '' : 's'}.`
  const esc = session.escalation
  // Whether an ask held — never the number of bids.
  const escNote =
    esc?.state === 'found' && esc.clusters[0] ? (
      <p className="text-sm text-ink-soft">
        One ask needed repeating around {formatTime(esc.clusters[0].startSec)}
        {esc.clusters[0].quote ? <> — “{esc.clusters[0].quote.replace(/[.!?]+$/, '')}”</> : null}.
      </p>
    ) : esc?.state === 'confirmed_none' ? (
      <p className="text-sm text-ink-soft">Your asks held: none needed repeating.</p>
    ) : null

  // 3. Encouragement & respect.
  const feedback = session.feedbackLog ?? []
  const specific = feedback.filter((f) => f.kind === 'specific')
  const corrective = (session.toneLog ?? []).filter((t) => t.kind === 'corrective')
  const help = moves?.routines?.helpInvites ?? []
  const encourageRows: Evidence[] = [
    ...specific.map((f) => ({ quote: f.text, timestampSec: f.timestampSec, tag: 'Named what was right' })),
    ...help.map((h) => ({ quote: h.quote, timestampSec: h.timestampSec, tag: 'Invited students to ask for help' })),
    ...corrective.map((t) => ({ quote: t.text, timestampSec: t.timestampSec, tag: 'Responded to a mistake' })),
    ...feedback.filter((f) => f.kind === 'generic').map((f) => ({ quote: f.text, timestampSec: f.timestampSec, tag: 'General praise' })),
  ]
  const encourageFinding =
    feedback.length > 0
      ? `${specific.length} of the ${feedback.length} times you responded to a student named what was right or wrong${help.length > 0 ? `, and you invited students to ask for help ${help.length} time${help.length === 1 ? '' : 's'}` : ''}.`
      : help.length > 0
        ? `You invited students to ask for help ${help.length} time${help.length === 1 ? '' : 's'}.`
        : null

  const keep: KeepLine | null =
    (specific[0] && { text: 'You named what was right, not just “good”.', quote: specific[0].text, timestampSec: specific[0].timestampSec }) ||
    (actionable[0] && { text: 'Your redirection told students what to do.', quote: actionable[0].quote, timestampSec: actionable[0].timestampSec }) ||
    (complete[0] && { text: 'Your directions named what to do, the steps, how long, and what to hand in.', quote: complete[0].quote, timestampSec: complete[0].timestampSec }) ||
    null

  return (
    <SectionShell
      section="routines"
      note={climateNarrative}
      keep={keep}
      tryNext={nextStep}
      lastRow={lastRow}
      onDiscuss={onDiscuss}
      howToRead={
        <>
          <p className="text-sm text-ink-soft">
            Everything here is from your own words. A direction is counted once however many sentences it runs to, and
            each says which of the four parts it named: what to do, the steps, how long, and what to hand in.
          </p>
          <p className="text-sm text-ink-soft">
            Tone isn't judged on this page: a transcript can't hear warmth or sarcasm, and a student's line can be filed as
            yours. The hard look is where a stricter reading lives, if you want one.
          </p>
        </>
      }
    >
      {/* From your lesson: what your words did to set up and run the room. */}
      <div className="flex flex-col gap-4 border-t border-dashed border-hairline pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-heading text-xl font-bold text-forest">From your lesson</p>
          <span className="text-sm text-ink-soft">
            {directionRows.length + redirectRows.length + encourageRows.length} moments
          </span>
        </div>
        <p className="text-base font-semibold text-ink">How your words set up the work, kept it on track, and encouraged students.</p>
        {directionRows.length + redirectRows.length + encourageRows.length === 0 ? (
          <p className="text-sm text-ink-soft">No directions, redirections or feedback to a student were found in this lesson.</p>
        ) : (
          <CategoryPicker
            tone="forest"
            hint="Tap a category to see its moments"
            options={[
              {
                key: 'directions',
                label: 'Directions & routines',
                finding: directionFinding,
                desc: 'Directions for starting work, changing activities, materials, getting help and finishing — and which of the four parts each named.',
                note:
                  byType.size > 0 ? (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {[...byType.entries()].map(([t, n]) => (
                        <span key={t} className="rounded-full bg-cream-card px-2.5 py-1 text-ink">
                          {ROUTINE_LABEL[t]} <b>{n}</b>
                        </span>
                      ))}
                    </div>
                  ) : undefined,
                items: directionRows.map((r) => ({ tag: r.tag, quote: r.quote, timestampSec: r.timestampSec })),
              },
              {
                key: 'redirection',
                label: 'Redirection & expectations',
                finding: redirectFinding,
                desc: 'Reminders and corrections, and whether each gave students a clear action to take.',
                note: escNote,
                items: redirectRows.map((r) => ({ tag: r.tag, quote: r.quote, timestampSec: r.timestampSec })),
              },
              {
                key: 'encouragement',
                label: 'Encouragement & respect',
                finding: encourageFinding,
                desc: 'What your words recognized, invitations to ask for help, and how you responded to mistakes.',
                items: encourageRows.map((r) => ({ tag: r.tag, quote: r.quote, timestampSec: r.timestampSec })),
              },
            ]}
          />
        )}
      </div>

      {/* Optional: every set of directions against the four parts. */}
      {directions.length > 0 && (
        <details className="group rounded-2xl border-[1.5px] border-hairline">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-4 px-5 py-4 marker:hidden">
            <span className="flex-1">
              <b className="block font-heading text-lg text-forest">Your directions, part by part</b>
              <span className="text-sm text-ink-soft">
                {complete.length} of {directions.length} named all four parts.
              </span>
            </span>
            <span className="rounded-full border border-hairline px-2.5 py-1 text-xs font-bold tracking-wide text-ink-soft">OPTIONAL</span>
            <RowChevron className="group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-1 px-5 pb-5">
            <div className="grid grid-cols-[56px_repeat(4,minmax(0,1fr))] gap-1.5 pb-1 text-center text-xs font-bold text-ink-soft">
              <span />
              {['What to do', 'Steps', 'How long', 'Hand in'].map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>
            {[...directions]
              .sort((x, y) => x.timestampSec - y.timestampSec)
              .map((d, i) => (
                <div key={i} className="grid grid-cols-[56px_repeat(4,minmax(0,1fr))] items-center gap-1.5" title={d.quote}>
                  <span className="font-mono text-xs text-ink-soft">{formatTime(d.timestampSec)}</span>
                  {(['task', 'steps', 'time', 'product'] as const).map((part) => (
                    <i
                      key={part}
                      className={`block h-6 rounded-md ${d.parts.includes(part) ? 'bg-forest' : 'border-[1.5px] border-dashed border-[#C9BFAD]'}`}
                      aria-label={`${PART_WORD[part]}: ${d.parts.includes(part) ? 'named' : 'not named'}`}
                    />
                  ))}
                </div>
              ))}
            <p className="mt-2 text-xs text-ink-soft">A filled square is a part the direction named. Hover a row for its words.</p>
          </div>
        </details>
      )}
    </SectionShell>
  )
}

/// What the audible student talk was about.
///
/// Every other number on this page is a duration, and a duration cannot tell
/// a discussion from a room talking over itself — both produce a high student
/// share and many short turns, and the recording cannot separate them
/// (diarization assigns each slice of time to one speaker, so simultaneous
/// speech arrives as tidy alternating turns). This is the one thing on the
/// page that speaks to the difference, which is why it sits above the
/// percentages rather than below them.
///
/// Counts rather than percentages, deliberately: "54% on topic" is a score,
/// and there is no correct figure here.

function TalkParticipationTab({
  session,
  silencePct,
  talkInsight,
  lastRow,
  onDiscuss,
}: {
  session: AudioSessionWithSegments
  silencePct: number | null
  talkInsight: string | null
  /// The section's Hard Look, opened from the card's footer.
  lastRow: React.ReactNode
  onDiscuss: () => void
}) {
  // What students talked about is no longer shown. The count could only ever
  // describe the turns the microphone caught, and those are the ones spoken
  // loudly towards the teacher — on-topic by construction. The worst-captured
  // real lesson returned 24 of 24 on-topic with zero unclear, while lessons
  // captured at 44% and 48% returned 23 and 17 unclear; the cleanest-looking
  // answer came from the recording that heard least. It is still computed,
  // because the Hard Look uses it to avoid criticising airtime blind.
  const wpm = session.metricsDetail?.teacherWordsPerMinute ?? null
  const silenceNote = (silencePct ?? 0) > 0 ? leadingSilenceNote(session.metricsDetail?.firstWordSec) : null
  // Only when it is long enough to be worth a look: every lesson has a longest
  // stretch, and a 40-second one is not a finding.
  const stretch = useMemo(() => {
    const longest = longestTeacherStretch(session.segments)
    return longest && longest.durationSec >= MIN_STRETCH_TO_SHOW_SEC ? longest : null
  }, [session.segments])

  const nonSpeech = nonSpeechSplit(session.metricsDetail, session.durationSec)
  const moves = session.teachingMoves
  const p = moves?.participation
  const invitations = (p?.invitations ?? moves?.invitations ?? []).map((q) => ({
    ...q,
    tag: 'format' in q ? (INVITE_FORMAT_LABEL[(q as { format: keyof typeof INVITE_FORMAT_LABEL }).format] ?? 'Opened the floor') : 'Opened the floor',
  }))
  const followUps = (p?.extending ?? moves?.revisionPrompts ?? []).map((q) => ({
    ...q,
    tag: 'kind' in q ? (EXTEND_KIND_LABEL[(q as { kind: keyof typeof EXTEND_KIND_LABEL }).kind] ?? 'Follow-up') : 'Follow-up',
  }))
  const widening = (p?.widening ?? []).map((q) => ({ ...q, tag: 'Beyond volunteers' }))

  return (
    <SectionShell
      section="talk"
      note={talkInsight}
      keep={keepFrom(followUps, widening, invitations)}
      tryNext={session.nextSteps?.talk}
      lastRow={lastRow}
      onDiscuss={onDiscuss}
      howToRead={
        <>
          <p className="text-sm text-ink-soft">
            Talk time describes the recording, not the room: it doesn't show how many students took part or whether
            they were engaged, and a microphone near you hears you far better than it hears them.
          </p>
          <p className="text-sm text-ink-soft">
            "Sound, no words" and "Quiet" are everything that was neither clearly you nor clearly a student
            {nonSpeech
              ? '. In a classroom, sound with no words is usually voices the microphone could not make out; a video or noise from outside reads the same way.'
              : ': quiet work, several voices at once, and audio too faint to place.'}
          </p>
          {silenceNote && <p className="text-sm text-ink-soft">{silenceNote}</p>}
          {wpm != null && (
            <p className="text-sm text-ink-soft">
              Pace is words a minute of your own speaking time. Everyday conversation runs about {CONVERSATIONAL_WPM} — an
              anchor to place yourself against, not a target.
            </p>
          )}
        </>
      }
    >
      {/* Who was heard and how fast, then the lesson minute by minute. */}
      <div id="stat-talkRatio" className="flex flex-col gap-3">
        <TalkNumbers teacherPct={session.teacherTalkPct} studentPct={session.studentTalkPct} wpm={wpm} />
        <TalkFlowStrip
          segments={session.segments}
          durationSec={session.durationSec}
          seconds={session.soundTimeline?.seconds ?? null}
          // Your moves are drawn once, on "When it happened" below.
          marks={[]}
          shares={recordingShares(session.teacherTalkPct, session.studentTalkPct, nonSpeech)}
        />
      </div>

      {/* How you brought students in: your moves and the answers heard, on
          one timeline, with every moment behind it. */}
      <div className="border-t border-dashed border-hairline pt-5">
        <BroughtStudentsIn session={session} />
      </div>

      {stretch && <LongestStretchCard stretch={stretch} read={moves?.stretch ?? null} segments={session.segments} />}
    </SectionShell>
  )
}

const INVITE_FORMAT_LABEL = {
  hands: 'Hands up',
  call_out: 'Call out',
  turn_and_talk: 'Turn and talk',
  write_first: 'Write first',
  show_me: 'Everyone shows',
  choral: 'All together',
  open: 'Opened the floor',
} as const
const EXTEND_KIND_LABEL = { probe: 'Probing', reasoning: 'Asking for reasoning', build_on_peer: 'Building on a classmate' } as const

/// The lesson summary on Summary: the first paragraph — what the lesson was
/// about — with the other two behind "Read more", beside Wivo's mark.
function SummaryNoteCard({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const paras = splitParagraphs(text.trim())
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-mint-tint/70 p-5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-forest font-heading text-sm font-bold text-gold">W</span>
      <div className="flex flex-col gap-3">
        {(open ? paras : paras.slice(0, 1)).map((para, i) => (
          <p key={i} className="text-base leading-relaxed text-ink">
            {para}
          </p>
        ))}
        {paras.length > 1 && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="self-start text-sm font-semibold text-terracotta-600 hover:underline">
            {open ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>
    </div>
  )
}

/// The coach note as the card leads with it: the first sentence large, the
/// rest a click away.
function CoachNoteCard({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const full = text.trim()
  const lead = noteOpening(full)
  const rest = splitParagraphs(full.slice(lead.length).trim())
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-mint-tint/70 p-4">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-forest font-heading text-sm font-bold text-gold">W</span>
      <div className="flex flex-col gap-2">
        <p className="text-base text-ink">{lead}</p>
        {open && rest.map((para, i) => <p key={i} className="text-sm text-ink-soft">{para}</p>)}
        {rest.length > 0 && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="self-start text-sm font-semibold text-terracotta-600 hover:underline">
            {open ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>
    </div>
  )
}

/// What to keep: one of your own moves from this lesson, said plainly — a
/// follow-up first (asking for reasoning or building on a classmate before a
/// plain probe), then reaching beyond volunteers, then an invitation. Never a
/// claim about what it did for students; the recording cannot show that.
type KeepLine = { text: string; quote: string; timestampSec: number }
function keepFrom(
  followUps: { quote: string; timestampSec: number; tag: string }[],
  widening: { quote: string; timestampSec: number }[],
  invitations: { quote: string; timestampSec: number }[],
): KeepLine | null {
  const byTag = (tag: string) => followUps.find((f) => f.tag === tag)
  const pick =
    (byTag('Building on a classmate') && { line: byTag('Building on a classmate')!, text: 'You asked students to build on each other’s ideas.' }) ||
    (byTag('Asking for reasoning') && { line: byTag('Asking for reasoning')!, text: 'You asked a student for their reasoning, not just the answer.' }) ||
    (followUps[0] && { line: followUps[0], text: 'You asked a student to say more.' }) ||
    (widening[0] && { line: widening[0], text: 'You reached past the usual volunteers.' }) ||
    (invitations[0] && { line: invitations[0], text: 'You opened the floor to the room.' }) ||
    null
  return pick ? { text: pick.text, quote: pick.line.quote, timestampSec: pick.line.timestampSec } : null
}

/// Keep and Try next time, side by side; one takes the full width when the
/// other has nothing to say.
function KeepAndTry({ keep, tryNext, tryGoal }: { keep: KeepLine | null; tryNext: string | null | undefined; tryGoal?: string | null }) {
  const tryText = tryNext?.trim()
  if (!keep && !tryText) return null
  return (
    <div className={`grid gap-3 ${keep && tryText ? 'sm:grid-cols-2' : ''}`}>
      {keep && (
        <div className="rounded-2xl bg-mint-tint/70 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-forest">Keep</p>
          <p className="mt-1 text-sm text-ink">{keep.text}</p>
          <p className="mt-1.5 text-sm text-ink-soft">
            “{keep.quote.split(/\s+/).length > 25 ? `${keep.quote.split(/\s+/).slice(0, 25).join(' ')}…` : keep.quote}”{' '}
            <span className="font-mono text-xs">{formatTime(keep.timestampSec)}</span>
          </p>
        </div>
      )}
      {tryText && (
        <div className="rounded-2xl bg-peach-tint p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-terracotta-600">Try next time</p>
          <p className="mt-1 text-sm text-ink">{tryText}</p>
          {tryGoal && <p className="mt-1.5 text-sm text-[#6E4A3A]">{tryGoal}</p>}
        </div>
      )}
    </div>
  )
}

/// The three numbers Talk & Participation leads with.
function TalkNumbers({ teacherPct, studentPct, wpm }: { teacherPct: number | null; studentPct: number | null; wpm: number | null }) {
  const tile = (label: string, value: string, sub: string, color: string | undefined) => (
    <div className="rounded-xl border border-hairline bg-cream-card px-4 py-3">
      <p className="text-xs font-semibold text-ink-soft">{label}</p>
      <p className="font-heading text-2xl font-extrabold leading-tight text-ink" style={color ? { color } : undefined}>
        {value}
      </p>
      <p className="text-xs text-ink-soft">{sub}</p>
    </div>
  )
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {tile('You', teacherPct != null ? `${Math.round(teacherPct)}%` : '—', teacherPct != null ? 'of the recording' : 'unavailable', FLOW_COLOR.you)}
      {tile('Students', studentPct != null ? `${Math.round(studentPct)}%` : '—', studentPct != null ? 'that came through as words' : 'unavailable', FLOW_COLOR.other)}
      {tile('Your pace', wpm != null ? String(Math.round(wpm)) : '—', wpm != null ? `words a minute · conversation runs about ${CONVERSATIONAL_WPM}` : 'unavailable', undefined)}
    </div>
  )
}

/// The recording's split as the report states it: you and students as the
/// tiles show them, and the rest shared between quiet and sound with no words
/// in the proportion the envelope measured — or one "no reading" slice where
/// there was no envelope to tell them apart.
function recordingShares(
  teacherPct: number | null,
  studentPct: number | null,
  nonSpeech: { quietPct: number; unresolvedPct: number } | null,
): ShareSlice[] {
  if (teacherPct == null) return []
  const students = studentPct ?? 0
  const rest = Math.max(0, 100 - teacherPct - students)
  const split = nonSpeech && nonSpeech.quietPct + nonSpeech.unresolvedPct > 0 ? nonSpeech : null
  return [
    { kind: 'you', pct: teacherPct },
    { kind: 'other', pct: students },
    ...(split
      ? [
          { kind: 'sound' as const, pct: (rest * split.unresolvedPct) / (split.quietPct + split.unresolvedPct) },
          { kind: 'quiet' as const, pct: (rest * split.quietPct) / (split.quietPct + split.unresolvedPct) },
        ]
      : [{ kind: 'unknown' as const, pct: rest }]),
  ]
}

const BREAK_MOVE = {
  check: 'a quick check would fit there',
  pause: 'a pause would let it land',
  question: 'a question to the room would fit there',
} as const

/// The longest unbroken stretch of your talk: how long, what it was doing,
/// its words behind "Show transcript", and a place to break it only when the
/// stretch read found one — most stretches read best whole, and the card says
/// nothing rather than suggest cutting an idea in half.
function LongestStretchCard({
  stretch,
  read,
  segments,
}: {
  stretch: { startSec: number; endSec: number; durationSec: number; opening: string }
  read: NonNullable<AudioSessionWithSegments['teachingMoves']>['stretch'] | null
  segments: TranscriptSegment[]
}) {
  const [open, setOpen] = useState(false)
  // The read belongs to this stretch only if it found the same one.
  const matched = read && Math.abs(read.startSec - stretch.startSec) < 1 ? read : null
  const lines = segments.filter(
    (s) => s.speakerLabel === 'Teacher' && s.text.trim() && s.startSec >= stretch.startSec - 0.01 && s.endSec <= stretch.endSec + 0.01,
  )
  const brk = matched?.breakAfter ?? null
  // The first line that says something: a stretch often opens on a fragment
  // ("Alright. So").
  const opening = (lines.find((l) => l.text.trim().split(/\s+/).length >= 6) ?? lines[0])?.text.trim() ?? stretch.opening
  return (
    <div className="flex flex-col gap-2 border-t border-dashed border-hairline pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-heading text-base font-bold text-forest">Your longest explanation</p>
        <span className="font-heading text-base font-bold text-forest">about {Math.max(1, Math.round(stretch.durationSec / 60))} min</span>
      </div>
      {matched?.about && <p className="-mt-1 text-xs text-ink-soft">{matched.about[0].toUpperCase() + matched.about.slice(1)}</p>}
      <div className="rounded-r-xl border-l-4 border-terracotta bg-cream px-3.5 py-2.5">
        <div className="flex justify-between text-xs font-semibold uppercase tracking-wide text-ink-soft">
          <span>From the stretch</span>
          <span>{formatTime(stretch.startSec)}–{formatTime(stretch.endSec)}</span>
        </div>
        <p className="mt-1 text-sm text-ink">“{opening}”</p>
        {open && (
          <div className="mt-2 flex flex-col gap-1.5 border-t border-hairline pt-2">
            {lines.filter((l) => l.text.trim() !== opening).map((l) => (
              <p key={l.id} className="text-sm text-ink-soft">
                <span className="mr-2 font-mono text-xs">{formatTime(l.startSec)}</span>
                {l.text.trim()}
              </p>
            ))}
          </div>
        )}
      </div>
      {lines.length > 1 && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="self-start text-sm font-semibold text-terracotta-600 hover:underline">
          {open ? 'Hide transcript' : 'Show transcript'}
        </button>
      )}
      {brk && (
        <p className="rounded-xl bg-cream px-3 py-2 text-sm text-ink">
          <span className="font-semibold">A place to break it up:</span> after “{brk.quote}” ({formatTime(brk.atSec)}) — {brk.closes} is
          complete there, and {BREAK_MOVE[brk.move]}.
        </p>
      )}
      <p className="text-xs text-ink-soft">
        A stretch ends when a student is heard or you pause for more than ten seconds. A student the microphone missed does not end it.
      </p>
    </div>
  )
}

/// The frame every Insights section shares: the header inside a white card,
/// the coach note, the section's own content, Keep and Try next time, and a
/// footer with "How to read this", "The hard look" and the coach.
function SectionShell({
  section,
  note,
  keep,
  tryNext,
  tryGoal,
  howToRead,
  lastRow,
  onDiscuss,
  children,
}: {
  section: InsightsSection
  note: string | null
  keep: KeepLine | null
  tryNext: string | null | undefined
  tryGoal?: string | null
  howToRead: React.ReactNode
  lastRow: React.ReactNode
  onDiscuss: () => void
  children: React.ReactNode
}) {
  const [panel, setPanel] = useState<'read' | 'hard' | null>(null)
  return (
    <div className="flex flex-col gap-5 rounded-3xl border border-hairline bg-cream-card p-5 sm:p-6">
      <InsightsSectionHeader section={section} inCard />
      {note && <CoachNoteCard text={note} />}
      {children}
      <KeepAndTry keep={keep} tryNext={tryNext} tryGoal={tryGoal} />
      <div className="flex flex-col gap-3 border-t border-hairline pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {(lastRow ? (['read', 'hard'] as const) : (['read'] as const)).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setPanel(panel === k ? null : k)}
              aria-expanded={panel === k}
              className={`rounded-xl border px-3 py-1.5 text-sm ${panel === k ? 'border-forest text-forest' : 'border-hairline text-ink'} hover:border-forest`}
            >
              {k === 'read' ? 'How to read this' : 'The hard look'}
            </button>
          ))}
          <button type="button" onClick={onDiscuss} className="ml-auto text-sm font-semibold text-terracotta-600 hover:underline">
            Discuss with Wivoza Coach →
          </button>
        </div>
        {panel === 'read' && <div className="flex flex-col gap-2 rounded-2xl bg-cream p-4">{howToRead}</div>}
        {panel === 'hard' && (
          <div className="rounded-2xl bg-cream px-4">
            {isValidElement<{ bare?: boolean }>(lastRow) ? cloneElement(lastRow, { bare: true }) : lastRow}
          </div>
        )}
      </div>
    </div>
  )
}

type Evidence = { quote: string; timestampSec: number; tag: string }

/// A name set off by commas the way direct address is ("Shania, what…",
/// "…do you think, Caleb?"). Common openers are not names.
const NOT_NAMES = new Set(['okay', 'ok', 'so', 'now', 'well', 'yes', 'yeah', 'alright', 'right', 'and', 'but', 'guys', 'everyone', 'everybody', 'class', 'folks', 'friends', 'sure', 'wait', 'really', 'hmm', 'um', 'good', 'great', 'perfect', 'exactly', 'nice'])
const ADDRESSED = /(^|[,.!?]\s*)(\p{Lu}\p{Ll}+(?:['’-]\p{L}+)*)(?=\s*[,?])/gu
function addressedName(text: string): boolean {
  for (const m of text.matchAll(ADDRESSED)) if (!NOT_NAMES.has(m[2].toLowerCase())) return true
  return false
}
/// The question with any name it addresses a student by shown as "[name]".
function withoutAddressedNames(text: string): string {
  return text.replace(ADDRESSED, (whole, lead: string, word: string) => (NOT_NAMES.has(word.toLowerCase()) ? whole : `${lead}[name]`))
}

const MIX = {
  recall: { label: 'Recall', color: '#A89C84', desc: 'One right answer, retrieved from memory.' },
  explain: { label: 'Explain', color: '#4F9A72', desc: 'Students put an idea in their own words — why or how.' },
  reasoning: { label: 'Reasoning', color: '#173F2D', desc: 'Asked students to justify, compare or judge.' },
} as const
type MixKey = keyof typeof MIX
const KIND_TO_MIX: Record<string, MixKey> = { recall: 'recall', explain: 'explain', justify: 'reasoning', compare: 'reasoning', evaluate: 'reasoning' }

/// Each counted question in one of three kinds: the finer read where it found
/// the question, else the recall / higher-order split (higher-order without a
/// finer kind reads as explain). Shared by Questioning & Checking and Summary
/// so the two never show different numbers.
function classifyQuestions(session: AudioSessionWithSegments) {
  const kinds = session.teachingMoves?.questionKinds ?? []
  const kindAt = (sec: number) => kinds.find((k) => Math.abs(k.timestampSec - sec) <= 4)?.kind
  return (session.questionLog ?? []).map((q) => {
    const kind = kindAt(q.timestampSec)
    const mix: MixKey = kind ? (KIND_TO_MIX[kind] ?? 'recall') : q.type === 'higher_order' ? 'explain' : 'recall'
    return { quote: withoutAddressedNames(q.text), timestampSec: q.timestampSec, mix, byName: addressedName(q.text) }
  })
}

/// Questioning & Checking: what you asked and what it asked of students, who
/// you asked, and how you followed up — from your own words, never a score,
/// never a claim that students understood.
function QuestioningCheckingTab({
  session,
  questioningInsight,
  nextStep,
  lastRow,
  onDiscuss,
}: {
  session: AudioSessionWithSegments
  questioningInsight: string | null
  nextStep: string | null | undefined
  lastRow: React.ReactNode
  onDiscuss: () => void
}) {
  const moves = session.teachingMoves
  const questions = classifyQuestions(session)
  const count = (k: MixKey) => questions.filter((q) => q.mix === k).length
  const byName = questions.filter((q) => q.byName).length

  // Follow-ups: one dot per heard answer, filled where you followed up.
  const detail = (session.metricsDetail ?? {}) as Record<string, unknown>
  const log = session.metricsLogs?.answerLog ?? detail.answerLog
  const answers = Array.isArray(log) ? (log as { timestampSec: number; followed: boolean }[]) : []
  const heard = typeof detail.answersHeardCount === 'number' ? detail.answersHeardCount : null
  const followed = typeof detail.answersFollowedUpCount === 'number' ? detail.answersFollowedUpCount : null
  const checksAll = (session.cfuLog ?? []).filter((c) => c.loop?.who !== 'not_a_check')
  const followLines: Evidence[] = [
    ...checksAll
      .filter((c) => c.loop?.acted?.how === 'adjusted' && c.loop.acted.text)
      .map((c) => ({ quote: c.loop!.acted!.text!, timestampSec: c.loop!.acted!.atSec, tag: 'Revisited a possible misunderstanding' })),
    ...(moves?.participation?.extending ?? moves?.revisionPrompts ?? []).map((q) => ({
      quote: q.quote,
      timestampSec: q.timestampSec,
      tag: 'kind' in q ? (EXTEND_KIND_LABEL[(q as { kind: keyof typeof EXTEND_KIND_LABEL }).kind] ?? 'Follow-up') : 'Follow-up',
    })),
  ]
  // What you said right after each answer you followed up — the same
  // pairing the dots count, so the list and "X of Y" always agree. The kind
  // comes from the follow-up read where it found the same moment.
  const fuLogRaw = session.metricsLogs?.followUpLog ?? detail.followUpLog
  const fuLog = Array.isArray(fuLogRaw) ? (fuLogRaw as { timestampSec: number; text: string }[]) : []
  const pairedLines: Evidence[] = answers.flatMap((a, i) => {
    if (!a.followed) return []
    const nextAt = answers[i + 1]?.timestampSec ?? Infinity
    const fu = fuLog.find((f) => f.timestampSec >= a.timestampSec && f.timestampSec < nextAt)
    if (!fu) return []
    const read = followLines.find((l) => Math.abs(l.timestampSec - fu.timestampSec) <= 5)
    return [{ quote: withoutAddressedNames(fu.text), timestampSec: fu.timestampSec, tag: read?.tag ?? 'Follow-up' }]
  })
  const shownFollowUps = pairedLines.length > 0 ? pairedLines : followLines.slice(0, 1)
  const unfollowed = answers.filter((a) => !a.followed)
  const [showUnfollowed, setShowUnfollowed] = useState(false)
  const showRate = heard != null && followed != null && heard >= 3

  const reasoningFirst = questions.find((q) => q.mix === 'reasoning') ?? questions.find((q) => q.mix === 'explain')
  const keep: KeepLine | null = reasoningFirst
    ? {
        text:
          count('reasoning') > 0
            ? `Your “why” questions. ${count('reasoning')} asked students to justify, compare or judge, not just answer.`
            : `${count('explain')} of your questions asked students to explain why or how.`,
        quote: reasoningFirst.quote,
        timestampSec: reasoningFirst.timestampSec,
      }
    : null
  const goal = showRate && followed! < heard! ? `Goal: ${Math.min(heard!, followed! + 2)} of ${heard} answers followed up, up from ${followed}.` : null

  return (
    <SectionShell
      section="questions"
      note={questioningInsight}
      keep={keep}
      tryNext={nextStep}
      tryGoal={goal}
      lastRow={lastRow}
      onDiscuss={onDiscuss}
      howToRead={
        <>
          <p className="text-sm text-ink-soft">
            Questions are the ones you asked and left with students — not "okay?", "right?" or "are we ready?". Each is
            sorted by what answering it asked for: recall, explaining why or how, or reasoning (justifying, comparing,
            judging).
          </p>
          <p className="text-sm text-ink-soft">
            A check is a moment you asked students to show or say what they understood. Each says who it asked and what you
            did next — from your own words, so a check you acted on silently (scanning boards, changing course without
            saying so) shows as nothing heard. It never says whether students understood.
          </p>
          <p className="text-sm text-ink-soft">
            A follow-up can only be spotted after a student answer the recording heard, so the dots count those answers
            only.
          </p>
        </>
      }
    >
      {/* Your questions and checks, on one lesson timeline; a key item shows
          its moments. */}
      <QuestionsChecksPart session={session} questions={questions} byName={byName} />

      {/* Your follow-ups: a dot per answer heard, filled where you followed up. */}
      <div className="flex flex-col gap-4 border-t border-dashed border-hairline pt-5">
        <p className="font-heading text-xl font-bold text-forest">Your follow-ups</p>
        {showRate ? (
          <div className="flex flex-wrap items-center gap-4">
            {answers.length > 0 && (
              <span className="flex flex-wrap gap-1.5" role="img" aria-label={`${followed} of ${heard} answers followed up`}>
                {answers.map((a, i) => (
                  <i
                    key={i}
                    className="inline-block h-5 w-5 rounded-full border-2"
                    style={{ borderColor: a.followed ? '#B4593A' : '#D8CDB8', background: a.followed ? '#B4593A' : 'transparent' }}
                  />
                ))}
              </span>
            )}
            <p className="text-base font-semibold text-ink">
              You followed up on {followed} of the {heard} student answers the recording could hear.
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">
            Too few student answers came through to count follow-ups{followLines.length > 0 ? ' — here is one the recording caught.' : '.'}
          </p>
        )}
        {shownFollowUps.map((l, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 rounded-xl bg-cream px-3.5 py-3 text-sm text-ink">
            <div>
              <span className="mb-1 block text-xs font-semibold text-ink-soft">{l.tag}</span>“{l.quote}”
            </div>
            <span className="shrink-0 font-mono text-xs text-ink-soft">{formatTime(l.timestampSec)}</span>
          </div>
        ))}
        {unfollowed.length > 0 && (
          <>
            <button type="button" onClick={() => setShowUnfollowed((v) => !v)} className="self-start text-sm font-semibold text-terracotta-600 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-terracotta/40">
              {showUnfollowed ? 'Hide' : `Answers without a follow-up (${unfollowed.length})`}
            </button>
            {showUnfollowed && (
              <div className="flex flex-wrap gap-2 text-xs text-ink-soft">
                {unfollowed.map((a, i) => (
                  <span key={i} className="rounded-full bg-cream px-2.5 py-1 font-mono">
                    {formatTime(a.timestampSec)}
                  </span>
                ))}
                <span className="basis-full">A student answered at these times and the next thing you said was not a follow-up.</span>
              </div>
            )}
          </>
        )}
      </div>
    </SectionShell>
  )
}

const CHECK_WHO: Record<string, string> = {
  everyone: 'Asked everyone',
  few: 'A few answered',
  asked_if_understood: 'Asked if they understood',
}
const CHECK_ACTED: Record<string, string> = { adjusted: 'You went back over it', confirmed: 'You confirmed and moved on' }

type QPick = MixKey | 'checks'
type QMoment = { t: number; quote: string; tag?: string; then?: string | null }

/// Your questions and checks for understanding on one lesson timeline: each
/// question a dot in its kind's colour, each check a ring (solid when it asked
/// everyone, dashed when it asked whether they understood). The key's pills
/// choose which moments the list below shows; a dot shows its own. Checks the
/// read found were not checks are left out. Never a claim that students
/// understood.
function QuestionsChecksPart({
  session,
  questions,
  byName,
}: {
  session: AudioSessionWithSegments
  questions: ReturnType<typeof classifyQuestions>
  byName: number
}) {
  const checks = (session.cfuLog ?? []).filter((c) => c.loop?.who !== 'not_a_check')
  const count = (k: MixKey) => questions.filter((q) => q.mix === k).length
  const beyond = count('explain') + count('reasoning')
  const [pick, setPick] = useState<QPick>(
    count('reasoning') > 0 ? 'reasoning' : count('explain') > 0 ? 'explain' : questions.length > 0 ? 'recall' : 'checks',
  )
  const [hot, setHot] = useState<number | null>(null)
  if (questions.length === 0 && checks.length === 0) {
    return (
      <div className="flex flex-col gap-2 border-t border-dashed border-hairline pt-5">
        <p className="font-heading text-xl font-bold text-forest">Your questions and checks</p>
        <p className="text-sm text-ink-soft">No questions or checks for understanding were heard in this lesson.</p>
      </div>
    )
  }
  const duration = session.durationSec ?? Math.max(60, ...questions.map((q) => q.timestampSec), ...checks.map((c) => c.timestampSec))
  const x = (sec: number) => `${Math.min(98.5, Math.max(1.5, (sec / duration) * 100)).toFixed(2)}%`
  const everyone = checks.filter((c) => c.loop?.who === 'everyone').length
  const askedIf = checks.filter((c) => c.loop?.who === 'asked_if_understood').length
  const acted = checks.filter((c) => c.loop?.acted).length

  const moments: QMoment[] =
    pick === 'checks'
      ? checks.map((c) => ({
          t: c.timestampSec,
          quote: withoutAddressedNames(c.text),
          tag: [c.loop ? CHECK_WHO[c.loop.who] : 'Check for understanding', c.loop?.acted ? CHECK_ACTED[c.loop.acted.how] : null]
            .filter(Boolean)
            .join(' · '),
          then: c.loop?.acted?.text ? withoutAddressedNames(c.loop.acted.text) : null,
        }))
      : questions.filter((q) => q.mix === pick).map((q) => ({ t: q.timestampSec, quote: q.quote }))

  const pills: { key: QPick; label: string; n: number; swatch: React.ReactNode }[] = [
    ...(Object.keys(MIX) as MixKey[]).map((k) => ({
      key: k as QPick,
      label: MIX[k].label,
      n: count(k),
      swatch: <i className="inline-block h-3 w-3 rounded-full" style={{ background: MIX[k].color }} />,
    })),
    {
      key: 'checks',
      label: 'Checks for understanding',
      n: checks.length,
      swatch: <i className="inline-block h-3 w-3 rounded-full border-2 border-[#B4593A]" />,
    },
  ]
  const ring = (who: string | undefined) => (who === 'asked_if_understood' ? 'border-dashed' : '')

  return (
    <div className="flex flex-col gap-4 border-t border-dashed border-hairline pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-heading text-xl font-bold text-forest">Your questions and checks</p>
        <span className="text-sm text-ink-soft">
          {questions.length} question{questions.length === 1 ? '' : 's'} · {checks.length} check{checks.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="text-base font-semibold text-ink">
        {questions.length === 0
          ? 'No questions were heard. '
          : beyond === 0
            ? `All ${questions.length} questions asked students to recall something. `
            : `${beyond} of ${questions.length} were higher-order questions (explain or reasoning). `}
        {checks.length === 0
          ? 'No checks for understanding were heard.'
          : `You checked for understanding ${checks.length} time${checks.length === 1 ? '' : 's'}${
              everyone > 0 ? `, ${everyone === checks.length ? 'each' : `${everyone} of them`} asking everyone` : ''
            }.`}
      </p>

      {/* One timeline: questions above, checks below. */}
      <div className="rounded-2xl border border-hairline bg-cream-card px-4 py-3.5">
        {[
          // A white edge keeps dots that fall close together readable as separate.
          { label: 'Questions', items: questions.map((q, i) => ({ i, t: q.timestampSec, on: pick === q.mix, node: <i className="block h-3.5 w-3.5 rounded-full ring-2 ring-cream-card" style={{ background: MIX[q.mix].color }} /> })) },
          { label: 'Checks', items: checks.map((c, i) => ({ i: 1000 + i, t: c.timestampSec, on: pick === 'checks', node: <i className={`block h-3.5 w-3.5 rounded-full border-[2.5px] border-[#B4593A] bg-cream-card ring-2 ring-cream-card ${ring(c.loop?.who)}`} /> })) },
        ].map((lane) => (
          <div key={lane.label} className="grid h-9 grid-cols-[72px_1fr] items-center">
            <span className="text-xs font-semibold text-ink-soft">{lane.label}</span>
            <div className="relative h-full">
              <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-hairline" />
              {lane.items.map((it) => (
                <button
                  key={it.i}
                  type="button"
                  aria-label={`${formatTime(it.t)}`}
                  onClick={() => {
                    setPick(it.i >= 1000 ? 'checks' : questions[it.i].mix)
                    setHot(it.i)
                  }}
                  // The button is the dot's own size, so the dot sits on the line.
                  className="absolute top-1/2 grid h-3.5 w-3.5 place-items-center leading-none outline-none transition-transform"
                  // Every mark in full colour and size; only the one tapped grows.
                  style={{ left: x(it.t), transform: `translate(-50%, -50%) scale(${hot === it.i ? 1.5 : 1})` }}
                >
                  {it.node}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[72px_1fr] text-xs text-ink-soft">
          <span />
          <div className="flex justify-between">
            <span>0:00</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* The key, as the choice of what the list shows. */}
      <div className="flex flex-wrap gap-2" role="group">
        {pills
          .filter((pl) => pl.n > 0)
          .map((pl) => {
            const on = pick === pl.key
            return (
              <button
                key={pl.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setPick(pl.key)
                  setHot(null)
                }}
                className={`flex min-h-[40px] items-center gap-2 rounded-full border-[1.5px] px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-terracotta/40 ${on ? 'border-forest bg-forest text-cream' : 'border-hairline bg-cream-card text-ink'}`}
              >
                {pl.swatch}
                {pl.label}
                <span className={`rounded-full px-2 text-xs ${on ? 'bg-white/20 text-cream' : 'bg-cream text-ink-soft'}`}>{pl.n}</span>
              </button>
            )
          })}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-cream p-4" aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <b className="text-sm text-forest">
            {pick === 'checks' ? `Checks for understanding · ${checks.length}` : `${MIX[pick].label} · ${moments.length} of ${questions.length}`}
          </b>
          <span className="text-xs text-ink-soft">Tap a dot, or a kind above</span>
        </div>
        <p className="-mt-1 text-sm text-ink-soft">
          {pick === 'checks'
            ? `Moments you asked students to show or say what they understood${askedIf > 0 ? ` — ${askedIf} only asked whether they understood` : ''}. ${
                acted > 0 ? `You said what you'd do with the answers ${acted} time${acted === 1 ? '' : 's'}.` : 'No response to the answers was heard.'
              }`
            : MIX[pick].desc}
        </p>
        {moments.map((m, i) => {
          const isHot = hot != null && (pick === 'checks' ? hot - 1000 === i : questions.indexOf(questions.filter((q) => q.mix === pick)[i]) === hot)
          return (
            <div
              key={i}
              className={`flex items-baseline justify-between gap-4 rounded-xl px-3.5 py-3 text-sm text-ink ${isHot ? 'bg-cream-card ring-2 ring-forest' : 'bg-cream-card'}`}
            >
              <div>
                {m.tag && <span className="mb-1 block text-xs font-semibold text-ink-soft">{m.tag}</span>}
                “{m.quote}”
                {m.then && <span className="mt-1 block text-ink-soft">Then: “{m.then}”</span>}
              </div>
              <span className="shrink-0 font-mono text-xs text-ink-soft">{formatTime(m.t)}</span>
            </div>
          )
        })}
      </div>

      {questions.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink">
          <b>Who you asked</b>
          <span className="rounded-full bg-cream px-3 py-1">{questions.length - byName} open to anyone</span>
          {byName > 0 && <span className="rounded-full bg-cream px-3 py-1">{byName} to a student by name</span>}
        </div>
      )}
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
    case 'topic':
    case 'content': {
      const notes = session.contentNotes?.notes ?? []
      return notes.length > 0 ? notes.map((n) => `${n.label}: ${n.text}`).join(' ') : null
    }
    default:
      return null
  }
}

/// `lead` is how the item is introduced once it leaves the report: a content
/// note is an observation, and a plan needs to be told what to do with it.


function RowChevron({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={`h-4 w-4 shrink-0 text-ink-soft transition-transform ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 7.5l5 5 5-5" />
    </svg>
  )
}

function DiscussFooter({ label, onClick, compact }: { label: string; onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        compact
          ? 'mt-4 rounded-xl border border-hairline bg-cream-card px-4 py-2.5 text-sm font-semibold text-forest transition-colors hover:border-terracotta/40 hover:text-terracotta-600'
          : 'mt-2 w-full rounded-2xl border border-hairline bg-cream-card px-5 py-4 text-left text-sm font-semibold text-forest transition-colors hover:border-terracotta/40 hover:text-terracotta-600'
      }
    >
      {label} →
    </button>
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
            : session.status === 'analyzing'
              ? { label: 'Building your report', className: 'bg-gold-tint text-forest' }
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
