import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ACCENTS,
  Callout,
  ReportCover,
  ReportFooter,
  ReportSection,
  ReportShell,
  ReportState,
  StatTile,
} from '../components/report'
import { PRIORITY_LABELS } from '../lib/adminLabels'
import {
  getAdminBreakdown,
  getAdminFocusAreas,
  getAdminOverview,
  type AdminBreakdown,
  type AdminFocusAreas,
  type AdminOverview,
  type DataConfidence,
} from '../lib/api'
import { FOCUS_METRIC_LABELS } from '../lib/focusMetrics'

// One printable page a principal can forward after a pilot: who used Wivoza,
// how, what teachers chose to work on, and what the anonymous classroom data
// shows. Everything here comes from the same endpoints as the admin panel,
// so it inherits their privacy rules — group comparisons need 5 teachers,
// focus areas need 3, and nothing names or singles out a teacher.

const FEATURE_ROWS: { key: keyof AdminOverview['featureAdoption']; label: string; unit: string }[] = [
  { key: 'lessonDebrief', label: 'Lesson Debrief', unit: 'lessons analyzed' },
  { key: 'practiceReflect', label: 'Ask & Practice', unit: 'questions and rehearsals' },
  { key: 'lessonPlanning', label: 'Lesson Planning', unit: 'plans' },
  { key: 'communications', label: 'Communication Coach', unit: 'messages and meeting preps' },
]

function formatRange(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—'
}

// A number the data can't support yet prints as a dash with its reason,
// never a zero — same rule as every other report.
function shown(value: number | null, confidence: DataConfidence, format: (v: number) => string): string {
  return value == null || confidence === 'none' ? '—' : format(value)
}

