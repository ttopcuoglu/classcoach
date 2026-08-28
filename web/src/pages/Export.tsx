import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { categoryLabel } from '../lib/categories'
import { getAttempts, getDebriefs, type Debrief, type ScenarioAttempt } from '../lib/api'

export default function Export() {
  const [attempts, setAttempts] = useState<ScenarioAttempt[]>([])
  const [debriefs, setDebriefs] = useState<Debrief[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getAttempts({ saved: true }), getDebriefs({ saved: true })])
      .then(([savedAttempts, savedDebriefs]) => {
        setAttempts(savedAttempts)
        setDebriefs(savedDebriefs)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-canvas px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <Link to="/profile" className="text-sm font-medium text-ink-soft hover:text-ink">
            ← Back
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
          >
            Print / Save as PDF
          </button>
        </div>

        <h1 className="text-2xl font-semibold text-ink">Wivoza — Your Playbook</h1>
        <p className="mt-1 text-sm text-ink-soft">Saved scenarios and saved Ask answers, exported for offline reference.</p>

        {loading ? (
          <p className="mt-8 text-sm text-ink-soft">Loading...</p>
        ) : (
          <>
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-ink">Saved Scenarios</h2>
              {attempts.length === 0 ? (
                <p className="mt-2 text-sm text-ink-soft">No saved scenarios yet.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-4">
                  {attempts.map((a) => (
                    <article key={a.id} className="break-inside-avoid rounded-xl border border-border p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                        {categoryLabel(a.scenario.category)} · Grades {a.scenario.gradeBand}
                      </p>
                      <p className="mt-1.5 text-sm text-ink">{a.scenario.text}</p>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                        Your response
                      </p>
                      <p className="mt-1 text-sm text-ink">{a.responseText}</p>
                      {a.feedback && (
                        <>
                          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                            Coaching
                          </p>
                          <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{a.feedback}</p>
                        </>
                      )}
                      {a.modelResponse && (
                        <>
                          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                            Model response
                          </p>
                          <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{a.modelResponse}</p>
                        </>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-8">
              <h2 className="text-lg font-semibold text-ink">Saved from Ask</h2>
              {debriefs.length === 0 ? (
                <p className="mt-2 text-sm text-ink-soft">Nothing saved yet.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-4">
                  {debriefs.map((d) => (
                    <article key={d.id} className="break-inside-avoid rounded-xl border border-border p-4">
                      <p className="text-sm font-semibold text-ink">{d.incidentText}</p>
                      {d.feedback && (
                        <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink-soft">{d.feedback}</p>
                      )}
                      {d.followUp && (
                        <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink-soft">{d.followUp}</p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
