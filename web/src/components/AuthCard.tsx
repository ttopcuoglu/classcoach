import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { logIn, signInWithGoogle, signUp } from '../lib/api'

type AuthMode = 'signup' | 'login'

const inputClass =
  'rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60'

function pillClass(active: boolean) {
  return `flex-1 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
    active ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
  }`
}

export default function AuthCard({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<AuthMode>('signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        await signUp({ email, password, name, termsAccepted, ageConfirmed })
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
    try {
      await signInWithGoogle(response.credential)
      onSignedIn()
    } catch {
      setError('Could not sign you in. Please try again.')
    }
  }

  return (
    <div id="get-started" className="w-full max-w-sm rounded-2xl bg-canvas p-5 shadow-sm">
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
        <span className="h-px flex-1 bg-border" />
        or {mode === 'signup' ? 'sign up' : 'log in'} with email
        <span className="h-px flex-1 bg-border" />
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
          <>
            <label className="flex items-start gap-2 text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I agree to Wivoza's{' '}
                <Link to="/terms" target="_blank" className="underline hover:text-brand-600">
                  Terms
                </Link>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              <span>I confirm I am 13 years of age or older.</span>
            </label>
          </>
        )}
        {error && <p className="text-sm text-warm-500">{error}</p>}
        <button
          type="submit"
          disabled={submitting || (mode === 'signup' && (!termsAccepted || !ageConfirmed))}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          {submitting ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Log in'}
        </button>
      </form>
    </div>
  )
}
