import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { useState } from 'react'
import { signInWithGoogle } from '../lib/api'

export default function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [error, setError] = useState<string | null>(null)

  async function handleSuccess(response: CredentialResponse) {
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
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center">
        <p className="text-lg font-semibold text-ink">ClassCoach</p>
        <p className="mt-1 text-sm text-ink-soft">Classroom management, sharpened</p>
        <p className="mt-6 text-sm text-ink-soft">Sign in with your Google account to get started.</p>
        <div className="mt-5 flex justify-center">
          <GoogleLogin onSuccess={handleSuccess} onError={() => setError('Sign-in failed. Please try again.')} />
        </div>
        {error && <p className="mt-3 text-sm text-warm-500">{error}</p>}
      </div>
    </div>
  )
}
