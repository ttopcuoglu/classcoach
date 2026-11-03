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
  GuideSample,
  GuideSection,
  GuideShell,
} from '../components/featureGuide'

// Teacher's guide to Lesson Debrief. Layout and section order come from
// components/featureGuide.tsx; everything below is content only.

const BENEFITS = [
  { title: 'See what you can’t see while teaching', body: 'You’re running the room. The recording isn’t.' },
  { title: 'Trade impressions for evidence', body: '“That explanation landed” — and here are the exact moments that show whether it did.' },
  { title: 'Find patterns, not verdicts', body: 'One lesson is a snapshot. Four start to tell you something.' },
  { title: 'Get a content coach’s eye', body: 'Your examples, models and vocabulary, read the way a specialist in your subject would.' },
  { title: 'Stop guessing what to work on', body: 'Pick one focus metric and watch just that one move.' },
  { title: 'Get credit for what’s working', body: 'The report names a strength before it names anything else.' },
  { title: 'Walk in prepared', body: 'Your own read on your teaching, before anyone else offers theirs.' },
]

const MOMENTS = [
  'You’re trying a new discussion structure',
  'Participation feels uneven and you can’t say why',
  'You’re teaching a concept students always find hard',
  'You’re working on one specific move — questioning, follow-ups, checks',
  'A unit isn’t landing the way it did last year',
  'A coach or AP named a focus and you want your own read on it',
  'You’re curious how much of the period is actually you talking',
  'You want a baseline before you change anything',
]

const STEPS = [
  {
    title: 'Press Record',
    body: 'A big timer, a Pause button, and a Stop button — that’s the whole screen, with nothing to fill in first. It records in your browser or the iPhone app; nothing extra on your desk.',
  },
  {
    title: 'Tell it which voice is yours',
    body: 'Wivoza separates the speakers, then shows you a sample line from each and asks which one is the teacher. Everyone else is grouped together as Student. Then the audio is discarded — only the text goes on.',
  },
  {
    title: 'Read the report',
    body: 'Summary first: one thing to try next lesson, what the lesson covered, an idea for taking the content further, how the lesson moved, and its numbers — talk, pace, questions and checks. Content Specialist reads how you taught the content. Insights holds the detail. My Growth shows the same numbers trending across every session you’ve recorded.',
  },
  {
    title: 'Talk it through',
    body: 'The Reflect tab is a spoken conversation about what the report found — pick a starting point, or just say what’s on your mind. When you finish, your notes are written from the conversation: what you noticed, what you want to explore, your next step with a date to follow up, and a focus for your next recording.',
  },
]

const TABS = [
  {
    name: 'Summary',
    body: 'Your one focus for next lesson, what the lesson covered, how the lesson moved, the lesson’s numbers, one thing to keep doing, and a “Try next time” list you can carry straight into your next plan. Save the whole report as a PDF from here.',
  },
  {
    name: 'Insights',
    body: 'Four sections when you want the detail: Talk & Participation, Questioning & Checking, Clarity & Content, Climate & Routines — each shown in your own words, with the times you said them.',
  },
  {
    name: 'Content Specialist',
    body: 'How you taught this content, read the way a specialist in the subject would — what worked and why, where it could go further, each tied to a moment you said. Then where students usually get stuck in this topic, and the move that heads it off.',
  },
  {
    name: 'Rubric lens',
    body: 'On request, the same lesson sorted under the Danielson rubric, with one next step for each component. Never a level or a score. Below it, the Hard Look, when you want the least generous reading the evidence supports.',
  },
  {
    name: 'Reflect',
    body: 'A spoken debrief with your coach. When you finish, your notes are written from what you said — edit them, or come back and talk more any time.',
  },
  {
    name: 'My Growth',
    body: 'The Summary’s numbers — talk time, pace, questions and checks — trended over time. Choose one as your focus and it’s highlighted here and on Summary.',
  },
]

