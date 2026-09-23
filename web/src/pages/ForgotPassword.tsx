import { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../lib/api'

// Asks for a reset link. The answer is deliberately the same whether or not
// the address has an account, so this page can't be used to find out who
// has one — the wording says "if" for that reason.
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      await requestPasswordReset(email.trim())
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-hairline bg-cream-card p-7 shadow-sm">
        <h1 className="font-heading text-2xl font-bold text-forest">Reset your password</h1>

        {sent ? (
          <>
            <p className="mt-3 text-sm text-ink">
              If there's a Wivoza account for <span className="font-semibold">{email.trim()}</span>, we've sent it a link
              to choose a new password. It works for one hour.
            </p>
            <p className="mt-3 text-sm text-ink-soft">
              Nothing in your inbox after a few minutes? Check your spam folder, and make sure that's the address you
              signed up with.
            </p>
            <Link to="/" className="mt-5 inline-block text-sm font-semibold text-terracotta-600 hover:underline">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-soft">
              Enter the email you use for Wivoza and we'll send you a link to set a new password.
            </p>
            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="email"
                required
                className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none"
              />
              {error && <p className="text-sm text-terracotta-600">{error}</p>}
              <button
                type="submit"
                disabled={sending || !email.trim()}
                className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send reset link'}
              </button>
            </form>
            <Link to="/" className="mt-5 inline-block text-sm font-semibold text-terracotta-600 hover:underline">
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
