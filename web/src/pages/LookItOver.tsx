import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ClassContextLine from '../components/ClassContextLine'
import SectionLabel from '../components/SectionLabel'
import { WorkingRing } from '../components/ProgressRing'
import { setHandoff } from '../lib/handoff'
import { useHandoff } from '../hooks/useHandoff'
import { BookIcon, ClipboardIcon } from '../components/icons'
import {
  createReview,
  extractReviewDocument,
  getReviewDocument,
  redesignReviewForAi,
  runReview,
  setReviewEditStatus,
  updateReview,
  type ClassContext,
  type Review,
  type ReviewEdit,
} from '../lib/api'
import {
  DOC_TYPES,
  DOC_TYPE_LABELS,
  canRedesignForAi,
  confirmQuestion,
  isDocType,
  type DocType,
} from '../lib/reviewLenses'

// Look It Over: one drop zone for anything a teacher made, read through
// lenses that change with what it is.
//
// It replaced four tools a teacher had to choose between before they could
// start (Get Feedback, Review a Presentation, Review an assignment, Review My
// Communication). The thing that makes that a simplification rather than the
// same menu one level down is that nobody picks a tool: the document arrives,
// the app says what it thinks it is, and being wrong costs one tap.

const ACCEPT = '.docx,.pdf,.pptx,.xlsx,.xls,.txt,.jpg,.jpeg,.png'

/// The API types docType as a plain string on purpose, so a server that
/// learns an eighth type cannot break an older client. This narrows it for
/// display, falling back rather than throwing.
function docTypeOf(value: string): DocType {
  return isDocType(value) ? value : 'assignment'
}

