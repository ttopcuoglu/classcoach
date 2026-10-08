import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { categoryLabel } from '../lib/categories'
import { challengeLabel } from '../lib/communicationOptions'
import {
  getSharedAttempt,
  getSharedConversationPrep,
  getSharedDebrief,
  getSharedLessonPlan,
  type SharedAttempt,
  type SharedConversationPrep,
  type SharedDebrief,
  type SharedLessonPlan,
} from '../lib/api'

type SharedContent = SharedAttempt | SharedDebrief | SharedLessonPlan | SharedConversationPrep

export default function Shared() {
  const { type, token } = useParams<{ type: string; token: string }>()
  const [content, setContent] = useState<SharedContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    const fetcher =
      type === 'debrief'
        ? getSharedDebrief(token)
        : type === 'lesson-plan'
          ? getSharedLessonPlan(token)
          : type === 'conversation-prep'
            ? getSharedConversationPrep(token)
            : getSharedAttempt(token)
    fetcher
      .then(setContent)
      .catch(() => setError('This link is invalid or has expired.'))
      .finally(() => setLoading(false))
  }, [type, token])

  return (
    <div className="min-h-screen bg-cream px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold text-ink-soft">Wivoza</p>
        <h1 className="mt-1 font-heading text-3xl font-extrabold text-forest">Shared from a colleague</h1>

        {loading ? (
          <p className="mt-8 text-sm text-ink-soft">Loading...</p>
        ) : error || !content ? (
          <p className="mt-8 text-sm text-terracotta-600">{error ?? 'Nothing to show.'}</p>
        ) : content.type === 'attempt' ? (
          <div className="mt-6 rounded-2xl border border-hairline bg-cream-card p-6">
            <span className="rounded-full bg-mint-tint/60 px-2.5 py-1 text-xs font-semibold text-forest">
              {categoryLabel(content.scenario.category)} · Grades {content.scenario.gradeBand}
            </span>
            <p className="mt-3 text-sm text-ink">{content.scenario.text}</p>

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">Response</p>
            <p className="mt-1 text-sm text-ink">{content.responseText}</p>

            {content.feedback && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-terracotta-600">Coaching</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.feedback}</p>
              </>
            )}
            {content.modelResponse && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-forest">
                  Model response
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.modelResponse}</p>
              </>
            )}
          </div>
        ) : content.type === 'debrief' ? (
          <div className="mt-6 rounded-2xl border border-hairline bg-cream-card p-6">
            {content.category && (
              <span className="rounded-full bg-mint-tint/60 px-2.5 py-1 text-xs font-semibold text-forest">
                {categoryLabel(content.category)}
              </span>
            )}
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              What happened
            </p>
            <p className="mt-1 text-sm text-ink">{content.incidentText}</p>

            {content.feedback && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-terracotta-600">Coaching</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.feedback}</p>
              </>
            )}
            {content.followUp && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-forest">
                  Following up
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.followUp}</p>
              </>
            )}
          </div>
        ) : content.type === 'lesson-plan' ? (
          <div className="mt-6 rounded-2xl border border-hairline bg-cream-card p-6">
            <span className="rounded-full bg-mint-tint/60 px-2.5 py-1 text-xs font-semibold text-forest">
              {content.mode !== 'generated'
                ? 'Lesson plan feedback'
                : content.planKind === 'ideas'
                  ? 'Teaching ideas'
                  : content.planKind === 'full'
                    ? 'Lesson plan'
                    : 'Sample lesson plan'}
            </span>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Objective</p>
            <p className="mt-1 text-sm text-ink">{content.objective}</p>
            {[content.approach, content.durationMinutes ? `${content.durationMinutes} min` : null]
              .filter(Boolean)
              .length > 0 && (
              <p className="mt-1 text-xs text-ink-soft">
                {[content.approach, content.durationMinutes ? `${content.durationMinutes} min` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}

            {/* Planning Coach's own shape. A plan built before it shipped has
                none of these and falls through to the five fields below. */}
            {content.successCriteria && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">Success criteria</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.successCriteria}</p>
              </>
            )}
            {content.materials && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">Materials</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.materials}</p>
              </>
            )}
            {(content.sequence ?? []).length > 0 && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-forest">The lesson</p>
                <ol className="mt-1 flex flex-col gap-3">
                  {(content.sequence ?? []).map((step, i) => (
                    <li key={i} className="rounded-xl border border-hairline bg-cream px-4 py-3">
                      <p className="text-sm font-semibold text-forest">
                        {i + 1}. {step.title}
                        {step.minutes != null ? ` · ${step.minutes} min` : ''}
                      </p>
                      {step.teacher && <p className="mt-1 whitespace-pre-wrap text-sm text-ink">You: {step.teacher}</p>}
                      {step.students && <p className="mt-1 whitespace-pre-wrap text-sm text-ink">Students: {step.students}</p>}
                    </li>
                  ))}
                </ol>
              </>
            )}
            {(content.checks ?? []).length > 0 && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">Checks for understanding</p>
                <ul className="mt-1 flex flex-col gap-2">
                  {(content.checks ?? []).map((check, i) => (
                    <li key={i} className="text-sm text-ink">
                      {check.when ? `${check.when}: ` : ''}
                      {check.check}
                      {check.lookFor ? ` — look for: ${check.lookFor}` : ''}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {(content.misconceptions ?? []).length > 0 && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">Likely misconceptions</p>
                <ul className="mt-1 flex flex-col gap-2">
                  {(content.misconceptions ?? []).map((item, i) => (
                    <li key={i} className="text-sm text-ink">
                      {item.belief}
                      {item.response ? ` — ${item.response}` : ''}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {content.exitTicket && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">Exit ticket</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.exitTicket.task}</p>
              </>
            )}
            {(content.quickIdeas ?? []).length > 0 && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-forest">Teaching ideas</p>
                <ol className="mt-1 flex flex-col gap-3">
                  {(content.quickIdeas ?? []).map((idea, i) => (
                    <li key={i}>
                      <p className="text-sm font-semibold text-forest">
                        {i + 1}. {idea.title}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{idea.how}</p>
                    </li>
                  ))}
                </ol>
              </>
            )}

            {content.planText && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">Plan</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.planText}</p>
              </>
            )}
            {content.feedback && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-terracotta-600">Coaching</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.feedback}</p>
              </>
            )}
            {content.doNow && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">Do Now</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.doNow}</p>
              </>
            )}
            {content.agenda && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">Agenda</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.agenda}</p>
              </>
            )}
            {content.closure && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">Closure</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.closure}</p>
              </>
            )}
            {content.hots && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-forest">
                  Higher-order thinking
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.hots}</p>
              </>
            )}
            {content.homework && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">Homework</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.homework}</p>
              </>
            )}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-hairline bg-cream-card p-6">
            {content.category && (
              <span className="rounded-full bg-mint-tint/60 px-2.5 py-1 text-xs font-semibold text-forest">
                {challengeLabel(content.category)}
              </span>
            )}
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Situation</p>
            <p className="mt-1 text-sm text-ink">{content.situationText}</p>

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">Planned response</p>
            <p className="mt-1 text-sm text-ink">{content.responseText}</p>

            {content.feedback && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-terracotta-600">Coaching</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.feedback}</p>
              </>
            )}
            {content.modelResponse && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-forest">
                  Model response
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.modelResponse}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
