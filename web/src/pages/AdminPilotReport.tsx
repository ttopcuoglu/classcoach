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
import {
  describeSnapshot,
  describeTrend,
  PD_SUGGESTIONS,
  PRIORITY_LABELS,
  PRIORITY_MEANING,
  STRENGTH_MEANING,
} from '../lib/adminLabels'
import {
  getAdminBreakdown,
  getAdminFocusAreas,
  getAdminOverview,
  getPdFocusAreas,
  type AdminBreakdown,
  type AdminFocusAreas,
  type AdminOverview,
  type DataConfidence,
  type PdFocusArea,
} from '../lib/api'
import { FOCUS_METRIC_LABELS } from '../lib/focusMetrics'

// One printable page a principal can forward after a pilot — to a
// superintendent or a board who will read it cold, often only the first
// page. So it opens with the answer (At a glance), and every number says
// what it counts and what a good sign looks like, in the same words the
// admin dashboard uses (lib/adminLabels). Everything here comes from the
// admin endpoints, so it inherits their privacy rules: group comparisons
// need 5 teachers, focus areas need 3, and nothing names or singles out a
// teacher.

const FEATURE_ROWS: { key: keyof AdminOverview['featureAdoption']; label: string; what: string; unit: string }[] = [
  { key: 'lessonDebrief', label: 'Lesson Debrief', what: 'Record a lesson, get private feedback on it', unit: 'lessons analyzed' },
  { key: 'practiceReflect', label: 'Ask & Practice', what: 'Ask a coach, rehearse classroom moments', unit: 'questions and rehearsals' },
  { key: 'lessonPlanning', label: 'Lesson Planning', what: 'Draft or improve lesson plans', unit: 'plans' },
  { key: 'communications', label: 'Communication Coach', what: 'Messages home and hard conversations', unit: 'messages and meeting preps' },
]

