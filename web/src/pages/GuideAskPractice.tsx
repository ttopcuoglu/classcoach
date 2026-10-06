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

// Teacher's guide to Practice. The route is still /guide/ask-practice, from when
// this surface was Ask & Practice and asking had not yet moved to Talk It Through
// — a live URL is not worth breaking over a name. Layout and section order come
// from components/featureGuide.tsx; everything below is content only.

import { FOCUS_AREAS } from '../lib/focusAreas'

const BENEFITS = [
  { title: 'One moment, not a reading list', body: 'One student, one period, one exchange. That’s what you rehearse and that’s what comes back.' },
  { title: 'Find the words while it’s calm', body: 'The right sentence is easier to write at 3:40 than to invent at 10:15.' },
  { title: 'Rehearse before it costs you', body: 'Try the firmer version on a scenario, not on a real fourteen-year-old.' },
  { title: 'Get it wrong somewhere safe', body: 'Nobody sees a practice attempt. That’s the whole point of one.' },
  { title: 'Compare against a model', body: 'Your response and a strong one, side by side — so you can see the gap, not just be told there is one.' },
  { title: 'Build your own bank', body: 'Star anything worth keeping and it stays in your saved list, ready to pull up again.' },
  { title: 'Watch yourself get better', body: 'Enough attempts in one category and Wivoza tells you where you’re growing.' },
]

const MOMENTS = [
  'A student said something and you froze',
  'You explained it twice and half the room still doesn’t have it',
  'A parent email is sitting in your inbox unanswered',
  'You’re not sure the grade you just entered is defensible',
  'A co-teacher undercut you in front of the class',
  'One idea in this unit goes wrong every single year',
  'A hard conversation is on tomorrow’s calendar',
  'You have five spare minutes and nothing to grade',
]

const STEPS = [
  {
    title: 'Pick the section that matches your moment',
    body: 'Four chips across the top: Teaching and Learning, Classroom Management, Conversation, Professionalism. The section is the only thing you have to decide — it quietly sets up the right kind of rehearsal underneath. Left on “Not sure yet,” your coach picks for you, weighted toward whatever you have practiced least.',
  },
  {
    title: 'Set up the rehearsal',
    body: 'For a classroom section, describe your room. Every one asks your grade band. Teaching and Learning also asks your subject, and from 6th grade up the actual course — Math 7, Algebra 1, Biology — plus whether it’s AP, honors or regular, and who is in the room: SPED/504, English learners, or both. Those last two change the coaching more than anything else on the screen, and they are kept apart on purpose — an English learner is not a student with a disability.',
  },
  {
    title: 'Or say who you’re facing',
    body: 'Conversation asks something different, because a person is not a room: who you’re up against, the kind of challenge, and how hard they push. Generate the situation, or paste in the real one you’re dreading.',
  },
  {
    title: 'Respond, badly if you like',
    body: 'Type it or speak it. Nobody sees a practice attempt — that is the entire point of one. A classroom moment comes back with coaching and a model response side by side; a conversation comes back marked on six parts of a hard exchange. Either way you can keep asking follow-ups until it actually makes sense.',
  },
  {
    title: 'Keep what works',
    body: 'Save it, share it as a read-only link, or print it. A classroom attempt can also be marked tried in class, so you can come back later and write down what actually happened.',
  },
]

// The section chip decides which of these opens; a teacher never picks an engine
// by name. Kept side by side here because the difference in what comes back is
// worth knowing before you start.
const LANES = [
  {
    icon: ScenarioIcon,
    name: 'A classroom moment',
    when: 'Teaching and Learning, Classroom Management, Professionalism.',
    detail:
      'Filter by situation and difficulty — Guided, Independent, or Challenge — and describe your room: grade band (K–2, 3–5, 6–8, 9–12) always, plus subject, course, topic, level and who’s in the room when you’re working on Teaching and Learning — courses from 6th grade up, where a schedule actually has them, with Other for whatever your district calls it. What you get handed depends on the section: a room that’s stopped following you, a misconception in a student’s own words, a piece of work on a rubric boundary, a line a colleague just said. Take one, or a Quick Session of three. Back comes coaching on your response and a model one to compare against.',
  },
  {
    icon: ChatBubbleIcon,
    name: 'A conversation',
    when: 'Conversation — a parent, student, colleague, or administrator.',
    detail:
      'Say who you’re facing, the kind of challenge, and how hard they push — supportive, concerned, resistant, or highly escalated. Generate the situation or write your own, then respond by typing or speaking. Back comes a six-part read — clarity, empathy, use of evidence, professional boundaries, collaboration, and resolution — each marked strong, developing, or needs work, plus what you did well, your one top priority, a stronger phrase to borrow, and a full model response.',
  },
]

