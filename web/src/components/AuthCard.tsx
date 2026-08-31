import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { logIn, signInWithGoogle, signUp } from '../lib/api'

type AuthMode = 'signup' | 'login'

const inputClass =
  'rounded-xl border border-hairline bg-cream px-3.5 py-2.5 text-sm text-ink focus:border-terracotta focus:outline-none disabled:opacity-60'

function pillClass(active: boolean) {
  return `flex-1 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
    active
      ? 'border-mint-tint bg-mint-tint text-forest'
      : 'border-hairline bg-cream-card text-ink-soft hover:border-forest/30 hover:text-forest'
  }`
}

export default function AuthCard({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<AuthMode>('signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        await signUp({ email, password, name, termsAccepted: agreed, ageConfirmed: agreed })
      } else {
        await logIn({ email, password })
      }
      onSignedIn()
    } catch (err) {
      setError((err as Error).message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGoogleSuccess(response: CredentialResponse) {
    if (!response.credential) {
      setError('Google did not return a credential. Please try again.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await signInWithGoogle(response.credential)
      onSignedIn()
    } catch {
      setError('Could not sign you in. Please try again.')
      setSubmitting(false)
    }
  }

  // A dedicated loading view, not just a disabled form — the Google flow in
  // particular has no per-field state to disable (GoogleLogin renders its
  // own button), so without this, a slow sign-in looks identical to the
  // form just sitting there doing nothing.
  if (submitting) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-hairline bg-cream-card p-6 py-14 text-center shadow-lg">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-terracotta border-t-transparent" />
        <p className="text-sm font-medium text-ink-soft">
          {mode === 'signup' ? 'Creating your account...' : 'Signing you in...'}
        </p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-hairline bg-cream-card p-6 shadow-lg">
      <div className="flex gap-2">
        <button type="button" onClick={() => setMode('signup')} className={pillClass(mode === 'signup')}>
          Sign up
        </button>
        <button type="button" onClick={() => setMode('login')} className={pillClass(mode === 'login')}>
          Log in
        </button>
      </div>

      <div className="mt-4 flex justify-center">
        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={() => setError('Sign-in failed. Please try again.')}
          size="large"
          width="336"
          text={mode === 'signup' ? 'signup_with' : 'signin_with'}
        />
      </div>

      <div className="my-4 flex items-center gap-3 text-xs text-ink-soft">
        <span className="h-px flex-1 bg-hairline" />
        or {mode === 'signup' ? 'sign up' : 'log in'} with email
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {mode === 'signup' && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className={inputClass}
            required
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={inputClass}
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          minLength={mode === 'signup' ? 8 : undefined}
          className={inputClass}
          required
        />
        {mode === 'signup' && (
          <label className="flex items-start gap-2 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I agree to Wivoza's{' '}
              <Link to="/terms" className="underline hover:text-forest">
                terms and conditions
              </Link>{' '}
              and I am 13 years of age or older.
            </span>
          </label>
        )}
        {error && <p className="text-sm text-terracotta-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting || (mode === 'signup' && !agreed)}
          className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Log in'}
        </button>
      </form>
    </div>
  )
}
