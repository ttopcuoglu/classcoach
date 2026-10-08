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
import { getLessonPlan, type LessonPlan } from '../lib/api'

// Printable report for all three Planning Coach modes. They share a data
// model but produce genuinely different documents, so the sections are
// chosen per mode rather than rendering empty shells for the others.
const MODE_LABEL: Record<string, string> = {
  generated: 'Build a Lesson',
  feedback: 'Improve a Lesson',
  presentation: 'Review Slides',
}

// The extracted slide text is written for Claude, not for the teacher: image
// slides carry a note telling the model it cannot see the picture, so it does
// not invent what the picture shows (see formatSlidesAsText in
// server/src/routes/lessonPlans.ts). That text is what gets saved, so a
// printed review repeated "its visual content is not visible to you" on every
// image slide — a sentence addressed to an AI, printed for a teacher.
//
// Rewritten here rather than at the source because the model still needs the
// note in follow-up questions, and because it fixes reviews already saved.
const AI_IMAGE_NOTE = /^(Slide \d+): \[This slide also contains at least one image — its visual content is not visible to you\.\]$/gm

function slideTextForTeacher(text: string): string {
  return text.replace(AI_IMAGE_NOTE, '$1 (includes an image):')
}

export default function LessonPlanExport() {
  const { id } = useParams<{ id: string }>()
  const [plan, setPlan] = useState<LessonPlan | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    getLessonPlan(id).then(setPlan).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  if (loading) return <ReportState text="Loading…" />
  if (!plan) return <ReportState text="Plan not found." />

  const A = ACCENTS
  const isPresentation = plan.mode === 'presentation'
  const review = plan.presentationReview
  const delivery = plan.deliveryCoaching
  // Feedback and presentation modes seed the conversation with the submitted
  // plan (or extracted slide text) and the first reply — both of which already
  // print above as their own sections. Printing them again doubled the length
  // of the report. Generated mode seeds nothing, so its first turns are real.
  // Matches LessonPlanning.tsx, which slices the same two turns in-app.
  const seeded = plan.mode === 'feedback' || plan.mode === 'presentation'
  const chat = (plan.conversation ?? []).slice(seeded ? 2 : 0).filter((m) => m.text?.trim())
  const isFullLesson = plan.mode === 'generated' && (plan.sequence?.length ?? 0) > 0
  const isIdeas = plan.mode === 'generated' && (plan.quickIdeas?.length ?? 0) > 0
  const context = [
    plan.subject,
    plan.gradeLevel,
    plan.unitName,
    plan.standard,
    plan.approach,
    plan.durationMinutes ? `${plan.durationMinutes} min` : null,
  ].filter(Boolean) as string[]
  let n = 0

  return (
    <ReportShell backTo="/lesson-planning">
      <ReportCover
        eyebrow={`Wivoza · ${MODE_LABEL[plan.mode] ?? 'Planning Coach'}`}
        title={plan.objective || (isPresentation ? plan.fileName || 'Presentation review' : 'Lesson plan')}
        meta={[
          formatReportDate(plan.createdAt),
          plan.slideCount ? `${plan.slideCount} slides` : null,
          plan.fileName && !isPresentation ? plan.fileName : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      />

      {plan.essentialQuestion && (
        <div className="mt-5 break-inside-avoid rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-6">
          <p className="text-[11px] font-bold uppercase tracking-wide text-terracotta-600">Essential question</p>
          <p className="mt-2 text-base leading-relaxed text-ink">{plan.essentialQuestion}</p>
        </div>
      )}

      {context.length > 0 && (
        <div className="mt-5">
          <ChipRow items={context} accent={A.mint} />
        </div>
      )}

      {/* Build a Lesson, Full Lesson — the lesson as Planning Coach built it. */}
      {isFullLesson && (
        <>
          {(plan.successCriteria || plan.materials) && (
            <ReportSection n={++n} title="The Goal" blurb="What students will be able to do, and what you need ready." accent={A.mint}>
              {plan.successCriteria && <Callout label="Students can show it when they" body={plan.successCriteria} accent={A.mint} />}
              {plan.materials && <Callout label="Materials" body={plan.materials} accent={A.forest} />}
            </ReportSection>
          )}

          <ReportSection n={++n} title="The Lesson" blurb="A draft to edit — not a script to follow." accent={A.terracotta}>
            {(plan.sequence ?? []).map((step, i) => (
              <Callout
                key={i}
                label={`${i + 1}. ${step.title}${step.minutes != null ? ` · ${step.minutes} min` : ''}`}
                body={[step.teacher && `You: ${step.teacher}`, step.students && `Students: ${step.students}`]
                  .filter(Boolean)
                  .join('\n\n')}
                accent={i % 2 === 0 ? A.terracotta : A.gold}
              />
            ))}
          </ReportSection>

          {(plan.checks ?? []).length > 0 && (
            <ReportSection n={++n} title="Checks for Understanding" blurb="Where to find out whether they are getting it." accent={A.mint}>
              {(plan.checks ?? []).map((check, i) => (
                <Callout
                  key={i}
                  label={check.when || 'During the lesson'}
                  body={[check.check, check.lookFor && `Look for: ${check.lookFor}`].filter(Boolean).join('\n\n')}
                  accent={A.mint}
                />
              ))}
            </ReportSection>
          )}

          {(plan.misconceptions ?? []).length > 0 && (
            <ReportSection
              n={++n}
              title="Likely Misconceptions"
              blurb="Common for this content at this grade — not a claim about your students."
              accent={A.gold}
            >
              {(plan.misconceptions ?? []).map((item, i) => (
                <Callout
                  key={i}
                  label={item.belief}
                  body={[item.surface && `Surface it: ${item.surface}`, item.response && `Address it: ${item.response}`]
                    .filter(Boolean)
                    .join('\n\n')}
                  accent={A.gold}
                />
              ))}
            </ReportSection>
          )}

          {plan.exitTicket && (
            <ReportSection n={++n} title="Exit Ticket" blurb="Aligned to the objective, with what the answers would tell you." accent={A.forest}>
              <Callout label="For students" body={plan.exitTicket.task} accent={A.forest} />
              {plan.exitTicket.expected && <Callout label="Expected answer" body={plan.exitTicket.expected} accent={A.mint} />}
              {plan.exitTicket.signals && (
                <Callout label="What different responses show" body={plan.exitTicket.signals} accent={A.gold} />
              )}
              {plan.exitTicket.nextStep && <Callout label="Suggested next step" body={plan.exitTicket.nextStep} accent={A.terracotta} />}
            </ReportSection>
          )}
        </>
      )}

      {/* Build a Lesson, Quick Ideas. */}
      {isIdeas && (
        <ReportSection n={++n} title="Teaching Ideas" blurb="Ideas to pull into the plan you are writing." accent={A.gold}>
          {(plan.quickIdeas ?? []).map((idea, i) => (
            <Callout key={i} label={`${i + 1}. ${idea.title}`} body={idea.how} accent={i % 2 === 0 ? A.gold : A.mint} />
          ))}
        </ReportSection>
      )}

      {/* The five-slot sample plans generated before Planning Coach. Still in
          teachers' histories, still printed exactly as they were. */}
      {plan.mode === 'generated' && !isFullLesson && !isIdeas && (
        <>
          <ReportSection n={++n} title="The Lesson" blurb="A sample day to adapt — not a script to follow." accent={A.terracotta}>
            {plan.doNow && <Callout label="Do Now" body={plan.doNow} accent={A.terracotta} />}
            {plan.agenda && <Callout label="Agenda · I Do / We Do / You Do" body={plan.agenda} accent={A.gold} />}
            {plan.closure && <Callout label="Closure" body={plan.closure} accent={A.mint} />}
          </ReportSection>

          {(plan.hots || plan.homework) && (
            <ReportSection n={++n} title="Thinking & Follow-Up" blurb="The part that asks for more than recall." accent={A.gold}>
              {plan.hots && <Callout label="Higher-order thinking" body={plan.hots} accent={A.gold} />}
              {plan.homework && <Callout label="Homework" body={plan.homework} accent={A.forest} />}
            </ReportSection>
          )}
        </>
      )}

      {/* Improve a Lesson — the teacher's own plan, then the coaching on it. */}
      {plan.mode === 'feedback' && (
        <>
          {plan.planText && (
            <ReportSection n={++n} title="Your Plan" blurb="As you submitted it." accent={A.forest}>
              <Prose body={plan.planText} />
            </ReportSection>
          )}
          {plan.feedback && (
            <ReportSection n={++n} title="Coaching" blurb="What's working, and where it will wobble." accent={A.terracotta}>
              <Prose body={plan.feedback} />
            </ReportSection>
          )}
        </>
      )}

      {/* Review Slides — five named reads. */}
      {isPresentation && review && (
        <ReportSection n={++n} title="Presentation Review" blurb="Five reads on the deck you built." accent={A.terracotta}>
          {([
            ['Grade-level fit', review.gradeLevelFit, A.mint],
            ['Visuals', review.visuals, A.gold],
            ['Ideas', review.ideas, A.terracotta],
            ['Length', review.length, A.mint],
            ['Implementation', review.implementation, A.forest],
          ] as const).map(([label, body, accent]) => (body ? <Callout key={label} label={label} body={body} accent={accent} /> : null))}
        </ReportSection>
      )}

      {isPresentation && plan.planText && (
        <ReportSection n={++n} title="Slide Text" blurb="The extracted text the review was based on." accent={A.forest}>
          <Prose body={slideTextForTeacher(plan.planText)} />
        </ReportSection>
      )}

      {/* Delivery coaching — generated and feedback modes only. */}
      {delivery && (
        <ReportSection n={++n} title="Presentation & Delivery" blurb="How to actually teach it, not just what is in it." accent={A.gold}>
          {([
            ['Opening hook', delivery.openingHook],
            ['Pacing & timing', delivery.pacing],
            ['Engagement checkpoints', delivery.engagementCheckpoints],
            ['Explaining the hard part', delivery.explainingTheHardPart],
            ['Closing', delivery.closing],
          ] as const).map(([label, body]) => (body ? <Callout key={label} label={label} body={body} accent={A.gold} /> : null))}
        </ReportSection>
      )}

      {plan.suggestedRevision && (
        <ReportSection n={++n} title="Suggested Revision" blurb="Offered, never applied. Take the parts that fit your class." accent={A.mint}>
          <Prose body={plan.suggestedRevision} />
        </ReportSection>
      )}

      {chat.length > 0 && (
        <ReportSection n={++n} title="The Conversation" blurb="Your follow-up questions and the answers." accent={A.forest}>
          <div className="flex flex-col gap-3">
            {chat.map((m, i) => (
              <TurnBubble key={i} role={m.role} text={m.text} />
            ))}
          </div>
        </ReportSection>
      )}

      {plan.mode === 'generated' && (
        <div className="mt-6 break-inside-avoid rounded-2xl bg-gold-tint/50 p-5 text-center">
          <StatTile
            label="Remember"
            value="A starting point"
            hint="This is a draft. It has never met your class — adjust it."
            accent={A.gold}
          />
        </div>
      )}

      <ReportFooter />
    </ReportShell>
  )
}