export default function AdminPilotReport() {
  const [params] = useSearchParams()
  const organizationId = params.get('organizationId') ?? undefined
  const startDate = params.get('startDate') ?? undefined
  const endDate = params.get('endDate') ?? undefined

  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [focus, setFocus] = useState<AdminFocusAreas | null>(null)
  const [byGrade, setByGrade] = useState<AdminBreakdown | null>(null)
  const [bySubject, setBySubject] = useState<AdminBreakdown | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getAdminOverview({ organizationId, startDate, endDate }),
      getAdminFocusAreas(organizationId),
      getAdminBreakdown({ by: 'gradeBand', organizationId }),
      getAdminBreakdown({ by: 'subject', organizationId }),
    ])
      .then(([o, f, g, s]) => {
        setOverview(o)
        setFocus(f)
        setByGrade(g)
        setBySubject(s)
      })
      .catch(() => setError('Could not load the pilot report.'))
  }, [organizationId, startDate, endDate])

  if (error) return <ReportState text={error} />
  if (!overview || !focus || !byGrade || !bySubject) return <ReportState text="Loading…" />

  const A = ACCENTS
  const inst = overview.instructionalAverages
  const climate = overview.climateAverages
  const topPriorities = Object.entries(overview.priorityTally)
    .filter(([, v]) => v.count > 0)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
  const groups = [...byGrade.breakdown, ...bySubject.breakdown].filter((g) => !g.suppressed)
  const activityChange = overview.activitiesThisWeek - overview.activitiesPriorWeek
  let n = 0

  return (
    <ReportShell backTo="/admin">
      <ReportCover
        eyebrow="Wivoza · Pilot report"
        title={overview.organizationName ?? 'All schools'}
        meta={formatRange(overview.periodStart.slice(0, 10), overview.periodEnd.slice(0, 10))}
        badge="Anonymous — no individual teacher data"
      />

      <ReportSection n={++n} title="Adoption" blurb="How many of your staff are using Wivoza." accent={A.terracotta}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Licensed staff" value={String(overview.totalTeachers)} accent={A.terracotta} />
          <StatTile
            label="Activated"
            value={String(overview.activatedAccounts)}
            hint={`${pct(overview.activatedAccounts, overview.totalTeachers)} of staff`}
            accent={A.terracotta}
          />
          <StatTile
            label="Active this period"
            value={String(overview.activeThisWeek)}
            hint={`${pct(overview.activeThisWeek, overview.totalTeachers)} of staff`}
            accent={A.gold}
          />
          <StatTile
            label="Came back"
            value={String(overview.returningUsers)}
            hint="Active this period and the one before"
            accent={A.mint}
          />
        </div>
        <p className="mt-4 text-sm text-ink-soft">
          {overview.activitiesThisWeek} coaching activities this period
          {overview.activitiesPriorWeek > 0 &&
            ` — ${activityChange >= 0 ? 'up' : 'down'} ${Math.abs(activityChange)} from the period before`}
          .
        </p>
      </ReportSection>

      <ReportSection n={++n} title="How Teachers Used It" blurb="Teachers who used each part of Wivoza, and how often." accent={A.gold}>
        <div className="break-inside-avoid overflow-hidden rounded-2xl border border-hairline bg-white">
          {FEATURE_ROWS.map((row, i) => (
            <div
              key={row.key}
              className={`flex items-center justify-between gap-4 px-5 py-3 text-sm ${i > 0 ? 'border-t border-hairline' : ''}`}
            >
              <span className="font-semibold text-forest">{row.label}</span>
              <span className="text-ink-soft">
                <span className="font-semibold text-ink">{overview.featureAdoption[row.key]} teachers</span>
                {' · '}
                {overview.featureActivity[row.key]} {row.unit}
              </span>
            </div>
          ))}
        </div>
      </ReportSection>

      <ReportSection
        n={++n}
        title="Where Teachers Are Focusing"
        blurb="The growth focus teachers chose for themselves."
        accent={A.mint}
      >
        {focus.suppressed ? (
          <Callout
            label="Not enough yet"
            body={`This appears once at least ${focus.minTeachers} teachers have chosen a focus.`}
            accent={A.mint}
          />
        ) : (
          <div className="break-inside-avoid rounded-2xl bg-mint-tint/40 p-5">
            {focus.areas.map((area) => (
              <div key={area.metric} className="flex items-center justify-between gap-4 py-1 text-sm">
                <span className="text-ink">{FOCUS_METRIC_LABELS[area.metric] ?? area.metric}</span>
                <span className="font-semibold text-forest">{area.count} teachers</span>
              </div>
            ))}
            {focus.otherCount > 0 && (
              <div className="flex items-center justify-between gap-4 py-1 text-sm">
                <span className="text-ink-soft">Other focus areas</span>
                <span className="text-ink-soft">
                  {focus.otherCount} {focus.otherCount === 1 ? 'teacher' : 'teachers'}
                </span>
              </div>
            )}
          </div>
        )}
      </ReportSection>

      <ReportSection
        n={++n}
        title="What the Classrooms Show"
        blurb="School-wide averages from recorded lessons — never one teacher's."
        accent={A.forest}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Lessons analyzed"
            value={String(inst.totalAnalyzedSessions)}
            accent={A.mint}
          />
          <StatTile
            label="Teacher talk"
            value={shown(inst.avgTeacherTalkPct, inst.talkConfidence, (v) => `${Math.round(v)}%`)}
            hint={inst.talkConfidence === 'none' ? 'Not enough lessons yet' : undefined}
            accent={A.mint}
          />
          <StatTile
            label="Wait time"
            value={shown(inst.avgWaitTimeSec, inst.waitTimeConfidence, (v) => v.toFixed(1))}
            unit={inst.avgWaitTimeSec != null && inst.waitTimeConfidence !== 'none' ? 's' : undefined}
            hint={inst.waitTimeConfidence === 'none' ? 'Not enough lessons yet' : undefined}
            accent={A.gold}
          />
          <StatTile
            label="Positive tone"
            value={shown(climate.positiveTonePct, climate.toneConfidence, (v) => `${Math.round(v)}%`)}
            hint={climate.toneConfidence === 'none' ? 'Not enough lessons yet' : undefined}
            accent={A.terracotta}
          />
        </div>

        {(overview.strengths.length > 0 || topPriorities.length > 0) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {overview.strengths.length > 0 && (
              <Callout
                label="Shared strengths"
                body={overview.strengths.map((s) => `${s.label} — ${s.value}%`).join('\n')}
                accent={A.mint}
              />
            )}
            {topPriorities.length > 0 && (
              <Callout
                label="Most common growth areas"
                body={topPriorities
                  .map(([key, v]) => `${PRIORITY_LABELS[key] ?? key} — ${v.teachers} ${v.teachers === 1 ? 'teacher' : 'teachers'}`)
                  .join('\n')}
                accent={A.gold}
              />
            )}
          </div>
        )}

        {groups.length > 0 && (
          <div className="mt-4 break-inside-avoid overflow-hidden rounded-2xl border border-hairline bg-white">
            <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] gap-2 bg-cream px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-forest/70">
              <span>By grade & subject · all lessons to date</span>
              <span className="text-right">Teacher talk</span>
              <span className="text-right">Wait time</span>
              <span className="text-right">Higher-order Qs</span>
            </div>
            {groups.map((g) =>
              g.suppressed ? null : (
                <div
                  key={`${g.bucket}-${g.teacherCount}`}
                  className="grid grid-cols-[1.6fr_1fr_1fr_1fr] gap-2 border-t border-hairline px-5 py-2.5 text-sm"
                >
                  <span>
                    <span className="font-semibold text-forest">{g.bucket}</span>
                    <span className="block text-xs text-ink-soft">
                      {g.teacherCount} teachers{g.combined ? ` · ${g.combined.join(', ')} combined` : ''}
                    </span>
                  </span>
                  <span className="text-right text-ink">
                    {shown(g.metrics.avgTeacherTalkPct, g.metrics.talkConfidence, (v) => `${Math.round(v)}%`)}
                  </span>
                  <span className="text-right text-ink">
                    {shown(g.metrics.avgWaitTimeSec, g.metrics.waitTimeConfidence, (v) => `${v.toFixed(1)}s`)}
                  </span>
                  <span className="text-right text-ink">
                    {shown(g.metrics.higherOrderPct, g.metrics.higherOrderConfidence, (v) => `${v}%`)}
                  </span>
                </div>
              ),
            )}
          </div>
        )}
      </ReportSection>

      <ReportFooter note="Generated by Wivoza · wivoza.com · Anonymous by design: no teacher's recordings, conversations or ratings are included, and groups with fewer than 5 teachers are combined." />
    </ReportShell>
  )
}
