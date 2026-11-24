import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ObservationReportView, observationHeading } from '../../components/ObservationReportView'
import {
  attachObservationPlan,
  createObservation,
  deleteObservation,
  findObservableTeachers,
  getObservation,
  getObservations,
  regenerateObservation,
  removeObservationPlan,
  saveObservationReport,
  sendObservation,
  submitObservationAnswers,
  updateObservation,
  uploadObservationAudio,
  type ObservableTeacher,
  type Observation,
  type ObservationNote,
  type ObservationStatus,
  type ObservationSummary,
} from '../../lib/api'
import { OBSERVATION_QUESTIONS } from '../../lib/observationQuestions'
import { PageHeader } from '../evaluations/common'

// A supervisor's classroom observations (School Workspace > Observations):
// pick the teacher and lesson, record while taking notes, answer ten Danielson
// questions after Stop, and Wivoza writes a draft from the recording, the
// answers, the notes and the plan (server: routes/observations.ts). The
// supervisor sets the levels and sends it to the teacher.

export default function ObserverPages() {
  const { id } = useParams()
  if (id === 'new') return <NewObservation />
  return id ? <ObservationFlow id={id} /> : <ObservationsList />
}

const btnPrimary = 'rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-cream hover:bg-forest/90 disabled:bg-hairline disabled:text-ink-soft'
const btnSecondary = 'rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm font-semibold text-forest hover:border-forest disabled:opacity-50'
const input = 'w-full rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm text-ink focus:border-forest focus:outline-none'

function clock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

function Shell({ children, back }: { children: ReactNode; back?: boolean }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
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
  generating: { label: 'Preparing report', tone: 'bg-gold-tint text-terracotta-600' },
  draft: { label: 'Draft', tone: 'bg-mint-tint/70 text-forest' },
  failed: { label: 'Needs a retry', tone: 'bg-terracotta/15 text-terracotta-600' },
  sent: { label: 'Sent', tone: 'bg-forest text-cream' },
}

// ---- the list ----

