const CATEGORIES = [
  'All',
  'Defiance',
  'Disengagement',
  'Peer conflict',
  'Disruption',
  'Transitions',
  'Technology misuse',
]

export default function TryItOut() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Try It Out</h1>
        <p className="text-ink-soft">Practice realistic scenarios and get coaching on your approach.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-ink-soft transition-colors first:border-brand-500 first:bg-brand-50 first:text-brand-600 hover:border-brand-400 hover:text-brand-600"
          >
            {category}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <p className="text-sm text-ink-soft">No scenario loaded yet.</p>
        <button
          type="button"
          className="mt-4 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
        >
          New Scenario
        </button>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
          Saved scenarios
        </h2>
        <div className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
          Scenarios you save will show up here.
        </div>
      </div>
    </div>
  )
}