const STORY = [
  'Fourth period, Ms. Ruiz asks a student to put his phone away. He says “you can’t make me,” loudly, and the room goes quiet and interested.',
  'What she actually says is “fine, keep it, see what happens on the test” — which ends the moment and which she regrets before the bell.',
  'That afternoon she opens Practice and picks Classroom Management. She does not have to explain the whole thing — she takes the scenario it hands her, which is near enough, and types what she wishes she had said. The coaching names what made the moment hard: the audience. The model response is a low-volume line that moves on without a standoff.',
  'She runs it three times — Guided, then Independent, then Challenge, where the student escalates instead of folding.',
  'Her third attempt still isn’t the model response. It’s shorter and it sounds like her, which is the version she’ll actually say out loud.',
  'It happens again the following week. She isn’t smooth, and he doesn’t hand over the phone. But she doesn’t say the thing she’ll regret, and the class goes back to work — which is the part that mattered.',
  'His mother emails that evening, and it is not a friendly email. She switches the section to Conversation, sets the other side to resistant, and drafts a reply she never sends. It comes back marked down on boundaries. The one she does send is her fourth try.',
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
      title="Practice · Your coaching"
      caption="An illustration of a classroom rehearsal. A Conversation comes back in a different shape — six parts of a hard exchange, each marked strong, developing, or needs work."
    >
      <div className="rounded-xl border border-hairline bg-cream p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Your scenario</p>
        <p className="mt-1.5 text-sm text-ink">
          You ask a student to put his phone away. In front of the whole class, he says &quot;you can&apos;t make
          me.&quot;
        </p>
      </div>
      <div className="rounded-xl border border-hairline bg-cream p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">What you said</p>
        <p className="mt-1.5 text-sm text-ink">
          &quot;Phone away. Now, please — I&apos;m not asking again.&quot;
        </p>
      </div>
      <div className="rounded-xl border border-hairline bg-peach-tint/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Coaching</p>
        <p className="mt-1.5 text-sm text-ink">
          The hard part here isn&apos;t the phone — it&apos;s the audience. Once twenty-eight people are watching,
          any request becomes a test of whether you can enforce it, and winning that test costs more than the
          phone is worth.
        </p>
      </div>
      <div className="rounded-xl border border-hairline bg-cream p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">A model response</p>
        <p className="mt-1.5 text-sm text-ink">
          &quot;I&apos;m not going to argue about it in front of everyone. Hang on to it for now and see me at the
          end.&quot;
        </p>
      </div>
      <div className="rounded-xl border border-mint-tint bg-mint-tint/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-forest">What to try for real</p>
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
        title="Practice"
        paragraphs={[
          'One rehearsal space for the thing you’re quietly dreading — whether it’s a room that has stopped listening or a conversation on tomorrow’s calendar.',
          'Practice hands you a realistic moment and lets you respond badly, as many times as you need, where it costs nothing. Asking a real question is Talk It Through’s job now, out loud or typed. Both are free, always, with no limit.',
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

          <div className="mt-5 flex items-start gap-3 rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-5">
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

        {/* The four sections */}
        <GuideSection
          id="four-sections"
          eyebrow="What you can bring"
          title="Four sections, not just behavior"
          lede="Practice used to be about student behavior only. It now covers the four things teachers actually come to a coach with — and the section you pick decides what kind of rehearsal opens."
        >
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {FOCUS_AREAS.map((a) => (
              <div key={a.value} className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
                <p className="font-heading text-lg font-bold text-forest">{a.label}</p>
                <p className="mt-1 text-sm font-semibold text-terracotta-600">{a.blurb}</p>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                  {a.engine === 'conversation' ? 'They open with' : 'You get handed'}
                </p>
                <p className="mt-1 text-sm italic leading-relaxed text-ink">&ldquo;{a.practiceExample}&rdquo;</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm leading-relaxed text-ink-soft">
            Conversation overlaps with Communication Coach on purpose. Come here to rehearse the exchange against
            someone who pushes back; go to Communication Coach when you need the actual email drafted or a whole
            meeting prepared.
          </p>
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
              <div key={lane.name} className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
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

          <p className="mt-6 flex items-start gap-3 rounded-xl bg-gold-tint/40 p-4 text-sm leading-relaxed text-forest">
            <SparkleIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
            <span>
              The bridge is worth knowing about: a meeting you planned in{' '}
              <strong className="font-semibold">Communication Coach</strong> has a{' '}
              <strong className="font-semibold">Practice This Meeting</strong> button that carries the real
              situation straight into a rehearsal here. Plan, then reps — without retyping a thing.
            </span>
          </p>

          <div className="mt-6">
            <SampleAnswer />
          </div>

          <div className="mt-8 flex flex-col items-start gap-3">
            <GuidePrimaryButton to="/coach-chat">Practice Now</GuidePrimaryButton>
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
          <div className="mt-8 rounded-3xl border border-hairline bg-cream-card p-7 shadow-sm">
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  icon: MicIcon,
                  title: 'Speak it instead of typing',
                  body: 'Tap the mic and say your response out loud. It’s faster than typing, you’ll say more, and it’s closer to how the real moment goes.',
                },
                {
                  icon: TargetIcon,
                  title: 'Try a Quick Session',
                  body: 'Three scenarios back to back in one sitting. Better than one scenario a week for actually building the reflex.',
                },
                {
                  icon: StarIcon,
                  title: 'Save the good ones',
                  body: 'Saved answers and attempts stay in your saved list, and your playbook export collects every one of them.',
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

            <p className="mt-6 rounded-2xl bg-mint-tint/50 p-5 text-sm leading-relaxed text-forest">
              Every filter on a classroom rehearsal is optional. Skipping all of them and hitting{' '}
              <strong className="font-semibold">New Scenario</strong> is a perfectly good way to start — you
              can always narrow it down once you know what you want to work on. Conversation asks for a little
              more up front, because who you’re facing is the whole scenario.
            </p>

            <div className="mt-7 border-t border-hairline pt-6">
              <GuidePrimaryButton to="/coach-chat">Practice Now</GuidePrimaryButton>
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
              There’s a quick version built into every classroom attempt: mark it{' '}
              <strong className="font-semibold">tried in class</strong>, then jot down what happened. Use that
              for a one-line note. Use the full debrief below when it deserves a conversation.
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
              <Link to="/coach-chat" className="text-sm font-semibold text-terracotta-600 hover:text-terracotta">
                Or reopen a saved attempt and mark it tried
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
        ctaLabel="Practice Now"
      />
    </GuideShell>
  )
}