export default function LookItOver() {
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement | null>(null)
  const cameraInput = useRef<HTMLInputElement | null>(null)

  const [pasted, setPasted] = useState('')
  const [prep, setPrep] = useState<ClassContext | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [busy, setBusy] = useState<null | 'reading' | 'reviewing'>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  // One clock read for the life of the page (see addedAgo).
  const [openedAt] = useState(() => Date.now())
  /// Open when detection was unsure. A confident guess still shows the
  /// question, just without the chips already unfolded.
  /// Arriving from Talk It Through, where a document came up in conversation.
  /// Only the intent travels — the document itself is still on the teacher's
  /// machine, so this opens the drop zone knowing why rather than with
  /// anything in it.
  const arrivedWith = useHandoff('review_document')

  async function startFromFile(file: File, sourceKind: 'file' | 'photo') {
    setBusy('reading')
    setError(null)
    try {
      const extracted = await extractReviewDocument(file)
      const created = await createReview({
        text: extracted.text,
        sourceKind,
        fileName: extracted.fileName,
        pageCount: extracted.pageCount,
        classProfileId: prep?.id ?? null,
      })
      setReview(created)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function startFromPaste() {
    const text = pasted.trim()
    if (!text) return
    setBusy('reading')
    setError(null)
    try {
      // No separate detect call: it only ever decided whether to open the
      // type chips, and every type is on screen now. The create call detects
      // server-side anyway, rather than trusting a client-supplied type.
      const created = await createReview({
        text,
        sourceKind: 'paste',
        classProfileId: prep?.id ?? null,
      })
      setReview(created)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  /// Back to the drop zone, for a teacher who dropped the wrong file. The
  /// review already created is left where it is rather than deleted — an
  /// unreviewed draft costs nothing, and deleting what someone just uploaded
  /// because they tapped "Replace" is a surprise.
  function discard() {
    setReview(null)
    setError(null)
  }

  /// "added just now", then minutes, then hours — a document being reviewed
  /// was almost always uploaded in this sitting, so the useful precision is
  /// all at the near end.
  ///
  /// Measured from one timestamp taken when the page mounted rather than from
  /// Date.now() at render: a clock read during render makes the label change
  /// on re-renders that have nothing to do with time passing.
  function addedAgo(createdAt: string): string {
    const ms = openedAt - new Date(createdAt).getTime()
    const minutes = Math.floor(ms / 60000)
    if (!Number.isFinite(minutes) || minutes < 2) return 'added just now'
    if (minutes < 60) return `added ${minutes} minutes ago`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `added ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
    return `added ${new Date(createdAt).toLocaleDateString()}`
  }

  /// How the document arrived. Worth saying for a photo in particular: it has
  /// been through OCR and may be missing content the paper copy has.
  const SOURCE_KIND_LABELS: Record<string, string> = {
    file: 'uploaded',
    paste: 'pasted in',
    photo: 'photographed',
  }

  /// The one line under the file name: how big it is, how it arrived, and
  /// when. No item count — nothing counts the questions in a document, and a
  /// number nobody computed is worse than one nobody shows.
  function documentMeta(r: Review): string {
    const parts: string[] = []
    if (r.pageCount) parts.push(`${r.pageCount} ${r.pageCount === 1 ? 'page' : 'pages'}`)
    parts.push(SOURCE_KIND_LABELS[r.sourceKind] ?? 'added')
    parts.push(addedAgo(r.createdAt))
    return parts.join(' · ')
  }

  async function confirmType(docType: string) {
    if (!review) return
    setError(null)
    try {
      setReview(await updateReview(review.id, { docType }))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function toggleLens(key: string) {
    if (!review) return
    const lenses = review.lenses.map((l) => (l.key === key ? { ...l, on: !l.on } : l))
    // Optimistic: a toggle should feel instant, and the only cost of being
    // wrong is the next render putting it back.
    setReview({ ...review, lenses })
    try {
      setReview(await updateReview(review.id, { lenses: lenses.map(({ key: k, on }) => ({ key: k, on })) }))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleRun() {
    if (!review) return
    setBusy('reviewing')
    setError(null)
    try {
      setReview(await runReview(review.id))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function handleEdit(edit: ReviewEdit, status: ReviewEdit['status']) {
    if (!review) return
    try {
      setReview(await setReviewEditStatus(review.id, edit.id, status))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleExport() {
    if (!review) return
    try {
      const { text, label } = await getReviewDocument(review.id)
      const blob = new Blob([text], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${(review.fileName ?? 'document').replace(/\.[^.]+$/, '')} — ${label}.txt`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleRedesign() {
    if (!review) return
    try {
      const { assignmentCoachSessionId } = await redesignReviewForAi(review.id)
      navigate(`/assignment-coach?open=${assignmentCoachSessionId}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const lensesOn = review?.lenses.filter((l) => l.on).length ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta-600">Wivoza · Review</p>
        <h1 className="font-heading text-3xl font-extrabold text-forest md:text-4xl">
          Look It Over<span className="text-terracotta">.</span>
        </h1>
        <p className="max-w-2xl text-ink-soft">
          A second pair of eyes on anything before students see it — a plan, a quiz, an assignment, a deck, a
          homework sheet.
        </p>
      </div>

      {!review ? (
        <>
          {arrivedWith && (
            <div className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
                From your conversation
              </p>
              <p className="mt-1 text-sm text-ink">{arrivedWith.about}</p>
              <p className="mt-1 text-xs text-ink-soft">Drop it in and I'll read it properly.</p>
            </div>
          )}

          {/* One card, like the state that follows it. The drop zone, the
              paste box and the class line used to sit loose on the page
              background, so arriving here looked like a different surface
              from the one you are on two seconds later.

              One drop zone for a file, a paste or a photo. A paper quiz
              photographed on a phone is a first-class way in, not a
              workaround — which is why the camera has its own button rather
              than hiding behind the file picker. */}
          <div className="flex flex-col gap-6 rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm sm:p-8">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const file = e.dataTransfer.files?.[0]
              if (file) void startFromFile(file, 'file')
            }}
            className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
              dragging ? 'border-terracotta bg-peach-tint/40' : 'border-hairline bg-cream'
            }`}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-tint text-terracotta-600">
              <BookIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="font-heading text-lg font-bold text-forest">Drop it here</p>
              <p className="mt-0.5 text-sm text-ink-soft">
                A quiz, a plan, a slide deck, an assignment, a message — whatever you made.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={busy != null}
                onClick={() => fileInput.current?.click()}
                className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:opacity-60"
              >
                Choose a file
              </button>
              <button
                type="button"
                disabled={busy != null}
                onClick={() => cameraInput.current?.click()}
                className="rounded-full border-2 border-hairline bg-cream px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600 disabled:opacity-60"
              >
                Take a photo
              </button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void startFromFile(file, 'file')
                e.target.value = ''
              }}
            />
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void startFromFile(file, 'photo')
                e.target.value = ''
              }}
            />
          </div>

          <div>
            <SectionLabel title="Or paste it" hint="Straight out of a doc, an email, a slide — whatever you have." />
            <label>
              <span className="sr-only">Or paste it</span>
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={5}
                placeholder="Paste the text here..."
                className="mt-2.5 w-full rounded-2xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none"
              />
            </label>
          </div>

          {/* The room it is for, in the same strip it gets after upload. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-hairline/50 px-4 py-3.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Your class</span>
            <ClassContextLine compact onChange={setPrep} />
          </div>

          {/* The same footer the next step has: the promise on the left, the
              one action on the right. */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-sm text-sm text-ink-soft">
              No student names, please. Paste text, drop a file, or photograph a paper copy.
            </p>
            <button
              type="button"
              disabled={busy != null || !pasted.trim()}
              onClick={() => void startFromPaste()}
              className="rounded-full bg-terracotta px-8 py-4 text-base font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
            >
              Look it over
            </button>
          </div>
          </div>

          <WorkingRing
            active={busy === 'reading'}
            estimatedMs={8000}
            label="Reading it"
            hint="A photo or a scan takes a little longer."
            className="text-forest"
          />
          {error && <p className="text-sm text-terracotta-600">{error}</p>}
        </>
      ) : (
        <>
          {/* One card, in the order a teacher reads it: what I have, what I
              think it is, what I will look at, whose room it is for, and the
              button. It used to be three separate panels, which made the type
              confirmation and the lenses look like unrelated questions rather
              than two halves of setting up one review. */}
          <div className="flex flex-col gap-6 rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm sm:p-8">
            {/* What is being reviewed, and the way out if it is the wrong
                file — a teacher who dropped the wrong thing should not have to
                guess that starting over is possible. */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-cream px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-3.5">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mint-tint/60 text-forest"
                >
                  <ClipboardIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{review.fileName ?? 'Pasted text'}</span>
                  <span className="block text-xs text-ink-soft">{documentMeta(review)}</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => void discard()}
                className="shrink-0 rounded-full border border-hairline px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-terracotta/50 hover:text-terracotta-600"
              >
                Replace
              </button>
            </div>

            {/* Confirm rather than interrogate. Every type is on screen, so
                correcting a wrong guess is one tap rather than a "no, it's
                something else" first. Tapping the one already chosen confirms
                it, which is what the question is asking. */}
            <div>
              <SectionLabel
                title={confirmQuestion(docTypeOf(review.docType))}
                hint="Tap any of these to correct me."
              />
              <div className="mt-2.5 flex flex-wrap gap-2.5">
                {DOC_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => void confirmType(type)}
                    aria-pressed={review.docType === type}
                    className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors ${
                      review.docType === type
                        ? 'border-gold bg-gold text-forest'
                        : 'border-hairline bg-cream text-ink hover:border-terracotta/50 hover:text-terracotta-600'
                    }`}
                  >
                    {DOC_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>

            {/* Lenses, each individually toggleable, with the count in the
                heading so a teacher can see at a glance how much they asked
                for. An off lens is drawn dashed rather than hidden: knowing
                what is NOT being looked at is half of trusting the result. */}
            <div>
              <SectionLabel
                title="What I'll look at"
                hint={`These change with the type. ${lensesOn} of ${review.lenses.length} on — tap any to turn it off.`}
              />
              <div className="mt-2.5 flex flex-wrap gap-2.5">
                {review.lenses.map((lens) => (
                  <button
                    key={lens.key}
                    type="button"
                    title={lens.blurb}
                    onClick={() => void toggleLens(lens.key)}
                    aria-pressed={lens.on}
                    className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors ${
                      lens.on
                        ? 'border-mint-tint bg-mint-tint/70 text-forest hover:border-forest/30'
                        : 'border-dashed border-ink-soft/40 text-ink-soft hover:border-terracotta/50 hover:text-terracotta-600'
                    }`}
                  >
                    {lens.label}
                  </button>
                ))}
              </div>
            </div>

            {/* The room it is for, which is what timing and grade-level
                judgments stand on. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-hairline/50 px-4 py-3.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Your class</span>
              <ClassContextLine compact onChange={setPrep} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-sm text-sm text-ink-soft">
                No student names, please. Paste text, drop a file, or photograph a paper copy.
              </p>
              <button
                type="button"
                disabled={busy != null || lensesOn === 0}
                onClick={() => void handleRun()}
                className="rounded-full bg-terracotta px-8 py-4 text-base font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
              >
                {review.status === 'reviewed' ? 'Look again' : 'Look it over'}
              </button>
            </div>
          </div>

          <WorkingRing
            active={busy === 'reviewing'}
            estimatedMs={15000}
            label="Reading it through"
            hint="Usually under twenty seconds."
            className="text-forest"
          />
          {error && <p className="text-sm text-terracotta-600">{error}</p>}

          {review.status === 'reviewed' && (
            <>
              {/* The one card the page leads with. */}
              {review.oneThing && (
                <div className="rounded-3xl border-l-8 border-gold bg-gold-tint/50 p-6">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
                    If you change one thing
                  </p>
                  <p className="mt-2 text-base text-ink">{review.oneThing}</p>
                </div>
              )}

              {review.timingBasis && (
                <div className="rounded-2xl bg-cream-card p-4">
                  <p className="text-sm font-semibold text-ink">
                    Timing: {review.timingBasis.minutes[0] === review.timingBasis.minutes[1]
                      ? `about ${review.timingBasis.minutes[0]} minutes`
                      : `${review.timingBasis.minutes[0]}–${review.timingBasis.minutes[1]} minutes`}
                  </p>
                  {/* The assumption, always — an estimate shown without one
                      reads as a measurement. */}
                  <p className="mt-1 text-xs text-ink-soft">Assuming: {review.timingBasis.assumption}</p>
                </div>
              )}

              {review.lenses
                .filter((lens) => lens.on && lens.finding)
                .map((lens) => (
                  <div key={lens.key} className="rounded-2xl border border-hairline bg-cream-card p-5">
                    <p className="font-heading text-lg font-bold text-forest">{lens.label}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{lens.finding}</p>
                  </div>
                ))}

              {review.edits.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div>
                    <h2 className="font-heading text-xl font-bold text-forest">Suggested edits</h2>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      Your document, with changes marked. Take the ones you want.
                    </p>
                  </div>
                  {review.edits.map((edit) => (
                    <div
                      key={edit.id}
                      className={`rounded-2xl border p-4 ${
                        edit.status === 'accepted'
                          ? 'border-forest/30 bg-mint-tint/40'
                          : edit.status === 'kept_mine'
                            ? 'border-hairline bg-cream'
                            : 'border-hairline bg-cream-card'
                      }`}
                    >
                      {/* Struck-through original above the revision — the
                          teacher sees exactly what would change, never a
                          rewritten document they have to diff themselves. */}
                      <p className="text-sm text-ink-soft line-through decoration-terracotta/50">{edit.original}</p>
                      <p className="mt-1.5 text-sm font-medium text-ink">{edit.revision}</p>
                      <p className="mt-2 text-xs text-ink-soft">{edit.why}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleEdit(edit, edit.status === 'accepted' ? 'pending' : 'accepted')}
                          aria-pressed={edit.status === 'accepted'}
                          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                            edit.status === 'accepted'
                              ? 'bg-forest text-cream'
                              : 'bg-cream text-ink-soft hover:text-ink'
                          }`}
                        >
                          Use this
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleEdit(edit, edit.status === 'kept_mine' ? 'pending' : 'kept_mine')}
                          aria-pressed={edit.status === 'kept_mine'}
                          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                            edit.status === 'kept_mine'
                              ? 'bg-forest text-cream'
                              : 'bg-cream text-ink-soft hover:text-ink'
                          }`}
                        >
                          Keep mine
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {/* Says what it will actually hand over. */}
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90"
                >
                  {review.exportLabel}
                </button>
                {/* The review is the context; the conversation is about what
                    to do with it. A teacher who disagrees with a finding, or
                    is not sure how to act on one, wants a colleague rather
                    than another pass over the same page. */}
                <button
                  type="button"
                  onClick={() => {
                    setHandoff({
                      kind: 'review_context',
                      reviewId: review.id,
                      docTypeLabel: review.docTypeLabel,
                      oneThing: review.oneThing,
                    })
                    navigate('/talk')
                  }}
                  className="rounded-full border-2 border-hairline bg-cream-card px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
                >
                  Talk this through
                </button>
                {/* An action from the result, not a tool of its own. */}
                {canRedesignForAi(review.docType) && (
                  <button
                    type="button"
                    onClick={() => void handleRedesign()}
                    className="rounded-full border-2 border-hairline bg-cream-card px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
                  >
                    Redesign for meaningful AI use
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setReview(null)
                    setPasted('')
                    setError(null)
                  }}
                  className="px-2 py-2.5 text-sm font-semibold text-ink-soft hover:text-ink"
                >
                  Look at something else
                </button>
              </div>

              {/* The limits, plainly. */}
              <p className="rounded-2xl bg-cream px-4 py-3 text-xs text-ink-soft">{review.limits}</p>
            </>
          )}
        </>
      )}

      <Link to="/" className="text-sm font-medium text-ink-soft hover:text-ink">
        ← Back home
      </Link>
    </div>
  )
}
