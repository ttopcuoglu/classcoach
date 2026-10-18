import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowUpIcon, ChatBubbleIcon, ChecklistIcon, HeartIcon, KebabIcon, MicIcon, PlayIcon } from '../components/icons'
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
  type AudioCfuLogEntry,
  type AudioContentNotes,
  type AudioDirectiveLogEntry,
  type AudioFeedbackLogEntry,
  type AudioHighlight,
  type AudioLessonContent,
  type AudioQuestionLogEntry,
  type AudioReflectMessage,
  type AudioEscalation,
  type AudioTeachingMoves,
  type AudioEscalationRung,
  type AudioRedirectionLogEntry,
  type AudioHardLook,
  type AudioRubricLens,
  type AudioSession,
  type AudioSessionWithSegments,
  type SoundTimeline,
  type AudioToneLogEntry,
  type ApiError,
  type FocusMetric,
  type ReflectChatErrorKind,
  type SpeakerSample,
  type TalkVoice,
  type TranscriptSegment,
} from '../lib/api'
import { THIN_AUDIBLE_SHARE_PCT, useCaptureMonitor } from '../hooks/useCaptureMonitor'
import { buildCorrectionBalance, coverageCaveatLine, DETECTION_CAVEAT } from '../lib/correctionBalance'
import {
  buildEvidenceQualityLine,
  evidenceLabel,
  formatRatio,
  getCoverage,
  getCountMetric,
  getFollowUpMetric,
  feedbackMeasurable,
  getPresenceMetric,
  isConfidentState,
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
  type MetricState,
  type TalkBalanceJudgment,
  waitTime2Metric,
  leadingSilenceNote,
  CONVERSATIONAL_WPM,
} from '../lib/reportConfidence'
import {
  buildNextTimeItems,
  buildStrengthCandidates,
  formatCandidateHeadline,
  highlightCandidates,
  pickTop,
  type NoticeCandidate,
} from '../lib/reportHighlights'
import InsightsPage from '../components/insights/InsightsPage'
import { FocusCheckInHistory } from '../components/insights/FocusCards'
import type { SectionKey as InsightsV3Section } from '../lib/insightsModel'
import {
  FOLLOW_UPS_OFF,
  LONG_PAUSE_SEC,
  NOT_IN_THIS_REPORT,
  pauseAfterQuestionsMetric,
  STUDENT_METRICS_ON,
  teacherLinesOnly,
  teacherVoiceView,
} from '../lib/teacherVoice'

/// The v3 Insights layout (components/insights) is the layout for everyone.
/// `?insights=old` still opens the previous one on this browser, for
/// comparing the two while it beds in; `?insights=new` comes back. The
/// choice is remembered so clicking between lessons stays in one layout.
function wantsNewInsights(): boolean {
  const param = new URLSearchParams(window.location.search).get('insights')
  try {
    if (param === 'old') localStorage.setItem('wivozaInsightsOld', '1')
    if (param === 'new') localStorage.removeItem('wivozaInsightsOld')
    return localStorage.getItem('wivozaInsightsOld') !== '1'
  } catch {
    return param !== 'old'
  }
}

/// Which of the old four sections' Hard Look and Discuss each new section
/// carries. Clarity has none of its own: the old "content" critiques belong
/// to the Content Lens, and showing them twice would say them twice.
const V3_OLD_SECTION: Record<InsightsV3Section, InsightsSection | null> = {
  talk_pace: 'talk',
  questioning: 'questions',
  clarity: null,
  climate: 'routines',
  content_lens: 'content',
}

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

type ReportTab = 'summary' | 'insights' | 'rubric' | 'reflect' | 'growth'
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
}