function formatRange(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—'
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

// A number the data can't support yet prints as a dash with its reason,
// never a zero — same rule as every other report.
function shown(value: number | null, confidence: DataConfidence, format: (v: number) => string): string {
  return value == null || confidence === 'none' ? '—' : format(value)
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function AdminPilotReport() {
  const [params] = useSearchParams()
  const organizationId = params.get('organizationId') ?? undefined
  const startDate = params.get('startDate') ?? undefined
  const endDate = params.get('endDate') ?? undefined
  // Only used to print the published marketing sample (/samples/pilot-report.pdf)
  // from invented data, so it can never be mistaken for a real school's report.
  const isSample = params.get('sample') === '1'

  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [focus, setFocus] = useState<AdminFocusAreas | null>(null)
  const [byGrade, setByGrade] = useState<AdminBreakdown | null>(null)
  const [bySubject, setBySubject] = useState<AdminBreakdown | null>(null)
  const [tracked, setTracked] = useState<PdFocusArea[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getAdminOverview({ organizationId, startDate, endDate }),
      getAdminFocusAreas(organizationId),
      getAdminBreakdown({ by: 'gradeBand', organizationId }),
      getAdminBreakdown({ by: 'subject', organizationId }),
      // A school-wide report can still print without its focus areas.
      getPdFocusAreas(organizationId).catch(() => ({ items: [] as PdFocusArea[] })),
    ])
      .then(([o, f, g, s, pd]) => {
        setOverview(o)
        setFocus(f)
        setByGrade(g)
        setBySubject(s)
        setTracked(pd.items.filter((i) => i.status === 'active'))
      })
      .catch(() => setError('Could not load the pilot report.'))
  }, [organizationId, startDate, endDate])

  if (error) return <ReportState text={error} />
  if (!overview || !focus || !byGrade || !bySubject || !tracked) return <ReportState text="Loading…" />

  const A = ACCENTS
  const inst = overview.instructionalAverages
  const climate = overview.climateAverages
  const priorities = Object.entries(overview.priorityTally)
    .filter(([, v]) => v.count > 0)
    .sort((a, b) => b[1].count - a[1].count)
  const topPriorities = priorities.slice(0, 3)
  const groups = [...byGrade.breakdown, ...bySubject.breakdown].filter((g) => !g.suppressed)
  const activityChange = overview.activitiesThisWeek - overview.activitiesPriorWeek
  const { recentStrong, recentTotal, priorStrong, priorTotal } = overview.growth

  // The next need: the most common growth area nobody is tracking yet.
  const trackedKeys = new Set(tracked.map((t) => t.themeKey))
  const nextNeed = priorities.find(([key, v]) => !trackedKeys.has(key) && v.count >= 3)

  // At a glance — the four sentences for a reader who stops at page one.
  const glance: string[] = [
    `${overview.activeThisWeek} of ${overview.totalTeachers} teachers (${pct(overview.activeThisWeek, overview.totalTeachers)}) used Wivoza in this period, and ${overview.returningUsers} came back from the period before.`,
  ]
  for (const t of tracked) {
    const trend = describeTrend(t.baselineSnapshot, t.currentSnapshot)
    if (trend && t.baselineSnapshot.sharePct != null && t.currentSnapshot?.sharePct != null) {
      glance.push(
        `Since focusing on ${t.title.toLowerCase()} on ${formatDay(t.createdAt)}, it has gone from ${t.baselineSnapshot.sharePct}% of recorded lessons to ${t.currentSnapshot.sharePct}%.`,
      )
    }
  }
  if (overview.strengths[0]) {
    const s = overview.strengths[0]
    glance.push(`Clearest staff strength: ${s.label.toLowerCase()}, ${s.value}% ${STRENGTH_MEANING[s.label] ?? ''}`.trim())
  }
  if (nextNeed) {
    glance.push(
      `Suggested next focus: ${(PRIORITY_LABELS[nextNeed[0]] ?? nextNeed[0]).toLowerCase()}, which came up in ${plural(nextNeed[1].count, 'lesson', 'lessons')} across ${plural(nextNeed[1].teachers, 'teacher', 'teachers')}.`,
    )
  }

  let n = 0

  return (
    <ReportShell backTo="/admin">
      <ReportCover
        eyebrow="Wivoza · Pilot report"
        title={overview.organizationName ?? 'All schools'}
        meta={formatRange(overview.periodStart.slice(0, 10), overview.periodEnd.slice(0, 10))}
        badge={isSample ? 'Sample report · invented school' : 'Anonymous — no individual teacher data'}
      />

      <div className="mt-6 break-inside-avoid rounded-3xl bg-forest p-6 text-cream">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">At a glance</p>
        <ul className="mt-3 flex flex-col gap-2">
          {glance.map((line) => (
            <li key={line} className="flex gap-2.5 text-sm leading-relaxed">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
              {line}
            </li>
          ))}
        </ul>
      </div>

      <ReportSection n={++n} title="Adoption" blurb="How many of your staff are using Wivoza, and whether they keep coming back." accent={A.terracotta}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Licensed staff" value={String(overview.totalTeachers)} hint="Teachers with an account" accent={A.terracotta} />
          <StatTile
            label="Activated"
            value={String(overview.activatedAccounts)}
            hint={`${pct(overview.activatedAccounts, overview.totalTeachers)} finished setting up`}
            accent={A.terracotta}
          />
          <StatTile
            label="Active this period"
            value={String(overview.activeThisWeek)}
            hint={`${pct(overview.activeThisWeek, overview.totalTeachers)} of staff used it in these dates`}
            accent={A.gold}
          />
          <StatTile
            label="Came back"
            value={String(overview.returningUsers)}
            hint="Active this period and the one before: the habit signal"
            accent={A.mint}
          />
        </div>
        <p className="mt-4 text-sm text-ink-soft">
          {overview.activitiesThisWeek} coaching activities in these dates
          {overview.activitiesPriorWeek > 0 &&
            `, ${activityChange >= 0 ? 'up' : 'down'} ${Math.abs(activityChange)} from the period before`}
          .
          {recentTotal > 0 &&
            ` In practice scenarios, ${pct(recentStrong, recentTotal)} of responses were strong${
              priorTotal > 0 ? `, compared with ${pct(priorStrong, priorTotal)} the period before` : ''
            }. Ratings are private to Wivoza and never shown per teacher.`}
        </p>
      </ReportSection>

      <ReportSection n={++n} title="How Teachers Used It" blurb="How many teachers have used each part of Wivoza, and how often." accent={A.gold}>
        <div className="break-inside-avoid overflow-hidden rounded-2xl border border-hairline bg-white">
          {FEATURE_ROWS.map((row, i) => (
            <div
              key={row.key}
              className={`flex items-center justify-between gap-4 px-5 py-3 text-sm ${i > 0 ? 'border-t border-hairline' : ''}`}
            >
              <span>
                <span className="font-semibold text-forest">{row.label}</span>
                <span className="block text-xs text-ink-soft">{row.what}</span>
              </span>
              <span className="text-right text-ink-soft">
                <span className="font-semibold text-ink">{plural(overview.featureAdoption[row.key], 'teacher', 'teachers')}</span>
                {' · '}
                {overview.featureActivity[row.key]} {row.unit}
              </span>
            </div>
          ))}
        </div>
      </ReportSection>

      <ReportSection
        n={++n}
        title="What We Worked On"
        blurb="The school-wide focus areas you tracked, and whether they're showing up in fewer lessons."
        accent={A.mint}
      >
        {tracked.length === 0 ? (
          <Callout
            label="No focus area tracked yet"
            body="Pick a shared growth area in Professional Learning and Wivoza will show, in the next report, whether it's showing up in fewer lessons."
            accent={A.mint}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {tracked.map((t) => {
              const trend = describeTrend(t.baselineSnapshot, t.currentSnapshot)
              return (
                <div key={t.id} className="break-inside-avoid rounded-2xl bg-mint-tint/40 p-5">
                  <p className="font-heading text-lg font-bold text-forest">{t.title}</p>
                  <p className="text-xs text-ink-soft">
                    Tracked since {formatDay(t.createdAt)} · {PRIORITY_MEANING[t.themeKey] ?? ''}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-forest/60">When you started</p>
                      <p className="mt-0.5 text-sm font-semibold text-ink">{describeSnapshot(t.baselineSnapshot)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-forest/60">Since then</p>
                      <p className="mt-0.5 text-sm font-semibold text-ink">
                        {t.currentSnapshot && t.currentSnapshot.confidence !== 'none'
                          ? describeSnapshot(t.currentSnapshot)
                          : 'Not enough lessons yet'}
                      </p>
                    </div>
                  </div>
                  {trend && <p className="mt-3 text-sm font-semibold text-forest">{trend.text}</p>}
                  {t.suggestedAction && (
                    <p className="mt-2 text-sm text-ink">
                      <span className="font-semibold">PD: </span>
                      {capitalize(t.suggestedAction)}
                    </p>
                  )}
                </div>
              )
            })}
            <p className="text-xs text-ink-soft">
              The share of recorded lessons where this was the main area to grow. Lower is better: fewer lessons need it.
            </p>
          </div>
        )}
      </ReportSection>

      <ReportSection
        n={++n}
        title="What the Classrooms Show"
        blurb="School-wide averages from recorded lessons, never one teacher's, with what a good sign looks like."
        accent={A.forest}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Lessons analyzed"
            value={String(inst.totalAnalyzedSessions)}
            hint="Recorded by teachers, for their own feedback"
            accent={A.mint}
          />
          <StatTile
            label="Teacher talk"
            value={shown(inst.avgTeacherTalkPct, inst.talkConfidence, (v) => `${Math.round(v)}%`)}
            hint={inst.talkConfidence === 'none' ? 'Not enough lessons yet' : 'Share of the lesson. 65%+ in a lesson is flagged.'}
            accent={A.mint}
          />
          <StatTile
            label="Wait time"
            value={shown(inst.avgWaitTimeSec, inst.waitTimeConfidence, (v) => v.toFixed(1))}
            unit={inst.avgWaitTimeSec != null && inst.waitTimeConfidence !== 'none' ? 's' : undefined}
            hint={inst.waitTimeConfidence === 'none' ? 'Not enough lessons yet' : 'After a question. A good sign: 3s or more.'}
            accent={A.gold}
          />
          <StatTile
            label="Positive tone"
            value={shown(climate.positiveTonePct, climate.toneConfidence, (v) => `${Math.round(v)}%`)}
            hint={climate.toneConfidence === 'none' ? 'Not enough lessons yet' : 'Above 50%: more encouragement than correction.'}
            accent={A.terracotta}
          />
        </div>

        {(overview.strengths.length > 0 || topPriorities.length > 0) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {overview.strengths.length > 0 && (
              <Callout
                label="Shared strengths"
                body={overview.strengths.map((s) => `${s.label}: ${s.value}% ${STRENGTH_MEANING[s.label] ?? ''}`.trim()).join('\n')}
                accent={A.mint}
              />
            )}
            {topPriorities.length > 0 && (
              <Callout
                label="Most common growth areas"
                body={topPriorities
                  .map(
                    ([key, v]) =>
                      `${PRIORITY_LABELS[key] ?? key}: ${plural(v.count, 'lesson', 'lessons')}, ${plural(v.teachers, 'teacher', 'teachers')}. ${PRIORITY_MEANING[key] ?? ''}`.trim(),
                  )
                  .join('\n')}
                accent={A.gold}
              />
            )}
          </div>
        )}

        {groups.length > 0 && (
          <>
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
            <p className="mt-2 text-xs text-ink-soft">
              Read across a row to see where a need is concentrated. Lower teacher talk, and higher wait time and
              higher-order questions, are the good directions. Groups under 5 teachers are combined so no one can be
              singled out.
            </p>
          </>
        )}
      </ReportSection>

      <ReportSection
        n={++n}
        title="Where Teachers Are Focusing"
        blurb="The growth goal each teacher chose for themselves — where PD can meet them."
        accent={A.gold}
      >
        {focus.suppressed ? (
          <Callout
            label="Not enough yet"
            body={`This appears once at least ${focus.minTeachers} teachers have chosen a focus.`}
            accent={A.gold}
          />
        ) : (
          <div className="break-inside-avoid rounded-2xl bg-gold-tint/40 p-5">
            {focus.areas.map((area) => (
              <div key={area.metric} className="flex items-center justify-between gap-4 py-1 text-sm">
                <span className="text-ink">{FOCUS_METRIC_LABELS[area.metric] ?? area.metric}</span>
                <span className="font-semibold text-forest">{plural(area.count, 'teacher', 'teachers')}</span>
              </div>
            ))}
            {focus.otherCount > 0 && (
              <div className="flex items-center justify-between gap-4 py-1 text-sm">
                <span className="text-ink-soft">Other focus areas</span>
                <span className="text-ink-soft">{plural(focus.otherCount, 'teacher', 'teachers')}</span>
              </div>
            )}
            <p className="mt-2 text-xs text-ink-soft">
              A focus only one teacher chose is counted under &ldquo;other&rdquo;, so no one is identified by their choice.
            </p>
          </div>
        )}
      </ReportSection>

      {nextNeed && (
        <ReportSection
          n={++n}
          title="Recommended Next Step"
          blurb="The most common growth area the school isn't working on yet."
          accent={A.terracotta}
        >
          <div className="break-inside-avoid rounded-2xl bg-peach-tint/50 p-5">
            <p className="font-heading text-lg font-bold text-forest">{PRIORITY_LABELS[nextNeed[0]] ?? nextNeed[0]}</p>
            <p className="text-sm text-ink">
              Came up in {plural(nextNeed[1].count, 'lesson', 'lessons')} across {plural(nextNeed[1].teachers, 'teacher', 'teachers')}.{' '}
              {PRIORITY_MEANING[nextNeed[0]] ?? ''}
            </p>
            {PD_SUGGESTIONS[nextNeed[0]] && (
              <p className="mt-2 text-sm text-ink">
                <span className="font-semibold">Suggested PD: </span>
                {capitalize(PD_SUGGESTIONS[nextNeed[0]])}.
              </p>
            )}
          </div>
        </ReportSection>
      )}

      <ReportFooter note="Generated by Wivoza · wivoza.com · Anonymous by design: no teacher's recordings, conversations or ratings are included, and groups with fewer than 5 teachers are combined." />
    </ReportShell>
  )
}