function ObservationsList() {
  const [rows, setRows] = useState<ObservationSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    getObservations()
      .then(setRows)
      .catch((e: Error) => setError(e.message))
  }, [])
  return (
    <Shell>
      <PageHeader
        crumb="Observations"
        title="Observations"
        blurb="Observe a lesson with Wivoza. You watch the room; Wivoza listens. Together they make one report you review and send."
        aside={
          <Link to="/admin/observations/new" className={btnPrimary}>
            New Observation
          </Link>
        }
      />
      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      {!rows && !error && <p className="text-sm text-ink-soft">Loading...</p>}
      {rows && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-hairline p-6 text-sm text-ink-soft">
          No observations yet. Press New Observation when you walk into a class.
        </div>
      )}
      {rows && rows.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-hairline bg-white">
          {rows.map((o) => (
            <Link
              key={o.id}
              to={`/admin/observations/${o.id}`}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline/70 px-5 py-4 last:border-0 hover:bg-cream/40"
            >
              <div className="min-w-0">
                <p className="font-semibold text-ink">{o.teacherName}</p>
                <p className="text-sm text-ink-soft">{observationHeading({ ...o, teacherName: '' }).replace(/^ · /, '')}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_LABEL[o.status].tone}`}>{STATUS_LABEL[o.status].label}</span>
            </Link>
          ))}
        </section>
      )}
    </Shell>
  )
}

// ---- the Teacher box: type, with suggestions from the school ----

type TeacherPick = { id: string | null; name: string; subject?: string | null; gradeLevel?: string | null }

function TeacherBox({ value, onChange }: { value: TeacherPick; onChange: (t: TeacherPick) => void }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ObservableTeacher[]>([])
  const [active, setActive] = useState(-1)
  const timer = useRef<number | null>(null)
  const search = useCallback((q: string) => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      findObservableTeachers(q)
        .then((r) => {
          setOptions(r)
          setActive(-1)
        })
        .catch(() => setOptions([]))
    }, 180)
  }, [])
  const pick = (t: ObservableTeacher) => {
    onChange({ id: t.id, name: t.name, subject: t.subject, gradeLevel: t.gradeLevel })
    setOpen(false)
  }
  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="teacher-options"
        aria-autocomplete="list"
        value={value.name}
        placeholder="Type a name or email"
        onFocus={() => {
          setOpen(true)
          search(value.id ? '' : value.name)
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          onChange({ id: null, name: e.target.value })
          setOpen(true)
          search(e.target.value.trim())
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(options.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter' && open && active >= 0 && options[active]) {
            e.preventDefault()
            pick(options[active])
          } else if (e.key === 'Escape') setOpen(false)
        }}
        className={input}
      />
      {open && options.length > 0 && (
        <ul id="teacher-options" role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-hairline bg-white py-1 shadow-lg">
          {options.map((t, i) => (
            <li
              key={t.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(t)
              }}
              className={`cursor-pointer px-4 py-2 ${i === active ? 'bg-mint-tint/50' : 'hover:bg-cream'}`}
            >
              <p className="text-sm font-semibold text-ink">
                {t.name}
                {t.mine && <span className="ml-2 text-xs font-normal text-forest">Your teacher</span>}
              </p>
              <p className="text-xs text-ink-soft">{[t.email, t.subject, t.gradeLevel ? `Grade ${t.gradeLevel.replace(/(st|nd|rd|th)$/i, '')}` : null].filter(Boolean).join(' · ')}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-xs text-ink-soft">
        {value.id
          ? 'From your school. They can receive the report in Wivoza.'
          : value.name.trim()
            ? 'Not linked to a Wivoza account. You can still observe; choose them from the list before sending.'
            : 'Teachers at your school appear as you type.'}
      </p>
    </div>
  )
}

// ---- start screen ----

function NewObservation() {
  const navigate = useNavigate()
  const [teacher, setTeacher] = useState<TeacherPick>({ id: null, name: '' })
  const [lesson, setLesson] = useState('')
  const [subject, setSubject] = useState('')
  const [grade, setGrade] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const now = new Date()

  return (
    <Shell back>
      <PageHeader crumb="Observations" title="New Observation" blurb="Who and what you are observing. The date and time are set when you press Record." />
      <section className="flex flex-col gap-5 rounded-2xl border border-hairline bg-white p-6">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-forest">
          Teacher
          <TeacherBox
            value={teacher}
            onChange={(t) => {
              setTeacher(t)
              if (t.id) {
                setSubject(t.subject ?? '')
                setGrade(t.gradeLevel ?? '')
              }
            }}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-forest">
          Lesson
          <input value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="For example: Chemical reactions, 3rd period" className={input} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-forest">
            Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={input} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-forest">
            Grade
            <input value={grade} onChange={(e) => setGrade(e.target.value)} className={input} />
          </label>
        </div>
        <div className="text-sm">
          <p className="font-semibold text-forest">Date</p>
          <p className="mt-1 text-ink">
            {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            <span className="text-ink-soft"> · set automatically</span>
          </p>
        </div>
        {error && <p className="text-sm text-terracotta-600">{error}</p>}
        <div>
          <button
            type="button"
            disabled={busy || !teacher.name.trim()}
            className={btnPrimary}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                const o = await createObservation({
                  teacherId: teacher.id,
                  teacherName: teacher.name.trim(),
                  lessonTitle: lesson.trim() || undefined,
                  subject: subject.trim() || undefined,
                  gradeLevel: grade.trim() || undefined,
                })
                navigate(`/admin/observations/${o.id}`)
              } catch (e) {
                setError((e as Error).message)
                setBusy(false)
              }
            }}
          >
            {busy ? 'Starting...' : 'Continue to recording'}
          </button>
        </div>
      </section>
    </Shell>
  )
}

// ---- one observation, whatever step it is at ----

const notesKey = (id: string) => `wivoza-observation-notes-${id}`
function loadNotes(id: string): ObservationNote[] {
  try {
    return JSON.parse(localStorage.getItem(notesKey(id)) ?? '[]') as ObservationNote[]
  } catch {
    return []
  }
}
function storeNotes(id: string, notes: ObservationNote[]) {
  try {
    localStorage.setItem(notesKey(id), JSON.stringify(notes))
  } catch {
    // A private window: the notes still live in this page.
  }
}

function ObservationFlow({ id }: { id: string }) {
  const [o, setO] = useState<Observation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotesState] = useState<ObservationNote[]>(() => loadNotes(id))
  const [stopped, setStopped] = useState(false)
  const setNotes = (n: ObservationNote[]) => {
    setNotesState(n)
    storeNotes(id, n)
  }
  const reload = useCallback(() => getObservation(id).then(setO).catch((e: Error) => setError(e.message)), [id])
  useEffect(() => {
    void reload()
  }, [reload])

  const preparing = !!o && !!o.answeredAt && ['transcribing', 'transcribed', 'no_recording', 'generating'].includes(o.status)
  useEffect(() => {
    if (!preparing) return
    const t = window.setInterval(() => void reload(), 4000)
    return () => window.clearInterval(t)
  }, [preparing, reload])

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

  const header = <PageHeader crumb="Observations" title={o.teacherName} blurb={observationHeading({ ...o, teacherName: '' }).replace(/^ · /, '') || 'Observation'} />

  if (o.status === 'recording' && !o.answeredAt && !stopped) {
    return (
      <Shell back>
        {header}
        <Recorder
          observation={o}
          notes={notes}
          onNotes={setNotes}
          onDone={async () => {
            setStopped(true)
            await reload()
          }}
        />
      </Shell>
    )
  }
  if (!o.answeredAt) {
    return (
      <Shell back>
        {header}
        <Questions observation={o} notes={notes} onNotes={setNotes} onChanged={setO} />
      </Shell>
    )
  }
  if (preparing) {
    return (
      <Shell back>
        {header}
        <section className="rounded-2xl border border-hairline bg-white p-6">
          <p className="font-heading text-lg font-bold text-forest">Preparing the report...</p>
          <p className="mt-1 text-sm text-ink-soft">
            {o.status === 'transcribing'
              ? 'Wivoza is still transcribing the recording. The report starts as soon as it is done.'
              : 'Wivoza is combining the recording, your answers, your notes and the plan. This usually takes under a minute. You can leave this page; the draft will be waiting under Observations.'}
          </p>
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
          <button type="button" className={`${btnPrimary} mt-4`} onClick={() => regenerateObservation(o.id).then(setO).catch((e: Error) => setError(e.message))}>
            Try again
          </button>
        </section>
      </Shell>
    )
  }
  if (o.status === 'draft' && o.report) {
    return (
      <Shell back>
        {header}
        <DraftEditor observation={o} onChanged={setO} />
      </Shell>
    )
  }
  return (
    <Shell back>
      {header}
      {o.sentAt && (
        <p className="rounded-xl bg-mint-tint/40 px-4 py-3 text-sm text-forest">
          Sent to {o.teacherName} on {new Date(o.sentAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.
        </p>
      )}
      {o.report && <ObservationReportView observation={o} report={o.report} />}
    </Shell>
  )
}

// ---- recording, with notes ----

const COMPONENT_TAGS = OBSERVATION_QUESTIONS.map((q) => ({ code: q.code, label: `${q.code} · ${q.component}` }))

function NotesEditor({ notes, onNotes, elapsed }: { notes: ObservationNote[]; onNotes: (n: ObservationNote[]) => void; elapsed: () => number }) {
  const [text, setText] = useState('')
  const [code, setCode] = useState('')
  const add = () => {
    const t = text.trim()
    if (!t) return
    onNotes([...notes, { atSec: Math.round(elapsed()), text: t, code: code || null }].sort((a, b) => a.atSec - b.atSec))
    setText('')
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="What you see: the room, the walls, groups, student work"
          className={input}
          maxLength={600}
        />
        <select value={code} onChange={(e) => setCode(e.target.value)} className="rounded-xl border border-hairline bg-white px-3 py-2.5 text-sm text-ink focus:border-forest focus:outline-none" aria-label="Component (optional)">
          <option value="">No component</option>
          {COMPONENT_TAGS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <button type="button" className={`${btnSecondary} shrink-0 whitespace-nowrap`} onClick={add} disabled={!text.trim()}>
          Add note
        </button>
      </div>
      <p className="text-xs text-ink-soft">Use numbers, not student names (&ldquo;3 of 5 groups&rdquo;). Your notes appear in the report the teacher receives.</p>
      {notes.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {notes.map((n, i) => (
            <li key={i} className="flex items-start justify-between gap-3 rounded-lg bg-cream/60 px-3 py-2 text-sm text-ink">
              <span>
                <span className="text-xs text-ink-soft">
                  {clock(n.atSec)}
                  {n.code ? ` · ${n.code}` : ''} ·{' '}
                </span>
                {n.text}
              </span>
              <button type="button" className="shrink-0 text-xs font-semibold text-terracotta-600 hover:underline" onClick={() => onNotes(notes.filter((_, j) => j !== i))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Recorder({ observation, notes, onNotes, onDone }: { observation: Observation; notes: ObservationNote[]; onNotes: (n: ObservationNote[]) => void; onDone: () => Promise<void> }) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'uploading' | 'upload_failed'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const startedAt = useRef<number | null>(null)
  const blob = useRef<Blob | null>(null)
  const wakeLock = useRef<WakeLockSentinel | null>(null)
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

  async function start() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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
      // The observation is dated by when recording began.
      void updateObservation(observation.id, { observedAt: new Date().toISOString() }).catch(() => {})
    } catch {
      setError('Wivoza couldn’t use the microphone. Allow microphone access, or continue without a recording.')
    }
  }

  async function upload() {
    if (!blob.current) return
    setPhase('uploading')
    try {
      await uploadObservationAudio(observation.id, blob.current, seconds)
      await onDone()
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

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-hairline bg-white p-6">
      {phase === 'idle' && (
        <>
          <p className="text-sm text-ink">
            Press <b>Record</b> when you&rsquo;re in the room. Take notes on what you see while Wivoza listens. When you press <b>Stop</b>, you&rsquo;ll answer ten
            quick questions and Wivoza will prepare the report.
          </p>
          <p className="text-xs text-ink-soft">Let the teacher know the lesson is being recorded. The audio is deleted once it is transcribed, and student names are masked.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={btnPrimary} onClick={start}>
              Record
            </button>
            <button type="button" className={btnSecondary} onClick={() => void onDone()}>
              Continue without recording
            </button>
          </div>
        </>
      )}
      {phase === 'recording' && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="flex items-center gap-3 font-heading text-2xl font-bold text-forest">
            <span className="h-3 w-3 animate-pulse rounded-full bg-terracotta" aria-hidden="true" />
            Recording {clock(seconds)}
          </p>
          <button type="button" className={btnPrimary} onClick={stop}>
            Stop
          </button>
        </div>
      )}
      {phase === 'uploading' && <p className="text-sm text-ink-soft">Sending the recording...</p>}
      {phase === 'upload_failed' && (
        <div className="flex flex-wrap gap-3">
          <button type="button" className={btnPrimary} onClick={upload}>
            Try sending again
          </button>
          <button type="button" className={btnSecondary} onClick={() => void onDone()}>
            Continue without the recording
          </button>
        </div>
      )}
      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      {(phase === 'recording' || notes.length > 0) && (
        <div className="border-t border-hairline pt-5">
          <p className="mb-3 font-heading text-base font-bold text-forest">Your notes</p>
          <NotesEditor notes={notes} onNotes={onNotes} elapsed={elapsed} />
        </div>
      )}
    </section>
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
  notes,
  onNotes,
  onChanged,
}: {
  observation: Observation
  notes: ObservationNote[]
  onNotes: (n: ObservationNote[]) => void
  onChanged: (o: Observation) => void
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(observation.answers ?? {})
  const [closing, setClosing] = useState(observation.closingNote ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const answered = Object.keys(answers).length
  const lastNote = notes.length ? notes[notes.length - 1].atSec : 0
  const recordingLine =
    observation.status === 'transcribing'
      ? 'Wivoza is transcribing the recording while you answer.'
      : observation.status === 'transcribed'
        ? 'The recording is ready.'
        : observation.status === 'no_recording'
          ? `${observation.failureReason ?? 'No recording.'} The report will rest on your answers, notes and the plan.`
          : 'No recording. The report will rest on your answers, notes and the plan.'

  return (
    <div className="flex flex-col gap-6">
      <p className="rounded-xl bg-mint-tint/40 px-4 py-3 text-sm text-forest">{recordingLine}</p>
      <section className="flex flex-col gap-5 rounded-2xl border border-hairline bg-white p-6">
        <div>
          <h2 className="font-heading text-xl font-bold text-forest">What you saw</h2>
          <p className="mt-1 text-sm text-ink-soft">Ten quick questions about what a recording can&rsquo;t capture. {answered} of 10 answered.</p>
        </div>
        {OBSERVATION_QUESTIONS.map((q, i) => (
          <fieldset key={q.code} className="flex flex-col gap-2 border-t border-hairline/70 pt-4 first-of-type:border-0 first-of-type:pt-0">
            <legend className="text-sm text-ink">
              <span className="mr-2 font-semibold text-ink-soft">{i + 1}.</span>
              <span className="mr-2 rounded-md bg-gold px-1.5 py-0.5 text-xs font-bold text-forest">{q.code}</span>
              <span className="font-semibold">{q.component}:</span> {q.text}
            </legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {q.options.map((opt) => {
                const on = answers[q.code] === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setAnswers((a) => ({ ...a, [q.code]: opt.key }))}
                    className={`rounded-xl px-3.5 py-2 text-sm font-medium ${on ? 'bg-forest text-cream' : 'border border-hairline bg-white text-ink hover:border-forest'}`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}
        <label className="flex flex-col gap-1.5 border-t border-hairline/70 pt-4 text-sm font-semibold text-forest">
          Anything the recording couldn&rsquo;t hear? <span className="font-normal text-ink-soft">Optional. Use numbers, not student names.</span>
          <textarea value={closing} onChange={(e) => setClosing(e.target.value)} rows={3} maxLength={1500} className={input} />
        </label>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-hairline bg-white p-6">
        <h2 className="font-heading text-lg font-bold text-forest">Your notes</h2>
        <NotesEditor notes={notes} onNotes={onNotes} elapsed={() => lastNote} />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-hairline bg-white p-6">
        <h2 className="font-heading text-lg font-bold text-forest">Lesson plan</h2>
        <PlanBox observation={observation} onChanged={onChanged} />
      </section>

      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      <div>
        <button
          type="button"
          disabled={busy}
          className={btnPrimary}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              onChanged(await submitObservationAnswers(observation.id, { answers, notes, closingNote: closing, recording: observation.status !== 'recording' }))
            } catch (e) {
              setError((e as Error).message)
              setBusy(false)
            }
          }}
        >
          {busy ? 'Sending...' : 'Prepare the report'}
        </button>
      </div>
    </div>
  )
}

// ---- the draft: levels, comments, send ----

function DraftEditor({ observation, onChanged }: { observation: Observation; onChanged: (o: Observation) => void }) {
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
      <p className="rounded-xl border border-dashed border-hairline px-4 py-3 text-sm text-ink-soft">
        Draft. Only you can see it until you send it. Wivoza suggested each level; set your own where you disagree.
      </p>

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
