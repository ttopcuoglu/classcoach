import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getProfile, updateProfile } from '../lib/api'
import { ONBOARDING_TRACK } from '../lib/onboardingTrack'

export default function FirstThirtyDays() {
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProfile()
      .then((profile) => {
        const ids = profile.onboardingProgress?.split(',').filter(Boolean) ?? []
        setCompleted(new Set(ids))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function toggleStep(id: string) {
    const next = new Set(completed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setCompleted(next)
    try {
      await updateProfile({ onboardingProgress: Array.from(next).join(',') })
    } catch {
      // best-effort — local state already reflects the intended change
    }
  }

  function handleStepLink(suggestedCategory?: string) {
    if (suggestedCategory) sessionStorage.setItem('classcoach.suggestedCategory', suggestedCategory)
    else sessionStorage.removeItem('classcoach.suggestedCategory')
  }

  const doneCount = completed.size

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Your First 30 Days</h1>
        <p className="text-ink-soft">A short guided track to help you get grounded early.</p>
      </div>

      {loading ? (
        <p className="text-center text-sm text-ink-soft">Loading...</p>
      ) : (
        <>
          <p className="text-sm text-ink-soft">
            {doneCount} of {ONBOARDING_TRACK.length} steps complete
          </p>
          <div className="flex flex-col gap-3">
            {ONBOARDING_TRACK.map((step) => {
              const done = completed.has(step.id)
              return (
                <div
                  key={step.id}
                  className={`flex items-start gap-3 rounded-xl border p-4 ${
                    done ? 'border-brand-100 bg-brand-50' : 'border-border bg-surface'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleStep(step.id)}
                    aria-label={done ? 'Mark incomplete' : 'Mark complete'}
                    className={`mt-0.5 h-5 w-5 shrink-0 rounded-md border-2 transition-colors ${
                      done ? 'border-brand-500 bg-brand-500' : 'border-border bg-surface'
                    }`}
                  >
                    {done && <span className="block text-xs leading-none text-white">✓</span>}
                  </button>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${done ? 'text-brand-600' : 'text-ink'}`}>
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">{step.description}</p>
                    {step.linkTo && (
                      <Link
                        to={step.linkTo}
                        onClick={() => handleStepLink(step.suggestedCategory)}
                        className="mt-2 inline-block text-sm font-semibold text-brand-600 underline underline-offset-2"
                      >
                        {step.linkLabel}
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <Link to="/profile" className="text-sm font-medium text-ink-soft hover:text-ink">
        ← Back to Profile
      </Link>
    </div>
  )
}
