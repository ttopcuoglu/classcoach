import { Link } from 'react-router-dom'
import {
  ChatBubbleIcon,
  CheckIcon,
  ChecklistIcon,
  ClockIcon,
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
  GuideSection,
  GuideShell,
} from '../components/featureGuide'

// Teacher's guide to the Cheat Sheet. Layout and section order come from
// components/featureGuide.tsx; everything below is content only.

const BENEFITS = [
  { title: 'Nothing to build', body: 'It assembles itself. There is no “make a cheat sheet” step, only a star you tap elsewhere.' },
  { title: 'Only things you already approved', body: 'Every phrase here is one you read once and judged worth keeping. None of it is generic advice.' },
  { title: 'Filed by situation, not by date', body: 'You’re never looking for “that thing from October.” You’re looking under the problem you have now.' },
  { title: 'It remembers why', body: 'Each phrase carries the moment it came from, so an old note still makes sense months later.' },
  { title: 'Findable in a passing period', body: 'Six headings, short entries. It’s built to be read standing up.' },
  { title: 'No blank page in a hard moment', body: 'Starting from something beats starting from nothing when you have four minutes and a knot in your stomach.' },
  { title: 'It grows while you’re not looking', body: 'Every save you make anywhere quietly adds to it.' },
]

const MOMENTS = [
  'The class you’ve been dreading starts in ten minutes',
  'You know you’ve handled this before and can’t recall how',
  'You’re about to repeat a response that didn’t work last time',
  'A new semester, new students, same situations',
  'You have three minutes between classes and a decision to make',
  'A colleague asks what you’d actually say',
  'You’re writing sub plans and want your own language in them',
]

const STEPS = [
  {
    title: 'Save as you go',
    body: 'The star on a Practice attempt or an Ask answer is the whole input. When something sounds like a sentence you could really say, star it and move on — you don’t have to file it anywhere.',
  },
  {
    title: 'It files itself',
    body: 'A saved Practice attempt contributes its model response; a saved Ask answer contributes its follow-up guidance. Both land under the situation they belong to, and Ask answers that don’t fit a category collect under General tips instead.',
  },
  {
    title: 'Open it when you need it',
    body: 'Six headings, by situation: responding to resistance, engagement and participation, conflict and repair, interruptions and redirection, routines and transitions, and devices and digital routines. Only the ones you’ve actually saved into appear.',
  },
  {
    title: 'Read the line underneath',
    body: 'Every entry ends with “For:” and the original scenario or incident it came from. That line is what makes a four-month-old phrase usable instead of cryptic.',
  },
]

const STORY = [
  'In September, Ms. Adeyemi runs a few Practice scenarios during a quiet prep. Two of the model responses sound like things she could genuinely say out loud, so she stars them. She also saves an Ask answer about a student who shuts down the moment he’s corrected.',
  'Then she forgets all three completely. That part is normal, and it isn’t a problem.',
  'In January a student who has never given her trouble snaps at her in front of the class. She gets through the period, but she spends lunch running the same thirty seconds on a loop, drafting and discarding what she’ll say sixth period.',
  'She opens the Cheat Sheet mostly out of habit. Under Responding to resistance is a phrase she saved four months ago — and beneath it, the scenario it came from, which is the part that actually helps: she can see why she liked it.',
  'She doesn’t use it word for word. She takes the shape of it, makes it shorter, and says it to him at the door before class instead of in front of anyone.',
  'It doesn’t fix the week. But it moved her from rehearsing to deciding, which is what she needed at 12:20 with twenty minutes left.',
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
  { title: 'One practical next step', body: 'The single thing worth carrying into the next hard moment.' },
]

const DEBRIEF_ACTIONS = [
  { label: 'Continue This Conversation', body: 'Keep talking if the debrief opened something up.' },
  { label: 'Set a Next Step', body: 'Write down the one thing you’re committing to.' },
  { label: 'Save My Reflection', body: 'Keep it alongside the phrase it came from.' },
  { label: 'Start a New Talk It Through', body: 'Begin fresh on something else.' },
]

