import { useEffect, useState } from 'react'
import {
  CANVAS_CONNECT_URL,
  getCanvasCourses,
  getCanvasModules,
  getCanvasStatus,
  sendToCanvas,
  type ApiError,
  type CanvasCourse,
  type CanvasStatus,
} from '../lib/api'
import { CloseIcon } from './icons'
import Overlay from './Overlay'
import { Spinner } from './Spinner'

// Send to Canvas: a lesson or a week as a page in one of the teacher's
// Canvas courses. The first time, a Canvas pop-up asks them to allow it. The
// page goes in unpublished unless they say otherwise — a plan carries
// teacher-only notes, and students can't see an unpublished page.

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest'
const FIELD = 'w-full rounded-xl border border-divider bg-white px-3 py-2 text-sm text-forest focus:border-forest focus:outline-none'

// One status check per page load: whether the button shows at all.
let statusOnce: Promise<CanvasStatus> | null = null
export function useCanvasStatus(): CanvasStatus | null {
  const [status, setStatus] = useState<CanvasStatus | null>(null)
  useEffect(() => {
    statusOnce ??= getCanvasStatus().catch(() => ({ available: false, connected: false, canvasName: null }))
    let live = true
    void statusOnce.then((s) => live && setStatus(s))
    return () => {
      live = false
    }
  }, [])
  return status
}

