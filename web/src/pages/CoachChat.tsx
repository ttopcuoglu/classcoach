import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Ask from './Ask'
import TryItOut from './TryItOut'
import { DEFAULT_TEACHING_CONTEXT, type TeachingContext } from '../components/TeachingContextFields'
import { FOCUS_AREAS, findFocusArea } from '../lib/focusAreas'
import { SUBJECTS, bandFromProfile, subjectFromProfile } from '../lib/teachingContext'
import { getProfile } from '../lib/api'

// The section is the main choice on this screen, so it lives here, above the
// Ask/Practice switch, and both tabs read it. It is one row of chips rather
// than the card grid this started as — four options with a sentence each put
// eleven controls above the box where a teacher types.
//
// It stays optional on Ask: a teacher who writes "my class talks over
// directions" should never have to classify it first, and the coach infers the
// section from the text. On Practice the coach has to choose what to hand them,
// so leaving it on All means the coach picks, weighted toward what this teacher
// has practiced least.
//
// The room lives here for the same reason the section does: a teacher who sets
// their grade band on Ask and switches to Practice is still in the same room,
// and having each tab keep its own copy meant setting it twice — and fetching
// the profile twice to default it.
export default function CoachChat() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'practice' ? 'practice' : 'ask'
  const area = findFocusArea(searchParams.get('area'))
  const [room, setRoom] = useState<TeachingContext>(DEFAULT_TEACHING_CONTEXT)

  useEffect(() => {
    getProfile()
      .then((profile) => {
        const mapped = subjectFromProfile(profile.subjects)
        setRoom((prev) => ({
          ...prev,
          gradeBand: bandFromProfile(profile.gradeLevels),
          subject: mapped,
          // A profile subject that isn't one of the six lands in "Other".
          otherSubject: !!mapped && !(SUBJECTS as readonly string[]).includes(mapped),
        }))
      })
      .catch(() => {})
  }, [])

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
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
          What's this about?
        </p>
        <div className="flex flex-wrap gap-2">
          {[{ label: 'Not sure yet', value: null }, ...FOCUS_AREAS.map((a) => ({ label: a.label, value: a.value }))].map(
            ({ label, value }) => {
              const selected = (value ?? undefined) === area?.value
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => update({ area: value })}
                  aria-pressed={selected}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    selected ? 'bg-forest text-cream' : 'bg-cream-card text-ink-soft hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              )
            },
          )}
        </div>
        {area && <p className="text-xs text-ink-soft">{area.blurb}</p>}
        {/* Parent and colleague work overlaps Communication Coach on purpose: a
            quick question or one rehearsed exchange belongs here, an actual
            drafted email or a prepared meeting belongs there. */}
        {area?.handoff && (
          <Link
            to={area.handoff.to}
            className="w-fit text-xs text-ink-soft underline decoration-hairline underline-offset-4 hover:text-terracotta"
          >
            {area.handoff.label}
          </Link>
        )}
      </div>

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
        <TryItOut focusArea={area?.value} room={room} onRoomChange={setRoom} />
      ) : (
        <Ask
          focusArea={area?.value}
          onPickArea={(value) => update({ area: value })}
          room={room}
          onRoomChange={setRoom}
        />
      )}
    </div>
  )
}
