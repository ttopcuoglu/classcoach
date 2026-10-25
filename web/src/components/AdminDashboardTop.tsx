import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCoachingPriorities, getPdFocusAreas, type PdFocusArea, type SchoolPriority } from '../lib/api'
import { adminPath } from '../lib/adminNav'
import { ArrowRightIcon, ChartBarIcon, GraduationCapIcon, LightbulbIcon } from './icons'

// The top of School Admin's Dashboard: the school's focus, then the three
// places to look further. Above the Dashboard's own reports, which stay as
// they were.
//
// Two different things are kept apart on purpose. A Coaching Priority is
// guidance teachers choose to bring into their coaching; a tracked focus area
// (Professional Learning) is a growth area followed in the lesson numbers.
// Neither line ever says how many teachers chose anything.

export function SchoolFocusCard({ organizationId }: { organizationId?: string }) {
  const [priorities, setPriorities] = useState<SchoolPriority[] | null>(null)
  const [tracked, setTracked] = useState<PdFocusArea[]>([])

  useEffect(() => {
    getCoachingPriorities(organizationId)
      .then((d) => setPriorities(d.items.filter((p) => p.status === 'active')))
      .catch(() => setPriorities([]))
    getPdFocusAreas(organizationId)
      .then((d) => setTracked(d.items.filter((i) => i.status === 'active')))
      .catch(() => setTracked([]))
  }, [organizationId])

  if (priorities == null) return null

  return (
    <section aria-labelledby="school-focus-card" className="rounded-3xl bg-forest p-6 text-cream sm:p-7">
      <p id="school-focus-card" className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">
        Your school&rsquo;s focus
      </p>
      {priorities.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {priorities.map((p) => (
            <p key={p.id} className="font-heading text-xl font-bold leading-snug">
              {p.name}
              <span className="ml-2 align-middle text-xs font-semibold text-cream/70">Coaching Priority · shared with teachers</span>
            </p>
          ))}
          <p className="text-sm text-cream/80">Teachers choose privately whether Wivoza brings it into their coaching.</p>
        </div>
      ) : (
        <p className="mt-2 font-heading text-xl font-bold leading-snug">No coaching priority shared yet.</p>
      )}
      {tracked.length > 0 && (
        <p className="mt-3 text-sm text-cream/80">
          Tracked growth area{tracked.length > 1 ? 's' : ''}: {tracked.map((t) => t.title).join(', ')}
        </p>
      )}
      <Link
        to={adminPath('coachingPriorities')}
        className="mt-4 inline-flex min-h-[40px] items-center gap-2 text-sm font-semibold text-gold hover:underline"
      >
        {priorities.length > 0 ? 'Review coaching priorities' : 'Set a coaching priority'}
        <ArrowRightIcon className="h-4 w-4" />
      </Link>
    </section>
  )
}

const EXPLORE = [
  { page: 'engagement' as const, title: 'Usage & Engagement', text: 'Activation, participation and returning users', icon: ChartBarIcon },
  { page: 'insights' as const, title: 'Coaching Insights', text: 'Patterns and opportunities across your school', icon: LightbulbIcon },
  { page: 'professionalLearning' as const, title: 'Professional Learning', text: 'Ideas for your next staff learning session', icon: GraduationCapIcon },
]

export function ExploreYourSchool() {
  return (
    <section aria-labelledby="explore-school">
      <h2 id="explore-school" className="font-heading text-lg font-bold text-forest">
        Explore your school
      </h2>
      <div className="mt-3 divide-y divide-hairline overflow-hidden rounded-3xl border border-hairline bg-cream-card">
        {EXPLORE.map(({ page, title, text, icon: Icon }) => (
          <Link
            key={page}
            to={adminPath(page)}
            className="flex min-h-[64px] items-center gap-4 px-5 py-4 transition-colors hover:bg-cream focus-visible:bg-cream focus-visible:outline-none"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sage text-forest">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-forest">{title}</span>
              <span className="block text-sm text-ink-soft">{text}</span>
            </span>
            <ArrowRightIcon className="h-4 w-4 shrink-0 text-ink-soft" />
          </Link>
        ))}
      </div>
    </section>
  )
}
