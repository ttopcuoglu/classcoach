import { Link, useSearchParams } from 'react-router-dom'
import Ask from './Ask'
import TryItOut from './TryItOut'
import { FOCUS_AREAS, findFocusArea } from '../lib/focusAreas'

// Ask & Practice covers six areas now, and the area is the one choice that
// applies to both modes — the same teacher wanting help with grading may want
// to ask about it or rehearse a call on it, and switching modes shouldn't lose
// the area. So it lives here, in the shell, and is passed down to both tabs.
//
// It stays optional on purpose. A teacher who types "my class talks over
// directions" should never have to classify it first; the coach infers the area
// from the text. The picker is for Practice, where the coach has to decide what
// to hand them, and as a way to narrow Ask when the teacher already knows.
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

      {area ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-hairline bg-cream-card px-4 py-3">
          <p className="text-sm text-ink">
            <span className="font-semibold text-forest">{area.label}</span>
            <span className="text-ink-soft"> · {area.blurb}</span>
          </p>
          <button
            type="button"
            onClick={() => update({ area: null })}
            className="text-sm font-semibold text-terracotta-600 hover:text-terracotta"
          >
            Change
          </button>
          {/* Parent and colleague work overlaps Communication Coach on purpose:
              a quick question or one rehearsed exchange belongs here, an actual
              drafted email or a whole prepared meeting belongs there. */}
          {area.handoff && (
            <Link
              to={area.handoff.to}
              className="w-full text-xs text-ink-soft underline decoration-hairline underline-offset-4 hover:text-terracotta"
            >
              {area.handoff.label}
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-hairline bg-cream-card p-5">
          <p className="font-heading text-lg font-bold text-forest">What would you like to work on?</p>
          <p className="mt-1 text-sm text-ink-soft">
            Or skip this and start typing — your coach will work out which one it is.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {FOCUS_AREAS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => update({ area: a.value })}
                className={`rounded-2xl p-4 text-left transition-transform hover:-translate-y-0.5 ${a.tint}`}
              >
                <span className="block font-heading text-sm font-bold text-forest">{a.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-soft">{a.blurb}</span>
                <span className="mt-2 block text-xs italic leading-relaxed text-ink">
                  &ldquo;{tab === 'practice' ? a.practiceExample : a.askExample}&rdquo;
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

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

      {tab === 'practice' ? (
        <TryItOut focusArea={area?.value} />
      ) : (
        <Ask focusArea={area?.value} onPickArea={(value) => update({ area: value })} />
      )}
    </div>
  )
}
