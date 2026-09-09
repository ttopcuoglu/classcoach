import {
  BrainIcon,
  ChatBubbleIcon,
  CheckIcon,
  ClockIcon,
  HeartIcon,
  QuoteIcon,
  SparkleIcon,
  StarIcon,
  TargetIcon,
  WaveformIcon,
} from '../components/icons'
import {
  GuideClosing,
  GuideHero,
  GuidePathway,
  GuidePrimaryButton,
  GuideSection,
  GuideShell,
} from '../components/featureGuide'

// Teacher's guide to Talk It Through, the first of these. Layout and section
// order come from components/featureGuide.tsx; everything below is content only.

const BENEFITS = [
  { title: 'Slow the moment down', body: 'Say it out loud once, before you decide anything.' },
  { title: 'Separate fact from feeling', body: 'What actually happened, and what you assumed happened.' },
  { title: 'Notice what you missed', body: 'The detail you walked past on your way to the frustration.' },
  { title: 'See it from another side', body: 'The student’s view, the parent’s view, the room’s view.' },
  { title: 'Weigh a few options', body: 'Not one prescription — a handful of realistic moves.' },
  { title: 'Rehearse the hard part', body: 'Find your words before the conversation, not during it.' },
  { title: 'Leave with one next step', body: 'Small enough to actually do tomorrow.' },
]

const MOMENTS = [
  'A lesson didn’t go the way you planned',
  'Students were disengaged, or clearly confused',
  'A management moment got away from you',
  'You’re not sure how to respond to a student',
  'A parent or colleague conversation is coming',
  'You’re still sitting with feedback you received',
  'Something’s bothering you and you can’t name it yet',
]

const STEPS = [
  {
    title: 'Describe the situation',
    body: 'Tap Start Talking and say what happened, the way you’d say it to a colleague you trust. No format, no template. (Prefer to type? “Type instead” is right there.)',
  },
  {
    title: 'Explore it with your coach',
    body: 'Coach listens, then asks. When did it start? Were the directions clear? What were students meant to do on their own? You answer out loud and keep going.',
  },
  {
    title: 'Consider your options',
    body: 'Together you look at a few approaches — what to change, what to say, what to watch for — rather than settling on the first fix.',
  },
  {
    title: 'Choose what you’ll try',
    body: 'Tap Finish session and Coach hands back a short takeaway under three headings — What we explored, What I’ll try, What I’ll notice. Tap Save and it’s waiting for you next time you open Talk It Through.',
  },
]

const STORY = [
  'Ms. Alvarez finishes third period frustrated. Several students talked through the lesson, two never started the assignment, and she spent most of the class redirecting behavior.',
  'Her first instinct is to rebuild the whole lesson tonight. Instead, she opens Talk It Through on her phone during her prep and just says what happened.',
  'Coach asks when students started losing focus. Then whether the directions were clear. Then what students were expected to do on their own. Answering out loud, she hears it herself: the class came apart at the handoff from her modeling to independent work — not during the lesson at all.',
  'They talk through a few options. She picks one. Tomorrow she’ll model the first problem, ask a student to restate the directions in their own words, and leave the three steps on the board.',
  'The next day the transition is smoother. Not perfect — two students still need a nudge. But she knows what she changed and what to watch for, which is more than she had walking out of class the day before.',
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
  { label: 'Save My Reflection', body: 'Keep it in Past conversations to come back to.' },
  { label: 'Start a New Talk It Through', body: 'Begin fresh on something else.' },
]


