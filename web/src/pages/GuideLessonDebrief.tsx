import { Link } from 'react-router-dom'
import {
  BrainIcon,
  ChartBarIcon,
  ChatBubbleIcon,
  CheckIcon,
  ClockIcon,
  LockIcon,
  MicIcon,
  QuoteIcon,
  ShieldIcon,
  TargetIcon,
} from '../components/icons'
import {
  GuideClosing,
  GuideHero,
  GuidePathway,
  GuidePrimaryButton,
  GuideSection,
  GuideShell,
} from '../components/featureGuide'

// Teacher's guide to Lesson Debrief. Layout and section order come from
// components/featureGuide.tsx; everything below is content only.

const BENEFITS = [
  { title: 'See what you can’t see while teaching', body: 'You’re running the room. The recording isn’t.' },
  { title: 'Trade impressions for evidence', body: '“That discussion went well” — and here’s what the talk time actually shows.' },
  { title: 'Find patterns, not verdicts', body: 'One lesson is a snapshot. Four start to tell you something.' },
  { title: 'Notice the small levers', body: 'Wait time, follow-up questions, whose names you say out loud.' },
  { title: 'Stop guessing what to work on', body: 'Pick one focus metric and watch just that one move.' },
  { title: 'Get credit for what’s working', body: 'The report names a strength before it names anything else.' },
  { title: 'Walk in prepared', body: 'Your own read on your teaching, before anyone else offers theirs.' },
]

const MOMENTS = [
  'You’re trying a new discussion structure',
  'Participation feels uneven and you can’t say why',
  'You’re working on one specific move — wait time, cold call, checks',
  'A unit isn’t landing the way it did last year',
  'A coach or AP named a focus and you want your own read on it',
  'You’re curious how much of the period is actually you talking',
  'You want a baseline before you change anything',
]

const STEPS = [
  {
    title: 'Press Record',
    body: 'A big timer, a Pause button, and a Stop button — that’s the whole screen. Class, period, and grade are optional. It records in your browser; no app to install, no device on your desk.',
  },
  {
    title: 'Tell it which voice is yours',
    body: 'Wivoza separates the speakers, then shows you a sample line from each and asks which one is the teacher. Everyone else is grouped together as Student. Then the audio is discarded — only the text goes on.',
  },
  {
    title: 'Read the report',
    body: 'Summary first: a plain-language read of the lesson, one strength, the evidence behind it, and your focus metric. Insights holds the detail. My Growth shows the same numbers trending across every session you’ve recorded.',
  },
  {
    title: 'Talk it through',
    body: 'The Reflect tab is a spoken conversation about what the report found — pick a starting point, or just say what’s on your mind. Finish with your own notes: strengths, growth areas, your next step, and a date to follow up.',
  },
]

const TABS = [
  {
    name: 'Summary',
    body: 'Lesson at a glance, one named strength, the evidence it came from, and a “try next time” tip tied to your focus.',
  },
  {
    name: 'Insights',
    body: 'Five sections when you want the detail: Talk & Participation, Questions & Thinking, Checks & Feedback, Clarity & Content, Climate & Routines.',
  },
  {
    name: 'Reflect',
    body: 'A spoken debrief with your coach, then your own notes — and a Lock button when you’re done with the report for good.',
  },
  {
    name: 'My Growth',
    body: 'Ten metrics trended over time. Choose one as your focus and it’s highlighted here and on Summary.',
  },
]

const STORY = [
  'Mr. Boateng is proud of third-period science. It’s discussion-based, students argue about evidence, and the room is never quiet. He records it expecting the report to confirm what he already believes.',
  'It doesn’t, exactly. Talk & Participation shows he was speaking for 74% of the period. His average wait time after a question is 1.2 seconds.',
  'His first reaction is to argue with it — a lot of that talk was him restating student ideas so the class could hear them. Which is true, and it’s also the finding.',
  'In the Reflect tab he says exactly that out loud. Coach asks what would happen if he waited instead of restating. He doesn’t love the answer: probably silence, and he’d fill it.',
  'His next step is small enough to actually do: after each open question, count to five in his head before saying anything. He writes it in his notes and sets a follow-up date for two weeks out.',
  'The next recording isn’t a transformation. Wait time is 2.9 seconds and his talk share is 66% — better, not fixed. But My Growth now has two points on a line instead of one opinion, and he knows which direction it’s going.',
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
  { title: 'One practical next step', body: 'The single thing worth carrying into the next recording.' },
]

const DEBRIEF_ACTIONS = [
  { label: 'Continue This Conversation', body: 'Keep talking if the debrief opened something up.' },
  { label: 'Set a Next Step', body: 'Write down the one thing you’re committing to.' },
  { label: 'Save My Reflection', body: 'Keep it to come back to before your next recording.' },
  { label: 'Start a New Talk It Through', body: 'Begin fresh on something else.' },
]

