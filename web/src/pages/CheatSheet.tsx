import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CATEGORIES } from '../lib/categories'
import { getAttempts, getDebriefs, type ScenarioAttempt, type Debrief } from '../lib/api'

type Phrase = { text: string; source: string }

const SECTION_STYLES = [
  { badge: 'bg-terracotta text-cream', card: 'bg-peach-tint/50' },
  { badge: 'bg-gold text-forest', card: 'bg-gold-tint/50' },
  { badge: 'bg-forest text-gold', card: 'bg-mint-tint/50' },
]

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
  const phraseCount = [...byCategory.values()].reduce((n, list) => n + list.length, 0) + generalTips.length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-3xl bg-forest p-6 text-cream sm:p-8">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Wivoza · Grow</p>
          <h1 className="mt-2 font-heading text-3xl font-extrabold text-cream md:text-4xl">
            Your Cheat Sheet<span className="text-gold">.</span>
          </h1>
          <p className="mt-1.5 text-cream/70">Go-to phrases and tips, auto-built from what you've saved.</p>
          <Link
            to="/guide/cheat-sheet"
            className="mt-2 inline-block text-xs font-medium text-cream/70 underline decoration-cream/30 underline-offset-4 hover:text-cream"
          >
            New to this? Read the teacher's guide
          </Link>
        </div>
        {!loading && !isEmpty && (
          <div className="rounded-2xl bg-cream/5 px-5 py-3 text-right ring-1 ring-cream/10">
            <p className="font-heading text-3xl font-extrabold text-gold">{phraseCount}</p>
            <p className="text-xs text-cream/70">saved {phraseCount === 1 ? 'phrase' : 'phrases'} and tips</p>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-center text-sm text-ink-soft">Loading...</p>
      ) : isEmpty ? (
        <div className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Nothing saved yet</p>
          <p className="mt-1.5 text-sm text-ink">
            Save a scenario response or an answer from Ask, and it'll show up here.
          </p>
          <Link
            to="/coach-chat"
            className="mt-3 inline-block rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90"
          >
            Open Ask & Practice →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {CATEGORIES.filter((c) => c.value && byCategory.has(c.value)).map(({ label, value }, index) => {
            const style = SECTION_STYLES[index % SECTION_STYLES.length]
            return (
              <div key={value}>
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl font-heading text-base font-bold ${style.badge}`}
                  >
                    {index + 1}
                  </span>
                  <h2 className="font-heading text-xl font-bold text-forest">{label}</h2>
                </div>
                <div className="mt-3 flex flex-col gap-3">
                  {byCategory.get(value!)!.map((phrase, i) => (
                    <div key={i} className={`rounded-2xl p-5 ${style.card}`}>
                      <p className="text-base whitespace-pre-wrap text-ink">{phrase.text}</p>
                      <p className="mt-2 text-xs text-ink-soft">For: {phrase.source}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {generalTips.length > 0 && (
            <div>
              <h2 className="font-heading text-xl font-bold text-forest">General tips</h2>
              <div className="mt-3 flex flex-col gap-3">
                {generalTips.map((d) => (
                  <div key={d.id} className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-5">
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