const STORY = [
  'Mr. Boateng is proud of his cellular respiration lesson. He has taught it for nine years, the equation goes up on the board, and students can recite it by the end of the period. He records it expecting the report to confirm what he already believes.',
  'Content Specialist agrees with part of it. His “what if the cell had no oxygen?” question made students predict before he named fermentation — that worked, and the note says why. But the equation went up as one line, and the note at 9:42 suggests tracking a single glucose molecule through each stage, so students can see where the energy actually leaves.',
  'His first reaction is to argue with it: the students knew the equation. Which is true, and it’s also the point — knowing the equation isn’t the same as knowing where the energy goes.',
  'In the Reflect tab he says exactly that out loud. Coach asks what a student would say if he asked where the energy goes. He doesn’t love the answer: probably “into the ATP,” with no idea how.',
  'His next step is small enough to actually do: one glucose molecule, followed on the board through glycolysis, the Krebs cycle and the electron transport chain. He carries it into Planning Coach for next year’s unit, and tries it with a different section on Thursday.',
  'The Thursday recording isn’t a transformation. But the “What worked” note now names the glucose walk-through, students’ questions are about the stages rather than the formula, and My Growth shows more of his questions going beyond recall.',
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

function SampleReport() {
  return (
    <GuideSample
      title="Lesson report · Summary"
      caption="An illustration of the Summary tab, not a real report — your own numbers will look nothing like these."
    >
      <div>
        <p className="text-lg font-semibold text-ink">Biology · Period 3</p>
        <p className="mt-0.5 text-xs text-ink-soft">Tue, Jan 14 · 9th grade · 41:20</p>
        <p className="mt-1.5 text-xs text-ink-soft">Recorded 41:20 · 86% came through as audible speech</p>
      </div>

      <div className="rounded-xl border-l-4 border-terracotta bg-peach-tint/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Next lesson, try this</p>
        <p className="mt-1.5 text-sm text-ink">Your “what if the cell had no oxygen?” question got students reasoning.</p>
        <p className="mt-1 text-sm font-semibold text-ink">After a student answers, ask one more “why?” before you move on.</p>
        <p className="mt-1.5 text-xs text-ink-soft">Why this › · Choose a different one</p>
      </div>

      <div className="rounded-xl border border-hairline bg-cream-card p-4">
        <p className="text-sm text-ink-soft">
          Students worked through cell respiration, moving from a modelled example to small-group analysis of
          what happens when oxygen runs short.
        </p>
        <div className="mt-3 border-l-4 border-terracotta pl-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">An idea for next time</p>
          <p className="mt-1 text-sm italic text-ink">
            Follow one glucose molecule through each stage on the board, so students see where the energy actually leaves.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-hairline bg-cream-card p-4">
        <p className="text-sm font-semibold text-ink">How the lesson moved</p>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
          {[
            { role: 'Opened with', title: 'Recapping photosynthesis', time: '0:00–6:40' },
            { role: 'Built', title: 'Walking through the respiration equation', time: '6:40–18:15' },
            { role: 'Applied to', title: 'Groups predicting a cell short of oxygen', time: '18:15–end' },
          ].map((st) => (
            <div key={st.role} className="rounded-lg bg-cream px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-terracotta-600">{st.role}</p>
              <p className="text-sm font-semibold leading-snug text-ink">{st.title}</p>
              <p className="font-mono text-[11px] text-ink-soft">{st.time}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Teacher Talk', value: '62', unit: '%', tint: 'bg-peach-tint' },
          { label: 'Student Talk', value: '18', unit: '%', tint: 'bg-gold-tint' },
          { label: 'Group Talk', value: '9', unit: '%', tint: 'bg-lavender-tint' },
          { label: 'Silence', value: '11', unit: '%', tint: 'bg-mint-tint' },
          { label: 'Pace', value: '148', unit: 'wpm', tint: 'bg-peach-tint' },
          { label: 'Questions', value: '22', unit: '', tint: 'bg-mint-tint' },
          { label: 'Checks', value: '3', unit: '', tint: 'bg-gold-tint' },
        ].map((t) => (
          <div key={t.label} className={`rounded-xl px-3 py-2.5 ${t.tint}`}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-forest/60">{t.label}</p>
            <p className="font-heading text-2xl font-extrabold leading-tight text-forest">
              {t.value}
              {t.unit && <span className="ml-0.5 text-sm font-bold">{t.unit}</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-mint-tint bg-mint-tint/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-forest">Keep doing</p>
        <p className="mt-1.5 text-sm text-ink">
          “What would change if the cell had no oxygen at all?” <span className="text-xs text-ink-soft">14:32</span>
        </p>
      </div>
    </GuideSample>
  )
}

export default function GuideLessonDebrief() {
  return (
    <GuideShell appTo="/audio-coaching">
      <GuideHero
        icon={MicIcon}
        title="Lesson Debrief"
        paragraphs={[
          'You can’t watch your own class while you’re teaching it. Lesson Debrief records one period and turns it into something you can actually look at afterward.',
          'Wivoza transcribes the recording and hands back a report on how you taught the content: what worked in your explanations and examples, where they could go further, and where students usually get stuck in this topic. Alongside it, the questions you asked, how the talking was shared, and how your directions sounded. Then you talk it through with your coach and decide what to change. No score, no rating, no one else sees it.',
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

          <div className="mt-5 flex items-start gap-3 rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-5">
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
              <li key={step.title} className="flex items-start gap-4 rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
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

          <div className="mt-6 rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
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

          <div className="mt-6">
            <SampleReport />
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
          lede="A lesson he was proud of, a note he didn’t expect, and a change small enough to keep."
        >
          <div className="mt-8 rounded-3xl border border-hairline bg-cream-card p-7 shadow-sm sm:p-9">
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
          <div className="mt-8 rounded-3xl border border-hairline bg-cream-card p-7 shadow-sm">
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
                report, or delete it outright.
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

          <div className="mt-5 rounded-3xl border border-hairline bg-cream-card p-7 shadow-sm">
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
                  <div key={r.title} className="rounded-2xl bg-mint-tint/50 p-5">
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