export default function GuideCheatSheet() {
  return (
    <GuideShell appTo="/cheat-sheet">
      <GuideHero
        icon={StarIcon}
        title="Cheat Sheet"
        paragraphs={[
          'Every other tool in Wivoza helps you in the moment. This one is the only place that helps you the second time — the page you open when something familiar happens and you can’t remember what worked.',
          'You never write it. It builds itself out of the things you starred while using Practice and Ask, files them by situation, and keeps the context attached so they still make sense in February.',
        ]}
      />

      <GuidePathway />

      <div className="mx-auto w-full max-w-4xl px-6">
        {/* Why it helps + when */}
        <GuideSection
          id="why-it-helps"
          eyebrow="Why it helps"
          title="You already found the answer once"
          lede="The problem was never that you didn’t know what to say. It’s that you worked it out in October and it’s January now."
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
            <SparkleIcon className="mt-0.5 h-5 w-5 shrink-0 text-terracotta-600" />
            <p className="text-sm leading-relaxed text-forest">
              <strong className="font-semibold">It’s empty when you first open it, and that’s deliberate.</strong>{' '}
              Nothing here is invented or pre-filled — it holds only what you chose to keep. An empty Cheat
              Sheet isn’t broken; it means you haven’t starred anything yet.
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
          title="One star, and then nothing"
          lede="There is no second step. Saving is the entire contribution you make to this page."
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

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-hairline bg-cream-card p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint-tint text-forest">
                <ScenarioIcon className="h-5 w-5" />
              </span>
              <p className="mt-3 font-heading text-lg font-bold text-forest">From Practice</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Star an attempt and its model response joins your sheet, filed under that scenario’s situation.
              </p>
            </div>
            <div className="rounded-2xl border border-hairline bg-cream-card p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint-tint text-forest">
                <ChatBubbleIcon className="h-5 w-5" />
              </span>
              <p className="mt-3 font-heading text-lg font-bold text-forest">From Ask</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Star an answer and its follow-up guidance joins too — under a situation when one fits, and
                under General tips when the question was a broader one.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-start gap-3">
            <GuidePrimaryButton to="/cheat-sheet">Open My Cheat Sheet</GuidePrimaryButton>
            <p className="text-xs text-ink-soft">
              Want it on paper instead? Export prints everything you’ve saved as a single “Your Playbook” page.
            </p>
          </div>
        </GuideSection>

        {/* Teacher story */}
        <GuideSection
          id="teacher-story"
          eyebrow="Teacher story"
          title="Ms. Adeyemi’s story"
          lede="Three things saved in September, entirely forgotten, and one of them exactly right in January."
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
            Forgetting what you saved is the expected case, not a failure of the system. That’s the whole
            reason the page exists.
          </p>
        </GuideSection>

        {/* Try it */}
        <GuideSection
          id="try-it"
          eyebrow="Try it"
          title="Star three things this week"
          lede="That’s the entire assignment. A sheet with three good phrases on it beats an empty one by an enormous margin."
        >
          <div className="mt-8 rounded-2xl border border-hairline bg-cream-card p-7">
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  icon: StarIcon,
                  title: 'Save low, not high',
                  body: 'Star anything you could imagine saying, not only the perfect ones. You’re collecting options, not building a monument.',
                },
                {
                  icon: TargetIcon,
                  title: 'Check the “For:” line',
                  body: 'It names the situation the phrase came from — the difference between a usable note and a cryptic one.',
                },
                {
                  icon: ChecklistIcon,
                  title: 'Look before the hard class',
                  body: 'Thirty seconds beforehand is worth more than an hour of thinking about it afterward.',
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
              A heading only appears once you’ve saved something into it, so the page stays short and reads as
              yours — never a list of empty categories waiting to be filled in.
            </p>

            <div className="mt-7 border-t border-hairline pt-6">
              <GuidePrimaryButton to="/coach-chat">Go Save Something</GuidePrimaryButton>
            </div>
          </div>
        </GuideSection>

        {/* Debrief */}
        <GuideSection
          id="debrief"
          eyebrow="Debrief"
          title="Come back after you’ve used one"
          lede="A saved phrase is a guess about your future self. Whether it actually worked in the room is the only thing that tells you if the guess was good."
        >
          <div className="mt-8 flex items-start gap-3 rounded-2xl border-l-4 border-mint-tint bg-mint-tint/30 p-5">
            <ChatBubbleIcon className="mt-0.5 h-5 w-5 shrink-0 text-forest" />
            <p className="text-sm leading-relaxed text-forest">
              This is also how a Cheat Sheet stays honest. Debriefing what you tried tells you which saved
              phrases earn their place and which ones sounded better on the screen than they did out loud.
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
              <Link to="/cheat-sheet" className="text-sm font-semibold text-terracotta-600 hover:text-terracotta">
                Or reopen your Cheat Sheet
              </Link>
            </div>
          </div>
        </GuideSection>
      </div>

      <GuideClosing
        icon={StarIcon}
        title="Your best answers, kept."
        body="You solve these problems constantly. This is the only page that makes sure you solve them once."
        ctaTo="/cheat-sheet"
        ctaLabel="Open My Cheat Sheet"
      />
    </GuideShell>
  )
}
