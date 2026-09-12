import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ACCENTS,
  Callout,
  ChipRow,
  Prose,
  ReportCover,
  ReportFooter,
  ReportSection,
  ReportShell,
  ReportState,
  StatTile,
  TurnBubble,
  formatReportDate,
} from '../components/report'
import { getAssignmentCoachSession, type AssignmentCoachSession } from '../lib/api'

// Printable report for both Assignment Coach paths. Review produces a
// snapshot of an existing assignment; Redesign produces a rebuilt one. They
// share a session model, so the sections are picked per mode.

const AI_LEVEL_LABEL: Record<string, string> = {
  thinking_partner: 'AI as a thinking partner',
  limited: 'Limited AI use',
  no_ai: 'No AI use',
}

// Word labels, never numbers — the in-app snapshot deliberately has no score
// and the printed version must not quietly invent one.
const GRADE_FIT: Record<string, string> = {
  below: 'Likely below the intended level',
  appropriate: 'Appears grade-level appropriate',
  above: 'May be above the intended level',
  need_more_context: 'More context needed',
}
const MEANINGFUL: Record<string, string> = {
  clear_value: 'Clear learning value',
  some_repetition: 'Some low-value repetition',
  purpose_unclear: 'Purpose needs clarification',
  mostly_completion: 'Mostly completion-focused',
}
const AI_RISK: Record<string, string> = { high: 'High', moderate: 'Moderate', low: 'Low' }

export default function AssignmentCoachExport() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<AssignmentCoachSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    getAssignmentCoachSession(id).then(setSession).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  if (loading) return <ReportState text="Loading…" />
  if (!session) return <ReportState text="Assignment not found." />

  const A = ACCENTS
  const isRedesign = session.mode === 'redesign_ai'
  const snap = session.reviewSnapshot
  const ai = session.aiResistant
  const chat = (session.conversation ?? []).filter((m) => m.text?.trim())
  const chips = [
    session.assignmentType ?? null,
    session.gradeLevel ?? null,
    session.subject ?? null,
    session.estimatedTime ?? null,
    session.aiUseLevel ? AI_LEVEL_LABEL[session.aiUseLevel] ?? session.aiUseLevel : null,
  ].filter(Boolean) as string[]
  let n = 0

  return (
    <ReportShell backTo="/assignment-coach">
      <ReportCover
        eyebrow={`Wivoza · ${isRedesign ? 'Redesign for meaningful AI use' : 'Assignment review'}`}
        title={session.title || 'Assignment'}
        meta={formatReportDate(session.createdAt)}
        badge={session.status === 'completed' ? 'Completed' : undefined}
      />

      {snap?.mainOpportunity?.title && (
        <div className="mt-5 break-inside-avoid rounded-2xl bg-forest p-6 text-cream">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gold">Most important opportunity</p>
          <p className="mt-2 font-heading text-2xl font-extrabold leading-tight">{snap.mainOpportunity.title}</p>
          {snap.mainOpportunity.description && (
            <p className="mt-2 text-sm leading-relaxed text-cream/75">{snap.mainOpportunity.description}</p>
          )}
        </div>
      )}

      {chips.length > 0 && (
        <div className="mt-5">
          <ChipRow items={chips} accent={A.mint} />
        </div>
      )}

      {snap && (
        <>
          <ReportSection n={++n} title="The Snapshot" blurb="Every finding is a phrase with a reason. There are no scores anywhere." accent={A.terracotta}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatTile
                label="Grade fit"
                value={snap.gradeFit?.rating ? GRADE_FIT[snap.gradeFit.rating] ?? snap.gradeFit.rating : '—'}
                hint={snap.gradeFit?.explanation ?? 'Not enough evidence to judge.'}
                accent={A.mint}
              />
              <StatTile
                label="Thinking and rigor"
                value={snap.rigor?.label ?? '—'}
                hint={snap.rigor?.explanation ?? 'Not enough evidence to judge.'}
                accent={A.gold}
              />
              <StatTile
                label="Learning value"
                value={snap.meaningfulWork?.rating ? MEANINGFUL[snap.meaningfulWork.rating] ?? snap.meaningfulWork.rating : '—'}
                hint={snap.meaningfulWork?.explanation ?? 'Not enough evidence to judge.'}
                accent={A.terracotta}
              />
              <StatTile
                label="AI completion risk"
                value={snap.aiRisk?.rating ? AI_RISK[snap.aiRisk.rating] ?? snap.aiRisk.rating : '—'}
                hint={snap.aiRisk?.explanation ?? 'Not enough evidence to judge.'}
                accent={A.forest}
              />
            </div>
            {snap.purpose && <Callout label="What this assignment is for" body={snap.purpose} accent={A.mint} />}
            {snap.workloadSummary && <Callout label="Workload & clarity" body={snap.workloadSummary} accent={A.gold} />}
            {snap.meaningfulWork?.suggestion && (
              <Callout label="Worth trying" body={snap.meaningfulWork.suggestion} accent={A.terracotta} />
            )}
            {snap.aiRisk?.reasons && <Callout label="Why the AI risk reads this way" body={snap.aiRisk.reasons} accent={A.forest} />}
          </ReportSection>
        </>
      )}

      {ai && (
        <ReportSection n={++n} title="Redesigned for AI" blurb="Not AI-proof — designed so the thinking happens where you can see it." accent={A.gold}>
          {ai.aiRole?.explanation && (
            <Callout
              label={`AI use · ${ai.aiRole.level ? AI_LEVEL_LABEL[ai.aiRole.level] ?? ai.aiRole.level : 'recommended level'}`}
              body={ai.aiRole.explanation}
              accent={A.mint}
            />
          )}
          {ai.vulnerableSteps && <Callout label="Vulnerable steps" body={ai.vulnerableSteps} accent={A.terracotta} />}
          {(ai.thinkingSafeguards ?? ai.strategies) && (
            <Callout label="Thinking safeguards" body={(ai.thinkingSafeguards ?? ai.strategies) as string} accent={A.gold} />
          )}
        </ReportSection>
      )}

      {ai?.guidelines && (
        <ReportSection n={++n} title="Student AI Guidelines" blurb="Written for this task — ready to paste into the handout." accent={A.mint}>
          <Prose body={ai.guidelines} />
        </ReportSection>
      )}

      {(session.liveAssignmentText || ai?.revisedAssignment) && (
        <ReportSection n={++n} title="The Assignment" blurb="Your current working version, as you last edited it." accent={A.forest}>
          <Prose body={(session.liveAssignmentText || ai?.revisedAssignment) as string} />
        </ReportSection>
      )}

      {session.originalText && session.originalText !== session.liveAssignmentText && (
        <ReportSection n={++n} title="The Original" blurb="What you started with, kept for comparison." accent={A.terracotta}>
          <Prose body={session.originalText} />
        </ReportSection>
      )}

      {chat.length > 0 && (
        <ReportSection n={++n} title="The Conversation" blurb="What you asked, and what came back." accent={A.gold}>
          <div className="flex flex-col gap-3">
            {chat.map((m, i) => (
              <TurnBubble key={i} role={m.role} text={m.text} />
            ))}
          </div>
        </ReportSection>
      )}

      <ReportFooter note="Generated by Wivoza · wivoza.com · This reads assignments, not students. It makes no claim about any individual." />
    </ReportShell>
  )
}
