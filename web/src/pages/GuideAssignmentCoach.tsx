import { Link } from 'react-router-dom'
import {
  BookIcon,
  ChatBubbleIcon,
  CheckIcon,
  ChecklistIcon,
  ClipboardIcon,
  ClockIcon,
  QuoteIcon,
  RobotIcon,
  ShieldIcon,
  TargetIcon,
  UploadIcon,
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

// Teacher's guide to Assignment Coach. Layout and section order come from
// components/featureGuide.tsx; everything below is content only.

const BENEFITS = [
  { title: 'Find out what it actually asks', body: 'Not what you meant it to ask — what a student opening it cold would do.' },
  { title: 'See the AI risk honestly', body: 'Some assignments can be finished in thirty seconds by a chatbot. Better to know which.' },
  { title: 'Separate learning from completion', body: 'Busywork looks a lot like rigor at 11pm when you’re writing it.' },
  { title: 'Check the grade-level fit', body: 'Especially on a new prep, where your calibration isn’t built yet.' },
  { title: 'Get a policy you can hand out', body: 'Student-facing AI guidelines, written for the assignment in front of you, ready to copy.' },
  { title: 'Keep the assignment, fix the weak part', body: 'You don’t have to throw out a task that mostly works.' },
  { title: 'Skip the intake form', body: 'Grade, subject, type, and time are read from the assignment itself. You paste; it figures the rest out.' },
]

const MOMENTS = [
  'You suspect AI could finish this in one prompt',
  'The same assignment got wildly different quality last year',
  'It’s a new prep and you’re not sure it’s pitched right',
  'Students keep asking clarifying questions about the directions',
  'You inherited a unit and its assignments came with it',
  'You need a written AI policy for one specific task',
  'It takes students three hours and you meant it to take one',
]

const LANES = [
  {
    icon: ChecklistIcon,
    name: 'Review an assignment',
    when: 'You want an honest read.',
    detail:
      'Coaching on clarity, rigor, student thinking, accessibility, differentiation, and assessment alignment — plus a snapshot of grade fit, learning value, workload, and AI completion risk.',
  },
  {
    icon: ClipboardIcon,
    name: 'Redesign for meaningful AI use',
    when: 'You want it to survive AI.',
    detail:
      'Adapt the task so students have to show their own thinking — whether AI is fully allowed, limited to approved steps, or not allowed at all. You choose the policy; it does the redesign.',
  },
]

const AI_LEVELS = [
  { label: 'AI as a thinking partner', body: 'Students may question, brainstorm, get feedback, or revise with AI — but must show their own reasoning.' },
  { label: 'Limited AI use', body: 'AI is permitted only for specific steps you’ve approved.' },
  { label: 'No AI use', body: 'Completed without generative AI, with authentic evidence of student thinking.' },
]

const STEPS = [
  {
    title: 'Add the assignment',
    body: 'Paste the text, or upload it — .docx, .pdf, .txt, and even a photo of a worksheet as .jpg or .png. There’s no form to fill in: grade level, subject, assignment type, and estimated time all get read from the assignment itself.',
  },
  {
    title: 'Make the one real choice',
    body: 'Review asks nothing else. Redesign asks how students should be allowed to use AI — a policy decision, not something to guess at. If you’re genuinely unsure, tick the box and let Wivoza recommend a level.',
  },
  {
    title: 'Read the snapshot',
    body: 'Grade fit, thinking and rigor, learning value, workload and clarity, and AI completion risk — each in plain words with an explanation, never a number or a grade. Up top, the single most important opportunity, named.',
  },
  {
    title: 'Work on it, right there',
    body: 'The assignment sits in the workspace as editable text that saves as you type. Use a quick action to push on one thing, or talk it through in the chat, then edit until it’s the version you’ll actually hand out.',
  },
]

const QUICK_ACTIONS = [
  'Address the biggest issue',
  'Make it AI-resilient',
  'Strengthen the rigor',
  'Remove low-value work',
  'Clarify student directions',
  'Adjust the workload',
  'Review everything with the coach',
]

const STORY = [
  'Mr. Nowak has assigned the same thing for four years: a 500-word essay on the causes of the First World War. It used to produce decent writing. Last year half of it came back sounding like a textbook that had swallowed a thesaurus.',
  'He pastes it into Review. AI completion risk comes back High, and learning value reads “mostly completion-focused.” The most important opportunity names the real problem: the assignment asks for a product a machine can produce, and never asks for the thinking that would have produced it.',
  'None of which is news, exactly. It’s just the first time it’s been said plainly.',
  'He switches to Redesign and picks Limited AI use — brainstorming allowed, drafting not. The redesign flags which steps are outsourceable, then adds safeguards: students pick two documents from the class set, mark where their reading differs from the textbook’s, and defend the difference in a short in-class write.',
  'The student AI guidelines come out ready to copy. He pastes them straight into the handout. He also rewrites the revised assignment in the workspace, because the version he got assumed two weeks and he has four days.',
  'Some students will still use AI. But now the part that counts happens in a room he’s standing in, which is a problem he can actually manage.',
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
  { title: 'One practical next step', body: 'The single thing worth carrying into the next assignment.' },
]

const DEBRIEF_ACTIONS = [
  { label: 'Continue This Conversation', body: 'Keep talking if the debrief opened something up.' },
  { label: 'Set a Next Step', body: 'Write down the one thing you’re committing to.' },
  { label: 'Save My Reflection', body: 'Keep it to read before you assign this again.' },
  { label: 'Start a New Talk It Through', body: 'Begin fresh on something else.' },
]

function SampleSnapshot() {
  const rows = [
    { label: 'Grade fit', value: 'Appears grade-level appropriate' },
    { label: 'Thinking and rigor', value: 'Mostly recall and summary' },
    { label: 'Learning value', value: 'Mostly completion-focused' },
    { label: 'AI completion risk', value: 'High' },
  ]
  return (
    <GuideSample
      title="Review · Snapshot"
      caption="An illustration of a Review snapshot. Every finding is a phrase with an explanation behind it — there are no numbers anywhere."
    >
      <div className="rounded-2xl bg-forest p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-cream/50">Most important opportunity</p>
        <p className="mt-2 font-heading text-lg font-bold text-cream">
          The task asks for a product, not the thinking behind it
        </p>
        <p className="mt-1 text-sm text-cream/70">
          A 500-word essay on a well-documented topic is something a chatbot can produce in one pass. The
          reasoning you actually want to assess never has to appear.
        </p>
        <div className="mt-4 flex flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-cream/10 pt-2.5">
              <span className="text-xs font-medium text-cream/50">{r.label}</span>
              <span className="text-sm font-medium text-cream">{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </GuideSample>
  )
}

export default function GuideAssignmentCoach() {
  return (
    <GuideShell appTo="/assignment-coach">
      <GuideHero
        icon={BookIcon}
        title="Assignment Coach"
        paragraphs={[
          'Every assignment you give makes a quiet promise about what students will actually do. Assignment Coach reads the thing you wrote and tells you whether it keeps that promise.',
          'Review gives you an honest read on rigor, workload, grade fit, and how easily the whole task could be handed to a chatbot. Redesign rebuilds it so students have to show their own thinking — at whatever AI policy you decide on.',
        ]}
      />

      <GuidePathway />

      <div className="mx-auto w-full max-w-4xl px-6">
        {/* Why it helps + when */}
        <GuideSection
          id="why-it-helps"
          eyebrow="Why it helps"
          title="You wrote it. You can’t read it cold."
          lede="You know what you meant. A student opening it on a Tuesday night doesn’t — and neither does the tool they might paste it into."
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
              Nothing here is scored. There are no numbers anywhere in the snapshot — every finding is a plain
              phrase with an explanation behind it, because “moderate AI risk, and here’s the step that causes
              it” is useful and <em>62/100</em> is not.
            </p>
          </div>

          <div className="mt-10">
            <h3 className="flex items-center gap-2.5 font-heading text-lg font-bold text-forest">
              <ClockIcon className="h-5 w-5 text-terracotta-600" />
              Good times to run one through
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
          title="Two paths, almost no setup"
          lede="Pick what you want, add the assignment, and answer at most one question."
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

          <div className="mt-6 rounded-2xl border border-hairline bg-cream-card p-6">
            <h3 className="flex items-center gap-2.5 font-heading text-base font-bold text-forest">
              <RobotIcon className="h-4 w-4 text-terracotta-600" />
              The AI policy is your call, not the tool’s
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Redesign asks you to pick one before it starts, because the right answer depends on your course,
              your department, and what you’re actually assessing.
            </p>
            <div className="mt-4 flex flex-col gap-2.5">
              {AI_LEVELS.map((lvl) => (
                <div key={lvl.label} className="flex items-start gap-2.5 text-sm">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
                  <span className="text-ink-soft">
                    <strong className="font-semibold text-forest">{lvl.label}</strong> — {lvl.body}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-ink-soft">
              Genuinely unsure? Tick <strong className="font-semibold text-forest">let Wivoza recommend</strong>{' '}
              and it will pick one and tell you why.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-hairline bg-cream-card p-6">
            <h3 className="flex items-center gap-2.5 font-heading text-base font-bold text-forest">
              <TargetIcon className="h-4 w-4 text-terracotta-600" />
              One-tap ways to push on it
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Instead of composing a request, tap one — the coach takes it from there.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {QUICK_ACTIONS.map((a) => (
                <span key={a} className="rounded-full bg-mint-tint/60 px-3.5 py-1.5 text-sm font-medium text-forest">
                  {a}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <SampleSnapshot />
          </div>

          <div className="mt-8 flex flex-col items-start gap-3">
            <GuidePrimaryButton to="/assignment-coach">Review an Assignment</GuidePrimaryButton>
            <p className="text-xs text-ink-soft">
              Reviewed an assignment and want it rebuilt? There’s a one-tap handoff from a finished review
              straight into Redesign — no retyping.
            </p>
          </div>
        </GuideSection>

        {/* Teacher story */}
        <GuideSection
          id="teacher-story"
          eyebrow="Teacher story"
          title="Mr. Nowak’s story"
          lede="A four-year-old essay prompt, a chatbot that could finish it in one go, and a fix that took an afternoon."
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
            The goal was never to make an assignment AI-proof. It was to move the thinking to a place where he
            can see it happen.
          </p>
        </GuideSection>

        {/* Try it */}
        <GuideSection
          id="try-it"
          eyebrow="Try it"
          title="Start with the one you already suspect"
          lede="Not your best assignment. The one you’ve had a bad feeling about since last spring."
        >
          <div className="mt-8 rounded-2xl border border-hairline bg-cream-card p-7">
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  icon: UploadIcon,
                  title: 'A photo works',
                  body: 'Uploads take .docx, .pdf, .txt — and .jpg or .png, so a picture of a paper worksheet is a valid way in.',
                },
                {
                  icon: ChecklistIcon,
                  title: 'Review before you redesign',
                  body: 'Knowing what’s actually wrong makes the redesign land better. And the handoff carries your text over.',
                },
                {
                  icon: ClipboardIcon,
                  title: 'Edit the revised version',
                  body: 'It doesn’t know you have four days, not two weeks. The workspace text is yours to change, and it saves as you type.',
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
              If one detail genuinely changes the read — how long students get, whether it’s done in class —
              you’ll get a single clarifying question with options rather than a guess presented as fact.
              Answering it takes a tap.
            </p>

            <div className="mt-7 border-t border-hairline pt-6">
              <GuidePrimaryButton to="/assignment-coach">Review an Assignment</GuidePrimaryButton>
            </div>
          </div>
        </GuideSection>

        {/* Debrief */}
        <GuideSection
          id="debrief"
          eyebrow="Debrief"
          title="Come back after students have done it"
          lede="The redesign is a hypothesis. What came back in the pile is the evidence — and that’s what should shape next year’s version."
        >
          <div className="mt-8 flex items-start gap-3 rounded-2xl border-l-4 border-mint-tint bg-mint-tint/30 p-5">
            <ChatBubbleIcon className="mt-0.5 h-5 w-5 shrink-0 text-forest" />
            <p className="text-sm leading-relaxed text-forest">
              This is the loop almost nobody closes. You rewrite an assignment, hand it out, grade the results
              — and then never connect the two. Five minutes here is what turns one fixed assignment into a
              better instinct for writing the next one.
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
              <Link to="/assignment-coach" className="text-sm font-semibold text-terracotta-600 hover:text-terracotta">
                Or reopen the assignment and revise it again
              </Link>
            </div>
          </div>
        </GuideSection>
      </div>

      <GuideClosing
        icon={BookIcon}
        title="Assign the thinking, not the product."
        body="The task is the lesson. It’s worth ten minutes of somebody reading it back to you."
        ctaTo="/assignment-coach"
        ctaLabel="Review an Assignment"
      />
    </GuideShell>
  )
}
