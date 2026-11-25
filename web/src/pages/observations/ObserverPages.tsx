import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ObservationReportView, observationHeading } from '../../components/ObservationReportView'
import { ObservationLessonReport } from '../AudioCoaching'
import { TeacherBox, type TeacherPick } from '../../components/SchoolTeacherBox'
import { MicIcon } from '../../components/icons'
import {
  addObservationNote,
  attachObservationPlan,
  createObservation,
  deleteObservation,
  getAudioSession,
  getSpeakerSamples,
  startTranscription,
  tagSpeakers,
  getObservation,
  getObservations,
  regenerateObservation,
  removeObservationNote,
  removeObservationPlan,
  saveObservationReport,
  sendObservation,
  submitObservationAnswers,
  updateObservation,
  uploadObservationAudio,
  type AudioSessionWithSegments,
  type SpeakerSample,
  type Observation,
  type ObservationNote,
  type ObservationStatus,
  type ObservationSummary,
} from '../../lib/api'
import { NOTE_PROMPTS, NOTE_TAGS, OBSERVATION_QUESTIONS } from '../../lib/observationQuestions'
import { PageHeader } from '../evaluations/common'

// A supervisor's classroom observations (School Workspace > Observations):
// pick the teacher and lesson, record while taking notes, answer ten Danielson
// questions after Stop, and Wivoza writes a draft from the recording, the
// answers, the notes and the plan (server: routes/observations.ts). The
// supervisor sets the levels and sends it to the teacher.

export default function ObserverPages() {
  const { id } = useParams()
  // The old start page: recording now starts from the Observations page.
  if (id === 'new') return <Navigate to="/admin/observations" replace />
  return id ? <ObservationFlow id={id} /> : <ObservationsList />
}

const btnPrimary = 'rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-cream hover:bg-forest/90 disabled:bg-hairline disabled:text-ink-soft'
const btnSecondary = 'rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm font-semibold text-forest hover:border-forest disabled:opacity-50'
const input = 'w-full rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm text-ink focus:border-forest focus:outline-none'

function clock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

function Shell({ children, back, wide }: { children: ReactNode; back?: boolean; wide?: boolean }) {
  return (
    <div className={`mx-auto flex ${wide ? 'max-w-5xl' : 'max-w-4xl'} flex-col gap-6 px-4 py-8 sm:px-8`}>
      {back && (
        <Link to="/admin/observations" className="text-sm text-ink-soft hover:text-forest">
          ← All observations
        </Link>
      )}
      {children}
    </div>
  )
}

const STATUS_LABEL: Record<ObservationStatus, { label: string; tone: string }> = {
  recording: { label: 'Not recorded yet', tone: 'bg-cream text-ink-soft' },
  transcribing: { label: 'In progress', tone: 'bg-gold-tint text-terracotta-600' },
  transcribed: { label: 'In progress', tone: 'bg-gold-tint text-terracotta-600' },
  no_recording: { label: 'In progress', tone: 'bg-gold-tint text-terracotta-600' },
  pending: { label: 'Preparing report', tone: 'bg-gold-tint text-terracotta-600' },
  generating: { label: 'Preparing report', tone: 'bg-gold-tint text-terracotta-600' },
  draft: { label: 'Draft', tone: 'bg-mint-tint/70 text-forest' },
  failed: { label: 'Needs a retry', tone: 'bg-terracotta/15 text-terracotta-600' },
  sent: { label: 'Sent', tone: 'bg-forest text-cream' },
}

// ---- the list ----

