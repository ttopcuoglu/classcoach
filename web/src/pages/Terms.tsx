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
        <p className="-mt-4 text-xs text-ink-soft">Last updated: August 29, 2026</p>

        <div className="flex flex-col gap-5 text-sm text-ink-soft">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">1. Eligibility</h2>
            <p className="mt-1">
              You must be at least 13 years old to create a Wivoza account. Wivoza is built for licensed and
              pre-service teachers, instructional coaches, and school administrators — by signing up, you confirm
              that you meet this minimum age and that you're creating the account for your own professional use, not
              on behalf of a student.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">2. Your Account</h2>
            <p className="mt-1">
              You're responsible for keeping your login credentials secure and for the activity that happens under
              your account. Tell us right away if you think someone else has access to it. You can sign in with
              Google or with an email and password — either way, one account per person.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">3. Your Content and Recordings</h2>
            <p className="mt-1">
              Anything you put into Wivoza — practice responses, recordings, transcripts, drafts, notes, and coaching
              history — belongs to you. We store it in order to run the service (transcribing audio, generating
              feedback, tracking your growth over time) and don't share it with your school, district, or anyone
              else unless you explicitly choose to share it (for example, using a "Share" link you generate
              yourself). If you record a class session, it's your responsibility to follow your school's and
              jurisdiction's rules about recording and consent.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">4. AI-Generated Coaching</h2>
            <p className="mt-1">
              Wivoza's feedback, scoring, transcripts, and suggested language are generated automatically and are
              meant as a private reflection aid — not a formal evaluation, an HR or legal determination, or a
              substitute for your own professional judgment. Automated analysis of audio and text can be incomplete
              or wrong; review anything Wivoza generates before relying on it or sharing it with someone else.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">5. Acceptable Use</h2>
            <p className="mt-1">You agree not to:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>Use Wivoza for anything unlawful, or in a way that violates a student's or colleague's privacy;</li>
              <li>Try to access another user's account or data, or interfere with the security of the service;</li>
              <li>Attempt to reverse-engineer, scrape, or resell Wivoza or the content it generates;</li>
              <li>Use Wivoza to generate or distribute harassing, discriminatory, or harmful content about anyone.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">6. Our Rights</h2>
            <p className="mt-1">
              Wivoza's software, design, and branding belong to us. This doesn't give us any ownership over your own
              content (see Section 3) — it just means you're licensed to use the app itself, not to copy or resell
              it.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">7. Ending Your Account</h2>
            <p className="mt-1">
              You can stop using Wivoza and delete your account at any time. We may suspend or terminate an account
              that violates these terms. If your account is deleted, your content is removed from active use
              according to our standard data-retention practices.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">8. Disclaimers and Limits on Liability</h2>
            <p className="mt-1">
              Wivoza is provided "as is," without warranties of any kind. To the fullest extent the law allows,
              Wivoza isn't liable for indirect, incidental, or consequential damages arising from your use of the
              service, and our total liability for any claim is limited to the amount you've paid us (if anything) in
              the twelve months before the claim.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">9. Governing Law</h2>
            <p className="mt-1">
              [Placeholder — the governing jurisdiction for these terms will be finalized during legal review.]
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">10. Changes to These Terms</h2>
            <p className="mt-1">
              These terms may change as Wivoza develops. We'll do our best to let you know before anything material
              changes, and continued use of Wivoza after a change means you accept the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">11. Contact</h2>
            <p className="mt-1">Questions about these terms can be sent to the Wivoza team through the app.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
