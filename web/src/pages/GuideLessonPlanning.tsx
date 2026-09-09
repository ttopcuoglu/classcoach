import { Link } from 'react-router-dom'
import {
  ChecklistIcon,
  ClockIcon,
  CheckIcon,
  ChatBubbleIcon,
  LessonPlanIcon,
  PlayIcon,
  QuoteIcon,
  SparkleIcon,
  StarIcon,
  TargetIcon,
  UploadIcon,
} from '../components/icons'
import {
  GuideClosing,
  GuideHero,
  GuidePathway,
  GuidePrimaryButton,
  GuideSection,
  GuideShell,
} from '../components/featureGuide'

// Teacher's guide to Lesson Planning. Layout and section order come from
// components/featureGuide.tsx; everything below is content only.

const BENEFITS = [
  { title: 'Beat the blank page', body: 'A draft you can argue with beats a cursor blinking in an empty doc.' },
  { title: 'Get a second read before your students give you one', body: 'Tuesday’s class is a rough place to discover the gap.' },
  { title: 'Find where it’ll wobble', body: 'Usually a transition, the timing, or the part that’s genuinely hard to explain.' },
  { title: 'Get the delivery, not just the plan', body: 'Opening hook, pacing, engagement checkpoints, how to close it.' },
  { title: 'See a revision without committing to it', body: 'A rewritten version sits beside yours until you choose to use it.' },
  { title: 'Keep the objective in frame', body: 'Give it your standard and objective and everything comes back tied to them.' },
  { title: 'Plan in the time you actually have', body: 'Ten minutes at a desk, not a protected planning period you never get.' },
]

const MOMENTS = [
  'The unit starts Monday and you have nothing',
  'You wrote a plan at 10pm and you’re not sure about it',
  'This lesson flopped last year and it’s coming back around',
  'You have the objective and the standard but no shape yet',
  'You built a deck for a class that hasn’t seen it yet',
  'It’s a new prep, or a grade level you haven’t taught',
  'You need sub plans that will actually hold',
]

const LANES = [
  {
    icon: SparkleIcon,
    name: 'Generate Ideas',
    when: 'You’re starting from nothing.',
    detail:
      'Give it an objective and get back a sample single day: Do Now, Agenda, Closure, a higher-order-thinking component, and Homework — plus coaching on how to deliver it.',
  },
  {
    icon: ChecklistIcon,
    name: 'Get Feedback',
    when: 'You already wrote something.',
    detail:
      'Paste or write your plan and get coaching on it, an open follow-up chat, and — if you want one — a full Suggested Revision you can use or dismiss.',
  },
  {
    icon: UploadIcon,
    name: 'Review a Presentation',
    when: 'The slides are built.',
    detail:
      'Upload a .pptx or .pdf and get a read on grade-level fit, visuals, ideas, length, and implementation. Export Google Slides or Keynote as PDF first.',
  },
]

const STEPS = [
  {
    title: 'Pick the lane that matches where you are',
    body: 'Blank page, written draft, or finished deck. All three live behind the same tab and you can move between them.',
  },
  {
    title: 'Give it an objective',
    body: 'That’s the only required field anywhere. Unit name, essential question, standard, subject, and grade level are all optional — but every one you add makes what comes back more specific to your class.',
  },
  {
    title: 'Read it as a colleague’s draft, not an answer key',
    body: 'A generated plan says so on the card: it’s a sample for ideas, meant to be adjusted. Feedback names what’s working before what isn’t, and you can keep asking follow-ups until it’s useful.',
  },
  {
    title: 'Take the parts that fit',
    body: 'A Suggested Revision sits next to your plan with “Use this version” and “Dismiss.” Nothing is ever applied to your work automatically. Then save it, share it as a read-only link, or download it.',
  },
]

const DELIVERY = ['Opening hook', 'Pacing & timing', 'Engagement checkpoints', 'Explaining the hard part', 'Closing']

const STORY = [
  'Ms. Park writes Tuesday’s ELA plan on Sunday night: symbolism in the novel they’re halfway through. It looks fine. She can’t say why it doesn’t feel finished.',
  'She pastes it into Get Feedback. The coaching names something she hadn’t seen — her We Do does almost all of the analytical work, and then the You Do asks students to find and defend a symbol on their own. The jump between them is bigger than one class period.',
  'In the follow-up chat she asks for a revision. It comes back as a Suggested Revision beside her plan: split the You Do, give students one identified symbol to defend before asking them to find their own.',
  'She takes that part. She dismisses the rest — the suggested closure is generic, and hers ties back to a discussion the class had in September that no model could know about.',
  'Tuesday goes better, and specifically at the seam the coaching flagged. Students who’d have stalled at the independent step had a rung to stand on first.',
  'The plan is still hers. It always was — she just got a read on it before twenty-nine ninth graders did.',
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
  { title: 'One practical next step', body: 'The single thing worth carrying into the next plan.' },
]

const DEBRIEF_ACTIONS = [
  { label: 'Continue This Conversation', body: 'Keep talking if the debrief opened something up.' },
  { label: 'Set a Next Step', body: 'Write down the one thing you’re committing to.' },
  { label: 'Save My Reflection', body: 'Keep it to read before you plan this unit again.' },
  { label: 'Start a New Talk It Through', body: 'Begin fresh on something else.' },
]

