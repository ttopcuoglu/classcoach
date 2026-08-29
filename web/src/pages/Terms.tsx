import { Link } from 'react-router-dom'

// Placeholder terms/privacy copy — NOT reviewed by a lawyer, NOT a binding
// legal document. This must be replaced with real, reviewed terms before
// Wivoza is used with real school districts.
export default function Terms() {
  return (
    <div className="min-h-screen bg-canvas px-6 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Link to="/" className="text-sm font-medium text-ink-soft hover:text-ink">
          ← Back
        </Link>

        <div className="rounded-xl border-2 border-warm-500 bg-warm-100 p-4">
          <p className="text-sm font-semibold text-warm-500">
            Draft — pending legal review. This page is placeholder text for development and is not a binding Terms
            of Service or Privacy Policy.
          </p>
        </div>

        <h1 className="font-display text-3xl italic text-ink">Terms &amp; Privacy</h1>

        <div className="flex flex-col gap-4 text-sm text-ink-soft">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">1. Using Wivoza</h2>
            <p className="mt-1">
              Wivoza is a self-coaching tool for teachers. By creating an account, you agree to use it to reflect on
              and improve your own classroom practice, and not to misuse it in ways that could harm the service or
              other users.
            </p>
          </section>
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">2. Your Account</h2>
            <p className="mt-1">
              You're responsible for keeping your login credentials secure and for the activity that happens under
              your account.
            </p>
          </section>
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">3. Your Data</h2>
            <p className="mt-1">
              Your recordings, transcripts, and coaching history belong to you. They're not shared with your school
              or district unless you explicitly choose to share them.
            </p>
          </section>
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">4. Changes to These Terms</h2>
            <p className="mt-1">
              These terms may change as Wivoza develops. We'll do our best to let you know before anything material
              changes.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
