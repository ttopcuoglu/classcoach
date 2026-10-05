import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import TryItOut from './TryItOut'
import { DEFAULT_TEACHING_CONTEXT, type TeachingContext } from '../components/TeachingContextFields'
import { FOCUS_AREAS, findFocusArea } from '../lib/focusAreas'
import { SUBJECTS, bandFromProfile, subjectFromProfile } from '../lib/teachingContext'
import { getProfile } from '../lib/api'

// This was Ask & Practice, two tabs over one shared section and room. Asking is
// Talk It Through's job now — out loud or typed, both in one place — so what is
// left here is the thing Talk It Through cannot do: rehearse a moment against a
// scenario and get feedback on the words you actually used.
//
// The section stays above the scenario rather than inside it. Left on "Not sure
// yet" the coach picks, weighted toward what this teacher has practiced least,
// so it is a narrowing tool and not a required field.
//
// The room lives here rather than in TryItOut because the profile is fetched
// here: one call defaults the grade band and subject, and a teacher who has set
// them never types them again.
export default function Practice() {
  const [searchParams, setSearchParams] = useSearchParams()
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

  function pickArea(next: string | null) {
    const params = new URLSearchParams(searchParams)
    if (next) params.set('area', next)
    else params.delete('area')
    setSearchParams(params)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta-600">Wivoza · Coaching</p>
        <h1 className="font-heading text-3xl font-extrabold text-forest md:text-4xl">
          Practice<span className="text-gold">.</span>
        </h1>
        <p className="text-ink-soft">
          Rehearse a real classroom moment and get coaching on your response — before it happens for real.
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
                  onClick={() => pickArea(value)}
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
        {/* Parent and colleague work overlaps Communication Coach on purpose: one
            rehearsed exchange belongs here, an actual drafted email or a
            prepared meeting belongs there. */}
        {area?.handoff && (
          <Link
            to={area.handoff.to}
            className="w-fit text-xs text-ink-soft underline decoration-hairline underline-offset-4 hover:text-terracotta"
          >
            {area.handoff.label}
          </Link>
        )}
      </div>

      <TryItOut focusArea={area?.value} room={room} onRoomChange={setRoom} />
    </div>
  )
}
