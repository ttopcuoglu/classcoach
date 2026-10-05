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
      <div className="rounded-3xl bg-forest p-6 text-cream sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Wivoza · Grow</p>
        <h1 className="mt-2 font-heading text-3xl font-extrabold text-cream md:text-4xl">
          Your First 30 Days<span className="text-gold">.</span>
        </h1>
        <p className="mt-1.5 text-cream/70">A short guided track to help you get grounded early.</p>
        {!loading && (
          <div className="mt-5 max-w-md">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold text-cream">
                {doneCount} of {ONBOARDING_TRACK.length} steps complete
              </span>
              <span className="text-cream/60">{Math.round((doneCount / ONBOARDING_TRACK.length) * 100)}%</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-cream/10">
              <div
                className="h-full rounded-full bg-gold transition-all duration-500"
                style={{ width: `${(doneCount / ONBOARDING_TRACK.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-center text-sm text-ink-soft">Loading...</p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {ONBOARDING_TRACK.map((step, index) => {
              const done = completed.has(step.id)
              return (
                <div
                  key={step.id}
                  className={`flex items-start gap-4 rounded-2xl p-5 transition-colors ${
                    done ? 'bg-mint-tint/50' : 'border border-hairline bg-cream-card shadow-sm'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleStep(step.id)}
                    aria-label={done ? 'Mark incomplete' : 'Mark complete'}
                    aria-pressed={done}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl font-heading text-base font-bold transition-colors ${
                      done
                        ? 'bg-forest text-gold'
                        : 'border-2 border-dashed border-hairline text-ink-soft hover:border-terracotta hover:text-terracotta-600'
                    }`}
                  >
                    {done ? '✓' : index + 1}
                  </button>
                  <div className="flex-1">
                    <p className={`font-heading text-base font-bold ${done ? 'text-forest/70 line-through decoration-forest/30' : 'text-forest'}`}>
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">{step.description}</p>
                    {step.linkTo && (
                      <Link
                        to={step.linkTo}
                        onClick={() => handleStepLink(step.suggestedCategory)}
                        className="mt-2 inline-block text-sm font-semibold text-terracotta-600 hover:text-terracotta"
                      >
                        {step.linkLabel} →
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
