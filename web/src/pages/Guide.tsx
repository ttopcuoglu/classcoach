import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import SupportChat from '../components/SupportChat'
import { TrainingLibrary } from '../components/TrainingVideos'
import {
  ArrowRightIcon,
  BookIcon,
  BrainIcon,
  CheckIcon,
  ChecklistIcon,
  HeadsetIcon,
  HomeIcon,
  LockIcon,
  MicIcon,
  ScenarioIcon,
  SparkleIcon,
  UserIcon,
  WaveformIcon,
} from '../components/icons'
import FooterContact from '../components/FooterContact'

// Old pastel icon tints mapped onto the app's solid badges.
const TINT_BADGES: Record<string, string> = {
  'bg-mint-tint text-forest': 'bg-forest text-gold',
  'bg-peach-tint text-terracotta': 'bg-terracotta text-cream',
  'bg-gold-tint text-terracotta-600': 'bg-gold text-forest',
  'bg-lavender-tint text-[#6B5FA0]': 'bg-forest text-gold',
}
const SECTION_BADGES = ['bg-gold text-forest', 'bg-terracotta text-cream', 'bg-forest text-gold']

function SectionLabel({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl font-heading text-base font-bold ${
          SECTION_BADGES[(n - 1) % SECTION_BADGES.length]
        }`}
      >
        {n}
      </span>
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta-600">{label}</span>
    </div>
  )
}

type IconComponent = (props: { className?: string }) => React.ReactElement
type SpecItem = { label: string; body: string }
type Feature = {
  id: string
  icon: IconComponent
  tint: string
  nav: string
  title: string
  intro: string
  specs: SpecItem[]
  // Set once a feature has its own teacher's guide — the walkthrough of why
  // and when to use it, told through a real classroom situation. This page
  // stays the complete reference; that one is the coaching version.
  guideTo?: string
}
type Chapter = { id: string; label: string; tint: string; intro: string; features: Feature[] }

/// The jump nav at the top. Each entry's `to` must match a section's own id.
const JUMP_NAV: { label: string; to: string }[] = [
  { label: 'Videos', to: 'videos' },
  { label: 'Getting started', to: 'getting-started' },
  { label: 'Talking and rehearsing', to: 'talking-and-rehearsing' },
  { label: 'Before and after', to: 'before-and-after' },
  { label: 'Grow', to: 'grow' },
  { label: 'Across the app', to: 'across-the-app' },
  { label: 'Privacy', to: 'privacy' },
  { label: 'For schools', to: 'for-schools' },
]

function SpecList({ items }: { items: SpecItem[] }) {
  return (
    <ul className="mt-4 flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-2.5 text-sm">
          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
          <span className="text-ink-soft">
            <strong className="font-semibold text-forest">{item.label}</strong> — {item.body}
          </span>
        </li>
      ))}
    </ul>
  )
}

function FeatureBlock({ feature }: { feature: Feature }) {
  const Icon = feature.icon
  return (
    <div id={feature.id} className="scroll-mt-24 rounded-3xl border border-hairline bg-cream-card p-7 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${TINT_BADGES[feature.tint] ?? 'bg-forest text-gold'}`}>
            <Icon className="h-5 w-5" />
          </span>
          <h3 className="font-heading text-xl font-bold text-forest">{feature.title}</h3>
        </div>
        <span className="rounded-full bg-mint-tint/60 px-2.5 py-1 text-[11px] font-semibold text-forest">
          {feature.nav}
        </span>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">{feature.intro}</p>
      <SpecList items={feature.specs} />
      {feature.guideTo && (
        <Link
          to={feature.guideTo}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-terracotta-600 hover:text-terracotta"
        >
          Read the teacher's guide to {feature.title}
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  )
}

const GETTING_STARTED: Chapter = {
  id: 'getting-started',
  label: 'Getting started',
  tint: 'bg-gold-tint text-terracotta-600',
  intro: 'Everything between opening wivoza.com and landing on your own dashboard.',
  features: [
    {
      id: 'signup',
      icon: LockIcon,
      tint: 'bg-gold-tint text-terracotta-600',
      nav: 'wivoza.com',
      title: 'Signing up',
      intro: 'Two ways in, same destination either way.',
      specs: [
        { label: 'Google', body: 'one click, no password to create, no separate terms step — signing in counts as agreeing to Wivoza\'s terms.' },
        { label: 'Email & password', body: 'name, email, an 8-character-minimum password, and one checkbox confirming you\'re 13+ and agree to the terms — the button stays disabled until it\'s checked.' },
        { label: 'Already have an account?', body: 'the same card toggles between Sign up and Log in, no separate page.' },
      ],
    },
    {
      id: 'onboarding',
      icon: ChecklistIcon,
      tint: 'bg-gold-tint text-terracotta-600',
      nav: 'First sign-in',
      title: 'The onboarding walkthrough',
      intro: 'A six-step wizard that runs once. Every step has a "Skip for now" link, and whatever you\'ve filled in before skipping is saved as you go.',
      specs: [
        { label: '1. About you', body: 'your name, and your role — Teacher, Instructional Coach, Assistant Principal, Principal, District Leader, or Other.' },
        { label: '2. Classroom', body: 'school name, an optional school/district join code, grade levels, and subjects.' },
        { label: '3. Mic check', body: 'a live level meter — the confirm button only unlocks once it actually detects sound.' },
        { label: '4. Live demo', body: 'read one line aloud to see real coaching detection work on your own voice.' },
        { label: '5. Your goal', body: 'finish "I\'d like my students to ___," typed yourself or from a suggested chip.' },
        { label: '6. Initial focus', body: 'pick one metric, from grouped categories, for My Growth to track first — changeable anytime.' },
      ],
    },
    {
      id: 'home',
      icon: HomeIcon,
      tint: 'bg-gold-tint text-terracotta-600',
      nav: 'Home',
      title: 'Home',
      intro: 'Your dashboard — built entirely from your own activity, never a generic template.',
      specs: [
        { label: 'Your next step', body: 'the greeting at the top suggests one concrete thing to do next — reflect on your last lesson, record your first one, or try a tool you haven\'t opened yet — with a button that takes you straight there.' },
        { label: 'Quick actions', body: 'three large one-tap cards for Lesson Debrief, Talk It Through, and Practice.' },
        { label: 'Your coaching path', body: 'a static Notice → Practice → Try → Reflect explainer.' },
        { label: 'Classroom pulse', body: 'a donut chart of your latest lesson\'s student-talk %, plus a sparkline once you have a few sessions.' },
        { label: 'Mood check-in', body: 'tap Good / Okay / Stressed / Overwhelmed and Wivoza quietly suggests a relevant practice category.' },
        { label: 'Daily tip, quick links, and recent work', body: 'a tip box, a link to your growth and to My Work, and a feed of your last few sessions.' },
      ],
    },
  ],
}

const TALK_IT_THROUGH: Feature = {
  id: 'talk-it-through',
  icon: WaveformIcon,
  tint: 'bg-mint-tint text-forest',
  nav: 'Talk It Through',
  title: 'Talk It Through',
  guideTo: '/guide/talk-it-through',
  intro: 'A live, spoken back-and-forth with Coach — tap Start Talking (or one of the example prompts) and just talk. Prefer to type? Type instead is always one tap away.',
  specs: [
    { label: 'Listening', body: 'a mic icon with a ring that visibly pulses in real time with your actual volume.' },
    { label: 'Thinking', body: 'three gently bouncing dots and "One moment" — covers both transcribing what you said and Coach composing its reply, shown as one continuous state rather than two confusing ones.' },
    { label: 'Speaking', body: 'an animated equalizer plays while Coach\'s reply is read aloud.' },
    { label: 'Mute', body: 'silences Coach\'s voice without ending the conversation — replies still appear as text.' },
    { label: 'Pause mic / Exit', body: 'Pause mic stops listening and releases the microphone while you stay in the conversation; Exit leaves at any point.' },
    { label: 'Continuity', body: 'if Coach\'s memory is on, it can reference real patterns from your past Ask and Talk It Through conversations.' },
    { label: 'Privacy', body: 'your voice itself is never saved — only the resulting conversation text.' },
  ],
}

const REPORT_TABS: SpecItem[] = [
  { label: 'Summary', body: 'the 60-second read, led by one next step. Then a plain-language "Lesson at a glance," one named Strength to keep, your focus metric with a "try next time" tip, an "Evidence from the lesson" row (who was heard, questions opened, a moment worth revisiting), and the lesson in its own words. Anything the recording could not judge is collected into one line rather than a panel per absence. Every card links through to Insights.' },
  { label: 'Insights', body: 'the detail, in three sections — see below.' },
  { label: 'My notes', body: 'your own written reflection: what you noticed, what you want to explore, your next step and a follow-up date, plus the focus for your next recording. A Lock button makes the whole report permanently read-only. Talking it through happens in Talk It Through now — pressing Discuss anywhere in the report hands the lesson over, carrying what was measured with it, so the conversation joins the rest of yours and can become a check-in.' },
  { label: 'Rubric Lens', body: 'not a tab but a toggle beside them: it re-reads the whole report through your evaluation framework\'s components. Evidence, never a rating and never a level, and only ever generated when you ask.' },
  { label: 'My Growth', body: 'ten metrics trended across every session you\'ve recorded — talk ratio, higher-order-question %, average wait time, checks for understanding, follow-up questions, redirection language, positive-vs-corrective tone, clear directions given, student names used, and feedback specificity. Pick one as your active focus and it\'s highlighted here and on Summary.' },
]

// Three, down from six. Questions & Thinking and Checks & Feedback were one
// question asked twice, and Clarity & Content folded into Summary, where the
// lesson's own words already sit beside what the lesson was about.
const INSIGHTS_SECTIONS: SpecItem[] = [
  { label: 'Talk & Participation', body: 'the teacher / student / silence split for the period, how many separate times students spoke, and a coach-voice read of what the balance suggests.' },
  { label: 'Questions & Checks', body: 'every question you asked, logged and tagged recall or higher-order, with the wait time after each one and any follow-ups that built on it — and, on the same page, the checks for understanding you used and how much of your feedback was specific rather than general. What you asked and whether it landed is one question, so it is one page.' },
  { label: 'Climate & Routines', body: 'transitions between activities, clear task directions given, student names used, positive-vs-corrective tone balance, and redirection language — each a plain count with a coach-voice note, never a behavior score.' },
]

const LESSON_DEBRIEF: Feature = {
  id: 'lesson-debrief',
  icon: MicIcon,
  tint: 'bg-mint-tint text-forest',
  nav: 'Lesson Debrief',
  title: 'Lesson Debrief',
  guideTo: '/guide/lesson-debrief',
  intro: 'Record a real class period; Wivoza transcribes it, asks you which voice is the teacher, and turns it into a four-tab report — no audio is ever kept, only the text and what it shows.',
  specs: [
    { label: 'Before recording', body: 'class/subject, period, grade level, and session date are all optional.' },
    { label: 'While recording', body: 'a running timer with record, pause, resume, and stop controls, capturing entirely in your browser.' },
    { label: 'After you stop', body: 'Wivoza transcribes the recording, then shows you a sample line from each detected voice and asks which one is the teacher — everyone else is grouped as Student. The audio is discarded at that point; only the text goes on to the report.' },
    { label: 'Managing sessions', body: 'set a retention period in Profile (7 / 30 / 90 days, or indefinite), lock a report to make it permanently read-only, export a printable copy, or delete it outright.' },
  ],
}

const PRACTICE: Feature = {
  id: 'practice',
  icon: ScenarioIcon,
  tint: 'bg-mint-tint text-forest',
  nav: 'Practice',
  title: 'Practice',
  guideTo: '/guide/practice',
  intro: 'One realistic moment at a time, rehearsed before it happens for real.',
  specs: [
    { label: 'Four rows', body: 'topic, then the kind of moment within it, then your class, then difficulty — each row narrows the one below, so a choice that cannot apply is never shown.' },
    { label: 'Topic', body: 'the same seven as Talk It Through. The kinds offered change with it: Classroom Management gives engagement, behaviour in the moment, routines, phones, group work; Parent Communication gives hard news, angry or accusatory, a grade dispute, attendance, a boundary.' },
    { label: 'Your class', body: 'one line from your profile. Teaching and Learning also asks what you are teaching right now, because its scenarios are about your actual content rather than delivery technique in the abstract.' },
    { label: 'Difficulty', body: 'Beginner, Intermediate or Advanced, labelled as the scenario\'s difficulty rather than yours.' },
    { label: 'Describe my own', body: 'always offered. Type the situation you already have in mind and rehearse that instead — and it is where a "want to rehearse it?" handoff from Talk It Through lands, with your own words in the box.' },
    { label: 'Getting a scenario', body: '"New Scenario" one at a time, or a "Quick Session" of three back to back; respond by typing or speaking.' },
    { label: 'Feedback', body: 'three named parts — what your move did, what it left on the table, and one line worth keeping — then the offer to run the same situation one notch harder.' },
    { label: 'Never scored', body: 'a private 1-5 rating steers which scenarios you are offered next. You never see it as a number and neither does anyone else.' },
  ],
}

const LOOK_IT_OVER: Feature = {
  id: 'look-it-over',
  icon: BookIcon,
  tint: 'bg-peach-tint text-terracotta',
  nav: 'Look It Over',
  title: 'Look It Over',
  guideTo: '/guide/look-it-over',
  intro: 'One drop zone for anything you made, read before students or parents see it. It replaced four separate review tools.',
  specs: [
    { label: 'Getting it in', body: 'drag a file, choose one (.docx, .pdf, .pptx, .xlsx, .txt), paste the text, or photograph it — a paper quiz snapped on a phone has its own button and goes through OCR.' },
    { label: 'What is this?', body: 'the type is detected and you confirm it — "Looks like a quiz — right?" — with seven chips to correct it in one tap. A weak guess arrives with the chips already open.' },
    { label: 'The seven types', body: 'quiz or exam, homework, assignment, project, lesson plan, presentation, message.' },
    { label: 'Lenses', body: 'each type opens with the questions worth asking about it, individually toggleable, with the count visible. AI-completion risk starts on for homework, assignments and projects, and off for a quiz — which is sat in the room.' },
    { label: 'The result', body: 'leads with "If you change one thing", then any timing estimate as a range with its assumption, then the lenses you left on.' },
    { label: 'Suggested edits', body: 'a marked-up diff, never a replacement document: each edit shows your original struck through, the revision, and why, with "Keep mine" and "Use this" per edit. The export button reads "Export my original" until you accept something, then "Export with N changes".' },
    { label: 'Redesign for meaningful AI use', body: 'an action from a student-work result, pre-seeded with the document you just uploaded.' },
    { label: 'Stated limits', body: 'the footer says plainly that it read the document only — not your students, not last week, not what you will say out loud.' },
  ],
}

const GROW: Chapter = {
  id: 'grow',
  label: 'Grow',
  tint: 'bg-lavender-tint text-[#6B5FA0]',
  intro: 'The tools that build on everything else you\'ve done in Wivoza.',
  features: [
    {
      id: 'my-work',
      icon: ChecklistIcon,
      tint: 'bg-gold-tint text-terracotta-600',
      nav: 'My Work',
      title: 'My Work',
      intro: 'One history for everything you have made, newest first — it replaced a separate past-list inside each tool.',
      specs: [
        { label: 'By surface', body: 'chips for all four, each with its own count. The count shows even at zero, so an empty list reads as a filter rather than as nothing to show.' },
        { label: 'By topic', body: 'the same seven topics, but only the ones you actually have work under — offering all seven when five are empty would be a row of dead ends.' },
        { label: 'Saved only', body: 'narrows to the ones you starred.' },
        { label: 'Filters live in the URL', body: 'so a filtered view can be bookmarked and returned to, and the back button undoes a filter instead of leaving the page.' },
        { label: 'Older work is here too', body: 'anything you made before the app had four surfaces is listed under the surface it belongs to, and opening it opens the page you wrote it on. Nothing was moved or rewritten to make this list.' },
      ],
    },
    {
      id: 'profile',
      icon: UserIcon,
      tint: 'bg-lavender-tint text-[#6B5FA0]',
      nav: 'Profile & Settings',
      title: 'Profile & Settings',
      intro: 'Everything about your account and your data, in one place.',
      specs: [
        { label: 'Basic info', body: 'your name, grade levels, and subjects taught.' },
        { label: 'Your classes', body: 'a line per class you teach — most teachers have two or three preps, and one stored room made the app wrong for all but one of them. Coaching starts from your default one and you can switch any time. Add, remove, or Make default; nothing here is required.' },
        { label: 'Filled in as you go', body: "Wivoza infers a first guess from what you have already told it, and the odd time a surface needs something it does not have it asks one question inline — never a form, and never before letting you do the thing you came to do. Whatever it saves says so, with a \"not quite?\" link that undoes it. At the start of a school year it asks you to confirm the list is still right." },
        { label: 'What Coach remembers', body: 'read the running profile Coach keeps about you, turn it off, or clear it entirely.' },
        { label: 'School', body: 'join with a code, or see the school/district you\'re already part of.' },
        { label: 'Lesson Debrief retention', body: 'keep transcripts and reports indefinitely, or auto-delete after 7, 30, or 90 days.' },
        { label: 'Export playbook', body: 'a printable page of everything you\'ve saved.' },
        { label: 'Reset & clear data', body: 'a permanent, confirmation-gated wipe of your saved scenarios, answers, messages, and Lesson Debrief sessions.' },
      ],
    },
  ],
}

export default function Guide() {
  // The home page links straight to a video here (/guide#video-lesson-debrief).
  // Arriving from another page, the browser tries to jump before this page has
  // rendered, finds nothing, and stays at the top — so jump once it has.
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    requestAnimationFrame(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView())
  }, [hash])

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="border-b border-hairline bg-cream-card">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo/wivoza-lockup-light.png" alt="Wivoza" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-5">
            <Link to="/" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">
              Home
            </Link>
            <Link
              to="/#get-started"
              className="flex items-center gap-1.5 rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
            >
              Start free
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-12 pt-10">
        <div className="rounded-3xl bg-forest px-6 py-12 text-center text-cream sm:px-12 sm:py-16">
        <span className="mx-auto inline-flex items-center gap-2 rounded-full bg-cream/10 px-4 py-2 text-sm font-semibold text-gold">
          <SparkleIcon className="h-4 w-4" />
          The complete Wivoza guide
        </span>
        <h1 className="mt-6 font-heading text-4xl font-extrabold leading-[1.1] tracking-tight text-cream sm:text-5xl">
          Every feature, in full<span className="text-gold">.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-cream/70">
          Not a highlight reel — every field, tab, and button in every Wivoza tool, organized the same way
          you'll find them in the app.
        </p>
        </div>
      </section>

      {/* Quick nav */}
      <nav className="border-y border-hairline bg-cream-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap justify-center gap-2 px-6 py-4">
          {/* Label and anchor given explicitly rather than derived from the
              label. Deriving it is how "Plan" kept pointing at #plan after
              that section became "Before and after" — a broken jump link
              nothing would have caught. */}
          {JUMP_NAV.map(({ label, to }) => (
            <a
              key={to}
              href={`#${to}`}
              className="rounded-full border border-hairline bg-cream px-3.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
            >
              {label}
            </a>
          ))}
        </div>
      </nav>

      {/* Training videos — the full library, moved here from the home page */}
      <section id="videos" className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 pt-16">
        <SectionLabel n={1} label="Training videos" />
        <p className="mt-4 max-w-xl text-lg text-ink-soft">
          Short walkthroughs of every feature. Start with setup, or jump to the one you need.
        </p>
        <div className="mt-8">
          <TrainingLibrary />
        </div>
      </section>

      <div className="mx-auto w-full max-w-5xl px-6 py-16">
        {/* Getting started */}
        <section id={GETTING_STARTED.id} className="scroll-mt-20 border-b border-hairline pb-16">
          <SectionLabel n={2} label={GETTING_STARTED.label} />
          <p className="mt-4 max-w-xl text-lg text-ink-soft">{GETTING_STARTED.intro}</p>
          <div className="mt-8 flex flex-col gap-5">
            {GETTING_STARTED.features.map((f) => (
              <FeatureBlock key={f.id} feature={f} />
            ))}
          </div>
        </section>

        {/* Talk It Through and Practice — the two surfaces for a situation
            you are in the middle of. */}
        <section id="talking-and-rehearsing" className="scroll-mt-20 border-b border-hairline py-16">
          <SectionLabel n={3} label="Talking and rehearsing" />
          <p className="mt-4 max-w-xl text-lg text-ink-soft">
            Two surfaces for a situation you are in the middle of: one to think it through out loud, one to
            rehearse the moment before it happens.
          </p>
          <div className="mt-8 flex flex-col gap-5">
            <FeatureBlock feature={TALK_IT_THROUGH} />
            <FeatureBlock feature={PRACTICE} />

            <div className="rounded-3xl border border-hairline bg-cream-card p-7 shadow-sm">
              <h4 className="font-heading text-lg font-bold text-forest">
                The seven topics, shared by both
              </h4>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                Teaching and Learning · Classroom Management · A student I&rsquo;m worried about · Parent
                Communication · Professionalism · Me and this job · Something else.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                In Talk It Through they are optional and decide only where Coach opens &mdash; pick Classroom
                Management, talk about a parent email, and it follows the parent email. In Practice the topic
                decides which kinds of moment you are offered. Either way, whatever you save is tagged with it,
                so My Work can filter by it.
              </p>
              <div className="mt-5 flex items-start gap-3 rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-5">
                <BrainIcon className="mt-0.5 h-5 w-5 shrink-0 text-forest" />
                <p className="text-sm text-forest">
                  Two topics change how coaching behaves rather than just where it starts. &ldquo;A student
                  I&rsquo;m worried about&rdquo; stays observational &mdash; it helps you notice, write it down
                  and decide who to escalate to, and never speculates about a diagnosis or a home. &ldquo;Me and
                  this job&rdquo; is supportive and practical, and when something is bigger than a hard week it
                  says so plainly instead of coaching through it.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Before and after — the same lesson, at both ends of it. */}
        <section id="before-and-after" className="scroll-mt-20 border-b border-hairline py-16">
          <SectionLabel n={4} label="Before and after" />
          <p className="mt-4 max-w-xl text-lg text-ink-soft">
            The same lesson at both ends: a read on what you made before anyone sees it, and a report on what
            actually happened in the room.
          </p>
          <div className="mt-8 flex flex-col gap-5">
            <FeatureBlock feature={LOOK_IT_OVER} />
            <FeatureBlock feature={LESSON_DEBRIEF} />

            <div className="rounded-3xl border border-hairline bg-cream-card p-7 shadow-sm">
              <h4 className="font-heading text-lg font-bold text-forest">Inside a Lesson Debrief report</h4>
              <SpecList items={REPORT_TABS} />
              <h4 className="mt-7 font-heading text-lg font-bold text-forest">The three Insights sections</h4>
              <SpecList items={INSIGHTS_SECTIONS} />
              <div className="mt-5 flex items-start gap-3 rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-5">
                <BrainIcon className="mt-0.5 h-5 w-5 shrink-0 text-forest" />
                <p className="text-sm text-forest">
                  Every number is honest about its own confidence &mdash; something Wivoza couldn&rsquo;t reliably
                  measure shows as unavailable, never as a hidden zero, and a real confirmed zero always shows as a
                  plain, full-strength zero. The two never look the same, on purpose. Everything a recording
                  couldn&rsquo;t judge is collected into one line rather than a panel per absence.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-hairline bg-cream-card p-7 shadow-sm">
              <h4 className="font-heading text-lg font-bold text-forest">
                A plan you had read over, and the recording of you teaching it
              </h4>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                Link a recording to a lesson plan you reviewed in Look It Over, and the report compares them:
                &ldquo;you planned 10&ndash;14 minutes for this lesson; the recording suggests about 4.&rdquo;
                It reports the gap and declines to grade it &mdash; a lesson that diverges from its plan is
                frequently a teacher reading the room correctly. Linking is something you do, not something
                guessed: a wrong pairing would produce a confident false comparison.
              </p>
            </div>
          </div>
        </section>

        {/* Grow */}
        <section id={GROW.id} className="scroll-mt-20 border-b border-hairline py-16">
          <SectionLabel n={5} label={GROW.label} />
          <p className="mt-4 max-w-xl text-lg text-ink-soft">{GROW.intro}</p>
          <div className="mt-8 flex flex-col gap-5">
            {GROW.features.map((f) => (
              <FeatureBlock key={f.id} feature={f} />
            ))}
          </div>
        </section>

        {/* Across the app */}
        <section id="across-the-app" className="scroll-mt-20 border-b border-hairline py-16">
          <SectionLabel n={6} label="Across the app" />
          <p className="mt-4 max-w-xl text-lg text-ink-soft">Three things that work the same way almost everywhere in Wivoza.</p>
          <div className="mt-8 rounded-3xl border border-hairline bg-cream-card p-7 shadow-sm">
            <SpecList
              items={[
                { label: 'Save', body: 'a star toggle on practice attempts, answers, messages, and plans — keeps the good ones out of the noise, and My Work can filter to just those.' },
                { label: 'Share', body: 'a private, read-only link. No account is needed to view it, and the recipient sees only that one item — nothing else in your account.' },
                { label: 'Export', body: 'one printable "Wivoza — Your Playbook" page of everything you\'ve saved, ready to print or save as a PDF.' },
              ]}
            />
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="scroll-mt-20 border-b border-hairline py-16">
          <SectionLabel n={7} label="Privacy" />
          <h2 className="mt-4 font-heading text-2xl font-extrabold text-forest sm:text-3xl">Privacy & what Coach remembers</h2>
          <p className="mt-3 max-w-2xl text-lg text-ink-soft">
            Wivoza is built to be honest with you about evidence, and careful with what it keeps about you and your students.
          </p>
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <div className="rounded-3xl border border-hairline bg-cream-card p-7 shadow-sm">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-forest text-gold">
                <BrainIcon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-heading text-lg font-bold text-forest">Coach's memory</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                A short, running note about your recurring strengths and any ongoing challenges — built only
                from your real Ask and Talk It Through conversations, never from Practice rehearsals. On by
                default, but entirely yours: read it, turn it off, or clear it anytime.
              </p>
            </div>
            <div className="rounded-3xl border border-hairline bg-cream-card p-7 shadow-sm">
              <SpecList
                items={[
                  { label: 'Your voice is never kept', body: 'audio is discarded right after transcription — only text and metrics remain.' },
                  { label: 'Names stay out of it', body: 'Coach refers to people by role — "a student," "the class" — even if you use a name yourself.' },
                  { label: "You're never scored", body: 'no grade, rank, or evaluation is ever shown to you. A few private internal ratings power your own growth trends and are never shown to anyone as a number.' },
                ]}
              />
            </div>
          </div>
        </section>

        {/* For schools */}
        <section id="for-schools" className="scroll-mt-20 pt-16">
          <SectionLabel n={8} label="For schools & districts" />
          <h2 className="mt-4 font-heading text-2xl font-extrabold text-forest sm:text-3xl">Admin dashboard</h2>
          <p className="mt-3 max-w-2xl text-lg text-ink-soft">
            Visible only to school and district admins — built around aggregate trends, never an individual teacher's attempts or ratings.
          </p>
          <div className="mt-8 rounded-3xl border border-hairline bg-cream-card p-7 shadow-sm">
            <SpecList
              items={[
                { label: 'Overview', body: 'total and active-this-week teacher counts, a staff-wide growth signal, a weekly activity chart, practice-by-category breakdown, and a member list — each row with Remove from org, Suspend, and (for platform admins) Delete. Every admin sees this.' },
                { label: 'Organizations', body: 'platform admins only — create, edit, or remove school and district accounts, including their join code and admin emails.' },
                { label: 'Users', body: 'platform admins only — every account across Wivoza, including independent teachers who aren\'t part of any school.' },
                { label: 'Joining a school', body: 'a teacher enters a short code during onboarding or later from Profile & Settings; whoever\'s email is listed as that school\'s admin becomes its admin automatically.' },
              ]}
            />
            <div className="mt-5 flex items-start gap-3 rounded-2xl border-l-8 border-terracotta bg-peach-tint/50 p-5">
              <HeadsetIcon className="mt-0.5 h-5 w-5 shrink-0 text-terracotta" />
              <p className="text-sm text-forest">
                A banner on every admin view says it plainly: only aggregate trends are ever shown here —
                never one teacher's individual attempts, answers, or ratings.
              </p>
            </div>
          </div>
          <Link
            to="/for-schools"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-terracotta-600 hover:text-terracotta"
          >
            Bringing Wivoza to your school or district? Get in touch
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </section>
      </div>

      {/* Closing CTA */}
      <section className="bg-forest py-20">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 text-center">
          <img src="/logo/wivoza-lockup-dark.png" alt="Wivoza" className="h-12 w-auto" />
          <h2 className="font-heading text-3xl font-extrabold leading-tight text-cream sm:text-4xl">
            Ready to see it for yourself?
          </h2>
          <p className="max-w-md text-cream/70">Every feature in this guide is free to start exploring today.</p>
          <Link
            to="/#get-started"
            className="flex items-center gap-2 rounded-full bg-terracotta px-6 py-3.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
          >
            Start free
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="bg-cream py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-ink-soft sm:flex-row">
          <div className="flex items-center gap-2.5">
            <img src="/logo/wivoza-lockup-light.png" alt="Wivoza" className="h-6 w-auto" />
            <span className="hidden sm:inline">Practice. Reflect. Grow.</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link to="/guide" className="hover:text-ink">
              Guide
            </Link>
            <Link to="/faq" className="hover:text-ink">
              FAQ
            </Link>
            <a href="/terms" className="hover:text-ink">
              Privacy
            </a>
            <a href="/terms" className="hover:text-ink">
              Terms
            </a>
            <span>&copy; 2026 Edinexa Technologies LLC. All rights reserved.</span>
          </div>
        </div>
        <FooterContact />
      </footer>
      <SupportChat />
    </div>
  )
}