function ObservationsList() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<ObservationSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The observation this page itself is recording, which never locks it.
  const [ownId, setOwnId] = useState<string | null>(null)
  // Checked every few seconds, so Record locks (and unlocks) as soon as
  // another device starts (or stops) recording.
  useEffect(() => {
    const load = () =>
      getObservations()
        .then(setRows)
        .catch((e: Error) => setError(e.message))
    void load()
    const t = window.setInterval(() => void load(), 5000)
    return () => window.clearInterval(t)
  }, [])
  const live = rows?.find((r) => r.recordingNow && r.id !== ownId) ?? null
  return (
    <Shell>
      <PageHeader
        crumb="Observations"
        title="Observations"
        blurb="Observe a lesson with Wivoza. You watch the room; Wivoza listens. Together they make one report you review and send."
      />
      {/* Record straight from here, like Lesson Debrief (2026-11-24). */}
      <Recorder
        observation={null}
        lockedBy={live ? { id: live.id, observedAt: live.observedAt } : null}
        onStarted={(o) => setOwnId(o.id)}
        onDone={(o) => navigate(`/admin/observations/${o.id}`)}
      />
      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      {!rows && !error && <p className="text-sm text-ink-soft">Loading...</p>}
      {rows && rows.length > 0 && <h2 className="mt-2 font-heading text-xl font-bold text-forest">Past observations</h2>}
      {rows && rows.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-hairline bg-white">
          {rows.map((o) => (
            <div key={o.id} className="flex items-center gap-2 border-b border-hairline/70 pr-3 last:border-0 hover:bg-cream/40">
              <Link to={`/admin/observations/${o.id}`} className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{o.teacherName || 'Untitled observation'}</p>
                  <p className="text-sm text-ink-soft">{observationHeading({ ...o, teacherName: '' })}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${o.recordingNow ? 'bg-terracotta/15 text-terracotta-600' : STATUS_LABEL[o.status].tone}`}>{o.recordingNow ? 'Recording now' : STATUS_LABEL[o.status].label}</span>
              </Link>
              <button
                type="button"
                aria-label={`Delete the observation of ${o.teacherName || 'an untitled lesson'}`}
                className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-terracotta-600 hover:bg-terracotta/10"
                onClick={async () => {
                  const who = o.teacherName || 'this observation'
                  const ask = o.sentAt
                    ? `Delete the observation sent to ${who}? It will also disappear from their Observations. This can’t be undone.`
                    : `Delete the observation of ${who}? Its recording, answers and notes go with it. This can’t be undone.`
                  if (!window.confirm(ask)) return
                  try {
                    await deleteObservation(o.id)
                    setRows((r) => (r ? r.filter((x) => x.id !== o.id) : r))
                  } catch (e) {
                    setError((e as Error).message)
                  }
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </section>
      )}
    </Shell>
  )
}

// ---- Who was observed ----
// Recording starts from the Observations page's record card (the user's call,
// 2026-11-24), like Lesson Debrief. Who and what was observed is filled in
// after Stop, above the five questions (ObservationDetails).

const GRADES = ['6', '7', '8', '9', '10', '11', '12']

type ObservationDetailsValue = { teacher: TeacherPick; lesson: string; grade: string }

function detailsFrom(o: Observation): ObservationDetailsValue {
  const g = (o.gradeLevel ?? '').replace(/(st|nd|rd|th)$/i, '')
  return { teacher: { id: o.teacherId, name: o.teacherName }, lesson: o.lessonTitle ?? '', grade: GRADES.includes(g) ? g : '' }
}

/// Who and what was observed. Only the teacher is required; subject and lesson
/// are one free-text field, grade a 6–12 dropdown, and the date is when
/// recording began.
function ObservationDetails({ value, onChange, observedAt }: { value: ObservationDetailsValue; onChange: (v: ObservationDetailsValue) => void; observedAt: string }) {
  const optional = <span className="font-normal text-ink-soft"> (optional)</span>
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-hairline bg-white p-6">
      <h2 className="font-heading text-xl font-bold text-forest">Who you observed</h2>
      <label className="flex flex-col gap-1.5 text-sm font-semibold text-forest">
        Teacher
        <TeacherBox
          value={value.teacher}
          onChange={(t) => {
            const next = { ...value, teacher: t }
            if (t.id) {
              // Filled from the teacher's profile only where still empty.
              if (!value.lesson.trim() && t.subject) next.lesson = t.subject
              const g = (t.gradeLevel ?? '').replace(/(st|nd|rd|th)$/i, '')
              if (!value.grade && GRADES.includes(g)) next.grade = g
            }
            onChange(next)
          }}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-forest">
          <span>Subject/Lesson{optional}</span>
          <input value={value.lesson} onChange={(e) => onChange({ ...value, lesson: e.target.value })} placeholder="For example: Science, chemical reactions" className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-forest">
          <span>Grade{optional}</span>
          <select value={value.grade} onChange={(e) => onChange({ ...value, grade: e.target.value })} className={input}>
            <option value="">Choose a grade</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="text-sm">
        <p className="font-semibold text-forest">Date</p>
        <p className="mt-1 text-ink">
          {new Date(observedAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          <span className="text-ink-soft"> · set automatically</span>
        </p>
      </div>
    </section>
  )
}

// ---- one observation, whatever step it is at ----

function ObservationFlow({ id }: { id: string }) {
  const [o, setO] = useState<Observation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stopped, setStopped] = useState(false)
  const [editing, setEditing] = useState(false)
  // "Record here instead", when the other device's recording was abandoned.
  // (Also from the Observations page's locked card: ?recordHere=1.)
  const [recordHere, setRecordHere] = useState(() => new URLSearchParams(window.location.search).has('recordHere'))
  const reload = useCallback(() => getObservation(id).then(setO).catch((e: Error) => setError(e.message)), [id])
  useEffect(() => {
    void reload()
  }, [reload])

  // Watch while another device records, while the recording is transcribed
  // or analyzed, and while the draft is being written.
  const busyLesson = !!o && ['recording', 'transcribing', 'analyzing'].includes(o.sessionStatus ?? '')
  const preparing = !!o && !!o.answeredAt && ['recording', 'transcribing', 'transcribed', 'no_recording', 'pending', 'generating'].includes(o.status)
  useEffect(() => {
    if (!preparing && !busyLesson) return
    const t = window.setInterval(() => void reload(), 4000)
    return () => window.clearInterval(t)
  }, [preparing, busyLesson, reload])

  if (error) {
    return (
      <Shell back>
        <p className="text-sm text-terracotta-600">{error}</p>
      </Shell>
    )
  }
  if (!o) {
    return (
      <Shell back>
        <p className="text-sm text-ink-soft">Loading...</p>
      </Shell>
    )
  }

  const header = (
    <PageHeader
      crumb="Observations"
      title={o.teacherName || 'New Observation'}
      blurb={o.teacherName ? observationHeading({ ...o, teacherName: '' }) : 'Record first. You’ll add who you observed after Stop.'}
    />
  )
  const voiceStep = o.sessionId && o.sessionStatus === 'tagging' ? <VoicePicker sessionId={o.sessionId} onDone={() => void reload()} /> : null
  const notRecordedYet = o.status === 'recording' && !o.answeredAt && !stopped

  // Recording on another device (the phone, say): this one takes notes.
  if (notRecordedYet && o.sessionStatus === 'recording' && !recordHere) {
    return (
      <Shell back>
        {header}
        <RemoteRecording observation={o} onRecordHere={() => setRecordHere(true)} />
      </Shell>
    )
  }
  if (notRecordedYet && (o.sessionStatus == null || ['setup', 'recording'].includes(o.sessionStatus))) {
    return (
      <Shell back>
        {header}
        <Recorder
          observation={o}
          takeOver={recordHere}
          onDone={async () => {
            setStopped(true)
            await reload()
          }}
        />
      </Shell>
    )
  }
  // Back from a draft (or a failed one) to change notes and answers, then
  // write the report again. Not once sent.
  if (!o.answeredAt || (editing && !o.sentAt)) {
    return (
      <Shell back>
        {header}
        {voiceStep}
        <Questions
          observation={o}
          rerun={editing}
          onCancel={editing ? () => setEditing(false) : undefined}
          onChanged={(next) => {
            setEditing(false)
            setO(next)
          }}
        />
      </Shell>
    )
  }
  const startEditing = () => {
    setEditing(true)
    window.scrollTo({ top: 0 })
  }
  if (preparing) {
    const line =
      o.sessionStatus === 'transcribing'
        ? 'Wivoza is still transcribing the recording. The report starts as soon as it is done.'
        : o.sessionStatus === 'tagging'
          ? 'Pick the teacher’s voice above, and Wivoza will analyze the lesson and write the report.'
          : o.sessionStatus === 'analyzing'
            ? 'Wivoza is analyzing the lesson, the same way it reads a teacher’s own recording.'
            : 'Wivoza is combining the recording, your answers, your notes and the plan. This usually takes under a minute. You can leave this page; the draft will be waiting under Observations.'
    return (
      <Shell back>
        {header}
        {voiceStep}
        <section className="rounded-2xl border border-hairline bg-white p-6">
          <p className="font-heading text-lg font-bold text-forest">Preparing the report...</p>
          <p className="mt-1 text-sm text-ink-soft">{line}</p>
        </section>
      </Shell>
    )
  }
  if (o.status === 'failed') {
    return (
      <Shell back>
        {header}
        <section className="rounded-2xl border border-terracotta/30 bg-white p-6">
          <p className="font-heading text-lg font-bold text-forest">The report couldn&rsquo;t be written</p>
          <p className="mt-1 text-sm text-ink-soft">{o.failureReason ?? 'Something went wrong.'} Your answers and notes are saved.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className={btnPrimary} onClick={() => regenerateObservation(o.id).then(setO).catch((e: Error) => setError(e.message))}>
              Try again
            </button>
            <button type="button" className={btnSecondary} onClick={startEditing}>
              Edit notes and answers
            </button>
          </div>
        </section>
      </Shell>
    )
  }
  const content =
    o.status === 'draft' && o.report ? (
      <DraftEditor observation={o} onChanged={setO} onEdit={startEditing} />
    ) : (
      <>
        {o.sentAt && (
          <p className="rounded-xl bg-mint-tint/40 px-4 py-3 text-sm text-forest">
            Sent to {o.teacherName} on {new Date(o.sentAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.
          </p>
        )}
        {o.report && <ObservationReportView observation={o} report={o.report} />}
      </>
    )
  return (
    <Shell back wide>
      {header}
      <WithLessonTabs sessionId={o.sessionStatus === 'analyzed' ? o.sessionId : null}>
        <div className="flex flex-col gap-6">{content}</div>
      </WithLessonTabs>
    </Shell>
  )
}

/// The observation report as the first tab, with the recording's Summary,
/// Insights and Content Specialist beside it (the teacher's own report
/// components). Without an analyzed lesson, the observation alone.
function WithLessonTabs({ sessionId, children }: { sessionId: string | null; children: ReactNode }) {
  const [lesson, setLesson] = useState<AudioSessionWithSegments | null>(null)
  useEffect(() => {
    if (!sessionId) return
    getAudioSession(sessionId)
      .then(setLesson)
      .catch(() => setLesson(null))
  }, [sessionId])
  if (!sessionId || !lesson) return <>{children}</>
  return <ObservationLessonReport session={lesson} onUpdate={setLesson} observationContent={children} />
}

/// After Stop, once transcribed: which voice is the teacher's. The same
/// choice a teacher makes on their own recording, so the lesson's numbers
/// (talk, questions, wait time) are counted for the right person.
function VoicePicker({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const [voices, setVoices] = useState<SpeakerSample[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    getSpeakerSamples(sessionId)
      .then(({ speakers }) => {
        const sorted = [...speakers].sort((a, b) => (b.totalSec ?? 0) - (a.totalSec ?? 0))
        setVoices(sorted)
        // The voice that speaks longest is usually the teacher: chosen to start.
        if (sorted[0]) setPicked([sorted[0].rawSpeakerTag])
      })
      .catch((e: Error) => setError(e.message))
  }, [sessionId])
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-gold/50 bg-gold-tint/30 p-6">
      <div>
        <h2 className="font-heading text-xl font-bold text-forest">Which voice is the teacher?</h2>
        <p className="mt-1 text-sm text-ink-soft">
          So the lesson&rsquo;s numbers count the teacher, not a student. If the teacher was split into two voices (moving around the room), pick both.
        </p>
      </div>
      {!voices && !error && <p className="text-sm text-ink-soft">Loading the voices...</p>}
      {voices && (
        <div className="flex flex-col gap-2">
          {voices.map((v) => {
            const on = picked.includes(v.rawSpeakerTag)
            return (
              <button
                key={v.rawSpeakerTag}
                type="button"
                aria-pressed={on}
                onClick={() => setPicked(on ? picked.filter((t) => t !== v.rawSpeakerTag) : [...picked, v.rawSpeakerTag])}
                className={`rounded-xl border p-3 text-left ${on ? 'border-forest bg-white ring-2 ring-forest/30' : 'border-hairline bg-white hover:border-forest'}`}
              >
                <p className="text-sm text-ink">&ldquo;{v.sample}&rdquo;</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {on ? 'Teacher · ' : ''}
                  {v.totalSec != null ? `speaks about ${Math.max(1, Math.round(v.totalSec / 60))} min` : ''}
                  {v.utteranceCount != null ? ` in ${v.utteranceCount} turns` : ''}
                </p>
              </button>
            )
          })}
        </div>
      )}
      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      <div>
        <button
          type="button"
          disabled={busy || picked.length === 0}
          className={btnPrimary}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await tagSpeakers(sessionId, picked)
              onDone()
            } catch (e) {
              setError((e as Error).message)
              setBusy(false)
            }
          }}
        >
          {busy ? 'Saving...' : 'This is the teacher'}
        </button>
      </div>
    </section>
  )
}

// ---- recording, with notes ----

const TAG_LABEL = Object.fromEntries(NOTE_TAGS.map((t) => [t.code, t.label]))

/// Notes while observing and after Stop. Each note is saved the moment it is
/// added, so another device on the same observation shows it too
/// (2026-11-24). With `prompts`, starters for what the five questions don't
/// ask (2b, 3a, 3b, 3e): each begins a note already tagged with its component.
function NotesEditor({
  notes,
  onAdd,
  onRemove,
  prompts = false,
}: {
  notes: ObservationNote[]
  onAdd: (text: string, code: string | null) => Promise<void>
  onRemove: (note: ObservationNote) => Promise<void>
  prompts?: boolean
}) {
  const [text, setText] = useState('')
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const field = useRef<HTMLInputElement | null>(null)
  const prompt = NOTE_PROMPTS.find((p) => p.code === code)
  const add = async () => {
    const t = text.trim()
    if (!t || saving) return
    setSaving(true)
    try {
      await onAdd(t, code || null)
      setText('')
      setCode('')
    } catch {
      // The note stays in the box; LiveNotes says why.
    } finally {
      setSaving(false)
      field.current?.focus()
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {prompts && (
        <div className="flex flex-wrap gap-2">
          {NOTE_PROMPTS.map((p) => (
            <button
              key={p.code}
              type="button"
              aria-pressed={code === p.code}
              onClick={() => {
                setCode(p.code)
                field.current?.focus()
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${code === p.code ? 'bg-forest text-cream' : 'border border-hairline bg-white text-forest hover:border-forest'}`}
            >
              + {p.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          ref={field}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void add()
            }
          }}
          placeholder={prompt?.placeholder ?? 'What you see: the room, the walls, groups, student work'}
          className={input}
          maxLength={600}
        />
        <select value={code} onChange={(e) => setCode(e.target.value)} className="rounded-xl border border-hairline bg-white px-3 py-2.5 text-sm text-ink focus:border-forest focus:outline-none" aria-label="About (optional)">
          <option value="">About anything</option>
          {NOTE_TAGS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <button type="button" className={`${btnSecondary} shrink-0 whitespace-nowrap`} onClick={() => void add()} disabled={!text.trim() || saving}>
          {saving ? 'Saving...' : 'Add note'}
        </button>
      </div>
      <p className="text-xs text-ink-soft">Use numbers, not student names (&ldquo;3 of 5 groups&rdquo;). Your notes appear in the report the teacher receives.</p>
      {notes.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {notes.map((n, i) => (
            <li key={n.id ?? i} className="flex items-start justify-between gap-3 rounded-lg bg-cream/60 px-3 py-2 text-sm text-ink">
              <span>
                <span className="text-xs text-ink-soft">
                  {clock(n.atSec)}
                  {n.code ? ` · ${TAG_LABEL[n.code] ?? n.code}` : ''} ·{' '}
                </span>
                {n.text}
              </span>
              <button type="button" className="shrink-0 text-xs font-semibold text-terracotta-600 hover:underline" onClick={() => void onRemove(n)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/// The observation's notes, kept on the server: added and removed there, and
/// with `live`, refreshed every few seconds so notes typed on another device
/// appear here too.
function LiveNotes({ observationId, initial, live = false, prompts = false }: { observationId: string; initial: ObservationNote[]; live?: boolean; prompts?: boolean }) {
  const [notes, setNotes] = useState<ObservationNote[]>(initial)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!live) return
    const t = window.setInterval(() => {
      getObservation(observationId)
        .then((o) => setNotes(o.notes ?? []))
        .catch(() => {})
    }, 5000)
    return () => window.clearInterval(t)
  }, [live, observationId])
  return (
    <div className="flex flex-col gap-2">
      <NotesEditor
        notes={notes}
        prompts={prompts}
        onAdd={async (text, code) => {
          setError(null)
          try {
            setNotes((await addObservationNote(observationId, { text, code })).notes)
          } catch (e) {
            setError((e as Error).message || 'The note couldn’t be saved.')
            throw e
          }
        }}
        onRemove={async (n) => {
          if (!n.id) return
          setError(null)
          try {
            setNotes((await removeObservationNote(observationId, n.id)).notes)
          } catch (e) {
            setError((e as Error).message || 'The note couldn’t be removed.')
          }
        }}
      />
      {error && <p className="text-sm text-terracotta-600">{error}</p>}
    </div>
  )
}

/// Another device is recording this observation (the phone in the room): this
/// one takes notes, with the recording's clock, and no second Record button.
function RemoteRecording({ observation, onRecordHere }: { observation: Observation; onRecordHere: () => void }) {
  const started = new Date(observation.observedAt).getTime()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-3xl bg-forest p-7 text-cream sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Recording on your other device</p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-terracotta opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-terracotta" />
            </span>
            <span className="font-mono text-5xl font-semibold text-cream">{clock(Math.max(0, (now - started) / 1000))}</span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cream/70">
            Started {new Date(started).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </p>
          <p className="max-w-md text-center text-sm text-cream/80">
            Take your notes here. Press Stop on the device that is recording; this page moves on to the questions by itself.
          </p>
          <button type="button" onClick={onRecordHere} className="mt-1 text-xs font-semibold text-cream/70 underline hover:text-cream">
            That recording stopped? Record here instead
          </button>
        </div>
      </section>
      <section className="rounded-2xl border border-hairline bg-white p-6">
        <p className="mb-3 font-heading text-base font-bold text-forest">Your notes</p>
        <LiveNotes observationId={observation.id} initial={observation.notes ?? []} live />
      </section>
    </div>
  )
}

/// The record card, like Lesson Debrief's (2026-11-24): a mic button that
/// starts recording at once. On the Observations page there is no observation
/// yet; it is made the moment recording starts (the microphone is asked for
/// first, while the tap still counts as the user's). Stop sends the audio and
/// hands over to the after-Stop page.
function Recorder({
  observation,
  onDone,
  lockedBy = null,
  takeOver = false,
  onStarted,
}: {
  observation: Observation | null
  onDone: (o: Observation) => void | Promise<void>
  /** Another device is recording this observation: Record is locked here (2026-11-24). */
  lockedBy?: { id: string; observedAt: string } | null
  /** "Record here instead": take over a recording that stopped on the other device. */
  takeOver?: boolean
  onStarted?: (o: Observation) => void
}) {
  const [phase, setPhase] = useState<'idle' | 'starting' | 'recording' | 'uploading' | 'upload_failed'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const startedAt = useRef<number | null>(null)
  const blob = useRef<Blob | null>(null)
  const wakeLock = useRef<WakeLockSentinel | null>(null)
  const obs = useRef<Observation | null>(observation)
  // The observation once it exists, for its live notes.
  const [current, setCurrent] = useState<Observation | null>(observation)
  const elapsed = () => (startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0)

  useEffect(() => {
    if (phase !== 'recording') return
    const t = window.setInterval(() => setSeconds(Math.floor(elapsed())), 1000)
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('beforeunload', warn)
    }
  }, [phase])

  async function ensureObservation(): Promise<Observation> {
    if (!obs.current) obs.current = await createObservation({})
    return obs.current
  }

  async function start() {
    setError(null)
    setPhase('starting')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Wivoza couldn’t use the microphone. Allow microphone access in the browser and try again.')
      setPhase('idle')
      return
    }
    try {
      const o = await ensureObservation()
      // Dated now, and marked recording, so the same observation opened on
      // another device (a laptop, for notes) shows notes only, and Record is
      // locked there. Refused if another device is already recording.
      await updateObservation(o.id, { recording: true, takeOver })
      setCurrent(o)
      onStarted?.(o)
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop())
      setError((e as Error).message || 'Could not start the observation.')
      setPhase('idle')
      return
    }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t))
    const r = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream)
    chunks.current = []
    r.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data)
    }
    r.start(1000)
    recorder.current = r
    startedAt.current = Date.now()
    setSeconds(0)
    setPhase('recording')
    try {
      wakeLock.current = (await navigator.wakeLock?.request('screen')) ?? null
    } catch {
      // The screen may dim; the recording continues.
    }
  }

  async function upload() {
    const o = obs.current
    if (!blob.current || !o) return
    setPhase('uploading')
    try {
      // Into the recording's lesson, transcribed like a teacher's own; an
      // observation from before lessons existed uploads the old way.
      if (o.sessionId) await startTranscription(o.sessionId, blob.current, seconds)
      else await uploadObservationAudio(o.id, blob.current, seconds)
      await onDone(o)
    } catch (e) {
      setError((e as Error).message || 'The recording couldn’t be sent.')
      setPhase('upload_failed')
    }
  }

  async function stop() {
    const r = recorder.current
    if (!r) return
    await new Promise<void>((resolve) => {
      r.onstop = () => resolve()
      r.stop()
    })
    r.stream.getTracks().forEach((t) => t.stop())
    void wakeLock.current?.release().catch(() => {})
    blob.current = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' })
    await upload()
  }

  const status =
    phase === 'recording' ? 'Recording' : phase === 'uploading' ? 'Sending the recording…' : phase === 'starting' ? 'Starting…' : phase === 'upload_failed' ? 'Not sent' : lockedBy ? 'Locked' : 'Ready to record'

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-3xl bg-forest p-7 text-cream sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Record an observation</p>
        <div className="mt-6 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2.5">
            {phase === 'recording' && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-terracotta opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-terracotta" />
              </span>
            )}
            <span className="font-mono text-5xl font-semibold text-cream">{clock(seconds)}</span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cream/70">{status}</p>
          {phase === 'idle' && lockedBy ? (
            // Another device is recording: no second recording from here.
            <div className="mt-2 flex flex-col items-center gap-3">
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="inline-flex cursor-not-allowed items-center gap-2.5 rounded-full bg-cream/15 px-8 py-4 text-base font-semibold text-cream/60"
              >
                <span aria-hidden="true">🔒</span>
                Record
              </button>
              <p className="max-w-md text-center text-sm text-cream/85">
                Recording on your other device since{' '}
                {new Date(lockedBy.observedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}. Record is locked here so the lesson isn&rsquo;t
                recorded twice.
              </p>
              <Link to={`/admin/observations/${lockedBy.id}`} className="rounded-full bg-cream px-6 py-3 text-sm font-semibold text-forest">
                Take notes on it
              </Link>
              <Link to={`/admin/observations/${lockedBy.id}?recordHere=1`} className="text-xs font-semibold text-cream/70 underline hover:text-cream">
                That recording stopped? Record here instead
              </Link>
            </div>
          ) : (
            (phase === 'idle' || phase === 'starting') && (
              <button
                type="button"
                onClick={start}
                disabled={phase === 'starting'}
                className="mt-2 inline-flex items-center gap-2.5 rounded-full bg-terracotta px-8 py-4 text-base font-semibold text-cream shadow-lg transition-transform hover:scale-[1.02] disabled:opacity-70"
              >
                <MicIcon className="h-5 w-5" />
                Record
              </button>
            )
          )}
          {phase === 'recording' && (
            <button
              type="button"
              onClick={stop}
              className="mt-2 inline-flex items-center gap-2.5 rounded-full bg-cream px-8 py-4 text-base font-semibold text-forest shadow-lg transition-transform hover:scale-[1.02]"
            >
              <span className="h-3.5 w-3.5 rounded-sm bg-terracotta" aria-hidden="true" />
              Stop
            </button>
          )}
          {phase === 'upload_failed' && (
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <button type="button" className="rounded-full bg-cream px-6 py-3 text-sm font-semibold text-forest" onClick={upload}>
                Try sending again
              </button>
              <button type="button" className="rounded-full px-4 py-3 text-sm font-semibold text-cream/80 hover:text-cream" onClick={() => obs.current && void onDone(obs.current)}>
                Continue without the recording
              </button>
            </div>
          )}
          {error && <p className="max-w-md text-center text-sm text-gold">{error}</p>}
          {phase === 'idle' && !lockedBy && (
            <p className="max-w-md text-center text-xs text-cream/70">
              Let the teacher know the lesson is being recorded. After Stop you&rsquo;ll add who you observed and answer five quick questions. Audio is
              deleted once it&rsquo;s transcribed, and student names are masked.
            </p>
          )}
        </div>
      </section>
      {phase === 'recording' && current && (
        <section className="rounded-2xl border border-hairline bg-white p-6">
          <p className="mb-3 font-heading text-base font-bold text-forest">Your notes</p>
          <p className="-mt-2 mb-3 text-xs text-ink-soft">You can also open this observation on another device (a laptop, say) and take notes there while this one records.</p>
          <LiveNotes observationId={current.id} initial={current.notes ?? []} live />
        </section>
      )}
    </div>
  )
}

