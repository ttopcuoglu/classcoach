import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../lib/api'

// Where the emailed link lands: choose a new password, and the server signs
// the teacher in with it so they don't type it twice.
export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError("Those two passwords don't match.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await resetPassword(token, password)
      // Signed in already. A full load rather than a client-side navigation,
      // so App re-reads the new session before Home renders.
      window.location.assign('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your password. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-hairline bg-cream-card p-7 shadow-sm">
        <h1 className="font-heading text-2xl font-bold text-forest">Choose a new password</h1>

        {!token ? (
          <>
            <p className="mt-3 text-sm text-ink">
              This link is missing its code. Open the link in the email again, or ask for a new one.
            </p>
            <Link
              to="/forgot-password"
              className="mt-5 inline-block text-sm font-semibold text-terracotta-600 hover:underline"
            >
              Send a new link
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-soft">At least 8 characters.</p>
            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                minLength={8}
                required
                className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none"
              />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="New password again"
                autoComplete="new-password"
                minLength={8}
                required
                className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none"
              />
              {error && <p className="text-sm text-terracotta-600">{error}</p>}
              <button
                type="submit"
                disabled={saving || password.length < 8}
                className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Set new password'}
              </button>
            </form>
            <Link
              to="/forgot-password"
              className="mt-5 inline-block text-sm font-semibold text-terracotta-600 hover:underline"
            >
              Link expired? Send a new one
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