export default function GuideLessonPlanning() {
  return (
    <GuideShell appTo="/lesson-planning">
      <GuideHero
        icon={LessonPlanIcon}
        title="Lesson Planning"
        paragraphs={[
          'A blank page and a plan you’re unsure about are two different problems. Lesson Planning has a tool for each — and a third for the slides you already built.',
          'None of it writes your lessons for you. It gives you something to react to when you’re stuck, an honest read when you’re not sure, and a revision you can take or leave. The plan stays yours.',
        ]}
      />

      <GuidePathway />

      <div className="mx-auto w-full max-w-4xl px-6">
        {/* Why it helps + when */}
        <GuideSection
          id="why-it-helps"
          eyebrow="Why it helps"
          title="The problem is rarely the ideas"
          lede="It’s the hour you don’t have, and the fact that nobody reads your plan before your students do."
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
            <TargetIcon className="mt-0.5 h-5 w-5 shrink-0 text-terracotta-600" />
            <p className="text-sm leading-relaxed text-forest">
              A generated plan is a starting point, and the card says so out loud — it doesn’t know your
              students, your room, or what happened in class last Thursday. You do. Treat it like a draft from
              a colleague who’s never met your third period.
            </p>
          </div>

          <div className="mt-10">
            <h3 className="flex items-center gap-2.5 font-heading text-lg font-bold text-forest">
              <ClockIcon className="h-5 w-5 text-terracotta-600" />
              Good moments to open it
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
          title="Three lanes, one objective field"
          lede="Which one you want depends entirely on how much you’ve already written."
        >
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
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
              <PlayIcon className="h-4 w-4 text-terracotta-600" />
              The part most planning tools skip
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Alongside the plan itself, you get coaching on actually teaching it — how to open, how to pace
              it, where to check that they’re with you, how to explain the hard part, and how to land the
              close.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {DELIVERY.map((d) => (
                <span key={d} className="rounded-full bg-mint-tint/60 px-3.5 py-1.5 text-sm font-medium text-forest">
                  {d}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-col items-start gap-3">
            <GuidePrimaryButton to="/lesson-planning">Plan a Lesson</GuidePrimaryButton>
            <p className="text-xs text-ink-soft">
              Nothing is ever applied to your plan automatically. Save, share as a read-only link, or download
              any of it.
            </p>
          </div>
        </GuideSection>

        {/* Teacher story */}
        <GuideSection
          id="teacher-story"
          eyebrow="Teacher story"
          title="Ms. Park’s story"
          lede="A plan that looked fine, one gap she couldn’t see, and a revision she only half took."
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
            Taking half a revision isn’t a failure of the tool — it’s the tool working. You’re the one who
            knows which half.
          </p>
        </GuideSection>

        {/* Try it */}
        <GuideSection
          id="try-it"
          eyebrow="Try it"
          title="Bring whatever you’ve got"
          lede="Half a plan, a messy list, or one sentence about what students should be able to do. All of it is enough to start."
        >
          <div className="mt-8 rounded-2xl border border-hairline bg-cream-card p-7">
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  icon: ChecklistIcon,
                  title: 'Already wrote it? Start there',
                  body: 'Get Feedback on your own plan is more useful than generating a new one you’ll have to rewrite anyway.',
                },
                {
                  icon: TargetIcon,
                  title: 'Add the standard',
                  body: 'It’s optional, but it’s the field that most changes how specific the response is.',
                },
                {
                  icon: StarIcon,
                  title: 'Don’t take the whole revision',
                  body: 'Use the parts that fit your class, dismiss the rest. Half a good suggestion is still a good suggestion.',
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
              In the follow-up chat you can just ask — “make the You Do shorter,” “this won’t work with 32
              kids,” “give me a version without the group work.” Asking for a revision is how you get one.
            </p>

            <div className="mt-7 border-t border-hairline pt-6">
              <GuidePrimaryButton to="/lesson-planning">Plan a Lesson</GuidePrimaryButton>
            </div>
          </div>
        </GuideSection>

        {/* Debrief */}
        <GuideSection
          id="debrief"
          eyebrow="Debrief"
          title="Come back after you’ve taught it"
          lede="A plan is a prediction. The debrief is where you find out how good a predictor you are — which is the skill that compounds."
        >
          <div className="mt-8 flex items-start gap-3 rounded-2xl border-l-4 border-mint-tint bg-mint-tint/30 p-5">
            <ChatBubbleIcon className="mt-0.5 h-5 w-5 shrink-0 text-forest" />
            <p className="text-sm leading-relaxed text-forest">
              This is the one teachers skip, and it’s the one that changes next year’s unit. Five minutes after
              the lesson beats rewriting the whole thing from memory next August.
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
              <Link to="/audio-coaching" className="text-sm font-semibold text-terracotta-600 hover:text-terracotta">
                Or record the lesson and see how the plan actually landed
              </Link>
            </div>
          </div>
        </GuideSection>
      </div>

      <GuideClosing
        icon={LessonPlanIcon}
        title="Somebody should read it before your students do."
        body="Ten minutes of honest feedback on Sunday is worth more than an hour of rewriting on Tuesday."
        ctaTo="/lesson-planning"
        ctaLabel="Plan a Lesson"
      />
    </GuideShell>
  )
}