// ---- the ten questions, after Stop ----

function PlanBox({ observation, onChanged }: { observation: Observation; onChanged: (o: Observation) => void }) {
  const [pasting, setPasting] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<Observation>) => {
    setBusy(true)
    setError(null)
    try {
      onChanged(await fn())
      setPasting(false)
      setText('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      {observation.plan ? (
        <p className="flex flex-wrap items-center gap-3 text-sm text-ink">
          <span>
            <span className="font-semibold text-forest">Plan:</span> {observation.plan.label}
          </span>
          <button type="button" disabled={busy} className="text-xs font-semibold text-terracotta-600 hover:underline" onClick={() => run(() => removeObservationPlan(observation.id))}>
            Remove plan
          </button>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <label className={`${btnSecondary} cursor-pointer`}>
            Attach Lesson Plan
            <input
              type="file"
              accept=".pdf,.doc,.docx,.txt,.rtf,.odt,.pptx"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void run(() => attachObservationPlan(observation.id, { file }))
                e.target.value = ''
              }}
            />
          </label>
          <button type="button" className="text-sm font-semibold text-forest hover:underline" onClick={() => setPasting(!pasting)}>
            Paste it
          </button>
          {busy && <span className="text-xs text-ink-soft">Reading the plan...</span>}
        </div>
      )}
      {pasting && !observation.plan && (
        <div className="flex flex-col gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className={input} placeholder="Paste the lesson plan" />
          <div>
            <button type="button" disabled={busy || text.trim().length < 80} className={btnSecondary} onClick={() => run(() => attachObservationPlan(observation.id, { text }))}>
              Attach
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      <p className="text-xs text-ink-soft">Optional. With a plan, the report adds Domain 1 and compares what was planned with what happened.</p>
    </div>
  )
}