// Lets the stat groups inside a section tint themselves with that section's
// colour without every Insights tab having to pass it down by hand.
const SectionAccentContext = createContext<Accent>(ACCENTS.mint)

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
  if (!STUDENT_METRICS_ON) {
    // The split and everything said about it rest on the student share.
    return session.teacherTalkPct != null
      ? `You spoke for about ${Math.round(session.teacherTalkPct)}% of the recording.`
      : null
  }
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
  if (!STUDENT_METRICS_ON) {
    // The same count the stat shows, and no reading of it: the pause runs to
    // your next line and may hold a student's answer.
    const pause = pauseAfterQuestionsMetric(session.questionLog)
    if (pause.timed > 0) {
      sentence += ` ${pause.long} of the ${pause.timed} questions that could be timed had ${LONG_PAUSE_SEC} seconds or more before you spoke again.`
    }
    return sentence
  }
  if (followUpMetric.state === 'measured') {
    sentence += ` You followed up on a question ${followUpMetric.display} time${followUpMetric.display === '1' ? '' : 's'} — that's a habit worth keeping.`
  } else if (followUpMetric.state === 'confirmed_none') {
    sentence += ' No follow-up questions were detected after a student answer today — a quick "say more about that" can go a long way.'
  }
  // Reads the SAME number the stat card shows. It used to cite
  // avgWaitTimeSec while the card beside it had been changed to held
  // silence, so Summary said "your average wait time was 1.8s" next to a
  // card reading "—". A report that contradicts itself on one screen spends
  // trust it cannot earn back.
  const heldSilence = session.metricsDetail?.heldSilenceSec
  if (heldSilence != null) {
    sentence +=
      heldSilence >= 3
        ? ` When nobody answered, you held the silence for ${heldSilence.toFixed(1)}s on average — that's real thinking room.`
        : ` When nobody answered, you held the silence for ${heldSilence.toFixed(1)}s on average — waiting a beat longer can bring more students into a response.`
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

// A section's note opens with its first two or three sentences and keeps the
// rest behind "Read more". The note is the reading of the section; the page
// below it is the evidence, and a teacher should reach the evidence without
// scrolling past a paragraph first. Short notes are shown whole.
function CoachNote({ text }: { text: string | null }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  const full = text.trim()
  const opening = noteOpening(full)
  // Not worth a button to reveal one more short sentence.
  const folds = full.length - opening.length > 80
  const paragraphs = open || !folds ? splitParagraphs(full) : [opening]
  return (
    <div className="flex items-start gap-3 rounded-xl border border-mint-tint bg-mint-tint/60 p-4">
      <ChatBubbleIcon className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
      <div className="flex flex-col gap-2">
        {paragraphs.map((para, i) => (
          <p key={i} className="text-sm text-ink">
            {para}
            {folds && i === paragraphs.length - 1 && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  className="font-semibold text-forest underline decoration-hairline underline-offset-4 hover:text-terracotta-600"
                >
                  {open ? 'Show less' : 'Read more'}
                </button>
              </>
            )}
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
  teacherPace:
    'Pick the stretch where you introduce something new and deliberately slow it — the same words, more room between them.',
  waitTime2:
    'When a student finishes, count two silently before you speak. That gap is where their second sentence lives.',
  longestMonologue:
    'Choose one point in your longest explanation to stop and take a question, even if nobody has raised a hand.',
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
  /// The status pill (evidenceLabel): "2 instances", "Clear pattern"...
  pill: string
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
  waitTime2: 's',
  teacherPace: ' wpm',
  longestMonologue: 's',
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
    pill: evidenceLabel(metric),
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

// Fixed tie-break order so ranking is deterministic across renders.



// Deliberately restricted to Overview's own three categories (talk,
// questioning, checking-understanding) plus highlights — Climate & Routines
// metrics have no FocusMetric key today, so including them would break "Set
// as my focus" wiring and require extending FocusMetric/My Growth, which is
// out of scope here.

// Always shows a duration and a timestamp as two distinct, explicitly
// labeled things — never a bare "label · 0:38" that leaves it ambiguous
// whether the number is how long something lasted or when it happened.

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

/// What Insights leaves out on purpose while student metrics are off, said
/// once at the foot of every section so a missing number reads as a decision
/// rather than a gap.
function NotInThisReport() {
  const items = NOT_IN_THIS_REPORT.join(', ')
  return (
    <div className="mt-6 flex items-start gap-3 rounded-2xl border-2 border-dashed border-hairline bg-cream p-4 text-sm text-ink-soft">
      <HatchedSwatch className="mt-1 h-3 w-3 shrink-0 rounded-sm" />
      <p>
        <span className="font-semibold text-ink">Not in this report:</span> {items[0].toUpperCase() + items.slice(1)}.
        These need each voice told apart from yours, which a room recording can't yet do reliably, so this report is
        built from your voice only.
      </p>
    </div>
  )
}

/// What the hatched slice holds while student metrics are off.
const NOT_YOUR_SPEECH_NOTE =
  '“Not your speech” is the rest of the recording: students, other voices, quiet work, and sound the microphone couldn’t make out. This report is built from your voice, so it doesn’t split that up.'

/// Pace used to be a trailing item in the talk legend, where it read as a
/// fourth slice of the bar rather than a separate measure. It is the one
/// number here a teacher can act on the same afternoon, so it gets its own
/// line — with an anchor, because "181" means nothing on its own, and a target
/// would be wrong: a lab demo and a read-aloud are different speeds and
/// neither is a fault.
function PaceAnchor({ wpm }: { wpm: number }) {
  return (
    <div className="rounded-xl bg-cream p-3">
      <p className="text-sm text-ink">
        <span className="font-semibold">Your pace — {wpm} words a minute.</span> Everyday conversation runs about
        150.
      </p>
      <p className="mt-0.5 text-xs text-ink-soft">An anchor to place yourself against, not a target.</p>
    </div>
  )
}

// One stacked bar (Teacher / Students / the rest — all in one, not two
// separate visualizations) plus a legend grid below it.
//
// "Silence or other" was one combined segment for a good reason: batch
// transcription has no voice-activity signal, so a quiet room and a room the
// microphone could not resolve produced the identical number, and splitting
// it would have been invented precision. On one real lesson that slice was
// 85%, and nothing in the report could say which it had been.
//
// The loudness envelope the device now uploads answers it, so the split is
// shown WHERE THERE IS ONE and the combined slice stays everywhere else —
// every recording made before envelopes existed, and any where the teacher's
// own speech could not be located well enough to calibrate against.
function TalkParticipationBar({
  teacherPct,
  studentPct,
  silencePct,
  nonSpeech,
  compact,
  paceWpm,
}: {
  teacherPct: number | null
  studentPct: number | null
  silencePct: number | null
  /// Seconds of quiet versus seconds with sound the transcript has no words
  /// for. Absent unless the recording carried an envelope.
  nonSpeech?: { quietPct: number; unresolvedPct: number } | null
  compact?: boolean
  /// Given on the Insights page, where pace sits in the same line as the split.
  paceWpm?: number | null
}) {
  const barHeight = compact ? 'h-3' : 'h-4'
  if (teacherPct == null) {
    return <HatchedBar label="Talk balance unavailable this session" className={barHeight} />
  }
  if (!STUDENT_METRICS_ON) {
    // Two parts: you, and everything else. Splitting the rest into students,
    // quiet and sound needs the speaker split this report does not trust, so
    // it stays one hatched slice — the same mark as everywhere else the
    // recording could not say. Both shares are of the same span, so they add
    // to 100.
    const otherPct = Math.max(0, Math.round((100 - teacherPct) * 10) / 10)
    const show = (pct: number) => (compact ? `${pct}%` : `${Math.round(pct)}%`)
    return (
      <div className="flex flex-col gap-3">
        <div className={`flex w-full overflow-hidden rounded-full bg-cream ${barHeight}`}>
          <div className="h-full bg-terracotta" style={{ width: `${teacherPct}%` }} />
          <div className="h-full" style={{ width: `${otherPct}%`, ...HATCH_STYLE }} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-soft">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-terracotta" /> You {show(teacherPct)}
          </span>
          <span className="flex items-center gap-1.5">
            <HatchedSwatch className="h-2.5 w-2.5 rounded-sm" /> Not your speech {show(otherPct)}
          </span>
        </div>
        {!compact && <p className="text-xs text-ink-soft">{NOT_YOUR_SPEECH_NOTE}</p>}
        {paceWpm != null && <PaceAnchor wpm={paceWpm} />}
      </div>
    )
  }
  const remainder = Math.max(0, 100 - teacherPct - (studentPct ?? 0) - (silencePct ?? 0))
  return (
    <div className="flex flex-col gap-3">
      <div className={`flex w-full overflow-hidden rounded-full bg-cream ${barHeight}`}>
        <div className="h-full bg-terracotta" style={{ width: `${teacherPct}%` }} />
        {studentPct != null && <div className="h-full bg-gold" style={{ width: `${studentPct}%` }} />}
        {nonSpeech ? (
          <>
            <div className="h-full bg-hairline" style={{ width: `${nonSpeech.quietPct}%` }} />
            {/* Hatched, like every other "we could not read this" mark in the
                report — sound with no words in it is missing data, not a
                measured quantity of anything. */}
            <div className="h-full" style={{ width: `${nonSpeech.unresolvedPct}%`, ...HATCH_STYLE }} />
          </>
        ) : silencePct != null ? (
          <div className="h-full bg-hairline" style={{ width: `${silencePct}%` }} />
        ) : (
          <div className="h-full" style={{ width: `${remainder}%`, ...HATCH_STYLE }} />
        )}
      </div>
      {paceWpm !== undefined ? (
        <>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-soft">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-terracotta" /> You {Math.round(teacherPct)}%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-gold" /> Students{' '}
            {studentPct != null ? `${Math.round(studentPct)}%` : 'unavailable'}
          </span>
          {nonSpeech ? (
            <>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-hairline" /> Quiet{' '}
                {Math.round(nonSpeech.quietPct)}%
              </span>
              <span className="flex items-center gap-1.5">
                <HatchedSwatch className="h-2.5 w-2.5 rounded-sm" /> Sound, no words{' '}
                {Math.round(nonSpeech.unresolvedPct)}%
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-hairline" /> Silence or other{' '}
              {silencePct != null ? `${Math.round(silencePct)}%` : 'unavailable'}
            </span>
          )}
        </div>
          {/* "Sound, no words" is what the envelope can support saying and
              no more: the measurement is that sound was present and the
              transcript has no words for it. In a classroom that is usually
              voices, which is why the label says so — but a video, a fire
              drill or a teacher at the far side of the room reads exactly the
              same, and the caption has to carry that rather than let a bar
              segment make a claim on its own. */}
          {nonSpeech && (
            <p className="text-xs text-ink-soft">
              “Sound, no words” is sound the microphone caught but couldn’t turn into words. In a classroom that is
              usually voices — a video or noise from outside reads the same way.
            </p>
          )}
          {paceWpm != null && <PaceAnchor wpm={paceWpm} />}
        </>
      ) : (
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
      )}
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
  second,
  onExplore,
}: {
  questionsMetric: ReturnType<typeof getCountMetric>
  /// Follow-ups, or the pause after a question while student metrics are off.
  second: { metric: ConfidentMetric; label: string }
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
          <p className="text-2xl font-semibold text-ink">{second.metric.display}</p>
          <p className="text-xs text-ink-soft">{second.label}</p>
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

  // Summary and Insights read the lesson through this: every student-derived
  // value removed while student metrics are off (lib/teacherVoice.ts).
  // `session` stays the whole record, because every update is spread from it.
  const report = useMemo(() => teacherVoiceView(session), [session])
  const [newInsights] = useState(wantsNewInsights)
  const metrics = report.metricsDetail ?? {}
  const recordedSec = report.durationSec ?? 0
  const coverage = getCoverage(report.durationSec, report.phases, report.metricsDetail)
  const num = (key: string) => (typeof metrics[key] === 'number' ? (metrics[key] as number) : null)

  // Talk & Participation
  const teacherTalkMetric = getPresenceMetric(report.teacherTalkPct)
  // One decimal, like the two talk shares it is shown beside — rounded to a
  // whole number it made the three add up to 100.4.
  const silencePct =
    report.teacherTalkPct != null && report.studentTalkPct != null
      ? Math.max(0, Math.round((100 - report.teacherTalkPct - report.studentTalkPct) * 10) / 10)
      : null
  const studentSegmentsMetric = getCountMetric({ count: num('studentVoiceSegments'), recordedSec })

  // Questioning & Thinking
  const questionsMetric = getCountMetric({ count: report.questionCount, recordedSec })
  const higherOrderCount = num('higherOrderQuestionCount')
  const higherOrderRatio =
    report.questionCount != null ? formatRatio(higherOrderCount ?? 0, report.questionCount) : null
  const followUpMetric = STUDENT_METRICS_ON
    ? getFollowUpMetric({
        count: num('followUpQuestionCount'),
        studentVoiceSegments: num('studentVoiceSegments'),
        recordedSec,
      })
    : FOLLOW_UPS_OFF
  // The teacher-voice stand-in for wait time, and what a "wait time" focus
  // reads while student metrics are off. One value, shown the same way on
  // Summary, Insights and the export.
  const pauseMetric = pauseAfterQuestionsMetric(report.questionLog)
  const waitTimeMetric = STUDENT_METRICS_ON
    ? waitTimeMetricOf(report.avgWaitTimeSec, report.questionCount)
    : pauseMetric

  // Checking Understanding
  const cfuMetric = getCountMetric({
    count: report.cfuCount,
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

  const reflectContext = buildReflectContext(report, cfuMetric, redirectionMetric, directiveMetric, coverage)

  // The written narrative when the report has one, and the rule-assembled
  // sentence as the fallback for reports made before it existed. The
  // rule-based version can only restate the metrics; the written one can say
  // that a 9.3% higher-order figure undercounts the thinking actually asked
  // for, which is the more useful thing for a teacher to read.
  const talkInsight = report.talkNarrative ?? buildTalkInsight(report, studentSegmentsMetric)
  const questioningInsight =
    report.questionsNarrative ?? buildQuestioningInsight(report, higherOrderRatio, followUpMetric)
  const feedbackTotal = genericCount != null && specificCount != null ? genericCount + specificCount : null
  const cfuInsight = buildCfuInsight(cfuMetric, feedbackRatio, specificCount, feedbackTotal)
  const hasRepeatedInstructionHighlight = (report.highlights ?? []).some((h) => h.label === 'Repeated instruction')
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
  const evidenceQuality = buildEvidenceQualityLine(coverage)

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
            {/* What the report is built from, said once at the top. Replaces
                "8 of 8 metrics measured confidently", which counted any
                metric that was not empty. */}
            {!STUDENT_METRICS_ON && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-forest-soft px-3 py-1 text-cream">Built from your voice</span>
                <span className="rounded-full border border-dashed border-cream/50 px-3 py-1 text-cream/70">
                  Student metrics off
                </span>
              </div>
            )}
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
          session={report}
          coverage={coverage}
          silencePct={silencePct}
          questionsMetric={questionsMetric}
          higherOrderRatio={higherOrderRatio}
          followUpMetric={followUpMetric}
          pauseMetric={pauseMetric}
          cfuMetric={cfuMetric}
          feedbackRatio={feedbackRatio}
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

      {tab === 'insights' && newInsights && (
        <InsightsPage
          report={report}
          slots={{
            footer: (section) => {
              const old = V3_OLD_SECTION[section]
              return (
                <>
                  {old && !(locked && !session.hardLook) && (
                    <SectionHardLook
                      section={old}
                      hardLook={session.hardLook}
                      locked={locked}
                      sending={hardLookSending}
                      error={hardLookError}
                      onGenerate={handleGenerateHardLook}
                    />
                  )}
                  {old && (
                    <DiscussFooter
                      compact
                      label="Discuss with Wivoza Coach"
                      onClick={() =>
                        handleDiscussWithCoach({
                          id: `insights-${section}`,
                          observation: `${INSIGHTS_SECTIONS.find((s) => s.key === old)?.label ?? 'This section'} in this lesson`,
                          whyItMatters: "Let's talk through what this part of the report showed.",
                          timestampSec: null,
                          excerpt: null,
                          durationSec: null,
                          weight: 0,
                          focusMetric: null,
                          detail: narrativeForSection(report, old) ?? undefined,
                        })
                      }
                    />
                  )}
                </>
              )
            },
            climateExtra: (
              <>
                <EscalationCard escalation={report.escalation ?? null} />
                <CorrectionBalanceCard metricsDetail={report.metricsDetail} capturedSharePct={coverage.capturedSharePct} />
              </>
            ),
            contentNotes: {
              sending: contentNotesSending,
              error: contentNotesError,
              locked,
              onGenerate: handleGenerateContentNotes,
            },
          }}
        />
      )}

      {tab === 'insights' && !newInsights && (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <InsightsNav section={insightsSection} onSelect={setInsightsSection} />
          <div className="min-w-0 flex-1">
            {/* Heading first, always. The two lenses used to sit above it, so
                choosing "Talk & Participation" showed two unrelated cards and
                then, fourth down the page, the heading for the thing you had
                just chosen — with its name already printed in the picker above.
                Lenses now come after the content they are lenses on. */}
            <InsightsSectionHeader section={insightsSection} />
            <SectionAccentContext.Provider value={INSIGHTS_SECTION_META[insightsSection].accent}>
            {insightsSection === 'talk' && (
              <TalkParticipationTab session={report} silencePct={silencePct} talkInsight={talkInsight} lastRow={sectionHardLook} />
            )}

            {insightsSection === 'questions' && (
              <QuestioningCheckingTab
                questionCount={report.questionCount}
                questionLog={report.questionLog}
                teachingMoves={report.teachingMoves ?? null}
                questionsMetric={questionsMetric}
                higherOrderRatio={higherOrderRatio}
                higherOrderCount={higherOrderCount}
                followUpMetric={followUpMetric}
                pauseMetric={pauseMetric}
                heldSilenceSec={report.metricsDetail?.heldSilenceSec ?? null}
                heldSilenceCount={report.metricsDetail?.heldSilenceSampleCount ?? 0}
                waitTime2Sec={report.metricsDetail?.waitTime2Sec ?? null}
                waitTime2SampleCount={report.metricsDetail?.waitTime2SampleCount ?? null}
                thinkingTaskCount={report.metricsDetail?.thinkingTaskCount ?? null}
                focusMetric={focusMetric}
                questioningInsight={questioningInsight}
                checksNarrative={report.checksNarrative ?? null}
                nextStep={report.nextSteps?.questions}
                highlights={report.highlights}
                cfuLog={report.cfuLog}
                feedbackLog={report.feedbackLog}
                segments={report.segments}
                lastRow={sectionHardLook}
              />
            )}

            {insightsSection === 'content' && (
              <LessonContentTab
                lessonContent={report.lessonContent}
                contentNotes={report.contentNotes}
                teachingMoves={report.teachingMoves ?? null}
                narrative={report.contentNarrative ?? null}
                isShort={coverage.isShort}
                sending={contentNotesSending}
                error={contentNotesError}
                onGenerate={handleGenerateContentNotes}
                lastRow={sectionHardLook}
              />
            )}

            {insightsSection === 'routines' && (
              <ClimateRoutinesTab
                climateNarrative={report.climateNarrative ?? null}
                nextStep={report.nextSteps?.climate}
                directiveLog={report.directiveLog}
                toneLog={report.toneLog}
                redirectionLog={report.redirectionLog}
                escalation={report.escalation ?? null}
                teachingMoves={report.teachingMoves ?? null}
                metricsDetail={report.metricsDetail}
                capturedSharePct={coverage.capturedSharePct}
                segments={report.segments}
                lastRow={sectionHardLook}
              />
            )}


            <DiscussFooter
              compact
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
                  detail: narrativeForSection(report, insightsSection) ?? undefined,
                })
              }
            />
            {!STUDENT_METRICS_ON && <NotInThisReport />}
            </SectionAccentContext.Provider>
          </div>
        </div>
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
function SummaryTab({
  session,
  coverage,
  silencePct,
  questionsMetric,
  higherOrderRatio,
  followUpMetric,
  pauseMetric,
  cfuMetric,
  feedbackRatio,
  talkInsight,
  questioningInsight,
  cfuInsight,
  classSummary,
  classSummarySending,
  hardLookDoor,
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
  /// Questions with a long pause before you spoke again (lib/teacherVoice.ts).
  pauseMetric: ConfidentMetric
  cfuMetric: ReturnType<typeof getCountMetric>
  feedbackRatio: ConfidentMetric
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
  focusMetric: FocusMetric | null
  focusSnapshot: FocusSnapshot | null
}) {
  const classSummaryProgress = useSimulatedProgress(classSummarySending, 14000)
  const strengthCandidates = buildStrengthCandidates(session, cfuMetric, feedbackRatio, higherOrderRatio)
  const strength = pickTop(strengthCandidates)
  const momentToRevisit = session.momentToRevisit ?? null
  const foundMoment = momentToRevisit?.status === 'found' ? momentToRevisit : null
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
        {/* While student metrics are off the split is you and everything else,
            on the same span so the two add to 100, and the pause is the
            teacher-voice one Insights shows (lib/teacherVoice.ts). */}
        {!STUDENT_METRICS_ON ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat label="You spoke" metric={getPresenceMetric(session.teacherTalkPct)} unit="%" accent={ACCENTS.terracotta} />
            <SummaryStat
              label="Not your speech"
              metric={getPresenceMetric(
                session.teacherTalkPct != null ? Math.max(0, Math.round((100 - session.teacherTalkPct) * 10) / 10) : null,
              )}
              unit="%"
              accent={ACCENTS.mint}
            />
            <SummaryStat label="Questions" metric={questionsMetric} accent={ACCENTS.mint} />
            <SummaryStat label={`Paused ${LONG_PAUSE_SEC}s+ after a question`} metric={pauseMetric} accent={ACCENTS.forest} />
          </div>
        ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <SummaryStat label="You spoke" metric={getPresenceMetric(session.teacherTalkPct)} unit="%" accent={ACCENTS.terracotta} />
          <SummaryStat label="Students spoke" metric={getPresenceMetric(session.studentTalkPct)} unit="%" accent={ACCENTS.gold} />
          <SummaryStat label="Silence / other" metric={getPresenceMetric(silencePct)} unit="%" accent={ACCENTS.mint} />
          <SummaryStat label="Questions" metric={questionsMetric} accent={ACCENTS.mint} />
          {/* Was "Avg. wait", which needs an audible student answer and so
              showed a dash on most lessons. This one needs only the
              teacher's own voice. */}
          <SummaryStat
            label="Silence held"
            metric={
              session.metricsDetail?.heldSilenceSec != null
                ? { state: 'measured', display: String(session.metricsDetail.heldSilenceSec) }
                : { state: 'not_measurable', display: '—', reason: 'No question here went unanswered long enough to time a silence.' }
            }
            unit="s"
            accent={ACCENTS.forest}
          />
        </div>
        )}
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
              {focusSnapshot.pill}
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
            second={
              STUDENT_METRICS_ON
                ? { metric: followUpMetric, label: 'Follow-up questions' }
                : { metric: pauseMetric, label: `Paused ${LONG_PAUSE_SEC}s+ before you spoke again` }
            }
            onExplore={() => onNavigateInsights('questions')}
          />
          {/* The moment to revisit used to sit here too. It is still read and
              still shown — in "Try next time", where it comes with the thing
              to do about it. Here it was the same moment stated twice on one
              screen, the first time without a next step. */}
        </div>
      </NumberedCard>

      <TryNextTimeCard n={focusSnapshot ? 5 : 4} session={session} />

      {hardLookDoor}

      <DiscussFooter
        label="Discuss this with Wivoza Coach"
        onClick={() =>
          onDiscussWithCoach({
            id: 'summary',
            observation: 'The summary of this lesson',
            whyItMatters: "Let's talk through what this report showed.",
            timestampSec: foundMoment?.timestampSec ?? null,
            excerpt: foundMoment?.quote ?? null,
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

      {/* The focus loop's data point (Insights): what each next-lesson focus
          found on the lesson after it. */}
      <FocusCheckInHistory sessions={sessions} />

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
  teachingMoves,
  narrative,
  isShort,
  sending,
  error,
  onGenerate,
  lastRow,
}: {
  lessonContent: AudioLessonContent | null
  contentNotes: AudioContentNotes | null
  teachingMoves: AudioTeachingMoves | null
  narrative: string | null
  isShort: boolean
  sending: boolean
  error: string | null
  onGenerate: () => void
  /// The section's Hard Look, as the final row of its list.
  lastRow: React.ReactNode
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const visibleNotes = contentNotes?.notes.filter((n) => !dismissed.has(n.id)) ?? []
  const connections = lessonContent?.connections ?? []

  const connectionIdeas = lessonContent?.connectionIdeas ?? contentNotes?.connectionIdeas ?? []
  const keyTerms = lessonContent?.keyTerms ?? []
  // Three is where "you kept saying it" starts; one or two uses is a mention.
  const unheard = STUDENT_METRICS_ON
    ? keyTerms.filter((t) => t.teacherCount >= 3 && t.studentCount === 0).map((t) => `"${t.term}"`)
    : []
  // The teacher-side version of that line: what you leaned on, and a move
  // that hands the term to students. Says nothing about whether they used it.
  const leanedOn = STUDENT_METRICS_ON
    ? []
    : [...keyTerms]
        .filter((t) => t.teacherCount >= 3)
        .sort((a, b) => b.teacherCount - a.teacherCount)
        .slice(0, 2)
        .map((t) => `"${t.term}"`)

  const misconceptions = contentNotes?.misconceptions ?? []
  // The same note "Try next time" on Summary carries for this section.
  const takeFurther = contentNotes?.notes.find((n) => n.label === 'Where it could go further')?.text

  return (
    <div className="flex flex-col gap-6">
      {narrative && <CoachNote text={narrative} />}

      {/* The terms are chosen by the read of the transcript and counted by
          the server (keyTerms.ts). Hidden when there are none — older reports
          have no list at all. */}
      {keyTerms.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Academic vocabulary</h2>
          <div className="overflow-hidden rounded-xl border border-hairline bg-cream-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-ink-soft">
                  <th scope="col" className="px-4 py-2 text-left font-semibold">Term</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">You</th>
                  {STUDENT_METRICS_ON && <th scope="col" className="px-4 py-2 text-right font-semibold">Students</th>}
                </tr>
              </thead>
              <tbody>
                {keyTerms.map((t) => (
                  <tr key={t.term} className="border-b border-hairline last:border-b-0">
                    <th scope="row" className="px-4 py-2 text-left font-medium text-ink">{t.term}</th>
                    <td className="px-4 py-2 text-right tabular-nums text-ink">{t.teacherCount}</td>
                    {STUDENT_METRICS_ON && (
                      <td className={`px-4 py-2 text-right tabular-nums ${t.studentCount === 0 ? 'text-ink-soft' : 'font-semibold text-forest'}`}>
                        {t.studentCount}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {unheard.length > 0 && (
        <p className="text-sm text-ink">
          You said {new Intl.ListFormat('en', { type: 'conjunction' }).format(unheard)} three or more times
          {unheard.length === 1 ? '' : ' each'}, and no student was heard saying {unheard.length === 1 ? 'it' : 'them'}.
        </p>
      )}

      {leanedOn.length > 0 && (
        <p className="text-sm text-ink">
          You leaned on {new Intl.ListFormat('en', { type: 'conjunction' }).format(leanedOn)}. Next time, have
          students use {leanedOn.length === 1 ? 'it' : 'each one'} in a sentence of their own.
        </p>
      )}

      <SectionNextStep text={takeFurther} />

      <DetailRows>
        {/* How the content was opened up, in the teacher's own words. The
            vocabulary table above says which terms were used; this says what
            was done to make them land. */}
        <MoveEvidence
          title="How you opened the content up"
          blurb="Examples, analogies, meanings given for a term, and moments you thought aloud through your own reasoning."
          rows={teachingMoves?.explanations}
          tag={(row: { kind: string }) => row.kind}
        />
        <MoveEvidence
          title="How you tied the lesson together"
          blurb="Links back to earlier learning, statements of why this matters, and drawing it together at the end."
          rows={teachingMoves?.connections}
          tag={(row: { kind: string }) =>
            row.kind === 'prior' ? 'prior learning' : row.kind === 'purpose' ? 'why it matters' : 'closing'
          }
        />
        {/* Offered for every lesson, and asked for when the report opens. The
            button stays for the case where that request failed, and to write
            them again. */}
        <DetailRow title={contentNotes ? `Content specialist notes (${visibleNotes.length})` : 'Content specialist notes'}>
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
              {isShort && (
                <p className="text-xs font-semibold text-terracotta-600">
                  This session is under {Math.round(SHORT_SESSION_THRESHOLD_SEC / 60)} minutes — content feedback from a
                  short sample is especially limited.
                </p>
              )}
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
              {/* Notes are written once and kept, so this is the way to ask
                  for the current specialist's version of an older set. */}
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
        </DetailRow>

        {/* Superseded by "How you tied the lesson together", which is not
            capped at two and says which kind each one is. Kept only for
            lessons analyzed before that read existed, so an older report
            does not quietly lose a section. */}
        {!teachingMoves?.connections?.length && connections.length > 0 && (
          <DetailRow title={`Connections you made (${connections.length})`}>
            {connections.map((c) => (
              <div key={`${c.timestampSec}-${c.quote.slice(0, 24)}`} className="rounded-xl border border-hairline bg-cream-card p-4">
                <p className="text-sm text-ink">"{c.quote}"</p>
                <p className="mt-1 text-xs text-ink-soft">{formatTime(c.timestampSec)}</p>
              </div>
            ))}
          </DetailRow>
        )}

        {connectionIdeas.length > 0 && (
          <DetailRow title="Ways into this topic, for next time">
            <p className="text-xs text-ink-soft">
              Suggestions from a specialist in {lessonContent?.subject || contentNotes?.subject || 'this subject'}, not a
              reading of your lesson.
            </p>
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              {connectionIdeas.map((idea) => (
                <li key={idea.slice(0, 32)} className="text-sm text-ink">
                  {idea}
                </li>
              ))}
            </ul>
          </DetailRow>
        )}

        {misconceptions.length > 0 && (
          <DetailRow title="Where students usually get stuck on this topic">
            <p className="text-xs text-ink-soft">
              Subject knowledge about {contentNotes?.subject || 'this topic'}, not a reading of your lesson — you may well
              have covered it.
            </p>
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              {misconceptions.map((m) => (
                <li key={m.slice(0, 32)} className="text-sm text-ink">
                  {m}
                </li>
              ))}
            </ul>
          </DetailRow>
        )}

        <DetailRow title="How to read this section">
          {keyTerms.length > 0 && (
            <p className="text-sm text-ink-soft">
              Vocabulary is counted from the transcript, so read the counts as "at least": unusual terms are the words a
              recording most often mishears, and student counts include only what the microphone picked up.
            </p>
          )}
          <p className="text-sm text-ink-soft">
            The specialist notes are written from excerpts of what you said and may miss context. They're a starting
            point for your own reflection, not a factual review — your subject expertise is the final word.
          </p>
        </DetailRow>
        {lastRow}
      </DetailRows>
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
}: {
  section: InsightsSection
  hardLook: AudioHardLook | null
  locked: boolean
  sending: boolean
  error: string | null
  onGenerate: () => void
}) {
  const [open, setOpen] = useState(false)
  const critiques = (hardLook?.critiques ?? []).filter((c) => c.section === section)
  const cleared = (hardLook?.cleared ?? []).find((c) => c.section === section)

  // Nothing to offer and nothing to show: a locked report can't gain one.
  if (locked && !hardLook) return null

  return (
    // The last row of the section's list, like the evidence rows above it:
    // a card of its own made the hard reading the loudest thing on a page it
    // is meant to be an option on.
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center justify-between gap-3 py-3 text-left text-sm font-semibold text-forest hover:text-terracotta-600"
      >
        <span>The hard look on this section</span>
        <RowChevron className={open ? 'rotate-180' : ''} />
      </button>

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

// Whether a bid for the room's attention HELD.
//
// Deliberately not a count. A teacher with a hard group redirects more than
// one with an easy group, and the count says which group she has — which is
// why redirectionCount was retired from My Growth. What is worth saying is
// the shape: asks in close succession mean the first did not land, and a run
// that climbs toward a consequence is the spiral where each warning is worth
// less than the last.
//
// Nothing here states how many bids there were. Across repeated readings of
// the same lesson that number came back 11, 12, 13, 13 and 13 while the run
// itself and the rung it reached never moved — so the run is what gets shown
// and the number stays out of sight.
const RUNG_PHRASE: Record<AudioEscalationRung, string> = {
  attention: 'asking for the room’s attention',
  behaviour: 'telling the room what to stop or start',
  named: 'naming a student',
  consequence: 'naming a consequence',
  removal: 'separating a student from the group',
}

function EscalationCard({ escalation }: { escalation: AudioEscalation | null }) {
  // Absent on every report analyzed before this existed. Saying nothing is
  // right: this is not "no escalation", it is "not looked at".
  if (!escalation) return null

  if (escalation.state === 'not_measurable') {
    return (
      <div className="rounded-xl border border-hairline bg-cream p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Did your asks hold?</p>
        <p className="mt-1 text-sm text-ink-soft">{escalation.reason}</p>
      </div>
    )
  }

  if (escalation.state === 'confirmed_none') {
    return (
      <p className="text-sm text-ink-soft">
        No run of repeated asks in this lesson — when you asked for attention, the recording shows you moving on rather
        than asking again.
      </p>
    )
  }

  const cluster = escalation.clusters[0] ?? null
  const repeat = escalation.repeatedAsks[0] ?? null

  return (
    <div className="rounded-xl border border-gold bg-gold-tint/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Did your asks hold?</p>
      {cluster && (
        <>
          <p className="mt-1 text-sm font-semibold text-ink">
            Around {formatTime(cluster.startSec)} you asked for the room several times in quick succession
            {cluster.climbed ? `, rising from ${RUNG_PHRASE[cluster.fromRung]} to ${RUNG_PHRASE[cluster.topRung]}.` : '.'}
          </p>
          {cluster.quote ? (
            <p className="mt-2 text-sm italic text-ink">“{cluster.quote}”</p>
          ) : (
            // The wording was too rough to attribute — see quoteSafety.ts. The
            // moment is real; putting a garbled sentence in a teacher's mouth
            // inside this section is not worth being right most of the time.
            <p className="mt-2 text-xs text-ink-soft">
              The transcript’s wording here was too rough to quote back to you, so only the moment is shown.
            </p>
          )}
          <p className="mt-2 text-sm text-ink">
            Asking again that soon means the first ask didn’t land. When that becomes the pattern, each one is worth less
            than the last, and escalating is the only way left to be heard.
          </p>
        </>
      )}
      {repeat && (
        <p className={`text-sm text-ink ${cluster ? 'mt-3' : 'mt-1'}`}>
          {repeat.quote ? (
            <>
              At {formatTime(repeat.timestampSec)} you said you’d already asked — “{repeat.quote}”
            </>
          ) : (
            <>At {formatTime(repeat.timestampSec)} your own words noted you’d already asked once.</>
          )}
        </p>
      )}
      <p className="mt-3 text-xs text-ink-soft">
        Read from your speech alone. Whether the room actually settled isn’t something a room microphone can hear
        {escalation.capturedSharePct != null ? `, and about ${escalation.capturedSharePct}% of this recording came through as speech` : ''}.
      </p>
    </div>
  )
}

// Redirections set against encouragement. Both numbers have existed on every
// lesson for months; the pairing is what was missing, and the pairing is the
// part that means something — one real lesson carries six redirections and no
// detected encouragement, which is the mechanism behind having to escalate.
//
// The counts are shown plainly and never as a score. There is no target ratio
// here: the evidence is far too thin to hold a teacher to one.
function CorrectionBalanceCard({
  metricsDetail,
  capturedSharePct,
}: {
  metricsDetail: AudioSessionWithSegments['metricsDetail']
  capturedSharePct: number | null
}) {
  const balance = buildCorrectionBalance(metricsDetail, capturedSharePct)
  if (balance.empty || !balance.line) return null
  return (
    <div className="rounded-xl border border-hairline bg-cream p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Correction and encouragement</p>
      <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
        <Tally n={balance.redirections} label="redirections" />
        {/* "detected" is in the label, not a footnote — a teacher reading a
            zero must not read it as a verdict on their warmth. */}
        <Tally n={balance.positives} label="encouragement detected" />
        <Tally n={balance.correctives} label="corrective" />
      </div>
      <p className="mt-3 text-sm text-ink">{balance.line}</p>
      {balance.detectionCaveat && <p className="mt-2 text-xs text-ink-soft">{DETECTION_CAVEAT}</p>}
      {balance.coverageCaveat && (
        <p className="mt-2 text-xs text-ink-soft">{coverageCaveatLine(capturedSharePct)}</p>
      )}
    </div>
  )
}

function Tally({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold text-ink">{n}</p>
      <p className="text-xs text-ink-soft">{label}</p>
    </div>
  )
}

// One shape for everything teachingMoves produces: a heading, a line saying
// what it is, and the teacher's own sentences with timestamps.
//
// Quotes rather than counts, deliberately. "5 clear directions" told a
// teacher nothing they could act on; the sentence they actually said, and
// which of task/steps/time/product it named, is a thing they can look at and
// disagree with. Everything here is checkable against their own lesson, which
// is the only authority this report has.
/// The finer question kind for a question at this timestamp, if the two reads
/// agree about where it was.
///
/// The question log and the teaching-moves read are separate passes and can
/// disagree by a second or two on the same utterance, so this allows a small
/// window. No match means no badge — an unlabelled question is better than a
/// label borrowed from the wrong one.
const QUESTION_KIND_MATCH_SEC = 3

function questionKindAt(moves: AudioTeachingMoves | null, timestampSec: number): string | null {
  const hit = (moves?.questionKinds ?? []).find(
    (k) => Math.abs(k.timestampSec - timestampSec) <= QUESTION_KIND_MATCH_SEC,
  )
  // "recall" is already carried by the coarse badge beside it; repeating it
  // would add a word and no information.
  return hit && hit.kind !== 'recall' ? hit.kind : null
}

function MoveEvidence({
  title,
  blurb,
  rows,
  tag,
  emptyNote,
}: {
  title: string
  blurb?: string
  rows: { quote: string; timestampSec: number }[] | undefined
  /// A short label per row — the kind, the clarity, or which parts a
  /// direction named.
  tag?: (row: never) => string | null
  /// Shown when the read ran and found none. Absent means show nothing at
  /// all, which is right wherever "none" is unremarkable.
  emptyNote?: string
}) {
  if (!rows) return null
  if (rows.length === 0) {
    return emptyNote ? <p className="text-sm text-ink-soft">{emptyNote}</p> : null
  }
  // No count in the heading. These come from a model read, and the number
  // moves between reads of the SAME lesson — one backfill returned 27
  // moments for a lesson and 7 on the next pass, while the moments
  // themselves held. A teacher reading "(16)" would reasonably treat it as
  // a measurement; the quotes are the measurement, and they are all here.
  return (
    <DetailRow title={title}>
      {blurb && <p className="text-sm text-ink-soft">{blurb}</p>}
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const label = tag ? tag(row as never) : null
          return (
            <div key={`${row.timestampSec}-${i}`} className="rounded-xl border border-hairline bg-cream-card p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                <span>{formatTime(row.timestampSec)}</span>
                {label && <span className="rounded-full bg-cream px-2 py-0.5">{label}</span>}
              </div>
              <p className="mt-1 text-sm italic text-ink">“{row.quote}”</p>
            </div>
          )
        })}
      </div>
    </DetailRow>
  )
}

/// Which of task / steps / time / product a direction named. An empty list is
/// a real result — a direction that named none of them is "off you go" — so
/// it reads as that rather than as a missing label.
function directionTag(row: { parts: string[] }): string {
  return row.parts.length > 0 ? row.parts.join(' · ') : 'named none of the four'
}

function ClimateRoutinesTab({
  climateNarrative,
  nextStep,
  directiveLog,
  toneLog,
  redirectionLog,
  escalation,
  teachingMoves,
  metricsDetail,
  capturedSharePct,
  segments,
  lastRow,
}: {
  climateNarrative: string | null
  nextStep: string | null | undefined
  directiveLog: AudioDirectiveLogEntry[] | null
  toneLog: AudioToneLogEntry[] | null
  redirectionLog: AudioRedirectionLogEntry[] | null
  escalation: AudioEscalation | null
  teachingMoves: AudioTeachingMoves | null
  metricsDetail: AudioSessionWithSegments['metricsDetail']
  capturedSharePct: number | null
  segments: TranscriptSegment[]
  /// The section's Hard Look, as the final row of its list.
  lastRow: React.ReactNode
}) {
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
  // Praise only. Directions and redirections each have their own row now,
  // saying what the direction NAMED and whether the redirection said what to
  // DO — strictly more than this list did. Leaving all three in meant a
  // teacher met the same sentences twice in one section, a few hundred
  // pixels apart.
  //
  // The older reads still feed this when the newer one is absent, so a
  // report analyzed before that existed keeps its evidence.
  const hasDirectionMoves = (teachingMoves?.directions?.length ?? 0) > 0
  const hasRedirectionMoves = (teachingMoves?.redirections?.length ?? 0) > 0
  const evidenceCandidates = [
    ...(hasDirectionMoves ? [] : directiveCandidates),
    ...positiveCandidates,
    ...(hasRedirectionMoves ? [] : redirectionCandidates),
  ].sort((a, b) => (a.timestampSec ?? 0) - (b.timestampSec ?? 0))

  return (
    <div className="flex flex-col gap-6">
      {/* The note, then what to try, then the moments it was read from. There
          is no numbers card here on purpose — a count of directions says
          nothing about whether they landed — and no stock tip: the next step
          is this lesson's own, or absent. */}
      {climateNarrative && <CoachNote text={climateNarrative} />}

      <EscalationCard escalation={escalation} />

      <CorrectionBalanceCard metricsDetail={metricsDetail} capturedSharePct={capturedSharePct} />

      <SectionNextStep text={nextStep} />

      <DetailRows>
        {/* Replaces a bare count of directions, which was never
            interpretable — more directions is not better or worse, and a lab
            has more than a seminar. What a direction NAMED is interpretable:
            a teacher can look at one that named only the task and decide
            whether the class knew how long they had. */}
        <MoveEvidence
          title="What your directions named"
          blurb="Of the four things a direction can carry — the task, the order of steps, how long, and what to hand in — these are the ones each named."
          rows={teachingMoves?.directions}
          tag={directionTag}
        />
        <MoveEvidence
          title="What your redirections asked for"
          blurb="Whether each one said what to DO, or only what to stop. Quotes too rough in the transcript to put in your mouth are left out rather than shown."
          rows={teachingMoves?.redirections}
          tag={(row: { clarity: string }) => (row.clarity === 'actionable' ? 'says what to do' : 'says only what to stop')}
        />
        {evidenceCandidates.length > 0 && (
          <DetailRow
            title={
              hasDirectionMoves && hasRedirectionMoves
                ? `Praise, in your words (${evidenceCandidates.length})`
                : `Directions, praise and redirections, in your words (${evidenceCandidates.length})`
            }
          >
            {evidenceCandidates.map((candidate) => (
              <EvidenceItemCard key={candidate.id} candidate={candidate} segments={segments} />
            ))}
          </DetailRow>
        )}
        {lastRow}
      </DetailRows>
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

type PacingBin = 'teacher' | 'student' | 'sound' | 'quiet' | 'unavailable'

// A bin with no words in it used to be one hatched "no dominant speaker"
// block, which covered a quiet room and a room the microphone could not
// resolve alike. Where the recording carried a loudness envelope the server
// says which each second was, so the bin takes whichever of the two filled
// more of it. Without one, it stays the combined block — still the honest
// answer when there is nothing to tell them apart with.
function emptyBinKind(seconds: string | undefined, binStart: number, binEnd: number): PacingBin {
  if (!seconds) return 'unavailable'
  let sound = 0
  let quiet = 0
  for (let sec = Math.floor(binStart); sec < Math.ceil(binEnd) && sec < seconds.length; sec++) {
    if (seconds[sec] === 's') sound++
    else if (seconds[sec] === 'q') quiet++
  }
  if (sound === 0 && quiet === 0) return 'unavailable'
  return sound >= quiet ? 'sound' : 'quiet'
}

function minutesPhrase(sec: number): string {
  if (sec < 60) return 'under a minute'
  const m = Math.round(sec / 60)
  return `${m} minute${m === 1 ? '' : 's'}`
}

/// One sentence of what the recording did and did not catch, and where.
/// Never a reason: the teacher was in the room and knows what 18:00 was.
function soundTimelineSentence(t: SoundTimeline): string {
  const cap = (x: string) => x[0].toUpperCase() + x.slice(1)
  const verb = (sec: number) => (sec < 90 ? 'was' : 'were')
  const parts = [`Words came through for ${minutesPhrase(t.wordsSec)} of ${minutesPhrase(t.seconds.length)}.`]
  if (t.soundSec >= 30) {
    const where = t.soundRuns.map((r) => `${formatTime(r.startSec)}–${formatTime(r.endSec)}`).join(', ')
    parts.push(`${cap(minutesPhrase(t.soundSec))} had sound but no words${where ? ` (${where})` : ''}.`)
  }
  if (t.quietSec >= 30) parts.push(`${cap(minutesPhrase(t.quietSec))} ${verb(t.quietSec)} quiet.`)
  return parts.join(' ')
}

function buildPacingTimeline(segments: TranscriptSegment[], durationSec: number, seconds?: string): PacingBin[] {
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
    bins.push(
      teacherSec === 0 && studentSec === 0
        ? emptyBinKind(seconds, binStart, binEnd)
        : teacherSec >= studentSec
          ? 'teacher'
          : 'student',
    )
  }
  return bins
}

function PacingTimeline({
  segments,
  durationSec,
  soundTimeline,
}: {
  segments: TranscriptSegment[]
  durationSec: number | null
  soundTimeline?: SoundTimeline | null
}) {
  if (durationSec == null || durationSec <= 0 || segments.length === 0) {
    return <HatchedBar label="Talk flow unavailable this session." className="h-6 rounded-lg" />
  }
  const bins = buildPacingTimeline(segments, durationSec, soundTimeline?.seconds)
  return (
    <div>
      <div className="flex h-6 w-full overflow-hidden rounded-lg">
        {bins.map((bin, i) =>
          // Hatched means the same thing here as in the talk bar above: sound
          // the transcript has no words for, or, with no envelope, a block
          // we cannot read at all.
          // While student metrics are off a block of other voices is not
          // called students: it joins the hatched "not your speech".
          bin === 'unavailable' || bin === 'sound' || (bin === 'student' && !STUDENT_METRICS_ON) ? (
            <div key={i} className="h-full flex-1" style={HATCH_STYLE} />
          ) : bin === 'quiet' ? (
            <div key={i} className="h-full flex-1 bg-hairline" />
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
        {STUDENT_METRICS_ON ? (
          <>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-terracotta" /> Teacher-heavy
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-gold" /> Student-heavy
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-terracotta" /> Mostly you
            </span>
            <span className="flex items-center gap-1.5">
              <HatchedSwatch /> Not your speech
            </span>
            {soundTimeline && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-hairline" /> Quiet
              </span>
            )}
          </>
        )}
        {!STUDENT_METRICS_ON ? null : soundTimeline ? (
          <>
            <span className="flex items-center gap-1.5">
              <HatchedSwatch /> Sound, no words
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-hairline" /> Quiet
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1.5">
            {/* Not labeled "unclear audio" — without an envelope this bucket
                also covers genuine silence (think-time, quiet reading), which
                nothing in the recording can tell apart from lost audio. */}
            <HatchedSwatch /> No dominant speaker
          </span>
        )}
      </div>
      {soundTimeline && <p className="mt-3 text-sm text-ink">{soundTimelineSentence(soundTimeline)}</p>}
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
              <span className="h-2 w-2 shrink-0 rounded-full bg-gold" /> Recall · {recallCount} of {totalCount}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-terracotta" /> Higher-order · {higherOrderCount} of{' '}
              {totalCount}
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
  const window = teacherLinesOnly(
    candidate.timestampSec == null
      ? []
      : candidate.observation === 'Follow-up / probing question'
        ? buildFollowUpExchange(segments, questionLog, candidate.timestampSec)
        : buildTranscriptWindow(segments, candidate.timestampSec),
  )
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

function WaitTime2Stat({
  waitTime2Sec: sec,
  sampleCount: samples,
}: {
  waitTime2Sec: number | null
  sampleCount: number | null
}) {
  const metric = waitTime2Metric(sec, samples)
  return (
    <Stat
      label="Your pause after an answer"
      value={metric.display}
      muted={isMissingState(metric.state)}
      reason={
        metric.reason ??
        'How long you left after a student finished before speaking. The pause above is the one after your question; this is the one after their answer, and it is where a follow-up has to fit.'
      }
      sub={
        !isMissingState(metric.state) && (samples ?? 0) > 0
          ? `Based on ${samples} exchange${samples === 1 ? '' : 's'}`
          : undefined
      }
    />
  )
}

function TalkParticipationTab({
  session,
  silencePct,
  talkInsight,
  lastRow,
}: {
  session: AudioSessionWithSegments
  silencePct: number | null
  talkInsight: string | null
  /// The section's Hard Look, as the final row of its list.
  lastRow: React.ReactNode
}) {
  const exampleCandidate = highlightCandidates(
    session.highlights,
    'Follow-up / probing question',
    'talk-exchange',
    0,
    'Following up on a student answer pushes their thinking further instead of stopping at the first response.',
  )[0]
  // What students talked about is no longer shown. The count could only ever
  // describe the turns the microphone caught, and those are the ones spoken
  // loudly towards the teacher — on-topic by construction. The worst-captured
  // real lesson returned 24 of 24 on-topic with zero unclear, while lessons
  // captured at 44% and 48% returned 23 and 17 unclear; the cleanest-looking
  // answer came from the recording that heard least. It is still computed,
  // because the Hard Look uses it to avoid criticising airtime blind.
  const wpm = session.metricsDetail?.teacherWordsPerMinute ?? null
  const notYoursPct = STUDENT_METRICS_ON ? silencePct : session.teacherTalkPct != null ? 100 - session.teacherTalkPct : null
  const silenceNote = (notYoursPct ?? 0) > 0 ? leadingSilenceNote(session.metricsDetail?.firstWordSec) : null
  // Only when it is long enough to be worth a look: every lesson has a longest
  // stretch, and a 40-second one is not a finding.
  const stretch = useMemo(() => {
    const longest = longestTeacherStretch(session.segments)
    return longest && longest.durationSec >= MIN_STRETCH_TO_SHOW_SEC ? longest : null
  }, [session.segments])

  return (
    <div className="flex flex-col gap-6">
      {/* The reading before the numbers it was drawn from. */}
      {talkInsight && <CoachNote text={talkInsight} />}

      {/* One picture of the split. It used to be here three times — as tiles,
          as this bar, and as the bar's legend. */}
      <div id="stat-talkRatio">
        <TalkParticipationBar
          teacherPct={session.teacherTalkPct}
          studentPct={session.studentTalkPct}
          silencePct={silencePct}
          nonSpeech={nonSpeechSplit(session.metricsDetail, session.durationSec)}
          paceWpm={wpm}
        />
      </div>

      <SectionNextStep text={session.nextSteps?.talk} />

      <DetailRows>
        {/* The one participation signal a teacher-side microphone can carry
            honestly. Airtime says how long students spoke; this says whether
            the floor was opened, which is the part the teacher controls. It
            records the invitation ONLY — never whether anyone took it up,
            because this recording cannot show that. */}
        <MoveEvidence
          title="You opened the floor"
          blurb="Moments you invited students in. Whether anyone took it up is not something a recording from the front of the room can show."
          rows={session.teachingMoves?.invitations}
        />
        <DetailRow title="Talk flow across the lesson">
          <PacingTimeline
            segments={session.segments}
            durationSec={session.durationSec}
            soundTimeline={session.soundTimeline}
          />
        </DetailRow>
        {stretch && (
          <DetailRow
            title={`Your longest stretch of talk · about ${Math.round(stretch.durationSec / 60)} min, from ${formatTime(stretch.startSec)}`}
          >
            <p className="text-sm text-ink">
              From {formatTime(stretch.startSec)} to {formatTime(stretch.endSec)}, opening with:
            </p>
            <p className="border-l-2 border-hairline pl-3 text-sm text-ink-soft">"{stretch.opening}…"</p>
            <p className="text-sm text-ink-soft">
              A stretch ends when a student is heard or you pause for more than ten seconds. A student the microphone
              missed does not end it, so check it against what you remember of that part of the lesson.
            </p>
          </DetailRow>
        )}
        {exampleCandidate && (
          <DetailRow title="An exchange to review">
            <TranscriptEvidenceCard candidate={exampleCandidate} segments={session.segments} questionLog={session.questionLog} />
          </DetailRow>
        )}
        <DetailRow title="How to read these numbers">
          <p className="text-sm text-ink-soft">
            Talk time describes the recording, not the room: it doesn't show how many students took part or whether
            they were engaged, and a microphone near you hears you far better than it hears them.
          </p>
          {STUDENT_METRICS_ON ? (
            <p className="text-sm text-ink-soft">
              "Silence / other" is everything that was neither clearly you nor clearly a student — quiet work, several
              voices at once, and audio too faint to place.
            </p>
          ) : (
            <p className="text-sm text-ink-soft">
              This section is built from your voice only. Telling one voice from another on a room recording is not
              yet reliable enough to say how much students spoke, so everything that wasn't you is one share.
            </p>
          )}
          {silenceNote && <p className="text-sm text-ink-soft">{silenceNote}</p>}
          {wpm != null && (
            <p className="text-sm text-ink-soft">
              Pace is words a minute of your own speaking time. Everyday conversation runs about {CONVERSATIONAL_WPM} —
              an anchor to place yourself against, not a target.
            </p>
          )}
        </DetailRow>
        {lastRow}
      </DetailRows>
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

const CFU_DETECTION_LIMITATION =
  'Spoken checks only — hand signals and written work are invisible to a recording.'


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
  const window = teacherLinesOnly(
    candidate.timestampSec == null
      ? []
      : isFeedback
        ? buildFeedbackExchange(segments, candidate.timestampSec)
        : buildSingleTurnExchange(segments, candidate.timestampSec),
  )
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

function QuestioningCheckingTab({
  questionCount,
  questionLog,
  teachingMoves,
  questionsMetric,
  higherOrderRatio,
  higherOrderCount,
  followUpMetric,
  pauseMetric,
  heldSilenceSec,
  heldSilenceCount,
  waitTime2Sec,
  waitTime2SampleCount,
  thinkingTaskCount,
  focusMetric,
  questioningInsight,
  checksNarrative,
  nextStep,
  highlights,
  cfuLog,
  feedbackLog,
  segments,
  lastRow,
}: {
  questionCount: number | null
  questionLog: AudioQuestionLogEntry[] | null
  teachingMoves: AudioTeachingMoves | null
  questionsMetric: ReturnType<typeof getCountMetric>
  higherOrderRatio: ReturnType<typeof formatRatio> | null
  higherOrderCount: number | null
  followUpMetric: ReturnType<typeof getCountMetric>
  /// Questions with a long pause before you spoke again (lib/teacherVoice.ts).
  pauseMetric: ConfidentMetric
  /// Median silence held after a question nobody answered aloud, and how many
  /// such questions there were.
  heldSilenceSec: number | null
  heldSilenceCount: number
  waitTime2Sec: number | null
  waitTime2SampleCount: number | null
  thinkingTaskCount: number | null
  focusMetric: FocusMetric | null
  questioningInsight: string | null
  checksNarrative: string | null
  nextStep: string | null | undefined
  highlights: AudioHighlight[] | null
  cfuLog: AudioCfuLogEntry[] | null
  feedbackLog: AudioFeedbackLogEntry[] | null
  segments: TranscriptSegment[]
  /// The section's Hard Look, as the final row of its list.
  lastRow: React.ReactNode
}) {
  // Older sessions predate waitTimeSampleCount; their root-question count is the best available.
  const followUpToKeep = highlightCandidates(
    highlights,
    'Follow-up / probing question',
    'questions-strength',
    0,
    'Following up on a student answer pushes their thinking further instead of stopping at the first response.',
  )[0]

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

  return (
    <div className="flex flex-col gap-6">
      {questioningInsight && <CoachNote text={questioningInsight} />}

      {/* The mix below is this section's one finding, and it states the count
          itself — as "detected", not "you asked", because a student's question
          can be picked up as one of them. A count, never a share. */}
      <QuestioningMixChart
        higherOrderCount={higherOrderCount}
        totalCount={questionCount}
        state={higherOrderRatio?.state ?? 'not_measurable'}
      />

      <SectionNextStep text={nextStep} />

      <DetailRows>
        <DetailRow title="The numbers">
          <StatGrid>
            <div id="stat-higherOrderPct">
              <Stat
                label="Questions you asked"
                value={questionsMetric.display}
                muted={isMissingState(questionsMetric.state)}
                reason={questionsMetric.reason}
                focused={focusMetric === 'higherOrderPct'}
              />
            </div>
            <div id="stat-higherOrderCount">
              <Stat
                label="Higher-order questions"
                value={higherOrderCount != null ? (questionCount ? `${higherOrderCount} of ${questionCount}` : String(higherOrderCount)) : '—'}
                muted={higherOrderCount == null}
                reason={higherOrderCount == null ? 'This session was analyzed before questions were classified.' : undefined}
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
            {STUDENT_METRICS_ON && (
              <Stat
                label="Your follow-up questions"
                value={followUpMetric.display}
                muted={isMissingState(followUpMetric.state)}
                reason={followUpMetric.reason}
                focused={focusMetric === 'followUpQuestionCount'}
              />
            )}
            {/* Replaces "your average wait time", which needed an audible
                student answer and so only ever described the questions where
                waiting WORKED — 25 of them across this teacher's real
                lessons, against 65 here. This is the half they control: they
                asked, nobody spoke, and this is how long they left it.
                Pauses that contain an answer are excluded rather than
                averaged in; those run to a median of 6.0s against 3.9s, and
                are mostly the student talking. */}
            {/* While student metrics are off: the pause from the end of a
                question to your next line. It needs no speaker split, and may
                hold a student's answer, so it is a pause and never think
                time. */}
            {!STUDENT_METRICS_ON ? (
              <div id="stat-avgWaitTime">
                <Stat
                  label={`Paused ${LONG_PAUSE_SEC}s+ before you spoke again`}
                  value={pauseMetric.display}
                  muted={isMissingState(pauseMetric.state)}
                  reason={pauseMetric.reason}
                  sub={
                    isMissingState(pauseMetric.state)
                      ? undefined
                      : 'Of the questions that could be timed · may include student answers'
                  }
                  focused={focusMetric === 'avgWaitTime'}
                />
              </div>
            ) : (
            <div id="stat-avgWaitTime">
              <Stat
                label="Silence you held after a question"
                value={heldSilenceSec != null ? `${heldSilenceSec}s` : '—'}
                muted={heldSilenceSec == null}
                reason={
                  heldSilenceSec == null
                    ? 'Every question here was either answered aloud or came too close to the next thing you said to time a silence.'
                    : undefined
                }
                sub={
                  heldSilenceSec != null && heldSilenceCount > 0
                    ? `Median across ${heldSilenceCount} question${heldSilenceCount === 1 ? '' : 's'} nobody answered aloud`
                    : undefined
                }
                focused={focusMetric === 'avgWaitTime'}
              />
            </div>
            )}
            {/* The other half of wait time: the pause after a student's answer,
                which is where a follow-up has to fit. */}
            {STUDENT_METRICS_ON && <WaitTime2Stat waitTime2Sec={waitTime2Sec} sampleCount={waitTime2SampleCount} />}
          </StatGrid>
          <WaitTimeChips questionLog={questionLog} />
        </DetailRow>

        {/* Counted nowhere else: the question detector excludes a question
            the teacher answers themselves, so the move most worth noticing
            left no trace at all. Shown without comment — it is a move, not a
            fault, and a teacher can decide what it meant. */}
        <MoveEvidence
          title="Questions you answered yourself"
          blurb="Asked and answered in the same breath. Sometimes that is the right call; sometimes it is the pause that got away."
          rows={teachingMoves?.selfAnswered}
        />

        <MoveEvidence
          title="When you pushed a student further"
          blurb="Responses that asked a student to go on, back it up, or try again — rather than closing the exchange."
          rows={teachingMoves?.revisionPrompts}
        />

        {questionLog !== null && questionLog.length > 0 && (
          <DetailRow title={`Your questions, in order (${questionLog.length})`}>
            <div className="flex flex-col gap-3">
              {questionLog.map((q, i) => (
                <div key={i} className="rounded-xl border border-hairline bg-cream-card p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    <span>{formatTime(q.timestampSec)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        q.type === 'higher_order' ? 'bg-mint-tint/60 text-forest' : 'bg-cream text-ink-soft'
                      }`}
                    >
                      {q.type === 'higher_order' ? 'Higher-order' : 'Recall'}
                    </span>
                    {/* The finer reading of the same question, folded in
                        rather than listed again beside it. It used to be a
                        parallel row — the same questions, twice, under two
                        taxonomies. Matched on timestamp, and simply absent
                        when the two reads disagree about where a question
                        was, which is better than inventing a pairing. */}
                    {questionKindAt(teachingMoves, q.timestampSec) && (
                      <span className="rounded-full bg-gold-tint/60 px-2 py-0.5 text-forest">
                        {questionKindAt(teachingMoves, q.timestampSec)}
                      </span>
                    )}
                    <span className="normal-case font-normal">
                      {STUDENT_METRICS_ON
                        ? q.waitTimeSec != null
                          ? `${q.waitTimeSec}s wait`
                          : 'wait not measured'
                        : q.pauseSec != null
                          ? `${q.pauseSec}s before you spoke again`
                          : 'pause not timed'}
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
              ))}
            </div>
          </DetailRow>
        )}

        {/* The section's second note — checks for understanding and what was
            done with students' answers. It sat on the page under the first,
            so this was the one section with two paragraphs to read before
            anything else; it belongs with the evidence it describes. */}
        {checksNarrative && (
          <DetailRow title="How you checked and responded">
            {splitParagraphs(checksNarrative).map((para, i) => (
              <p key={i} className="text-sm text-ink">
                {para}
              </p>
            ))}
          </DetailRow>
        )}

        {evidenceCandidates.length > 0 && (
          <DetailRow title={`Checks and feedback, in your words (${evidenceCandidates.length})`}>
            {evidenceCandidates.map((candidate) => (
              <EvidenceItemCard key={candidate.id} candidate={candidate} segments={segments} />
            ))}
          </DetailRow>
        )}

        {followUpToKeep && (
          <DetailRow title="A follow-up worth keeping">
            <div className="rounded-xl border border-hairline bg-cream-card p-4">
              <p className="text-sm text-ink">{formatCandidateHeadline(followUpToKeep)}</p>
              {followUpToKeep.excerpt && <p className="mt-1 text-sm text-ink-soft">"{followUpToKeep.excerpt}"</p>}
            </div>
          </DetailRow>
        )}

        <DetailRow title="How to read these numbers">
          <p className="text-sm text-ink-soft">
            Questions and checks are read from your side of the transcript. {CFU_DETECTION_LIMITATION}
          </p>
          {STUDENT_METRICS_ON ? (
            <p className="text-sm text-ink-soft">
              Wait time, follow-ups and feedback all need a student to be heard, so they are limited by how much of the
              room the microphone reached. Where too little came through, the number says so rather than showing zero.
            </p>
          ) : (
            <p className="text-sm text-ink-soft">
              The pause runs from the end of your question to the next thing you said, so it may include a student's
              answer. Wait time before a student answered and follow-ups to an answer both need students to be told
              apart from you, which a room recording can't yet do reliably, so they are not in this report.
            </p>
          )}
        </DetailRow>
        {lastRow}
      </DetailRows>
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

/// `lead` is how the item is introduced once it leaves the report: a content
/// note is an observation, and a plan needs to be told what to do with it.


// The report's suggestions in one place, and the way to carry them into the
// next lesson. Planning is asked as a question and the checkboxes only appear
// on a yes: a teacher reading their report should see what to try, not a form.
// What travels is exactly what they left ticked, into Planning Coach's
// "Anything else" box, where it can still be edited before anything is built.
function TryNextTimeCard({ n, session }: { n: number; session: AudioSessionWithSegments }) {
  const navigate = useNavigate()
  const items = buildNextTimeItems(session)
  const [choosing, setChoosing] = useState(false)
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  if (items.length === 0) return null
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
        ...chosen.map((item) => `- ${item.lead ? `${item.lead}: ` : ''}${item.text}`),
      ].join('\n'),
      source: `${sessionTitle(session)}, ${new Date(session.sessionDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
    })
    navigate('/lesson-planning')
  }

  return (
    <NumberedCard n={n} title="Try next time" subtitle="What this report suggests, from every section, in one list">
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
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-4 border-t border-hairline pt-4">
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
    </NumberedCard>
  )
}

// Every Insights section has the same shape: the note, one picture, one
// finding, one thing to try, and then everything else folded into rows. The
// rows are where the evidence lives — lists of quotes, the full set of numbers,
// how to read them — so a teacher who wants it is one tap away and a teacher
// who does not is not made to scroll past it.
function DetailRows({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-hairline border-y border-hairline">{children}</div>
}

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

function DetailRow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold text-forest marker:hidden hover:text-terracotta-600">
        <span>{title}</span>
        <RowChevron className="group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-4 pb-5 pt-1">{children}</div>
    </details>
  )
}

// The section's own line from "Try next time" on Summary, shown where the
// evidence for it is. Written with the class summary, so a report summarized
// before that existed has none — and a section with nothing worth suggesting
// says nothing rather than reaching for a stock tip.
function SectionNextStep({ text }: { text: string | null | undefined }) {
  if (!text?.trim()) return null
  return (
    <div className="rounded-xl bg-gold-tint/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Try next time</p>
      <p className="mt-1 text-sm text-ink">{text}</p>
    </div>
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

function StatGrid({ children }: { children: React.ReactNode }) {
  const accent = useContext(SectionAccentContext)
  return <div className={`grid grid-cols-2 gap-4 rounded-2xl ${accent.chip} p-6 sm:grid-cols-3`}>{children}</div>
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