export default function GuideLessonDebrief() {
  return (
    <GuideShell appTo="/audio-coaching">
      <GuideHero
        icon={MicIcon}
        title="Lesson Debrief"
        paragraphs={[
          'You can’t watch your own class while you’re teaching it. Lesson Debrief records one period and turns it into something you can actually look at afterward.',
          'Wivoza transcribes the recording and hands back a report: how the talking was shared, what kinds of questions you asked, how long you waited for answers, how transitions went. Then you talk it through with your coach and decide what to change. No score, no rating, no one else sees it.',
        ]}
      />

      <GuidePathway />

      <div className="mx-auto w-full max-w-4xl px-6">
        {/* Why it helps + when to use it */}
        <GuideSection
          id="why-it-helps"
          eyebrow="Why it helps"
          title="Evidence beats memory"
          lede="Not because your read on the lesson is wrong, but because you were busy running it. The recording was only listening."
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
            <div className="text-sm leading-relaxed text-forest">
              <p>
                <strong className="font-semibold">You are never scored.</strong> There’s no grade, no rank, no
                rating anywhere in the report, and nothing here is visible to your school.
              </p>
              <p className="mt-2">
                The report is also honest about its own limits. Something it couldn’t measure reliably says so
                instead of quietly showing a zero, and a short recording is labeled a short excerpt up front —
                so you know which numbers to lean on.
              </p>
            </div>
          </div>

          <div className="mt-10">
            <h3 className="flex items-center gap-2.5 font-heading text-lg font-bold text-forest">
              <ClockIcon className="h-5 w-5 text-terracotta-600" />
              Good weeks to record
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
          title="Record once, then take your time"
          lede="The recording takes a class period and no extra effort. Reading the report is the part worth sitting down for."
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

          <div className="mt-6 rounded-2xl border border-hairline bg-cream-card p-6">
            <h3 className="font-heading text-base font-bold text-forest">What’s in the report</h3>
            <ul className="mt-4 flex flex-col gap-2.5">
              {TABS.map((t) => (
                <li key={t.name} className="flex items-start gap-2.5 text-sm">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
                  <span className="text-ink-soft">
                    <strong className="font-semibold text-forest">{t.name}</strong> — {t.body}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 flex flex-col items-start gap-3">
            <GuidePrimaryButton to="/audio-coaching">Record a Lesson</GuidePrimaryButton>
            <p className="text-xs text-ink-soft">
              Your audio is never saved — it’s transcribed and then discarded. Three recordings a month on the
              free plan.
            </p>
          </div>
        </GuideSection>

        {/* Teacher story */}
        <GuideSection
          id="teacher-story"
          eyebrow="Teacher story"
          title="Mr. Boateng’s story"
          lede="A lesson he was proud of, a number he didn’t like, and a change small enough to keep."
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
            Arguing with the report is a normal first reaction, and often the useful one — it’s usually where
            the real conversation starts.
          </p>
        </GuideSection>

        {/* Try it */}
        <GuideSection
          id="try-it"
          eyebrow="Try it"
          title="Record an ordinary Tuesday"
          lede="Not your showcase lesson. A normal day tells you far more, and there’s nothing to prepare."
        >
          <div className="mt-8 rounded-2xl border border-hairline bg-cream-card p-7">
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  icon: MicIcon,
                  title: 'Twenty minutes is plenty',
                  body: 'You don’t need a whole period. A short recording is labeled as an excerpt so you read it accordingly.',
                },
                {
                  icon: ChartBarIcon,
                  title: 'Start with Summary',
                  body: 'Read that tab and stop. Insights will still be there when you want the detail.',
                },
                {
                  icon: TargetIcon,
                  title: 'Pick one focus',
                  body: 'One metric, tracked across sessions. Ten at once is how a report becomes wallpaper.',
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

            <p className="mt-6 flex items-start gap-3 rounded-xl bg-gold-tint/40 p-4 text-sm leading-relaxed text-forest">
              <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
              <span>
                It stays yours: set how long recordings are kept in Profile &amp; Settings, print or save a
                report, lock one to make it permanently read-only, or delete it outright.
              </span>
            </p>

            <div className="mt-7 border-t border-hairline pt-6">
              <GuidePrimaryButton to="/audio-coaching">Record a Lesson</GuidePrimaryButton>
            </div>
          </div>
        </GuideSection>

        {/* Debrief */}
        <GuideSection
          id="debrief"
          eyebrow="Debrief"
          title="Come back after you’ve tried it"
          lede="The report is evidence. The debrief is what you did about it — and that’s the part that actually changes a classroom."
        >
          <div className="mt-8 flex items-start gap-3 rounded-2xl border-l-4 border-mint-tint bg-mint-tint/30 p-5">
            <ChatBubbleIcon className="mt-0.5 h-5 w-5 shrink-0 text-forest" />
            <p className="text-sm leading-relaxed text-forest">
              Lesson Debrief has two reflection moments, and they do different jobs. The{' '}
              <strong className="font-semibold">Reflect tab</strong> happens right after the lesson, while the
              evidence is in front of you. This debrief happens later — after you’ve taught with the change and
              found out whether it worked.
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
                Or reopen a past report’s Reflect tab
              </Link>
            </div>
          </div>
        </GuideSection>
      </div>

      <GuideClosing
        icon={BrainIcon}
        title="One period. One thing worth changing."
        body="You already know your teaching. This just shows you the part you were too busy to watch."
        ctaTo="/audio-coaching"
        ctaLabel="Record a Lesson"
      />
    </GuideShell>
  )
}
