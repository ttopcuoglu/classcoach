import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAuthProviders, logIn, microsoftSignInUrl, signInWithGoogle, signUp } from '../lib/api'

/// What a failed Microsoft sign-in comes back as (?authError=…), in words.
const MICROSOFT_ERRORS: Record<string, string> = {
  'microsoft-unverified':
    "Your Microsoft account didn't confirm your email address, so Wivoza can't use it to sign you in. Use Google or your email and password instead — or ask your school's IT to verify its email domain with Microsoft.",
  'microsoft-other-account': 'That email is already connected to a different Microsoft account. Sign in the way you usually do.',
  'microsoft-cancelled': 'Microsoft sign-in was cancelled.',
  'microsoft-expired': 'That took too long. Try signing in with Microsoft again.',
  'microsoft-unavailable': "Microsoft sign-in isn't available right now.",
  'microsoft-failed': "Microsoft couldn't sign you in. Please try again.",
  suspended: 'This account has been suspended. Contact your administrator.',
}

let providersOnce: Promise<{ microsoft: boolean }> | null = null

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" aria-hidden="true" className="h-[18px] w-[18px] shrink-0">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}

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
  const [microsoft, setMicrosoft] = useState(false)

  useEffect(() => {
    providersOnce ??= getAuthProviders().catch(() => ({ microsoft: false }))
    let live = true
    void providersOnce.then((p) => live && setMicrosoft(p.microsoft))
    // A Microsoft sign-in that failed comes back here with ?authError=…: say
    // why, then take it out of the address so a reload doesn't say it again.
    const params = new URLSearchParams(window.location.search)
    const code = params.get('authError')
    if (code) {
      setError(MICROSOFT_ERRORS[code] ?? MICROSOFT_ERRORS['microsoft-failed'])
      setMode('login')
      params.delete('authError')
      const rest = params.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`)
    }
    return () => {
      live = false
    }
  }, [])

  function signInWithMicrosoft() {
    setSubmitting(true)
    window.location.href = microsoftSignInUrl(`${window.location.pathname}${window.location.search}`)
  }

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

        {mode === 'signup' && (
          <label className="mt-4 flex items-start gap-2 text-xs text-ink-soft">
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
              </Link>
              , I am 13 years of age or older, and I agree that my responses, recordings, and messages may be sent to
              Anthropic's Claude AI (for coaching feedback and chat) and Deepgram (for transcription and voice
              playback), as described in the Privacy Policy.
            </span>
          </label>
        )}

        <div className={`flex justify-center ${mode === 'signup' ? 'mt-3' : 'mt-4'}`}>
          {mode === 'signup' && !agreed ? (
            <div className="flex h-10 w-[336px] max-w-full items-center justify-center rounded-full border border-hairline bg-cream text-xs text-ink-soft">
              Check the box above to continue
            </div>
          ) : (
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('Sign-in failed. Please try again.')}
              size="large"
              width="336"
              text={mode === 'signup' ? 'signup_with' : 'signin_with'}
            />
          )}
        </div>

        {microsoft && !(mode === 'signup' && !agreed) && (
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={signInWithMicrosoft}
              className="flex h-10 w-[336px] max-w-full items-center justify-center gap-2.5 rounded-full border border-[#8C8C8C] bg-white px-3 text-sm font-medium text-[#1F1F1F] transition-colors hover:bg-[#F3F3F3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
            >
              <MicrosoftLogo />
              <span className="text-[#1F1F1F]">{mode === 'signup' ? 'Sign up with Microsoft' : 'Sign in with Microsoft'}</span>
            </button>
          </div>
        )}

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
        {mode === 'login' && (
          <Link to="/forgot-password" className="self-end text-xs font-semibold text-terracotta-600 hover:underline">
            Forgot password?
          </Link>
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