function Questions({
  observation,
  onChanged,
  rerun = false,
  onCancel,
}: {
  observation: Observation
  onChanged: (o: Observation) => void
  /** Back from a draft: the button rewrites the report from what changed. */
  rerun?: boolean
  onCancel?: () => void
}) {
  const [details, setDetails] = useState<ObservationDetailsValue>(() => detailsFrom(observation))
  const [answers, setAnswers] = useState<Record<string, string>>(observation.answers ?? {})
  // The separate closing box is gone (2026-11-24): a note does the same job.
  // An older observation keeps the closing note it already has.
  const closing = observation.closingNote ?? ''
  const named = details.teacher.name.trim().length > 0
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const answered = Object.keys(answers).length
  // Recorded = the audio reached the server, into the lesson (sessionStatus)
  // or, for an observation from before lessons existed, the old way.
  const ls = observation.sessionStatus
  const recorded = (ls != null && !['setup', 'recording'].includes(ls)) || observation.status !== 'recording'
  const recordingLine =
    ls === 'transcribing' || observation.status === 'transcribing'
      ? 'Wivoza is transcribing the recording while you answer.'
      : ls === 'tagging'
        ? 'The recording is transcribed. Pick the teacher’s voice above.'
        : ls === 'analyzing'
          ? 'Wivoza is analyzing the lesson while you answer.'
          : ls === 'analyzed' || observation.status === 'transcribed'
            ? 'The recording is ready.'
            : ls === 'failed' || observation.status === 'no_recording'
              ? `${observation.failureReason ?? 'The recording could not be transcribed.'} The report will rest on your answers, notes and the plan.`
              : 'No recording. The report will rest on your answers, notes and the plan.'

  return (
    <div className="flex flex-col gap-6">
      <p className="rounded-xl bg-mint-tint/40 px-4 py-3 text-sm text-forest">{recordingLine}</p>
      <ObservationDetails value={details} onChange={setDetails} observedAt={observation.observedAt} />
      <section className="flex flex-col gap-5 rounded-2xl border border-hairline bg-white p-6">
        <div>
          <h2 className="font-heading text-xl font-bold text-forest">Quick questions</h2>
          <p className="mt-1 text-sm text-ink-soft">What a recording can&rsquo;t capture. {answered} of {OBSERVATION_QUESTIONS.length} answered.</p>
        </div>
        {OBSERVATION_QUESTIONS.map((q, i) => (
          <fieldset key={q.id} className="flex flex-col gap-2 border-t border-hairline/70 pt-4 first-of-type:border-0 first-of-type:pt-0">
            <legend className="text-sm text-ink">
              <span className="mr-2 font-semibold text-ink-soft">{i + 1}.</span>
              <span className="font-semibold">{q.title}:</span> {q.text}
            </legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {q.options.map((opt) => {
                const on = answers[q.id] === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt.key }))}
                    className={`rounded-xl px-3.5 py-2 text-sm font-medium ${on ? 'bg-forest text-cream' : 'border border-hairline bg-white text-ink hover:border-forest'}`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-hairline bg-white p-6">
        <div>
          <h2 className="font-heading text-xl font-bold text-forest">Observer notes</h2>
          <p className="mt-1 text-sm text-ink-soft">Notes you took while recording, and anything else you saw. Tap a topic the questions don&rsquo;t ask about to start a note on it.</p>
        </div>
        <LiveNotes observationId={observation.id} initial={observation.notes ?? []} live prompts />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-hairline bg-white p-6">
        <h2 className="font-heading text-lg font-bold text-forest">Lesson plan</h2>
        <PlanBox observation={observation} onChanged={onChanged} />
      </section>

      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !named}
          className={btnPrimary}
          onClick={async () => {
            if (rerun && !window.confirm('Write the report again from these notes and answers? The levels and comments you set on the draft will be replaced.')) return
            setBusy(true)
            setError(null)
            try {
              await updateObservation(observation.id, {
                ...(details.teacher.id ? { teacherId: details.teacher.id } : { teacherId: null, teacherName: details.teacher.name.trim() }),
                lessonTitle: details.lesson.trim() || null,
                gradeLevel: details.grade || null,
              })
              onChanged(await submitObservationAnswers(observation.id, { answers, closingNote: closing, recording: recorded }))
            } catch (e) {
              setError((e as Error).message)
              setBusy(false)
            }
          }}
        >
          {busy ? 'Sending...' : rerun ? 'Rerun the report' : 'Prepare the report'}
        </button>
        {onCancel && (
          <button type="button" disabled={busy} className={btnSecondary} onClick={onCancel}>
            Back to the draft
          </button>
        )}
        {!named && <span className="text-sm text-ink-soft">Add the teacher&rsquo;s name above first.</span>}
      </div>
    </div>
  )
}

// ---- the draft: levels, comments, send ----

function DraftEditor({ observation, onChanged, onEdit }: { observation: Observation; onChanged: (o: Observation) => void; onEdit: () => void }) {
  const navigate = useNavigate()
  const report = observation.report!
  const [comments, setComments] = useState(report.comments ?? '')
  const [teacher, setTeacher] = useState<TeacherPick>({ id: observation.teacherId, name: observation.teacherName })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<Observation>) => {
    setBusy(true)
    setError(null)
    try {
      onChanged(await fn())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const setLevel = (code: string, level: 1 | 2 | 3 | 4 | null) => {
    // Shown at once; saved behind it.
    onChanged({
      ...observation,
      report: {
        ...report,
        components: report.components.map((c) => (c.code === code ? { ...c, level } : c)),
        planning: report.planning?.map((c) => (c.code === code ? { ...c, level } : c)) ?? null,
      },
    })
    void saveObservationReport(observation.id, { levels: { [code]: level } }).catch((e: Error) => setError(e.message))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-hairline px-4 py-3">
        <p className="min-w-0 flex-1 text-sm text-ink-soft">Draft. Only you can see it until you send it. Wivoza suggested each level; set your own where you disagree.</p>
        <button type="button" className={`${btnSecondary} shrink-0`} onClick={onEdit}>
          Edit notes and answers
        </button>
      </div>

      {!observation.teacherId && (
        <section className="flex flex-col gap-3 rounded-2xl border border-gold/50 bg-gold-tint/30 p-5">
          <p className="text-sm text-ink">
            <b>{observation.teacherName}</b> isn&rsquo;t linked to a Wivoza account. Choose them from your school to send the report.
          </p>
          <TeacherBox value={teacher} onChange={setTeacher} />
          <div>
            <button type="button" disabled={busy || !teacher.id} className={btnSecondary} onClick={() => run(() => updateObservation(observation.id, { teacherId: teacher.id }))}>
              Link teacher
            </button>
          </div>
        </section>
      )}

      <ObservationReportView observation={observation} report={report} onLevel={setLevel} showComments={false} />

      <section className="flex flex-col gap-3 rounded-2xl border border-hairline bg-white p-5">
        <h2 className="font-heading text-lg font-bold text-forest">Your comments to {observation.teacherName}</h2>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          onBlur={() => void saveObservationReport(observation.id, { comments }).then(onChanged).catch((e: Error) => setError(e.message))}
          rows={5}
          maxLength={3000}
          placeholder="What went well, what to work on next, and a question for your follow-up conversation."
          className={input}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-hairline bg-white p-5">
        <h2 className="font-heading text-lg font-bold text-forest">Lesson plan</h2>
        <PlanBox observation={observation} onChanged={onChanged} />
        <div>
          <button
            type="button"
            disabled={busy}
            className={btnSecondary}
            onClick={() => {
              if (window.confirm('Write the draft again from the recording, your answers, notes and plan? Your levels and comments will be replaced.')) {
                void run(() => regenerateObservation(observation.id))
              }
            }}
          >
            Write the draft again
          </button>
        </div>
      </section>

      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || !observation.teacherId}
          className={btnPrimary}
          onClick={async () => {
            if (!window.confirm(`Send this observation to ${observation.teacherName}? They will see the whole report, including your notes and comments. It can't be changed after sending.`)) return
            await saveObservationReport(observation.id, { comments }).catch(() => null)
            await run(() => sendObservation(observation.id))
          }}
        >
          Send to {observation.teacherName}
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-terracotta-600 hover:underline"
          onClick={async () => {
            if (!window.confirm('Delete this draft? This can’t be undone.')) return
            await deleteObservation(observation.id).catch(() => null)
            navigate('/admin/observations')
          }}
        >
          Delete draft
        </button>
      </div>
    </div>
  )
}
