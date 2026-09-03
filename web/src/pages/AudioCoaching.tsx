import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpIcon, ChatBubbleIcon, MicIcon } from '../components/icons'
import { DashedLinePoint, HatchedBar, HatchedSwatch, NoDataLabel } from '../components/unavailableChart'
import { UpgradeMessage } from '../components/UpgradeMessage'
import { HATCH_STYLE } from '../lib/chartPatterns'
import { FOCUS_METRIC_GROUPS, FOCUS_METRIC_LABELS } from '../lib/focusMetrics'
import {
  createAudioSession,
  deleteAudioSession,
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
  type AudioQuestionLogEntry,
  type AudioReflectMessage,
  type AudioSession,
  type AudioSessionWithSegments,
  type AudioTopicTerm,
  type FocusMetric,
  type ReflectChatErrorKind,
  type SpeakerSample,
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
  MIN_N_FOR_PERCENT,
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
      })
      .catch(() => {})
  }, [])

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
}: {
  session: AudioSessionWithSegments
  speakers: SpeakerSample[]
  onUpdate: (s: AudioSessionWithSegments) => void
  onExit: () => void
  sessions: AudioSession[]
  focusMetric: FocusMetric | null
  onFocusMetricChange: (metric: FocusMetric | null) => void
}) {
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
  return (
    <ReportPanel
      session={session}
      onUpdate={onUpdate}
      onExit={onExit}
      sessions={sessions}
      focusMetric={focusMetric}
      onFocusMetricChange={onFocusMetricChange}
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
    if (!session) {
      try {
        const created = await createAudioSession({
          teacherName: teacherName || undefined,
          sessionDate: new Date().toISOString(),
          consentConfirmed: true,
        })
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
              <span className="text-sm text-ink-soft">This can take a minute for a full class period.</span>
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

type ReportTab = 'summary' | 'insights' | 'reflect' | 'growth'
type InsightsSection = 'lesson' | 'climate' | 'discourse'

const REPORT_TABS: { key: ReportTab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'insights', label: 'Insights' },
  { key: 'reflect', label: 'Reflect' },
  { key: 'growth', label: 'My Growth' },
]

const INSIGHTS_SECTIONS: { key: InsightsSection; label: string }[] = [
  { key: 'lesson', label: 'Lesson Content' },
  { key: 'climate', label: 'Climate & Routines' },
  { key: 'discourse', label: 'Discourse Details' },
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

function buildTalkInsight(session: AudioSessionWithSegments): string | null {
  return buildVoiceBalanceCaption(judgeTalkBalance(session.teacherTalkPct, session.studentTalkPct))
}

function buildQuestioningInsight(
  session: AudioSessionWithSegments,
  higherOrderRatio: ConfidentMetric | null,
): string | null {
  if (!higherOrderRatio || isMissingState(higherOrderRatio.state)) return null
  if (higherOrderRatio.state === 'possible_detection') {
    return `Only ${session.questionCount} question${session.questionCount === 1 ? '' : 's'} came through today — too few to say whether they leaned recall or higher-order.`
  }
  if (session.higherOrderPct != null && session.higherOrderPct >= 40) {
    return `A good chunk of today's questions pushed for real thinking (${session.higherOrderPct}% higher-order) — that's the harder kind of question to ask on the fly.`
  }
  return "Most of today's questions were quick recall checks — a natural spot to slip in one 'why' or 'how' next time."
}

function buildCfuInsight(cfuMetric: { state: string }): string | null {
  if (cfuMetric.state === 'measured') {
    return 'You checked for understanding today — a good habit for catching confusion before it compounds.'
  }
  if (cfuMetric.state === 'confirmed_none') {
    return 'No explicit check for understanding was detected this session — even a quick thumbs-up check can catch confusion early.'
  }
  return null
}

function buildRoutinesInsight(
  directiveMetric: { state: string; display: string },
  hasRepeatedInstructionHighlight: boolean,
): string | null {
  if (directiveMetric.state === 'measured') {
    const base = `You gave clear, direct instructions ${directiveMetric.display} today — that kind of clarity helps routines run themselves.`
    return hasRepeatedInstructionHighlight
      ? `${base} A couple needed repeating, though — worth double-checking they land the first time.`
      : base
  }
  if (directiveMetric.state === 'confirmed_none') {
    return "No task-instruction language was picked up today — if you gave directions, they may just have been phrased differently than what's detected here."
  }
  return null
}

function buildClimateInsight(
  redirectionMetric: { state: string; display: string },
  positiveCount: number | null,
  correctiveCount: number | null,
): string | null {
  if (redirectionMetric.state === 'confirmed_none') {
    return 'No redirection language was detected this session.'
  }
  if (redirectionMetric.state === 'measured') {
    let sentence = `You used redirection language ${redirectionMetric.display} today.`
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
    return sentence
  }
  return null
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

// Stitches the existing per-category coach notes into one short narrative —
// no new Claude call, since these sentences are already grounded in
// measured/zero data and following the app's no-overclaiming rules. Folded
// directly into SummaryTab's combined snapshot card rather than rendered as
// its own card.
function buildWivozaNoticedSummary(
  talkInsight: string | null,
  questioningInsight: string | null,
  cfuInsight: string | null,
): string | null {
  const sentences = [talkInsight, questioningInsight, cfuInsight].filter((s): s is string => s != null)
  return sentences.length > 0 ? sentences.join(' ') : null
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

  const balance = judgeTalkBalance(session.teacherTalkPct, session.studentTalkPct)
  if (balance?.kind === 'student-heavy') {
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

  if (session.avgWaitTimeSec != null && session.avgWaitTimeSec >= 3) {
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

  const balance = judgeTalkBalance(session.teacherTalkPct, session.studentTalkPct)
  if (balance?.kind === 'teacher-heavy') {
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

  if (session.avgWaitTimeSec != null && session.avgWaitTimeSec < 3) {
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
            See the full breakdown in Discourse Details →
          </button>
        </div>
      )}
    </div>
  )
}

function computeVoiceBalance(session: AudioSessionWithSegments, silencePct: number | null) {
  const recordedSec = session.durationSec ?? 0
  const toSec = (pct: number | null) => (pct == null ? null : Math.round((pct / 100) * recordedSec))
  return {
    teacherPct: session.teacherTalkPct,
    teacherSec: toSec(session.teacherTalkPct),
    studentPct: session.studentTalkPct,
    studentSec: toSec(session.studentTalkPct),
    // AudioSession has no group-talk field today — this row is structurally
    // always omitted, kept as a named null pair so a future group-talk
    // metric can populate it without reshaping this function or its caller.
    groupPct: null as number | null,
    groupSec: null as number | null,
    silencePct,
    silenceSec: toSec(silencePct),
  }
}

function VoiceBalanceBar({
  label,
  pct,
  sec,
  barClassName,
}: {
  label: string
  pct: number | null
  sec: number | null
  barClassName: string
}) {
  if (pct == null) return null
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-xs font-medium text-ink-soft">
        <span>{label}</span>
        <span>
          {sec != null ? `${formatTime(sec)} · ` : ''}
          {pct}%
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-canvas">
        <div className={`h-full rounded-full ${barClassName}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  )
}

// Chart #1 — Talk-Time Balance Bar: a single 2-segment stacked bar (you vs.
// students), replacing two separate rows so the split reads as one whole
// rather than two independently-scaled numbers. Never renders a 0/0 or empty
// bar for missing data — the whole bar hatches when teacher talk itself is
// unavailable; just the student segment hatches when only that side is.
function TalkTimeBalanceBar({ teacherPct, studentPct }: { teacherPct: number | null; studentPct: number | null }) {
  if (teacherPct == null) {
    return <HatchedBar label="Talk balance unavailable this session" className="h-4" />
  }
  const remainder = Math.max(0, 100 - teacherPct - (studentPct ?? 0))
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-canvas">
        <div className="h-full bg-brand-500" style={{ width: `${teacherPct}%` }} />
        {studentPct != null ? (
          <div className="h-full bg-brand-500/45" style={{ width: `${studentPct}%` }} />
        ) : (
          <div className="h-full" style={{ width: `${remainder}%`, ...HATCH_STYLE }} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-brand-500" /> You — {teacherPct}%
        </span>
        <span className="flex items-center gap-1.5">
          {studentPct != null ? (
            <span className="h-2 w-2 rounded-full bg-brand-500/45" />
          ) : (
            <HatchedSwatch className="h-2 w-2" />
          )}
          Students — {studentPct != null ? `${studentPct}%` : 'unavailable'}
        </span>
      </div>
    </div>
  )
}

function ClassroomVoiceBalance({
  teacherPct,
  studentPct,
  groupPct,
  groupSec,
  silencePct,
  silenceSec,
  caption,
}: {
  teacherPct: number | null
  studentPct: number | null
  groupPct: number | null
  groupSec: number | null
  silencePct: number | null
  silenceSec: number | null
  caption: string | null
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Classroom voice balance</h2>
      <div className="mt-3 flex flex-col gap-4">
        <TalkTimeBalanceBar teacherPct={teacherPct} studentPct={studentPct} />
        <div className="flex flex-col gap-3">
          <VoiceBalanceBar label="Group work" pct={groupPct} sec={groupSec} barClassName="bg-brand-500/35" />
          <VoiceBalanceBar label="Silence / other" pct={silencePct} sec={silenceSec} barClassName="bg-ink-soft/40" />
        </div>
      </div>
      {caption && <p className="mt-3 text-sm text-ink-soft">{caption}</p>}
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
      {priority?.focusMetric ? (
        <>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">One next step</h2>
          <p className="mt-1 text-sm text-ink-soft">{priority.whyItMatters}</p>
          <button
            type="button"
            onClick={() => onSetFocus(priority.focusMetric as FocusMetric)}
            className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-400 hover:text-brand-600"
          >
            Set as my focus → My Growth
          </button>
        </>
      ) : null}
      <button
        type="button"
        onClick={onGoReflect}
        className={`flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600 ${
          priority?.focusMetric ? 'mt-4' : ''
        }`}
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
}: {
  session: AudioSessionWithSegments
  onUpdate: (s: AudioSessionWithSegments) => void
  onExit: () => void
  sessions: AudioSession[]
  focusMetric: FocusMetric | null
  onFocusMetricChange: (metric: FocusMetric | null) => void
}) {
  const [tab, setTab] = useState<ReportTab>('summary')
  const [insightsSection, setInsightsSection] = useState<InsightsSection>('lesson')
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

  async function handleStartReflect() {
    setReflectSending(true)
    setReflectError(null)
    try {
      const updated = await sendReflectMessage(session.id, { context: reflectContext })
      onUpdate({ ...session, ...updated })
    } catch (err) {
      const kind = (err as { kind?: ReflectChatErrorKind })?.kind ?? 'other'
      setReflectError({ kind, message: (err as Error).message })
    } finally {
      setReflectSending(false)
    }
  }

  async function handleSendReflect() {
    const trimmed = reflectDraft.trim()
    if (!trimmed || reflectSending) return
    setReflectSending(true)
    setReflectError(null)
    setReflectDraft('')
    try {
      const updated = await sendReflectMessage(session.id, { message: trimmed, context: reflectContext })
      onUpdate({ ...session, ...updated })
    } catch (err) {
      const kind = (err as { kind?: ReflectChatErrorKind })?.kind ?? 'other'
      setReflectError({ kind, message: (err as Error).message })
      setReflectDraft(trimmed)
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

  const talkInsight = buildTalkInsight(session)
  const questioningInsight = buildQuestioningInsight(session, higherOrderRatio)
  const cfuInsight = buildCfuInsight(cfuMetric)
  const hasRepeatedInstructionHighlight = (session.highlights ?? []).some((h) => h.label === 'Repeated instruction')
  const routinesInsight = buildRoutinesInsight(directiveMetric, hasRepeatedInstructionHighlight)
  const climateInsight = buildClimateInsight(redirectionMetric, positiveCount, correctiveCount)

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

      <TabBar tab={tab} onSelect={setTab} />

      {tab === 'summary' && (
        <SummaryTab
          session={session}
          coverage={coverage}
          teacherTalkMetric={teacherTalkMetric}
          studentTalkMetric={studentTalkMetric}
          silencePct={silencePct}
          silenceMetric={silenceMetric}
          studentSegmentsMetric={studentSegmentsMetric}
          questionsMetric={questionsMetric}
          higherOrderRatio={higherOrderRatio}
          followUpMetric={followUpMetric}
          waitTimeMetric={waitTimeMetric}
          cfuMetric={cfuMetric}
          feedbackRatio={feedbackRatio}
          onFocusMetricChange={onFocusMetricChange}
          talkInsight={talkInsight}
          questioningInsight={questioningInsight}
          cfuInsight={cfuInsight}
          onGoReflect={() => setTab('reflect')}
          onViewDiscourse={() => handleViewSource('insights', '', 'discourse')}
        />
      )}

      {tab === 'growth' && (
        <MyGrowthTab sessions={sessions} focusMetric={focusMetric} onFocusMetricChange={onFocusMetricChange} />
      )}

      {tab === 'reflect' && (
        <ReflectTab
          highlights={session.highlights}
          conversation={session.reflectConversation}
          sending={reflectSending}
          reflectError={reflectError}
          draft={reflectDraft}
          onDraftChange={setReflectDraft}
          onStart={handleStartReflect}
          onSend={handleSendReflect}
          locked={locked}
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
        />
      )}

      {tab === 'insights' && (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <InsightsNav section={insightsSection} onSelect={setInsightsSection} />
          <div className="min-w-0 flex-1">
            {insightsSection === 'lesson' && (
              <LessonContentTab
                session={session}
                lessonContent={lessonContent}
                contentNotes={session.contentNotes}
                isShort={coverage.isShort}
                sending={contentNotesSending}
                error={contentNotesError}
                onGenerate={handleGenerateContentNotes}
              />
            )}

            {insightsSection === 'climate' && (
              <ClimateRoutinesTab
                transitionMetric={transitionMetric}
                directiveMetric={directiveMetric}
                phasesCount={session.phases?.length ?? 0}
                onViewPhases={() => handleViewSource('insights', 'session-phases', 'discourse')}
                nameMentionMetric={nameMentionMetric}
                uniqueNameCount={uniqueNameCount}
                toneRatio={toneRatio}
                redirectionMetric={redirectionMetric}
                routinesInsight={routinesInsight}
                climateInsight={climateInsight}
              />
            )}

            {insightsSection === 'discourse' && (
              <DiscourseDetailsTab
                questionCount={session.questionCount}
                questionLog={session.questionLog}
                session={session}
                teacherTalkMetric={teacherTalkMetric}
                studentTalkMetric={studentTalkMetric}
                silencePct={silencePct}
                silenceMetric={silenceMetric}
                studentSegmentsMetric={studentSegmentsMetric}
                questionsMetric={questionsMetric}
                higherOrderRatio={higherOrderRatio}
                higherOrderCount={higherOrderCount}
                followUpMetric={followUpMetric}
                waitTimeMetric={waitTimeMetric}
                cfuMetric={cfuMetric}
                feedbackRatio={feedbackRatio}
                focusMetric={focusMetric}
                talkInsight={talkInsight}
                questioningInsight={questioningInsight}
                cfuInsight={cfuInsight}
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

// Summary: a genuine 60-second read, not a scroll of every card the full
// report can produce. Exactly the proposal's five elements — a two-sentence
// snapshot (folding in what Wivoza noticed and the evidence-quality read,
// rather than three separate cards saying related things), one chart, 2-3
// moments worth revisiting, one next step, one coaching CTA.
function SummaryTab({
  session,
  coverage,
  teacherTalkMetric,
  studentTalkMetric,
  silencePct,
  silenceMetric,
  studentSegmentsMetric,
  questionsMetric,
  higherOrderRatio,
  followUpMetric,
  waitTimeMetric,
  cfuMetric,
  feedbackRatio,
  onFocusMetricChange,
  talkInsight,
  questioningInsight,
  cfuInsight,
  onGoReflect,
  onViewDiscourse,
}: {
  session: AudioSessionWithSegments
  coverage: ReturnType<typeof getCoverage>
  teacherTalkMetric: ReturnType<typeof getPresenceMetric>
  studentTalkMetric: ReturnType<typeof getPresenceMetric>
  silencePct: number | null
  silenceMetric: ReturnType<typeof getPresenceMetric>
  studentSegmentsMetric: ReturnType<typeof getCountMetric>
  questionsMetric: ReturnType<typeof getCountMetric>
  higherOrderRatio: ReturnType<typeof formatRatio> | null
  followUpMetric: ReturnType<typeof getCountMetric>
  waitTimeMetric: ReturnType<typeof getPresenceMetric>
  cfuMetric: ReturnType<typeof getCountMetric>
  feedbackRatio: ConfidentMetric
  onFocusMetricChange: (metric: FocusMetric | null) => void
  talkInsight: string | null
  questioningInsight: string | null
  cfuInsight: string | null
  onGoReflect: () => void
  onViewDiscourse: () => void
}) {
  const strength = pickTop(buildStrengthCandidates(session, cfuMetric, feedbackRatio, higherOrderRatio))
  const priority = pickTop(buildPriorityCandidates(session, cfuMetric, feedbackRatio, higherOrderRatio))
  const voiceBalance = computeVoiceBalance(session, silencePct)
  const balanceJudgment = judgeTalkBalance(session.teacherTalkPct, session.studentTalkPct)
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
  const noticedText = buildWivozaNoticedSummary(talkInsight, questioningInsight, cfuInsight)
  const warn = evidenceQuality.tone === 'warn'

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Two-sentence snapshot — identity, what Wivoza noticed, and the
          evidence-quality read all in one card instead of three. */}
      <div className={`rounded-2xl p-6 ${warn ? 'border-2 border-warm-500 bg-warm-100' : 'border border-border bg-surface'}`}>
        <h1 className={`text-xl font-semibold ${warn ? 'text-warm-500' : 'text-ink'}`}>
          {session.classSubject || 'New Recording'} {session.period ? `· ${session.period}` : ''}
        </h1>
        <p className={`mt-1 text-sm ${warn ? 'text-warm-500' : 'text-ink-soft'}`}>
          {session.teacherName ? `${session.teacherName} · ` : ''}
          {formatSessionDateTime(session.sessionDate)}
          {session.gradeLevel ? ` · ${session.gradeLevel}` : ''}
          {session.durationSec ? ` · ${formatTime(session.durationSec)}` : ''}
        </p>
        {noticedText && (
          <p className={`mt-3 text-sm ${warn ? 'font-semibold text-warm-500' : 'text-ink'}`}>{noticedText}</p>
        )}
        <p className={`mt-3 text-xs ${warn ? 'text-warm-500' : 'text-ink-soft'}`}>{evidenceQuality.text}</p>
      </div>

      {/* 2. One chart — usually talk distribution. */}
      <ClassroomVoiceBalance {...voiceBalance} caption={buildVoiceBalanceCaption(balanceJudgment)} />

      {/* 3. Two or three moments linked to the recording. */}
      <MomentsCard strength={strength} priority={priority} coverage={coverage} onViewDiscourse={onViewDiscourse} />

      {/* 4-5. One suggested next step + one Reflect with Wivoza button. */}
      <NextStepCard priority={priority} onSetFocus={onFocusMetricChange} onGoReflect={onGoReflect} />
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

  const ordered = focusMetric
    ? [...charts.filter((c) => c.key === focusMetric), ...charts.filter((c) => c.key !== focusMetric)]
    : charts

  return (
    <div className="flex flex-col gap-6">
      <FocusSelector focusMetric={focusMetric} onChange={onFocusMetricChange} />

      {insight && (
        <div className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4">
          <ArrowUpIcon className="h-5 w-5 shrink-0 text-brand-600" />
          <p className="text-sm text-ink">{insight}</p>
        </div>
      )}

      {ordered.map((c) => (
        <div
          key={c.key}
          className={`rounded-2xl border p-6 ${
            focusMetric === c.key ? 'border-brand-400 bg-brand-50/40 ring-1 ring-brand-200' : 'border-border bg-surface'
          }`}
        >
          {focusMetric === c.key && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-600">Your focus</p>
          )}
          {c.node}
        </div>
      ))}

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
  conversation,
  sending,
  reflectError,
  draft,
  onDraftChange,
  onStart,
  onSend,
  locked,
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
}: {
  highlights: AudioHighlight[] | null
  conversation: AudioReflectMessage[] | null
  sending: boolean
  reflectError: { kind: ReflectChatErrorKind; message: string } | null
  draft: string
  onDraftChange: (v: string) => void
  onStart: () => void
  onSend: () => void
  locked: boolean
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
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const started = conversation != null && conversation.length > 0
  const userTurnCount = conversation?.filter((m) => m.role === 'user').length ?? 0
  const turnCapHit = userTurnCount >= REFLECT_TURN_CAP

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [conversation, sending])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">What stood out this session</h2>
        {!highlights || highlights.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">Nothing stood out enough this session to flag here.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {highlights.map((h, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                  {formatHighlightHeadline(h)}
                </p>
                <p className="mt-1.5 text-sm text-ink">"{h.excerpt}"</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col rounded-2xl border border-border bg-surface">
        <div ref={scrollRef} className="flex max-h-96 min-h-[10rem] flex-col gap-3 overflow-y-auto p-4">
          {!started ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-ink-soft">
                Talk through this session with your coach — one question at a time, at your pace.
              </p>
              {!locked && (
                <button
                  type="button"
                  onClick={onStart}
                  disabled={sending}
                  className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
                >
                  {sending ? 'Starting...' : 'Start reflecting'}
                </button>
              )}
            </div>
          ) : (
            <>
              {conversation!.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === 'user'
                      ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brand-500 px-4 py-2.5 text-sm text-white'
                      : 'max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-canvas px-4 py-2.5 text-sm whitespace-pre-wrap text-ink'
                  }
                >
                  {m.text}
                </div>
              ))}
              {sending && (
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-canvas px-4 py-2.5 text-sm text-ink-soft">
                  Thinking...
                </div>
              )}
            </>
          )}
        </div>

        {reflectError && (
          <p className="border-t border-border px-4 py-2 text-sm text-warm-500">{reflectError.message}</p>
        )}

        {started && (
          <form
            className="border-t border-border p-4"
            onSubmit={(e) => {
              e.preventDefault()
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
            {locked ? (
              <p className="mt-2 text-xs text-ink-soft">This report is locked — the conversation is read-only.</p>
            ) : turnCapHit ? (
              <p className="mt-2 text-xs text-ink-soft">
                You've reached today's reflection limit for this session.
              </p>
            ) : null}
          </form>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Your reflection</h2>
          {started && !locked && (
            <button
              type="button"
              onClick={onSummarize}
              disabled={summarizing}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-60"
            >
              {summarizing ? 'Summarizing...' : 'Fill in from our conversation'}
            </button>
          )}
        </div>
        {summarizeError && <p className="mt-1 text-xs text-warm-500">{summarizeError}</p>}
        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">What went well</span>
            <textarea
              value={strengths}
              onChange={(e) => onStrengthsChange(e.target.value)}
              disabled={locked}
              rows={3}
              className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-70"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">What you want to work on</span>
            <textarea
              value={growthAreas}
              onChange={(e) => onGrowthAreasChange(e.target.value)}
              disabled={locked}
              rows={3}
              className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-70"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">One thing to try next time</span>
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
  contentNotes,
  isShort,
  sending,
  error,
  onGenerate,
}: {
  session: AudioSession
  lessonContent: AudioLessonContent | null
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
  phasesCount,
  onViewPhases,
  nameMentionMetric,
  uniqueNameCount,
  toneRatio,
  redirectionMetric,
  routinesInsight,
  climateInsight,
}: {
  transitionMetric: ReturnType<typeof getCountMetric>
  directiveMetric: ReturnType<typeof getCountMetric>
  phasesCount: number
  onViewPhases: () => void
  nameMentionMetric: ReturnType<typeof getCountMetric>
  uniqueNameCount: number | null
  toneRatio: ConfidentMetric
  redirectionMetric: ReturnType<typeof getCountMetric>
  routinesInsight: string | null
  climateInsight: string | null
}) {
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
      </CategorySection>
      <CoachNote text={routinesInsight} />

      {phasesCount > 0 && (
        <button
          type="button"
          onClick={onViewPhases}
          className="self-start text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          {phasesCount} phase{phasesCount === 1 ? '' : 's'} detected — see Discourse Details for the full breakdown →
        </button>
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

function DiscourseDetailsTab({
  questionCount,
  questionLog,
  session,
  teacherTalkMetric,
  studentTalkMetric,
  silencePct,
  silenceMetric,
  studentSegmentsMetric,
  questionsMetric,
  higherOrderRatio,
  higherOrderCount,
  followUpMetric,
  waitTimeMetric,
  cfuMetric,
  feedbackRatio,
  focusMetric,
  talkInsight,
  questioningInsight,
  cfuInsight,
}: {
  questionCount: number | null
  questionLog: AudioQuestionLogEntry[] | null
  session: AudioSessionWithSegments
  teacherTalkMetric: ReturnType<typeof getPresenceMetric>
  studentTalkMetric: ReturnType<typeof getPresenceMetric>
  silencePct: number | null
  silenceMetric: ReturnType<typeof getPresenceMetric>
  studentSegmentsMetric: ReturnType<typeof getCountMetric>
  questionsMetric: ReturnType<typeof getCountMetric>
  higherOrderRatio: ReturnType<typeof formatRatio> | null
  higherOrderCount: number | null
  followUpMetric: ReturnType<typeof getCountMetric>
  waitTimeMetric: ReturnType<typeof getPresenceMetric>
  cfuMetric: ReturnType<typeof getCountMetric>
  feedbackRatio: ConfidentMetric
  focusMetric: FocusMetric | null
  talkInsight: string | null
  questioningInsight: string | null
  cfuInsight: string | null
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-soft">
        {questionCount != null
          ? `You asked ${questionCount} question${questionCount === 1 ? '' : 's'} this session.`
          : 'No question data for this session.'}
      </p>

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
            value={session.avgWaitTimeSec != null ? `${session.avgWaitTimeSec}s` : waitTimeMetric.display}
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

      {session.phases && session.phases.length > 0 && (
        <div id="session-phases">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Session phases</h2>
          <div className="mt-3 flex flex-col gap-2">
            {session.phases.map((p, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5">
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
