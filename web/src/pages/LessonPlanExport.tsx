import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getLessonPlan, type LessonPlan } from '../lib/api'

export default function LessonPlanExport() {
  const { id } = useParams<{ id: string }>()
  const [plan, setPlan] = useState<LessonPlan | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    getLessonPlan(id)
      .then(setPlan)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  return (
    <div className="min-h-screen bg-canvas px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <Link to="/lesson-planning" className="text-sm font-medium text-ink-soft hover:text-ink">
            ← Back
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
          >
            Print / Save as PDF
          </button>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-ink-soft">Loading...</p>
        ) : !plan ? (
          <p className="mt-8 text-sm text-ink-soft">Lesson plan not found.</p>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-ink">
              ClassCoach — {plan.mode === 'generated' ? 'Sample Lesson Plan' : 'Lesson Plan Feedback'}
            </h1>
            <p className="mt-1 text-sm text-ink-soft">
              {plan.unitName ? `${plan.unitName} · ` : ''}
              {plan.subject ? `${plan.subject} · ` : ''}
              {plan.gradeLevel || ''}
            </p>

            <section className="mt-6 break-inside-avoid rounded-xl border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Objective</p>
              <p className="mt-1 text-sm text-ink">{plan.objective}</p>
              {plan.standard && (
                <p className="mt-2 text-xs text-ink-soft">
                  <span className="font-semibold">Standard:</span> {plan.standard}
                </p>
              )}
              {plan.essentialQuestion && (
                <p className="mt-1 text-xs text-ink-soft">
                  <span className="font-semibold">Essential question:</span> {plan.essentialQuestion}
                </p>
              )}
            </section>

            {plan.mode === 'feedback' ? (
              <>
                {plan.planText && (
                  <section className="mt-4 break-inside-avoid rounded-xl border border-border p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Plan</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{plan.planText}</p>
                  </section>
                )}
                {plan.feedback && (
                  <section className="mt-4 break-inside-avoid rounded-xl border border-border p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Coaching</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{plan.feedback}</p>
                  </section>
                )}
              </>
            ) : (
              <>
                {plan.doNow && (
                  <section className="mt-4 break-inside-avoid rounded-xl border border-border p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Do Now</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{plan.doNow}</p>
                  </section>
                )}
                {plan.agenda && (
                  <section className="mt-4 break-inside-avoid rounded-xl border border-border p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Agenda</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{plan.agenda}</p>
                  </section>
                )}
                {plan.closure && (
                  <section className="mt-4 break-inside-avoid rounded-xl border border-border p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Closure</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{plan.closure}</p>
                  </section>
                )}
                {plan.hots && (
                  <section className="mt-4 break-inside-avoid rounded-xl border border-border p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                      Higher-order thinking
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{plan.hots}</p>
                  </section>
                )}
                {plan.homework && (
                  <section className="mt-4 break-inside-avoid rounded-xl border border-border p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Homework</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{plan.homework}</p>
                  </section>
                )}
                <p className="mt-6 break-inside-avoid text-xs text-ink-soft">
                  This is a sample plan generated for ideas — not a plan you're required to follow.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