export function SendToCanvasButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-full border border-divider bg-white px-4 py-2.5 text-sm font-bold text-forest hover:border-forest/40 hover:bg-cream ${FOCUS} ${className}`}
    >
      <span className="text-forest">Send to Canvas</span>
    </button>
  )
}

export default function SendToCanvasDialog({
  planId,
  defaultTitle,
  useFormat,
  formatName,
  onClose,
}: {
  planId: string
  defaultTitle: string
  /** Send the lesson as the teacher is looking at it: in their school's format, or Wivoza's. */
  useFormat: boolean
  formatName: string | null
  onClose: () => void
}) {
  const [stage, setStage] = useState<'loading' | 'connect' | 'pick' | 'sent'>('loading')
  const [courses, setCourses] = useState<CanvasCourse[]>([])
  const [courseId, setCourseId] = useState('')
  const [modules, setModules] = useState<{ id: string; name: string }[] | null>(null)
  const [moduleId, setModuleId] = useState('')
  const [title, setTitle] = useState(defaultTitle)
  const [published, setPublished] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ pageUrl: string; addedToModule: boolean; published: boolean } | null>(null)

  async function loadCourses() {
    setStage('loading')
    setError(null)
    try {
      const list = await getCanvasCourses()
      setCourses(list)
      setCourseId((prev) => prev || list[0]?.id || '')
      setStage('pick')
    } catch (e) {
      if ((e as ApiError).status === 409) setStage('connect')
      else {
        setError((e as Error).message)
        setStage('pick')
      }
    }
  }
  useEffect(() => {
    void loadCourses()
  }, [])

  // The pop-up reports back when the teacher has allowed (or refused) it.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.data?.type !== 'wivoza-canvas') return
      statusOnce = null
      if (event.data.ok) void loadCourses()
      else setError(String(event.data.message ?? 'Canvas did not give permission.'))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!courseId) return
    setModules(null)
    setModuleId('')
    let live = true
    getCanvasModules(courseId)
      .then((list) => live && setModules(list))
      .catch(() => live && setModules([]))
    return () => {
      live = false
    }
  }, [courseId])

  function connect() {
    setError(null)
    const popup = window.open(CANVAS_CONNECT_URL, 'wivoza-canvas', 'width=640,height=760')
    if (!popup) setError('Your browser blocked the Canvas window. Allow pop-ups for wivoza.com and try again.')
  }

  async function handleSend() {
    if (!courseId || busy) return
    setBusy(true)
    setError(null)
    try {
      setResult(await sendToCanvas({ planId, courseId, moduleId: moduleId || null, title: title.trim() || defaultTitle, published, useFormat }))
      setStage('sent')
    } catch (e) {
      if ((e as ApiError).status === 409) setStage('connect')
      else setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay onClose={onClose} labelledBy="send-to-canvas-title">
      <div className="mx-auto mb-6 mt-[8vh] w-full max-w-lg rounded-2xl border border-divider bg-cream-card p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="send-to-canvas-title" className="font-heading text-xl font-bold text-forest">
            Send to Canvas
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className={`rounded-full p-1 text-forest ${FOCUS}`}>
            <CloseIcon className="h-5 w-5 text-forest" />
          </button>
        </div>

        {stage === 'loading' && (
          <p className="flex items-center gap-2 text-sm text-warm-gray">
            <Spinner /> Checking Canvas…
          </p>
        )}

        {stage === 'connect' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-forest">
              The first time, Canvas asks you to allow Wivoza to add pages to your courses. It opens in a small window; sign in to Canvas there if
              it asks.
            </p>
            <button type="button" onClick={connect} className={`self-start rounded-full bg-forest px-5 py-2.5 text-sm font-bold text-cream hover:bg-forest-soft ${FOCUS}`}>
              <span className="text-cream">Allow Wivoza in Canvas</span>
            </button>
            <p className="text-xs text-warm-gray">Wivoza can only list your courses and modules and add pages. It can't read student work or grades.</p>
          </div>
        )}

        {stage === 'pick' && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void handleSend()
            }}
          >
            {courses.length === 0 && !error ? (
              <p className="text-sm text-forest">Canvas didn't list any courses you teach.</p>
            ) : (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-warm-gray">Course</span>
                  <select id="canvas-course" className={FIELD} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-warm-gray">Module</span>
                  <select id="canvas-module" className={FIELD} value={moduleId} onChange={(e) => setModuleId(e.target.value)} disabled={modules == null}>
                    <option value="">{modules == null ? 'Loading modules…' : 'No module — just the page'}</option>
                    {(modules ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-warm-gray">Page title</span>
                  <input id="canvas-title" className={FIELD} value={title} maxLength={250} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <label className="flex items-start gap-2 text-sm text-forest">
                  <input id="canvas-publish" type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="mt-1 accent-forest" />
                  <span>
                    Publish it now
                    <span className="block text-xs text-warm-gray">
                      Students can see a published page. Left unpublished, only you and other teachers can — check it in Canvas first.
                    </span>
                  </span>
                </label>
                <p className="text-xs text-warm-gray">{formatName ? `Sent in ${formatName}, as you see it.` : 'Sent as you see it here.'}</p>
              </>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-soft-terracotta px-3 py-2 text-[13px] text-forest">
                {error}
              </p>
            )}
            {courses.length > 0 && (
              <button
                type="submit"
                disabled={busy || !courseId}
                className={`flex items-center gap-2 self-start rounded-full bg-forest px-5 py-2.5 text-sm font-bold text-cream hover:bg-forest-soft disabled:opacity-60 ${FOCUS}`}
              >
                {busy && <Spinner />}
                <span className="text-cream">{busy ? 'Sending…' : 'Send to Canvas'}</span>
              </button>
            )}
          </form>
        )}

        {stage === 'sent' && result && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-forest">
              It's in Canvas{result.addedToModule ? ', in the module you picked' : ''}
              {result.published ? ' and published.' : ', unpublished — students can’t see it until you publish it.'}
            </p>
            {moduleId && !result.addedToModule && (
              <p className="text-xs text-warm-gray">Canvas made the page but didn't add it to the module — you can add it there yourself.</p>
            )}
            <a
              href={result.pageUrl}
              target="_blank"
              rel="noreferrer"
              className={`self-start rounded-full bg-forest px-5 py-2.5 text-sm font-bold text-cream hover:bg-forest-soft ${FOCUS}`}
            >
              <span className="text-cream">Open it in Canvas</span>
            </a>
          </div>
        )}
      </div>
    </Overlay>
  )
}
