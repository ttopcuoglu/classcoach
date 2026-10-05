import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import AnswerSection, { NumberedCard } from '../components/AnswerSection'
import ClassContextLine from '../components/ClassContextLine'
import SectionLabel from '../components/SectionLabel'
import { WorkingRing } from '../components/ProgressRing'
import { setHandoff } from '../lib/handoff'
import { useHandoff } from '../hooks/useHandoff'
import { BookIcon, ClipboardIcon } from '../components/icons'
import {
  createReview,
  getReview,
  extractReviewDocument,
  getReviewDocument,
  redesignReviewForAi,
  runReview,
  setReviewEditStatus,
  updateReview,
  type ClassContext,
  type ApiError,
  type Assumption,
  type ScopeChoice,
  type PendingFile,
  type StudentNamesFound,
  type Review,
  type ReviewEdit,
} from '../lib/api'
import {
  DOC_TYPES,
  DOC_TYPE_LABELS,
  canRedesignForAi,
  MAX_FILES_PER_REVIEW,
  DOC_TYPE_IN_A_SENTENCE,
  lensPreview,
  correctedHeading,
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
  const { reviewId } = useParams()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  // `?open=` is what My Work used to link with, and may still be in a
  // teacher's history. Treated as naming the same review.
  const draftId = searchParams.get('draft') ?? searchParams.get('open')
  const fileInput = useRef<HTMLInputElement | null>(null)
  const cameraInput = useRef<HTMLInputElement | null>(null)

  const [pasted, setPasted] = useState('')
  /// "An assignment and a rubric — I'll check them against each other."
  const [fileSetSummary, setFileSetSummary] = useState<string | null>(null)
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

  /// Files read but not yet turned into a review. A teacher dropping an
  /// assignment and then its rubric is building one review, so nothing is
  /// created until they say they are done adding.

  /// Reads files and adds them to the set. Each is extracted on its own, so
  /// one unreadable file in a drop of three does not lose the other two.
  async function addFiles(files: File[], sourceKind: 'file' | 'photo') {
    // One drop is one review, so the cap applies to what was dropped.
    const room = MAX_FILES_PER_REVIEW
    if (room <= 0) {
      setError(`That's the limit — ${MAX_FILES_PER_REVIEW} documents in one review.`)
      return
    }
    setBusy('reading')
    setError(null)
    const added: PendingFile[] = []
    const failed: string[] = []
    for (const file of files.slice(0, room)) {
      try {
        const extracted = await extractReviewDocument(file)
        added.push({
          text: extracted.text,
          fileName: extracted.fileName,
          sourceKind,
          pageCount: extracted.pageCount,
        })
      } catch (err) {
        failed.push(`${file.name}: ${(err as Error).message}`)
      }
    }
    // Named one by one: "one of your files could not be read" leaves a
    // teacher checking all three.
    if (failed.length > 0) setError(failed.join(' · '))
    if (added.length === 0) {
      setBusy(null)
      return
    }
    // Straight on. Dropping a file is the instruction — asking again
    // afterwards is a step with no decision in it.
    try {
      const created = await createReview({
        files: added,
        docType: chosenType ?? undefined,
        classProfileId: prep?.id ?? null,
      })
      setReview(created)
      setFileSetSummary(created.fileSetSummary ?? null)
      navigate(`/look-it-over?draft=${created.id}`, { replace: true })
      await runReviewFor(created)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  /// Turns the pending set into a review.
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
        docType: chosenType ?? undefined,
        classProfileId: prep?.id ?? null,
      })
      setReview(created)
      navigate(`/look-it-over?draft=${created.id}`, { replace: true })
      // And read it. Pasting the text and pressing the button is the whole
      // instruction.
      await runReviewFor(created)
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
    setScope(null)
    navigate('/look-it-over', { replace: true })
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
    paste: 'pasted in',
    photo: 'photographed',
  }

  /// The one line under the file name: how big it is, how it arrived, and
  /// when. No item count — nothing counts the questions in a document, and a
  /// number nobody computed is worse than one nobody shows.
  function documentMeta(r: Review): string {
    const parts: string[] = []
    if (r.pageCount) parts.push(`${r.pageCount} ${r.pageCount === 1 ? 'page' : 'pages'}`)
    // Only when it is worth knowing: a photo has been through OCR and may be
    // missing what the paper copy has. An ordinary upload is just a document.
    const how = SOURCE_KIND_LABELS[r.sourceKind]
    if (how) parts.push(how)
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


  /// Set when the server refused to run because the document looks like it
  /// has student names in it. Holding it here, rather than running anyway and
  /// apologising, is what makes the promise real.
  const [namesFound, setNamesFound] = useState<StudentNamesFound | null>(null)
  /// What the teacher says this is, chosen before anything is uploaded.
  ///
  /// The surface used to detect first and ask for a correction. Choosing up
  /// front means the lenses are settled before the document arrives — and it
  /// means the page can say what it will look at while a teacher is still
  /// deciding whether to use it at all.
  const [chosenType, setChosenType] = useState<DocType | null>(null)

  /// Set when the document is long enough that the teacher has to say how
  /// much of it to read.
  const [scopeChoice, setScopeChoice] = useState<ScopeChoice | null>(null)
  /// What they chose, carried into every later run of this review so the
  /// question is asked once rather than on each attempt.
  const [scope, setScope] = useState<string | null>(null)

  // A review named in the URL is loaded on arrival — a bookmarked result, a
  // link from My Work, or a reload of a draft that was never run. The id is
  // the only dependency: this runs once per review, not once per render.
  useEffect(() => {
    // Only while this is the page being shown. `?open=` is a param several
    // surfaces use, so handing off to one of them — Redesign goes to
    // /assignment-coach?open= — would otherwise read that id back as a review
    // of ours on the way out.
    if (!pathname.startsWith('/look-it-over')) return
    const wanted = reviewId ?? draftId
    if (!wanted || review?.id === wanted) return
    let cancelled = false
    getReview(wanted)
      .then((loaded) => {
        if (!cancelled) setReview(loaded)
      })
      // A link to a review that is gone lands on the drop zone rather than an
      // error: there is something useful to do here either way.
      .catch(() => {
        if (!cancelled) setError(null)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewId, draftId])

  /// Runs the review and shows the result.
  ///
  /// Takes the review rather than reading state, because both ways in call it
  /// with the one they have just created — before React has re-rendered, when
  /// `review` is still null.
  async function runReviewFor(target: Review, opts?: { namesHandled?: 'strip' | 'keep'; scope?: string }) {
    try {
      const chosenScope = opts?.scope ?? scope ?? undefined
      const ran = await runReview(target.id, { namesHandled: opts?.namesHandled, scope: chosenScope })
      setReview(ran)
      if (opts?.scope) setScope(opts.scope)
      setNamesFound(null)
      setScopeChoice(null)
      if (ran.status === 'reviewed') navigate(`/look-it-over/${ran.id}`, { replace: true })
    } catch (err) {
      // 409 is the server declining to go on until the teacher answers
      // something, not a failure. Shown as the question it is.
      const apiErr = err as ApiError
      const details = apiErr.details as { studentNames?: StudentNamesFound; scope?: ScopeChoice } | null
      if (apiErr.status === 409 && details?.studentNames) setNamesFound(details.studentNames)
      else if (apiErr.status === 409 && details?.scope) setScopeChoice(details.scope)
      else setError(apiErr.message)
    }
  }

  async function handleRun(opts?: { namesHandled?: 'strip' | 'keep'; scope?: string }) {
    if (!review) return
    setBusy('reviewing')
    setError(null)
    try {
      const chosenScope = opts?.scope ?? scope ?? undefined
      const ran = await runReview(review.id, { namesHandled: opts?.namesHandled, scope: chosenScope })
      setReview(ran)
      // The result has its own URL from the moment it exists.
      if (ran.status === 'reviewed') navigate(`/look-it-over/${ran.id}`, { replace: true })
      if (opts?.scope) setScope(opts.scope)
      setNamesFound(null)
      setScopeChoice(null)
    } catch (err) {
      // 409 is not a failure — it is the server declining to send a roster to
      // the model until the teacher has answered. Shown as the question it
      // is, not as an error.
      const apiErr = err as ApiError
      const details = apiErr.details as
        | { studentNames?: StudentNamesFound; scope?: ScopeChoice }
        | null
      if (apiErr.status === 409 && details?.studentNames) {
        setNamesFound(details.studentNames)
      } else if (apiErr.status === 409 && details?.scope) {
        setScopeChoice(details.scope)
      } else {
        setError(apiErr.message)
      }
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
  /// Only lenses that actually produced something get a pill — an empty one is
  /// a promise of a finding that is not there.
  const findingLenses = (review?.lenses ?? []).filter((l) => l.on && (l.body || l.finding))
  /// Every number the result shows, with its basis — including the timing
  /// estimate, which predates the contract and is stored in its own column.
  /// Folding it in here rather than giving it a card of its own is what makes
  /// "every number traces to an assumption" true for old reviews as well as
  /// new ones.
  const assumptions: Assumption[] = [
    ...(review?.timingBasis
      ? [
          {
            label: 'Timing',
            value: `${
              review.timingBasis.minutes[0] === review.timingBasis.minutes[1]
                ? `about ${review.timingBasis.minutes[0]} minutes`
                : `${review.timingBasis.minutes[0]}–${review.timingBasis.minutes[1]} minutes`
            } — assuming ${review.timingBasis.assumption}`,
          },
        ]
      : []),
    ...(review?.assumptions ?? []),
  ]

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
            {/* First, because it decides everything after it: which lenses
                run, and therefore what the review is actually about. */}
            <div>
              <SectionLabel
                title="What are you looking over?"
                hint="This decides what I check for. You can change it after."
              />
              <div className="mt-2.5 flex flex-wrap gap-2.5">
                {DOC_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setChosenType(chosenType === type ? null : type)}
                    aria-pressed={chosenType === type}
                    className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors ${
                      chosenType === type
                        ? 'border-gold bg-gold text-forest'
                        : 'border-hairline bg-cream text-ink hover:border-terracotta/50 hover:text-terracotta-600'
                    }`}
                  >
                    {DOC_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
              {/* What picking it bought, stated while they can still change
                  their mind — a lens set a teacher cannot see is a promise
                  they have no way to check. */}
              {chosenType && (
                <p className="mt-2.5 text-sm text-ink-soft">
                  I&rsquo;ll look at: {lensPreview(chosenType)}.
                </p>
              )}
            </div>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const files = Array.from(e.dataTransfer.files ?? [])
              if (files.length > 0) void addFiles(files, 'file')
            }}
            className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
              dragging ? 'border-terracotta bg-peach-tint/40' : 'border-hairline bg-cream'
            }`}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-tint text-terracotta-600">
              <BookIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="font-heading text-lg font-bold text-forest">
                {chosenType ? 'Drop it here' : 'Pick what it is first'}
              </p>
              <p className="mt-0.5 text-sm text-ink-soft">
                {chosenType
                  ? `Your ${DOC_TYPE_IN_A_SENTENCE[chosenType]} — a file, a photo, or paste the text below.`
                  : 'Choose one above and this opens up.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={busy != null || !chosenType}
                onClick={() => fileInput.current?.click()}
                className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:opacity-60"
              >
                Choose a file
              </button>
              <button
                type="button"
                disabled={busy != null || !chosenType}
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
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                if (files.length > 0) void addFiles(files, 'file')
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
                const files = Array.from(e.target.files ?? [])
                if (files.length > 0) void addFiles(files, 'photo')
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
              disabled={busy != null || !pasted.trim() || !chosenType}
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
          {review.status !== 'reviewed' && (
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
              {/* Asks until the teacher answers, then reports. A corrected
                  type swaps the whole lens set, so the strip says so rather
                  than letting the result quietly change underneath them. */}
              {/* What it made of the set, in the teacher's words, before the
                  type question. */}
              {fileSetSummary && review.files && review.files.length > 1 && (
                <p className="rounded-xl bg-mint-tint/50 px-4 py-2.5 text-sm font-medium text-forest">
                  {fileSetSummary}
                </p>
              )}

              {/* The teacher chose the type before uploading, so this states
                  it rather than asking. The chips below still change it in one
                  tap — being able to change your mind is not the same as being
                  interrogated. */}
              <SectionLabel
                title={correctedHeading(docTypeOf(review.docType))}
                hint="Different type, different checks — tap any to change it."
              />

              {/* The one thing choosing up front costs: nothing checks the
                  teacher's answer. Detection still runs, and says so when it
                  disagrees, so a wrong pick is visible rather than silently
                  producing the wrong lenses. */}
              {disagreesWithChoice(review) && (
                <p className="rounded-xl bg-gold-tint/60 px-4 py-2.5 text-sm text-ink">
                  Reading it, this looks more like{' '}
                  <strong className="font-semibold">
                    {DOC_TYPE_LABELS[docTypeOf(review.detectedType ?? review.docType)]}
                  </strong>
                  {review.detectionEvidence && review.detectionEvidence.length > 0
                    ? ` — ${review.detectionEvidence.join(' and ')}.`
                    : '.'}{' '}
                  Tap it below if that&rsquo;s right.
                </p>
              )}
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

            {/* The room it is for, which is what timing and grade-level
                judgments stand on. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-hairline/50 px-4 py-3.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Your class</span>
              <ClassContextLine compact onChange={setPrep} />
            </div>

            {/* Asked once, and only when there is something to choose. The
                minutes are said before it starts rather than after, because
                "this will take a few minutes" is the thing a teacher needs in
                order to decide whether to wait. */}
            {scopeChoice && (
              <div className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-4">
                <p className="font-heading text-base font-bold text-forest">
                  This is {scopeChoice.pages} pages. Want the whole thing, or a part?
                </p>
                <p className="mt-1 text-sm text-ink">
                  One pass over all of it reads everything and says less about each part.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy != null}
                    onClick={() => void handleRun({ scope: scopeChoice.whole.label })}
                    className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {scopeChoice.whole.label} · {minutesLabel(scopeChoice.whole.minutes)}
                  </button>
                  {scopeChoice.sections.map((section) => (
                    <button
                      key={section.label}
                      type="button"
                      disabled={busy != null}
                      onClick={() => void handleRun({ scope: section.label })}
                      className="rounded-full border border-hairline bg-cream-card px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-terracotta/50 hover:text-terracotta-600 disabled:opacity-60"
                    >
                      {section.label} · {minutesLabel(section.minutes)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* The guard, as a question rather than a failure. The server
                refused to run; this is what it refused over, and the teacher
                decides. Strip is first and is what the quiet default would be
                — nothing here needs their students' names. */}
            {namesFound && (
              <div className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-4">
                <p className="font-heading text-base font-bold text-forest">
                  This looks like it has student names in it.
                </p>
                <p className="mt-1 text-sm text-ink">
                  I found {namesFound.reason}. I don&rsquo;t need them to read this — want me to take them out
                  first?
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy != null}
                    onClick={() => void handleRun({ namesHandled: 'strip' })}
                    className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    Strip names
                  </button>
                  <button
                    type="button"
                    disabled={busy != null}
                    onClick={() => void handleRun({ namesHandled: 'keep' })}
                    className="rounded-full border border-hairline bg-cream-card px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-terracotta/50 hover:text-terracotta-600 disabled:opacity-60"
                  >
                    Use it as is
                  </button>
                  <button
                    type="button"
                    onClick={() => setNamesFound(null)}
                    className="px-3 py-2.5 text-sm font-semibold text-ink-soft hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

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

          </>
          )}

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
              {/* 1 — what was read. Dark, so the result below it reads as the
                  page rather than as another panel, and so the file name and
                  the room are settled before any judgment appears. */}
              <div className="rounded-3xl bg-forest p-6 text-cream">
                <p className="font-heading text-lg font-bold">
                  {review.files && review.files.length > 1
                    ? review.files.map((f, i) => f.fileName ?? `Document ${i + 1}`).join(' · ')
                    : (review.fileName ?? 'Pasted text')}
                </p>
                <p className="mt-1 text-sm text-cream/70">{resultMeta(review)}</p>
                {/* Only when it is not the whole thing — a scope label on a
                    whole-document review would imply a limit that is not
                    there. */}
                {review.scope?.label && (
                  <p className="mt-2 inline-block rounded-full bg-cream/10 px-3 py-1 text-xs font-semibold">
                    {review.scope.label}
                  </p>
                )}
              </div>

              {/* 2 — the hero. One change, for the whole review. */}
              {review.oneThing && (
                <div className="rounded-3xl bg-peach-tint/60 p-6">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
                    If you change one thing
                  </p>
                  <p className="mt-2 font-heading text-2xl font-extrabold leading-tight text-forest">
                    {review.oneThing}
                  </p>
                  {review.oneThingDetail && <p className="mt-2 text-base text-ink">{review.oneThingDetail}</p>}
                </div>
              )}

              {/* 3 — the findings, as numbered sections: the same shape as
                  the printed reports and Lesson Debrief's Insights, so every
                  report in this app reads the same way. What the part is,
                  what it is for, then the content. Numbers are assigned in
                  reading order, so a lens that produced nothing leaves no
                  gap. */}
              {findingLenses.map((lens, i) => (
                <AnswerSection
                  key={lens.key}
                  n={i + 1}
                  // The lens's own name and its fixed blurb, exactly as
                  // Presentation Review and Assignment Coach did it: a section
                  // a teacher recognises from one review to the next, and a
                  // subtitle that says what it is about rather than what this
                  // particular document turned out to be. The model's own
                  // heading moved into the body, where a sentence belongs.
                  title={lens.label}
                  subtitle={lens.blurb}
                >
                  {/* A thin-evidence finding says so rather than sitting at
                      the same weight as a well-grounded one. */}
                  {lens.confidence === 'low' && (
                    <p className="mb-2 text-xs font-semibold text-terracotta-600">
                      Low confidence — the document didn&rsquo;t give this much to go on.
                    </p>
                  )}
                  {/* What it found, led by the model's own one-line summary
                      when there is one. */}
                  {lens.title && <span className="block font-semibold text-forest">{lens.title}</span>}
                  {lens.body || lens.finding}

                  {/* The named parts, in the shape the old presentation
                      review used: the place, then what about it. A teacher
                      can act on one of these without re-reading the rest. */}
                  {lens.points && lens.points.length > 0 && (
                    <div className="mt-3 flex flex-col gap-3">
                      {lens.points.map((point) => (
                        <div key={point.label}>
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                            {point.label}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{point.body}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {lens.evidence && lens.evidence.length > 0 && (
                    <p className="mt-2.5 text-xs text-ink-soft">
                      <span className="font-semibold">From:</span> {lens.evidence.join(' · ')}
                    </p>
                  )}
                </AnswerSection>
              ))}

              {/* 4 — the changes, last and numbered with the rest, below the
                  findings that argue for them. */}
              <NumberedCard
                n={findingLenses.length + 1}
                title="Suggested edits"
                subtitle={
                  review.edits.length === 0
                    ? 'Nothing I would change before tomorrow'
                    : 'Your words, and what they could become — take the ones you want'
                }
              >
                {review.edits.length === 0 ? (
                  // A result, not an error. The findings above still stand.
                  <p className="text-sm text-ink-soft">
                    No suggested edits. What I found is above, and your document is unchanged.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {review.edits.map((edit) => (
                      <EditCard
                        key={edit.id}
                        edit={edit}
                        unanchored={review.unanchoredEditIds?.includes(edit.id) ?? false}
                        onDecide={(status) => void handleEdit(edit, status)}
                      />
                    ))}
                  </div>
                )}
              </NumberedCard>

              {/* Every number on the page, with its basis. Shown rather than
                  held, because a figure nobody can check is a figure that gets
                  believed or dismissed for the wrong reasons. */}
              {assumptions.length > 0 && (
                <div className="rounded-2xl bg-cream px-5 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
                    What the numbers assume
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {assumptions.map((a) => (
                      <li key={a.label} className="text-sm text-ink">
                        <span className="font-semibold">{a.label}:</span> {a.value}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {review.notVisible && review.notVisible.length > 0 && (
                <p className="text-sm text-ink-soft">
                  <span className="font-semibold text-ink">Not visible from the document:</span>{' '}
                  {review.notVisible.join(' · ')}.
                </p>
              )}

              {/* 5 — the finish bar. Says what has been decided before it
                  offers to hand anything over. */}
              <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
                <p className="mr-auto text-sm font-semibold text-ink">
                  {review.acceptedCount === 0
                    ? 'Nothing changed yet'
                    : `${review.acceptedCount} ${review.acceptedCount === 1 ? 'change' : 'changes'} accepted`}
                </p>
                <button
                  type="button"
                  onClick={() => void handleRun()}
                  disabled={busy != null}
                  className="rounded-full border-2 border-hairline bg-cream-card px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600 disabled:opacity-60"
                >
                  Look again
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90"
                >
                  {review.exportLabel}
                </button>
                {/* The review is the context; the conversation is about what
                    to do with it. */}
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
                    setScope(null)
                    navigate('/look-it-over', { replace: true })
                  }}
                  className="px-2 py-2.5 text-sm font-semibold text-ink-soft hover:text-ink"
                >
                  Look at something else
                </button>
              </div>

              {/* 6 — always. */}
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

/// The line under the file name: what it is, how big, and whose room it was
/// judged against. Built only from what the review actually has — a field it
/// does not have is left out rather than guessed at.
function resultMeta(review: Review): string {
  const parts: string[] = [review.docTypeLabel]
  if (review.pageCount) parts.push(`${review.pageCount} ${review.pageCount === 1 ? 'page' : 'pages'}`)
  if (review.classLine) parts.push(review.classLine)
  return parts.join(' · ')
}

/// One suggested change, as a diff.
///
/// The whole surface turns on this card being a diff and never a replacement:
/// the teacher's words stay on screen, struck through, beside what they would
/// become, and neither button does anything until they press it.
function EditCard({
  edit,
  unanchored,
  onDecide,
}: {
  edit: ReviewEdit
  unanchored: boolean
  onDecide: (status: ReviewEdit['status']) => void
}) {
  const border =
    edit.status === 'accepted'
      ? 'border-forest/40 bg-mint-tint/40'
      : edit.status === 'kept_mine'
        ? 'border-hairline bg-cream'
        : 'border-hairline bg-cream-card'
  return (
    <div className={`rounded-2xl border p-5 ${border}`}>
      <div className="flex flex-wrap items-center gap-2">
        {edit.where && (
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">{edit.where}</span>
        )}
        {edit.tag && (
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
              edit.severity === 'high'
                ? 'bg-peach-tint text-terracotta-600'
                : edit.severity === 'low'
                  ? 'bg-cream text-ink-soft'
                  : 'bg-gold-tint text-forest'
            }`}
          >
            {edit.tag}
          </span>
        )}
      </div>

      {/* Their words, still here. */}
      <p className="mt-3 text-sm text-ink-soft line-through decoration-terracotta/50">{edit.original}</p>
      <p className="mt-2 rounded-xl bg-mint-tint/50 px-4 py-3 text-sm text-ink">{edit.revision}</p>
      <p className="mt-2 text-sm text-ink-soft">
        <span className="font-semibold text-ink">Why:</span> {edit.why}
      </p>

      {/* An edit quoting text that is not in the document would strike through
          a sentence the teacher never wrote, so it is named rather than
          quietly rendered. */}
      {unanchored && (
        <p className="mt-2 text-xs font-semibold text-terracotta-600">
          I couldn&rsquo;t find this exact wording in your document — check it against the original before taking it.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onDecide(edit.status === 'accepted' ? 'pending' : 'accepted')}
          aria-pressed={edit.status === 'accepted'}
          className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
            edit.status === 'accepted' ? 'bg-forest text-cream' : 'bg-cream text-ink hover:text-terracotta-600'
          }`}
        >
          Use this
        </button>
        <button
          type="button"
          onClick={() => onDecide(edit.status === 'kept_mine' ? 'pending' : 'kept_mine')}
          aria-pressed={edit.status === 'kept_mine'}
          className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
            edit.status === 'kept_mine' ? 'bg-forest text-cream' : 'bg-cream text-ink hover:text-terracotta-600'
          }`}
        >
          Keep mine
        </button>
      </div>
    </div>
  )
}

/// "about 2 min" / "2–4 min". Always a range or an explicit "about", never a
/// bare number — a figure on its own reads as a measurement.
function minutesLabel([low, high]: [number, number]): string {
  return low === high ? `about ${low} min` : `${low}–${high} min`
}

/// True when detection read the document as something other than what the
/// teacher said it was.
///
/// Choosing the type up front means nothing checks the choice — a teacher who
/// picks "assignment" for a quiz gets the assignment lenses and is told
/// nothing. Detection still runs for exactly this, so the disagreement is
/// surfaced as a sentence rather than left to be noticed in the results.
function disagreesWithChoice(review: Review): boolean {
  if (!review.detectedType) return false
  if (review.detectedType === review.docType) return false
  // Only when the teacher actually chose. An unconfirmed type means detection
  // picked it, and detection cannot disagree with itself.
  return review.docTypeConfirmed
}
