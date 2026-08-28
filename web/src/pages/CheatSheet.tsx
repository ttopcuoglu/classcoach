import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CATEGORIES } from '../lib/categories'
import { getAttempts, getDebriefs, type ScenarioAttempt, type Debrief } from '../lib/api'

type Phrase = { text: string; source: string }

export default function CheatSheet() {
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

  const byCategory = new Map<string, Phrase[]>()
  for (const a of attempts) {
    if (!a.modelResponse) continue
    const list = byCategory.get(a.scenario.category) ?? []
    list.push({ text: a.modelResponse, source: a.scenario.text })
    byCategory.set(a.scenario.category, list)
  }
  for (const d of debriefs) {
    if (!d.followUp || !d.category) continue
    const list = byCategory.get(d.category) ?? []
    list.push({ text: d.followUp, source: d.incidentText })
    byCategory.set(d.category, list)
  }

  const generalTips = debriefs.filter((d) => !d.category && (d.followUp || d.feedback))

  const hasAnyCategoryPhrases = byCategory.size > 0
  const isEmpty = !loading && !hasAnyCategoryPhrases && generalTips.length === 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Your Cheat Sheet</h1>
        <p className="text-ink-soft">
          Go-to phrases and tips, auto-built from what you've saved.
        </p>
      </div>

      {loading ? (
        <p className="text-center text-sm text-ink-soft">Loading...</p>
      ) : isEmpty ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
          Save a scenario response or an answer from Ask, and it'll show up here.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {CATEGORIES.filter((c) => c.value && byCategory.has(c.value)).map(({ label, value }) => (
            <div key={value}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">{label}</h2>
              <div className="mt-2 flex flex-col gap-2">
                {byCategory.get(value!)!.map((phrase, i) => (
                  <div key={i} className="rounded-xl border border-border bg-surface p-4">
                    <p className="text-sm whitespace-pre-wrap text-ink">{phrase.text}</p>
                    <p className="mt-2 text-xs text-ink-soft">For: {phrase.source}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {generalTips.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">General tips</h2>
              <div className="mt-2 flex flex-col gap-2">
                {generalTips.map((d) => (
                  <div key={d.id} className="rounded-xl border border-border bg-surface p-4">
                    <p className="text-sm font-semibold text-ink">{d.incidentText}</p>
                    <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink-soft">{d.followUp ?? d.feedback}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Link to="/profile" className="text-sm font-medium text-ink-soft hover:text-ink">
        ← Back to Profile
      </Link>
    </div>
  )
}
