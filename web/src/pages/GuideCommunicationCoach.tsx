import { Link } from 'react-router-dom'
import {
  ChatBubbleIcon,
  CheckIcon,
  ChecklistIcon,
  ClockIcon,
  HeartIcon,
  MailIcon,
  QuoteIcon,
  ScenarioIcon,
  ShieldIcon,
  TargetIcon,
} from '../components/icons'
import {
  GuideClosing,
  GuideHero,
  GuidePathway,
  GuidePrimaryButton,
  GuideSample,
  GuideSection,
  GuideShell,
} from '../components/featureGuide'

// Teacher's guide to Communication Coach. Layout and section order come from
// components/featureGuide.tsx; everything below is content only.

const BENEFITS = [
  { title: 'Don’t send the 9pm reply', body: 'The message you write angry is never the message you’d have written Tuesday.' },
  { title: 'Walk in with an agenda', body: 'A meeting you’ve planned goes differently from one you show up to.' },
  { title: 'Rehearse the version that goes badly', body: 'Practice at “highly escalated” and the real thing feels manageable.' },
  { title: 'Say the hard thing without the edge', body: 'Firm and direct is a tone you can pick. So is warm.' },
  { title: 'Reach families in their language', body: 'One tap translates a finished message and keeps the tone intact.' },
  { title: 'Know when it’s not yours alone', body: 'Every plan gives honest guidance on when to involve an administrator.' },
  { title: 'Have your facts in order', body: 'What to bring, what to ask, what to avoid saying — before you’re in the room.' },
]

const MOMENTS = [
  'An angry email landed and you want to reply right now',
  'A conference is on Thursday and you haven’t thought about it',
  'You need to deliver bad news to a family kindly',
  'A colleague conversation keeps getting postponed',
  'You have an IEP or 504 meeting and you’re not leading it',
  'A post-observation meeting you’re nervous about',
  'You wrote a reply and something about it feels off',
]

const LANES = [
  {
    icon: MailIcon,
    name: 'Write a Message',
    when: 'It needs to be in writing.',
    detail:
      'Start fresh, reply to something you received, or polish a draft you already wrote. Pick who it’s to, what it’s about, the tone, and the format — email, text, announcement, or a phone-call follow-up.',
  },
  {
    icon: ChecklistIcon,
    name: 'Prepare for a Meeting',
    when: 'It’s on the calendar.',
    detail:
      'A full plan for a real upcoming meeting — conference, IEP or 504, post-observation, department, or a hard colleague conversation. Agenda, talking points, facts, likely reactions, and how to close.',
  },
  {
    icon: ScenarioIcon,
    name: 'Practice a Conversation',
    when: 'You’re dreading it.',
    detail:
      'Role-play it first. Choose who you’re facing, the kind of challenge, and how hard they push — supportive, concerned, resistant, or highly escalated. Respond by typing or speaking.',
  },
  {
    icon: ChatBubbleIcon,
    name: 'Review My Communication',
    when: 'It’s written but not sent.',
    detail:
      'Paste what you received and what you plan to say. Ask for feedback only, a rewrite only, or both — then push on the result with Make warmer, Make firmer, or Shorten.',
  },
]

const STEPS = [
  {
    title: 'Pick the tool by where you are',
    body: 'Not by how important it is — by whether the thing has happened yet, whether it’s written or spoken, and whether you already have a draft.',
  },
  {
    title: 'Say what happened',
    body: 'In every tool, one free-text field is the only required one: what’s going on. Recipient, purpose, tone, format, meeting type, attendees, difficulty — all optional context that sharpens what comes back.',
  },
  {
    title: 'Work on the result, don’t just accept it',
    body: 'Every output has quick actions and an open chat. Make it warmer, make it firmer, shorten it, simplify the reading level, translate it, or ask for a different version entirely.',
  },
  {
    title: 'Hand it to the next tool',
    body: 'A finished meeting plan has two buttons: Practice This Meeting, and Create a Follow-Up Message. The situation carries over — you don’t retype it.',
  },
]

const PLAN_PARTS = [
  'Suggested meeting agenda',
  'Suggested opening',
  'Key talking points',
  'Important facts to present',
  'Questions to ask',
  'Possible reactions',
  'How to respond',
  'Language to avoid',
  'Boundaries to maintain',
  'Suggested closing',
  'Next steps',
  'When to involve an administrator',
]

const DIMENSIONS = ['Clarity', 'Empathy', 'Use of evidence', 'Professional boundaries', 'Collaboration', 'Resolution']

