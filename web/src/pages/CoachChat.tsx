import { Link, useSearchParams } from 'react-router-dom'
import Ask from './Ask'
import TryItOut from './TryItOut'
import { findFocusArea } from '../lib/focusAreas'

// The shell owns the focus area and nothing else. It used to render a six-card
// grid here, above both tabs — which put eleven controls between a teacher and
// the box where they type, and showed ten example prompts on one screen (six in
// the cards, four in the starters below) that all did the same job.
//
// The area is now picked where it actually does work, which differs by tab:
// on Practice it decides what scenario you get handed, so it's the primary
// control there; on Ask the coach infers it from what you type, so it's just a
// filter on the starter questions. Either tab's pick still lives here, in the
// URL, so switching tabs keeps it.
export default function CoachChat() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'practice' ? 'practice' : 'ask'
  const area = findFocusArea(searchParams.get('area'))

  function update(next: { tab?: 'practice' | 'ask'; area?: string | null }) {
    const params = new URLSearchParams(searchParams)
    if (next.tab !== undefined) {
      if (next.tab === 'ask') params.delete('tab')
      else params.set('tab', next.tab)
    }
    if (next.area !== undefined) {
      if (next.area) params.set('area', next.area)
      else params.delete('area')
    }
    setSearchParams(params)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta-600">Wivoza · Coaching</p>
        <h1 className="font-heading text-3xl font-extrabold text-forest md:text-4xl">
          Ask &amp; Practice<span className="text-gold">.</span>
        </h1>
        <p className="text-ink-soft">
          Ask a question about any part of the job, or rehearse it before it happens for real.
        </p>
        <Link
          to="/guide/ask-practice"
          className="mt-1 w-fit text-xs font-medium text-ink-soft underline decoration-hairline underline-offset-4 hover:text-terracotta"
        >
          New to this? Read the teacher's guide
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => update({ tab: 'ask' })}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === 'ask' ? 'bg-forest text-cream' : 'text-ink-soft hover:text-ink'
            }`}
          >
            Ask
          </button>
          <button
            type="button"
            onClick={() => update({ tab: 'practice' })}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === 'practice' ? 'bg-forest text-cream' : 'text-ink-soft hover:text-ink'
            }`}
          >
            Practice
          </button>
        </div>
        {/* Parent and colleague work overlaps Communication Coach on purpose: a
            quick question or one rehearsed exchange belongs here, an actual
            drafted email or a prepared meeting belongs there. One line, shown
            only once that area is in play. */}
        {area?.handoff && (
          <Link
            to={area.handoff.to}
            className="w-fit text-xs text-ink-soft underline decoration-hairline underline-offset-4 hover:text-terracotta"
          >
            {area.handoff.label}
          </Link>
        )}
      </div>

      {tab === 'practice' ? (
        <TryItOut focusArea={area?.value} onPickArea={(value) => update({ area: value })} />
      ) : (
        <Ask focusArea={area?.value} onPickArea={(value) => update({ area: value })} />
      )}
    </div>
  )
}
