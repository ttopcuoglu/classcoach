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
import {
  challengeLabel,
  conversationDifficultyLabel,
  formatLabel,
  meetingFormatLabel,
  meetingTypeLabel,
  purposeLabel,
  recipientLabel,
  toneLabel,
} from '../lib/communicationOptions'
import {
  getConversationPlans,
  getConversationPreps,
  getParentMessages,
  type ConversationPlan,
  type ConversationPrep,
  type ParentMessage,
} from '../lib/api'

// One printable report covering all four Communication Coach tools. They sit
// on three different models, so the route carries the kind:
//   message  — Write a Message (ParentMessage)
//   meeting  — Prepare for a Meeting (ConversationPlan)
//   practice — Practice a Conversation / Review My Communication
//              (ConversationPrep, which distinguishes them by `source`)
export default function CommunicationExport() {
  const { kind, id } = useParams<{ kind: string; id: string }>()
  const [message, setMessage] = useState<ParentMessage | null>(null)
  const [plan, setPlan] = useState<ConversationPlan | null>(null)
  const [prep, setPrep] = useState<ConversationPrep | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const find = <T extends { id: string }>(all: T[]) => all.find((x) => x.id === id) ?? null
    const load =
      kind === 'meeting'
        ? getConversationPlans().then((all) => setPlan(find(all)))
        : kind === 'practice'
          ? getConversationPreps().then((all) => setPrep(find(all)))
          : getParentMessages().then((all) => setMessage(find(all)))
    load.catch(() => {}).finally(() => setLoading(false))
  }, [kind, id])

  if (loading) return <ReportState text="Loading…" />

  const A = ACCENTS
  let n = 0

  /* Prepare for a Meeting — the twelve-section plan. */
  if (kind === 'meeting') {
    if (!plan) return <ReportState text="Meeting plan not found." />
    const c = plan.planContent
    const chat = (plan.conversation ?? []).slice(2).filter((m) => m.text?.trim())
    return (
      <ReportShell backTo="/communications?tool=prepare">
        <ReportCover
          eyebrow="Wivoza · Prepare for a Meeting"
          title={plan.title || meetingTypeLabel(plan.meetingType) || 'Meeting plan'}
          meta={formatReportDate(plan.createdAt)}
        />
        <div className="mt-5">
          <ChipRow
            // Format belongs on paper next to the type: together they are what
            // tells you which meeting a printed plan is for. PrepareConversation
            // deliberately printed both pills, so the report must carry both.
            items={
              [meetingTypeLabel(plan.meetingType), meetingFormatLabel(plan.meetingFormat), plan.attendees].filter(
                Boolean,
              ) as string[]
            }
            accent={A.mint}
          />
        </div>
        <div className="mt-2 break-inside-avoid rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-6">
          <p className="text-[11px] font-bold uppercase tracking-wide text-terracotta-600">What the meeting is about</p>
          <p className="mt-2 text-base leading-relaxed text-ink">{plan.situationText}</p>
          {plan.desiredOutcome && <p className="mt-3 text-sm text-ink-soft">Hoping for: {plan.desiredOutcome}</p>}
        </div>

        {c && (
          <>
            <ReportSection n={++n} title="Going In" blurb="How to open, and what you are there to say." accent={A.terracotta}>
              {c.agenda && <Callout label="Suggested agenda" body={c.agenda} accent={A.terracotta} />}
              {c.opening && <Callout label="Suggested opening" body={c.opening} accent={A.gold} />}
              {c.mainConcern && <Callout label="Key talking points" body={c.mainConcern} accent={A.mint} />}
              {c.facts && <Callout label="Important facts to present" body={c.facts} accent={A.forest} />}
            </ReportSection>

            <ReportSection n={++n} title="In the Room" blurb="What they may say, and how to hold the line kindly." accent={A.gold}>
              {c.questions && <Callout label="Questions to ask" body={c.questions} accent={A.mint} />}
              {c.reactions && <Callout label="Possible reactions" body={c.reactions} accent={A.terracotta} />}
              {c.recommendedResponses && <Callout label="How to respond" body={c.recommendedResponses} accent={A.gold} />}
              {c.phrasesToAvoid && <Callout label="Language to avoid" body={c.phrasesToAvoid} accent={A.terracotta} />}
              {c.boundaries && <Callout label="Boundaries to maintain" body={c.boundaries} accent={A.forest} />}
            </ReportSection>

            {c.modelResponse && (
              <ReportSection n={++n} title="A Model Response" blurb="Read it aloud if the moment gets away from you." accent={A.mint}>
                <Prose body={c.modelResponse} />
              </ReportSection>
            )}

            <ReportSection n={++n} title="Closing & After" blurb="How to end it, and when it stops being yours alone." accent={A.forest}>
              {c.closing && <Callout label="Suggested closing" body={c.closing} accent={A.mint} />}
              {c.nextSteps && <Callout label="Next steps" body={c.nextSteps} accent={A.gold} />}
              {c.adminInvolvement && (
                <Callout label="When to involve an administrator" body={c.adminInvolvement} accent={A.terracotta} />
              )}
            </ReportSection>
          </>
        )}

        {chat.length > 0 && (
          <ReportSection n={++n} title="The Conversation" accent={A.gold}>
            <div className="flex flex-col gap-3">
              {chat.map((m, i) => (
                <TurnBubble key={i} role={m.role} text={m.text} />
              ))}
            </div>
          </ReportSection>
        )}
        <ReportFooter note="Generated by Wivoza · wivoza.com · Print this and take it into the room." />
      </ReportShell>
    )
  }

  /* Practice a Conversation / Review My Communication. */
  if (kind === 'practice') {
    if (!prep) return <ReportState text="Not found." />
    const isReview = prep.source === 'review'
    const r = prep.coachingReport
    const chat = (prep.conversation ?? []).slice(2).filter((m) => m.text?.trim())
    return (
      <ReportShell backTo={`/communications?tool=${isReview ? 'review' : 'practice'}`}>
        <ReportCover
          eyebrow={`Wivoza · ${isReview ? 'Review My Communication' : 'Practice a Conversation'}`}
          title={prep.title || (isReview ? 'A second read' : 'A rehearsal')}
          meta={formatReportDate(prep.createdAt)}
        />
        <div className="mt-5">
          <ChipRow
            items={[
              recipientLabel(prep.personType),
              challengeLabel(prep.category),
              // Stored as the validated enum, so printing it raw put
              // "highly_escalated" on paper.
              conversationDifficultyLabel(prep.difficulty),
              prep.gradeBand,
            ].filter(Boolean) as string[]}
            accent={A.mint}
          />
        </div>

        <ReportSection n={++n} title={isReview ? 'What You Received' : 'The Situation'} accent={A.terracotta}>
          <Prose body={prep.situationText} />
        </ReportSection>

        <ReportSection n={++n} title={isReview ? 'What You Planned to Say' : 'Your Response'} accent={A.gold}>
          <Prose body={prep.responseText} />
        </ReportSection>

        {r && (
          <ReportSection n={++n} title="Six Dimensions" blurb="Strong, developing or needs work — with the reason, never a score." accent={A.mint}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                ['Clarity', r.clarity],
                ['Empathy', r.empathy],
                ['Use of evidence', r.evidence],
                ['Professional boundaries', r.boundaries],
                ['Collaboration', r.collaboration],
                ['Resolution', r.resolution],
              ] as const).map(([label, d]) =>
                d ? <StatTile key={label} label={label} value={d.rating} hint={d.feedback} accent={A.mint} /> : null,
              )}
            </div>
            {r.didWell && <Callout label="What you did well" body={r.didWell} accent={A.mint} />}
            {r.priority && <Callout label="Your top priority" body={r.priority} accent={A.terracotta} />}
            {r.strongerPhrase && <Callout label="A stronger phrase to try" body={r.strongerPhrase} accent={A.gold} />}
            {r.nextStep && <Callout label="Next step" body={r.nextStep} accent={A.forest} />}
          </ReportSection>
        )}

        {prep.feedback && (
          <ReportSection n={++n} title="Coaching" accent={A.terracotta}>
            <Prose body={prep.feedback} />
          </ReportSection>
        )}

        {prep.modelResponse && (
          <ReportSection n={++n} title={isReview ? 'Revised Response' : 'A Model Response'} accent={A.forest}>
            <Prose body={prep.modelResponse} />
          </ReportSection>
        )}

        {chat.length > 0 && (
          <ReportSection n={++n} title="The Follow-Up" accent={A.gold}>
            <div className="flex flex-col gap-3">
              {chat.map((m, i) => (
                <TurnBubble key={i} role={m.role} text={m.text} />
              ))}
            </div>
          </ReportSection>
        )}
        <ReportFooter />
      </ReportShell>
    )
  }

  /* Write a Message. */
  if (!message) return <ReportState text="Message not found." />
  const chat = (message.conversation ?? []).slice(2).filter((m) => m.text?.trim())
  return (
    <ReportShell backTo="/communications?tool=write">
      <ReportCover
        eyebrow="Wivoza · Write a Message"
        title={message.title || 'Your message'}
        meta={formatReportDate(message.createdAt)}
      />
      <div className="mt-5">
        <ChipRow
          items={[
            recipientLabel(message.recipientType),
            purposeLabel(message.purpose),
            message.tone ? toneLabel(message.tone) : null,
            formatLabel(message.format),
          ].filter(Boolean) as string[]}
          accent={A.mint}
        />
      </div>

      <ReportSection n={++n} title="The Message" blurb="Ready to copy and send from your own account." accent={A.terracotta}>
        <Prose body={message.draftText} />
      </ReportSection>

      {(message.incidentSummary || message.receivedMessage || message.existingDraft) && (
        <ReportSection n={++n} title="What You Started From" accent={A.gold}>
          {message.receivedMessage && <Callout label="The message you received" body={message.receivedMessage} accent={A.terracotta} />}
          {message.incidentSummary && <Callout label="What needed saying" body={message.incidentSummary} accent={A.gold} />}
          {message.existingDraft && <Callout label="Your original draft" body={message.existingDraft} accent={A.mint} />}
        </ReportSection>
      )}

      {chat.length > 0 && (
        <ReportSection n={++n} title="How It Was Revised" blurb="Each request, and the version it produced." accent={A.forest}>
          <div className="flex flex-col gap-3">
            {chat.map((m, i) => (
              <TurnBubble key={i} role={m.role} text={m.text} />
            ))}
          </div>
        </ReportSection>
      )}

      <ReportFooter note="Generated by Wivoza · wivoza.com · Wivoza never sends anything. You send it yourself." />
    </ReportShell>
  )
}