const STORY = [
  'At 9:40 on a Tuesday night, Ms. Iyer gets an email from a parent about a grade. It uses the word “unfair” twice and asks to meet with her and an administrator.',
  'She writes a reply immediately. It is, she knows even as she writes it, the wrong reply — three paragraphs defending the rubric.',
  'She pastes both the email and her draft into Review My Communication and asks for both feedback and a rewrite. The coaching is blunt about the problem: her second paragraph litigates the grade instead of opening a conversation, and a parent reading it will hear a wall.',
  'She takes the revised version, makes it slightly firmer than the suggestion, and schedules it for the morning rather than sending it at 9:52pm.',
  'Then she opens Prepare for a Meeting, picks “Parent or family conference,” and gets an agenda, the facts worth bringing, the reactions she should expect, the phrases to avoid — and a straight answer on whether an administrator belongs in the room.',
  'Before Thursday she runs it once in Practice at “highly escalated,” which goes worse than the real meeting does. The real one isn’t pleasant. But nobody raises their voice, and it ends with a plan.',
]

const DEBRIEF_QUESTIONS = [
  'What did you try?',
  'What happened?',
  'What seemed to help?',
  'What would you adjust next time?',
  'What’s your next step?',
]

const DEBRIEF_RETURNS = [
  { title: 'A short summary', body: 'What you learned, in a few lines you can actually reread.' },
  { title: 'One honest observation', body: 'Something you did well — named specifically, not flattered.' },
  { title: 'One practical next step', body: 'The single thing worth carrying into the next hard conversation.' },
]

const DEBRIEF_ACTIONS = [
  { label: 'Continue This Conversation', body: 'Keep talking if the debrief opened something up.' },
  { label: 'Set a Next Step', body: 'Write down the one thing you’re committing to.' },
  { label: 'Save My Reflection', body: 'Keep it for the next time this family or colleague comes up.' },
  { label: 'Start a New Talk It Through', body: 'Begin fresh on something else.' },
]

function SamplePlanExcerpt() {
  const sections = [
    {
      label: 'Suggested opening',
      value:
        '“Thanks for making time. I want to start by hearing how you’re seeing this, and then walk you through what I’ve been tracking.”',
    },
    {
      label: 'Key talking points',
      value:
        '- The grade reflects four assignments, not one.\n- Two were late; both were accepted at full credit.\n- The pattern changed in November, not at the start of the term.',
    },
    {
      label: 'Possible reactions',
      value:
        '- “You never told us.” Expect this early. Don’t litigate it — move to what happens next.\n- Silence. Give it room before filling it.',
    },
    {
      label: 'When to involve an administrator',
      value:
        'Not yet. Loop one in only if the conversation turns to your competence rather than the student’s work, or if a second meeting is requested with one present.',
    },
  ]
  return (
    <GuideSample
      title="Prepare for a Meeting · Your plan"
      caption="An illustration — four of the twelve sections a real plan returns, plus the pills naming what it was built from."
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {['Parent or family conference', 'Video call'].map((pill) => (
          <span key={pill} className="rounded-full border border-border bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink-soft">
            {pill}
          </span>
        ))}
      </div>
      {sections.map((s) => (
        <div key={s.label} className="rounded-xl border border-border bg-canvas p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{s.label}</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{s.value}</p>
        </div>
      ))}
    </GuideSample>
  )
}

