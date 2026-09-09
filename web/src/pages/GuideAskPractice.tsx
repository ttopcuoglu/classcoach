import { Link } from 'react-router-dom'
import {
  ArrowUpIcon,
  ChatBubbleIcon,
  CheckIcon,
  ClockIcon,
  MicIcon,
  QuoteIcon,
  ScenarioIcon,
  SparkleIcon,
  StarIcon,
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

// Teacher's guide to Ask & Practice. Layout and section order come from
// components/featureGuide.tsx; everything below is content only.

const BENEFITS = [
  { title: 'Get an answer, not a reading list', body: 'You asked about one student on one day. That’s what comes back.' },
  { title: 'Find the words while it’s calm', body: 'The right sentence is easier to write at 3:40 than to invent at 10:15.' },
  { title: 'Rehearse before it costs you', body: 'Try the firmer version on a scenario, not on a real fourteen-year-old.' },
  { title: 'Get it wrong somewhere safe', body: 'Nobody sees a practice attempt. That’s the whole point of one.' },
  { title: 'Compare against a model', body: 'Your response and a strong one, side by side — so you can see the gap, not just be told there is one.' },
  { title: 'Build your own bank', body: 'Anything you save turns into your Cheat Sheet, grouped by situation.' },
  { title: 'Watch yourself get better', body: 'Enough attempts in one category and Wivoza tells you where you’re growing.' },
]

const MOMENTS = [
  'A student said something and you froze',
  'You already responded and it didn’t go well',
  'A hard conversation is on tomorrow’s calendar',
  'A routine keeps falling apart at the same point',
  'You want to sound firmer without sounding harsh',
  'You’re new to this grade band and reading the room wrong',
  'You have five spare minutes and nothing to grade',
]

const STEPS = [
  {
    title: 'Pick the tab that matches your moment',
    body: 'Ask is for something that already happened, or a real question you have right now. Practice is for something that hasn’t happened yet and you’d rather not improvise.',
  },
  {
    title: 'Say what’s going on',
    body: 'In Ask, type it or tap “Speak instead” — and if you’re not sure how to start, three starting points reshape the prompt for you: find the words, reflect on a moment, or build a routine. In Practice, set any filters you want and generate a scenario.',
  },
  {
    title: 'Get something you can use',
    body: 'Ask hands back Coaching, Words to try, and One next step. Practice shows your response, coaching on it, and a model response to compare against. Either way you can keep asking follow-ups until it actually makes sense.',
  },
  {
    title: 'Keep what works',
    body: 'Save it, share it as a read-only link, or hand it straight to the other tab — “Practice this” turns the real situation you just described into a rehearsal.',
  },
]

const LANES = [
  {
    icon: ChatBubbleIcon,
    name: 'Ask',
    when: 'Something real — it happened, or it’s about to.',
    detail:
      'Describe the moment or ask a straight question. Four starter questions are there if you’re stuck. You get coaching, specific words to try, and one next step — plus an open follow-up chat.',
  },
  {
    icon: ScenarioIcon,
    name: 'Practice',
    when: 'A rehearsal — low stakes, nobody watching.',
    detail:
      'Filter by situation, grade band (K–5, 6–8, 9–12), and difficulty — Guided, Independent, or Challenge. Take one scenario, or a Quick Session of three back to back. Respond, then compare with a model.',
  },
]

const STORY = [
  'Fourth period, Ms. Ruiz asks a student to put his phone away. He says “you can’t make me,” loudly, and the room goes quiet and interested.',
  'What she actually says is “fine, keep it, see what happens on the test” — which ends the moment and which she regrets before the bell.',
  'That afternoon she opens Ask, picks “Find the words,” and describes it. The coaching names what made it hard: the audience. Words to try gives her a low-volume, low-audience line and a way to move on without a standoff. One next step is to handle the phone privately, after the transition, not in front of twenty-eight people.',
  'Then she taps Practice this. Same situation, now a rehearsal. She runs it three times — Guided, then Independent, then Challenge, where the student escalates instead of folding.',
  'Her third attempt still isn’t the model response. It’s shorter and it sounds like her, which is the version she’ll actually say out loud.',
  'It happens again the following week. She isn’t smooth, and he doesn’t hand over the phone. But she doesn’t say the thing she’ll regret, and the class goes back to work — which is the part that mattered.',
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
  { title: 'One practical next step', body: 'The single thing worth carrying into tomorrow.' },
]

const DEBRIEF_ACTIONS = [
  { label: 'Continue This Conversation', body: 'Keep talking if the debrief opened something up.' },
  { label: 'Set a Next Step', body: 'Write down the one thing you’re committing to.' },
  { label: 'Save My Reflection', body: 'Keep it to come back to when the situation repeats.' },
  { label: 'Start a New Talk It Through', body: 'Begin fresh on something else.' },
]

function SampleAnswer() {
  return (
    <GuideSample
      title="Ask · Your coaching"
      caption="An illustration of an Ask answer. A Practice attempt looks similar, with your own response and a model one side by side."
    >
      <div className="rounded-xl border border-border bg-canvas p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">What&apos;s going on</p>
        <p className="mt-1.5 text-sm text-ink">
          A student told me &quot;you can&apos;t make me&quot; in front of the whole class when I asked him to put his
          phone away.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-warm-100/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">Coaching</p>
        <p className="mt-1.5 text-sm text-ink">
          The hard part here isn&apos;t the phone — it&apos;s the audience. Once twenty-eight people are watching,
          any request becomes a test of whether you can enforce it, and winning that test costs more than the
          phone is worth.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-canvas p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Words to try</p>
        <p className="mt-1.5 text-sm text-ink">
          &quot;I&apos;m not going to argue about it in front of everyone. Hang on to it for now and see me at the
          end.&quot;
        </p>
      </div>
      <div className="rounded-xl border border-brand-100 bg-brand-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">One next step</p>
        <p className="mt-1.5 text-sm text-ink">
          Handle the phone privately after the transition, not in front of the room.
        </p>
      </div>
    </GuideSample>
  )
}

export default function GuideAskPractice() {
  return (
    <GuideShell appTo="/coach-chat">
      <GuideHero
        icon={ChatBubbleIcon}
        title="Ask & Practice"
        paragraphs={[
          'Two tools that sit behind one tab. One is for the thing that already happened. The other is for the thing you’re quietly dreading.',
          'Ask gives you coaching on a real situation — including the actual words to try. Practice puts you in a realistic classroom moment and lets you respond badly, as many times as you need, where it costs nothing. Both are free, always, with no limit.',
        ]}
      />

      <GuidePathway />

      <div className="mx-auto w-full max-w-4xl px-6">
        {/* Why it helps + when */}
        <GuideSection
          id="why-it-helps"
          eyebrow="Why it helps"
          title="Nobody improvises well under pressure"
          lede="Not because you’re bad at it — because the moment is loud, public, and three seconds long. This is where you do the thinking beforehand."
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
            <ArrowUpIcon className="mt-0.5 h-5 w-5 shrink-0 text-terracotta-600" />
            <p className="text-sm leading-relaxed text-forest">
              Practice attempts are never scored to your face and never shown to anyone. Wivoza keeps a private
              read on how you’re doing so it can tell you where you’re growing — the only thing you ever see is
              a note like <em>“You’re showing growth in Routines &amp; transitions scenarios.”</em>
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
          title="Two lanes, one tab"
          lede="You can move between them at any point — and the app will do it for you when it makes sense."
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

          <p className="mt-6 flex items-start gap-3 rounded-xl bg-gold-tint/40 p-4 text-sm leading-relaxed text-forest">
            <SparkleIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
            <span>
              The bridge is worth knowing about: every Ask answer has a{' '}
              <strong className="font-semibold">Practice this</strong> button that rebuilds your real situation
              as a scenario. Advice, then reps — without retyping a thing.
            </span>
          </p>

          <div className="mt-6">
            <SampleAnswer />
          </div>

          <div className="mt-8 flex flex-col items-start gap-3">
            <GuidePrimaryButton to="/coach-chat">Ask or Practice Now</GuidePrimaryButton>
            <p className="text-xs text-ink-soft">
              Free for everyone, always. Coach talks about people by role — “a student,” “the class” — even if
              you use a name yourself.
            </p>
          </div>
        </GuideSection>

        {/* Teacher story */}
        <GuideSection
          id="teacher-story"
          eyebrow="Teacher story"
          title="Ms. Ruiz’s story"
          lede="A phone, an audience, and a sentence she wished she hadn’t said."
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
            The model response is there to compare against, not to memorize. The version you’ll actually say
            out loud has to sound like you.
          </p>
        </GuideSection>

        {/* Try it */}
        <GuideSection
          id="try-it"
          eyebrow="Try it"
          title="Five minutes is a real session"
          lede="This is the one that fits in a passing period. There’s nothing to set up and nothing to schedule."
        >
          <div className="mt-8 rounded-2xl border border-hairline bg-cream-card p-7">
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  icon: MicIcon,
                  title: 'Start in Ask if it’s real',
                  body: 'Describe what happened out loud with “Speak instead.” It’s faster than typing and you’ll say more.',
                },
                {
                  icon: TargetIcon,
                  title: 'Try a Quick Session',
                  body: 'Three scenarios back to back in one sitting. Better than one scenario a week for actually building the reflex.',
                },
                {
                  icon: StarIcon,
                  title: 'Save the good ones',
                  body: 'Saved answers and attempts become your Cheat Sheet, grouped by situation and waiting when you need them.',
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
              Every filter in Practice is optional. Skipping all three and hitting{' '}
              <strong className="font-semibold">New Scenario</strong> is a perfectly good way to start — you
              can always narrow it down once you know what you want to work on.
            </p>

            <div className="mt-7 border-t border-hairline pt-6">
              <GuidePrimaryButton to="/coach-chat">Ask or Practice Now</GuidePrimaryButton>
            </div>
          </div>
        </GuideSection>

        {/* Debrief */}
        <GuideSection
          id="debrief"
          eyebrow="Debrief"
          title="Come back after you’ve tried it"
          lede="Advice you read is worth very little. Advice you used, and then thought about, is the part that sticks."
        >
          <div className="mt-8 flex items-start gap-3 rounded-2xl border-l-4 border-mint-tint bg-mint-tint/30 p-5">
            <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-forest" />
            <p className="text-sm leading-relaxed text-forest">
              There’s a quick version built into every answer and attempt: mark it{' '}
              <strong className="font-semibold">tried in class</strong>, then jot down what happened. Use that
              for a one-line note. Use the full debrief below when it deserves a conversation.
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
              <Link to="/coach-chat" className="text-sm font-semibold text-terracotta-600 hover:text-terracotta">
                Or reopen a saved answer and mark it tried
              </Link>
            </div>
          </div>
        </GuideSection>
      </div>

      <GuideClosing
        icon={ScenarioIcon}
        title="Better to get it wrong here."
        body="A scenario has no audience, no bell, and no student who remembers what you said."
        ctaTo="/coach-chat"
        ctaLabel="Ask or Practice Now"
      />
    </GuideShell>
  )
}