export default function GuideTalkItThrough() {
  return (
    <GuideShell appTo="/talk-to-me">
      <GuideHero
        icon={WaveformIcon}
        title="Talk It Through"
        paragraphs={[
          'Sometimes you don\u2019t need another template or checklist. You need a private space to explain what happened, get your thoughts in order, and decide what to do next.',
          'Talk It Through lets you describe a classroom challenge, an instructional worry, a meeting, or a hard moment \u2014 out loud, in your own words. Wivoza listens, asks thoughtful questions, and helps you find your own next step.',
        ]}
      />

      <GuidePathway />

      <div className="mx-auto w-full max-w-4xl px-6">
        {/* 2. Why it is useful + 3. When to use it */}
        <GuideSection
          id="why-it-helps"
          eyebrow="Why it helps"
          title="Thinking out loud is the point"
          lede="Not because talking is nice, but because most classroom problems are clearer once you’ve had to say them in order."
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
            <HeartIcon className="mt-0.5 h-5 w-5 shrink-0 text-terracotta-600" />
            <p className="text-sm leading-relaxed text-forest">
              Coach is here to support your thinking, not to replace it. You know your students, your room, and
              your school. Expect questions more often than answers — that’s deliberate.
            </p>
          </div>

          <div className="mt-10">
            <h3 className="flex items-center gap-2.5 font-heading text-lg font-bold text-forest">
              <ClockIcon className="h-5 w-5 text-terracotta-600" />
              Good moments to open it
            </h3>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {MOMENTS.map((m) => (
                <span
                  key={m}
                  className="rounded-full border border-hairline bg-cream-card px-4 py-2 text-sm text-ink-soft"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        </GuideSection>

        {/* 4. How it works */}
        <GuideSection
          id="how-it-works"
          eyebrow="How it works"
          title="Four steps, about five minutes"
          lede="It runs on your voice — you talk, Coach talks back. A prep period or a car ride is plenty of time."
        >
          <ol className="mt-8 flex flex-col gap-4">
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

          <div className="mt-8 flex flex-col items-start gap-3">
            <GuidePrimaryButton to="/talk-to-me">Talk It Through Now</GuidePrimaryButton>
            <p className="text-xs text-ink-soft">
              Your voice is never saved — only the conversation text. Free, and unlimited.
            </p>
          </div>
        </GuideSection>

        {/* 5. Show it through a story */}
        <GuideSection
          id="teacher-story"
          eyebrow="Teacher story"
          title="Ms. Alvarez’s story"
          lede="One prep period, one honest conversation, one change worth trying."
        >
          <div className="mt-8 rounded-2xl border border-hairline bg-cream-card p-7 sm:p-9">
            <QuoteIcon className="h-7 w-7 text-gold" />
            <div className="mt-4 flex flex-col gap-4">
              {STORY.map((para, i) => (
                <p
                  key={para.slice(0, 24)}
                  className={
                    i === 2
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
            Notice what Wivoza didn’t do: it didn’t diagnose her classroom or hand her a management plan. It
            asked three questions she hadn’t asked herself yet.
          </p>
        </GuideSection>

        {/* Try it */}
        <GuideSection
          id="try-it"
          eyebrow="Try it"
          title="Start with whatever’s on your mind"
          lede="You don’t need the problem figured out first. Starting messy is the normal way in."
        >
          <div className="mt-8 rounded-2xl border border-hairline bg-cream-card p-7">
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                { icon: WaveformIcon, title: 'Tap Start Talking', body: 'The mic opens and Coach waits. What you said appears on screen as you go, so you can see it heard you right.' },
                { icon: BrainIcon, title: 'Keep it conversational', body: 'Interrupt, backtrack, change your mind. It’s a conversation, not a form.' },
                { icon: StarIcon, title: 'Finish when ready', body: 'Tap Finish session for your takeaway, or Exit to leave with nothing kept.' },
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
            <p className="mt-6 rounded-xl bg-gold-tint/40 p-4 text-sm leading-relaxed text-forest">
              Somewhere you can’t talk out loud? <strong className="font-semibold">Mute coach</strong> silences
              the spoken replies — they still arrive as text — and <strong className="font-semibold">Type
              instead</strong> is there from the first screen.
            </p>
            <div className="mt-7 border-t border-hairline pt-6">
              <GuidePrimaryButton to="/talk-to-me">Talk It Through Now</GuidePrimaryButton>
            </div>
          </div>
        </GuideSection>

        {/* 6. Debrief */}
        <GuideSection
          id="debrief"
          eyebrow="Debrief"
          title="Come back after you’ve tried it"
          lede="Optional, and short. The conversation is only half of it — the learning is in what happened next."
        >
          <div className="mt-8 rounded-2xl border border-hairline bg-cream-card p-7">
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

            <div className="mt-7 border-t border-hairline pt-6">
              <GuidePrimaryButton to="/talk-to-me?mode=debrief">Debrief This Experience</GuidePrimaryButton>
            </div>
          </div>
        </GuideSection>
      </div>

      <GuideClosing
        icon={SparkleIcon}
        title="You don\u2019t have to figure it out alone."
        body="Five minutes of thinking out loud usually beats an evening of second-guessing."
        ctaTo="/talk-to-me"
        ctaLabel="Talk It Through Now"
      />
    </GuideShell>
  )
}