export default function GuideCommunicationCoach() {
  return (
    <GuideShell appTo="/communications">
      <GuideHero
        icon={MailIcon}
        title="Communication Coach"
        paragraphs={[
          'Four tools behind one door, for the four places you can be standing when a hard conversation is coming: it needs writing, it’s on the calendar, you’re dreading it, or you’ve drafted a reply and something feels off.',
          'None of it speaks for you. It helps you find the words, plan the room, rehearse the worst version, and get a second read before you hit send.',
        ]}
      />

      <GuidePathway />

      <div className="mx-auto w-full max-w-4xl px-6">
        {/* Why it helps + when */}
        <GuideSection
          id="why-it-helps"
          eyebrow="Why it helps"
          title="Nothing good is written at 9:52pm"
          lede="The hard part was never the vocabulary. It’s that these conversations arrive when you’re tired, alone, and holding the least generous version of the story."
        >
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <div key={b.title} className="flex items-start gap-3 rounded-2xl border border-hairline bg-cream-card p-5">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
                <div>
                  <p className="font-semibold text-forest">{b.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{b.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-2xl border-l-4 border-gold bg-gold-tint/40 p-5">
            <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-terracotta-600" />
            <p className="text-sm leading-relaxed text-forest">
              Coach refers to people by role — “a student,” “the parent,” “your colleague” — even when you use
              a name yourself. And on the guidance that matters most: when a situation genuinely warrants
              looping in an administrator, it says so plainly rather than leaving you to carry it alone.
            </p>
          </div>

          <div className="mt-10">
            <h3 className="flex items-center gap-2.5 font-heading text-lg font-bold text-forest">
              <ClockIcon className="h-5 w-5 text-terracotta-600" />
              Good times to open it
            </h3>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {MOMENTS.map((m) => (
                <span key={m} className="rounded-full border border-hairline bg-cream-card px-4 py-2 text-sm text-ink-soft">
                  {m}
                </span>
              ))}
            </div>
          </div>
        </GuideSection>

        {/* How it works */}
        <GuideSection
          id="how-it-works"
          eyebrow="How it works"
          title="Four tools, one question"
          lede="Where are you, relative to the conversation? That’s the only thing you need to know to pick."
        >
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {LANES.map((lane) => (
              <div key={lane.name} className="rounded-2xl border border-hairline bg-cream-card p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint-tint text-forest">
                  <lane.icon className="h-5 w-5" />
                </span>
                <p className="mt-3 font-heading text-lg font-bold text-forest">{lane.name}</p>
                <p className="mt-1 text-sm font-semibold text-terracotta-600">{lane.when}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{lane.detail}</p>
              </div>
            ))}
          </div>

          <ol className="mt-6 flex flex-col gap-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex items-start gap-4 rounded-2xl border border-hairline bg-cream-card p-6">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-mint-tint font-heading text-base font-bold text-forest">
                  {i + 1}
                </span>
                <div>
                  <p className="font-heading text-lg font-bold text-forest">{step.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-hairline bg-cream-card p-6">
              <h3 className="flex items-center gap-2.5 font-heading text-base font-bold text-forest">
                <ChecklistIcon className="h-4 w-4 text-terracotta-600" />
                What a meeting plan contains
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Twelve sections, plus a complete model response you can read aloud if the moment gets away from
                you.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {PLAN_PARTS.map((p) => (
                  <span key={p} className="rounded-full bg-mint-tint/60 px-3 py-1.5 text-xs font-medium text-forest">
                    {p}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-hairline bg-cream-card p-6">
              <h3 className="flex items-center gap-2.5 font-heading text-base font-bold text-forest">
                <ScenarioIcon className="h-4 w-4 text-terracotta-600" />
                How a rehearsal is read back
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Six dimensions, each marked strong, developing, or needs work — with specific feedback, not a
                score. Then what you did well, your one top priority, a stronger phrase to try, and a full
                model response.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {DIMENSIONS.map((d) => (
                  <span key={d} className="rounded-full bg-peach-tint/70 px-3 py-1.5 text-xs font-medium text-terracotta">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <SamplePlanExcerpt />
          </div>

          <div className="mt-8 flex flex-col items-start gap-3">
            <GuidePrimaryButton to="/communications">Open Communication Coach</GuidePrimaryButton>
            <p className="text-xs text-ink-soft">
              A finished message can be copied straight out, and a finished plan can be printed and carried
              into the room.
            </p>
          </div>
        </GuideSection>

        {/* Teacher story */}
        <GuideSection
          id="teacher-story"
          eyebrow="Teacher story"
          title="Ms. Iyer’s story"
          lede="One angry email, one reply she didn’t send, and a meeting that ended with a plan."
        >
          <div className="mt-8 rounded-2xl border border-hairline bg-cream-card p-7 sm:p-9">
            <QuoteIcon className="h-7 w-7 text-gold" />
            <div className="mt-4 flex flex-col gap-4">
              {STORY.map((para, i) => (
                <p
                  key={para.slice(0, 24)}
                  className={
                    i === 3
                      ? 'rounded-xl border-l-4 border-mint-tint bg-mint-tint/30 p-4 text-base leading-relaxed text-forest'
                      : 'text-base leading-relaxed text-ink-soft'
                  }
                >
                  {para}
                </p>
              ))}
            </div>
          </div>
          <p className="mt-4 text-sm text-ink-soft">
            She used three of the four tools for one situation. That’s the normal pattern, not an unusual one —
            they’re built to hand off to each other.
          </p>
        </GuideSection>

        {/* Try it */}
        <GuideSection
          id="try-it"
          eyebrow="Try it"
          title="Start with the one you’re avoiding"
          lede="You already know which conversation it is. It’s been on your mind since Friday."
        >
          <div className="mt-8 rounded-2xl border border-hairline bg-cream-card p-7">
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  icon: ChatBubbleIcon,
                  title: 'Already drafted it? Review it',
                  body: 'Paste what you received and what you plan to say. Ask for feedback only if you don’t want it rewritten.',
                },
                {
                  icon: HeartIcon,
                  title: 'Translate before you send',
                  body: 'One tap renders a finished message in another language, tone intact — Spanish, Vietnamese, Arabic, Haitian Creole and more, or type any language.',
                },
                {
                  icon: TargetIcon,
                  title: 'Rehearse harder than reality',
                  body: 'Set the difficulty to highly escalated. If you can hold that, the actual conversation will feel survivable.',
                },
              ].map((item) => (
                <div key={item.title}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-peach-tint text-terracotta">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <p className="mt-3 font-semibold text-forest">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{item.body}</p>
                </div>
              ))}
            </div>

            <p className="mt-6 rounded-xl bg-mint-tint/40 p-4 text-sm leading-relaxed text-forest">
              Every field except “what’s going on” is optional. You can skip straight past recipient, purpose,
              tone, and format and still get something useful back — then adjust it with a quick action once
              you see it.
            </p>

            <div className="mt-7 border-t border-hairline pt-6">
              <GuidePrimaryButton to="/communications">Open Communication Coach</GuidePrimaryButton>
            </div>
          </div>
        </GuideSection>

        {/* Debrief */}
        <GuideSection
          id="debrief"
          eyebrow="Debrief"
          title="Come back after the conversation"
          lede="This is the one that turns a hard week into something you’re better at — and it’s the one everyone skips, because once it’s over you want it to be over."
        >
          <div className="mt-8 flex items-start gap-3 rounded-2xl border-l-4 border-mint-tint bg-mint-tint/30 p-5">
            <ChatBubbleIcon className="mt-0.5 h-5 w-5 shrink-0 text-forest" />
            <p className="text-sm leading-relaxed text-forest">
              Hard conversations have a way of repeating — the same family, the same colleague, the same shape
              of problem in March. Five minutes now is the difference between doing it better next time and
              doing it exactly the same.
            </p>
          </div>

          <div className="mt-5 rounded-2xl border border-hairline bg-cream-card p-7">
            <h3 className="flex items-center gap-2.5 font-heading text-lg font-bold text-forest">
              <TargetIcon className="h-5 w-5 text-terracotta-600" />
              Five questions, that’s all
            </h3>
            <ul className="mt-4 flex flex-col gap-2.5">
              {DEBRIEF_QUESTIONS.map((q) => (
                <li key={q} className="flex items-start gap-2.5 text-sm text-ink-soft">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
                  {q}
                </li>
              ))}
            </ul>

            <div className="mt-7 border-t border-hairline pt-6">
              <p className="font-heading text-base font-bold text-forest">What you get back</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {DEBRIEF_RETURNS.map((r) => (
                  <div key={r.title} className="rounded-xl bg-mint-tint/40 p-4">
                    <p className="text-sm font-semibold text-forest">{r.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-soft">{r.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-7 border-t border-hairline pt-6">
              <p className="font-heading text-base font-bold text-forest">Then it’s your call</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {DEBRIEF_ACTIONS.map((a) => (
                  <div key={a.label} className="flex items-start gap-3 rounded-xl border border-hairline p-4">
                    <ChatBubbleIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
                    <div>
                      <p className="text-sm font-semibold text-forest">{a.label}</p>
                      <p className="mt-0.5 text-sm text-ink-soft">{a.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-hairline pt-6">
              <GuidePrimaryButton to="/talk-to-me?mode=debrief">Debrief This Experience</GuidePrimaryButton>
              <Link to="/communications?tool=practice" className="text-sm font-semibold text-terracotta-600 hover:text-terracotta">
                Or rehearse the follow-up conversation
              </Link>
            </div>
          </div>
        </GuideSection>
      </div>

      <GuideClosing
        icon={MailIcon}
        title="Write it tomorrow. Say it prepared."
        body="Almost nothing in this job needs answering tonight — and the version you send in the morning is nearly always better."
        ctaTo="/communications"
        ctaLabel="Open Communication Coach"
      />
    </GuideShell>
  )
}
