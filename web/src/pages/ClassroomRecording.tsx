import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightIcon } from '../components/icons'
import FooterContact from '../components/FooterContact'
import { FAMILY_NOTE, FORM_LINE } from '../lib/recordingWording'

// The page a teacher forwards to their principal from the recording notice —
// so asking "is this OK?" is sending a link, not explaining a product. Every
// line here has to stay true to the code: audio deletion (discardUpload in
// server/src/routes/audioSessions.ts, RecordingStore.keepLocalAudioDays on
// iOS), the retention options in Profile, and the admin boundary in the FAQ.
// The transcript-keeps-names line is the one most tempting to soften; don't.

type Point = { title: string; body: string }


const POINTS: Point[] = [
  {
    title: 'It is for the teacher’s own growth.',
    body: 'Wivoza is a private coach. It gives no ratings, levels or scores, and nothing it produces is a formal evaluation.',
  },
  {
    title: 'Wivoza asks the teacher to tell students.',
    body: 'Before their first recording, the teacher is asked to tell the class they are recording their own teaching, and that it is only for them.',
  },
  {
    title: 'The audio is not kept.',
    body: 'The recording is turned into text and then deleted. On our server it is a temporary file, removed as soon as transcription finishes. An iPhone holds its own copy only until the transcript is ready, and never more than 7 days.',
  },
  {
    title: 'The transcript is kept, in the teacher’s private account.',
    body: 'It is a record of what was said, so if a student’s name is said aloud, it appears in the text. The teacher can delete any lesson at any time, or have transcripts delete themselves after 7, 30 or 90 days.',
  },
  {
    title: 'Students are not identified.',
    body: 'Voices are separated only into “teacher” and “student”. There are no voiceprints, no student accounts, and nothing students have to do.',
  },
  {
    title: 'No one else at school sees it.',
    body: 'If your school has not joined Wivoza, no one there sees anything. If it does, administrators see school-wide totals and who has joined — never a teacher’s recordings, transcripts or reports.',
  },
  {
    title: 'It is not used to train AI.',
    body: 'Transcription (Deepgram) and coaching (Anthropic’s Claude) both run under terms that exclude this content from model training.',
  },
]

function CopyBlock({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false)
  const textRef = useRef<HTMLParagraphElement>(null)
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard refused (an embedded view, an old browser) — select the text
      // instead, so one Cmd/Ctrl+C or a long-press finishes the job.
      if (!textRef.current) return
      const range = document.createRange()
      range.selectNodeContents(textRef.current)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
    }
  }
  return (
    <div className="mt-3 rounded-2xl border border-hairline bg-cream-card p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="font-heading text-base font-bold text-forest">{title}</p>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-full border border-hairline px-3.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p ref={textRef} className="mt-3 whitespace-pre-line rounded-xl bg-cream px-4 py-3 text-sm leading-relaxed text-ink">{text}</p>
    </div>
  )
}

export default function ClassroomRecording() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="border-b border-hairline bg-cream-card">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo/wivoza-lockup-light.png" alt="Wivoza" className="h-10 w-auto" />
          </Link>
          <Link to="/faq" className="text-sm font-medium text-ink-soft hover:text-ink">
            FAQ
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl px-6 pb-10 pt-10">
        <div className="rounded-3xl bg-forest px-6 py-10 text-cream sm:px-10 sm:py-12">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">For school leaders</p>
          <h1 className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-tight text-cream sm:text-4xl">
            A teacher would like to record their own lessons<span className="text-gold">.</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-cream/75">
            They are using Wivoza, a private coach, to hear how their teaching sounds and get better at it. Here is
            what that involves, in two minutes.
          </p>
        </div>
      </section>

      <main className="mx-auto w-full max-w-3xl px-6 pb-16">
        <ul className="flex flex-col gap-3">
          {POINTS.map((p) => (
            <li key={p.title} className="rounded-2xl border border-hairline bg-cream-card p-5">
              <p className="font-heading text-base font-bold text-forest">{p.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{p.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-8 rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-6">
          <p className="font-heading text-lg font-bold text-forest">What the teacher is asking</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Whether your school has a policy on teachers recording their own lessons for professional learning, and
            if so, what it asks of them. Many schools treat it like any other instructional recording: a line in the
            family notice, and a shared understanding that the recordings are for the teacher’s own learning and are
            not used in evaluation.
          </p>
        </div>

        <section className="mt-12">
          <h2 className="font-heading text-2xl font-extrabold text-forest">Ready-to-use wording</h2>

          <div className="mt-5 rounded-2xl border border-hairline bg-cream-card p-5">
            <p className="font-heading text-base font-bold text-forest">About your photo and video form</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              Most start-of-year forms are about publishing pictures — the yearbook, the website, social media.
              Whether yours covers audio a teacher records for their own learning is your call. Where a family did not
              sign, the simplest path is to treat their child as not consented: record a different class, or send the
              note below so the family can say yes.
            </p>
          </div>

          <CopyBlock title="A line for next year’s form" text={FORM_LINE} />
          <CopyBlock title="A note a teacher can send home" text={FAMILY_NOTE} />
        </section>

        <p className="mt-8 text-sm text-ink-soft">
          Questions, or need a data privacy agreement? Write to{' '}
          <a href="mailto:hello@wivoza.com" className="font-semibold text-terracotta-600 hover:underline">
            hello@wivoza.com
          </a>
          . More in the{' '}
          <Link to="/faq" className="font-semibold text-terracotta-600 hover:underline">
            FAQ
          </Link>{' '}
          and the{' '}
          <Link to="/terms" className="font-semibold text-terracotta-600 hover:underline">
            Terms and Privacy Notice
          </Link>
          , which govern where they differ from this page.
        </p>

        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-terracotta px-5 py-3 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
        >
          About Wivoza
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </main>

      <footer className="bg-cream pb-10">
        <p className="text-center text-sm text-ink-soft">&copy; 2026 Edinexa Technologies LLC.</p>
        <FooterContact />
      </footer>
    </div>
  )
}
