import { Link } from 'react-router-dom'
import {
  ArrowRightIcon,
  ArrowUpIcon,
  BookIcon,
  BrainIcon,
  ChartBarIcon,
  ChatBubbleIcon,
  CheckIcon,
  ChecklistIcon,
  HeadsetIcon,
  HomeIcon,
  LessonPlanIcon,
  LockIcon,
  MailIcon,
  MicIcon,
  ScenarioIcon,
  SparkleIcon,
  StarIcon,
  TargetIcon,
  UserIcon,
  WaveformIcon,
} from '../components/icons'

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
    <div id={feature.id} className="scroll-mt-24 rounded-2xl border border-hairline bg-cream-card p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${feature.tint}`}>
            <Icon className="h-5 w-5" />
          </span>
          <h3 className="font-heading text-xl font-bold text-forest">{feature.title}</h3>
        </div>
        <span className="rounded-full border border-hairline bg-cream px-2.5 py-1 text-[11px] font-medium text-ink-soft">
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
        { label: 'Quick actions', body: 'three large one-tap buttons to Talk It Through, Lesson Debrief, and Ask & Practice.' },
        { label: 'Your coaching path', body: 'a static Notice → Practice → Try → Reflect explainer, with a "Practice now" shortcut.' },
        { label: 'Classroom pulse', body: 'a donut chart of your latest lesson\'s student-talk %, plus a sparkline once you have a few sessions.' },
        { label: 'Mood check-in', body: 'tap Good / Okay / Stressed / Overwhelmed and Wivoza quietly suggests a relevant practice category.' },
        { label: 'Daily tip, quick links, and recent work', body: 'a tip box, shortcuts to Cheat Sheet and First 30 Days, and a feed of your last few sessions.' },
      ],
    },
  ],
}

const TALK_IT_THROUGH: Feature = {
  id: 'talk-it-through',
  icon: WaveformIcon,
  tint: 'bg-mint-tint text-forest',
  nav: 'Coaching → Talk It Through',
  title: 'Talk It Through',
  guideTo: '/guide/talk-it-through',
  intro: 'A live, spoken back-and-forth with Coach — the mic arms itself the moment you open it, no typing at all.',
  specs: [
    { label: 'Listening', body: 'a mic icon with a ring that visibly pulses in real time with your actual volume.' },
    { label: 'Thinking', body: 'a pulsing brain icon with bouncing dots — covers both transcribing what you said and Coach composing its reply, shown as one continuous state rather than two confusing ones.' },
    { label: 'Speaking', body: 'an animated equalizer plays while Coach\'s reply is read aloud.' },
    { label: 'Mute', body: 'silences Coach\'s voice without ending the conversation — replies still appear as text.' },
    { label: 'Stop / Close', body: 'end the session at any point; the mic releases immediately.' },
    { label: 'Continuity', body: 'if Coach\'s memory is on, it can reference real patterns from your past Ask and Talk It Through conversations.' },
    { label: 'Privacy', body: 'your voice itself is never saved — only the resulting conversation text.' },
  ],
}

const REPORT_TABS: SpecItem[] = [
  { label: 'Summary', body: 'the 60-second read, in the order you\'d want it: a plain-language "Lesson at a glance," one named Strength to keep, your focus metric with its current value and a "try next time" tip, an "Evidence from the lesson" row (who was heard, questions opened, and a moment worth revisiting), and one suggested next step. Every card links through to the fuller detail in Insights.' },
  { label: 'Insights', body: 'the detail, in five sections — see below.' },
  { label: 'Reflect', body: 'a spoken debrief with Coach about what the report found. Pick a starting point (talk through today\'s highlights, explore a specific moment, reflect on how the lesson felt, or ask your own question), then talk it through — pause, resume, or type instead at any point. Finish with your own Strengths / Growth areas / My next step / Follow-up date notes, optionally drafted for you from the conversation, and a Lock button that makes the whole report permanently read-only.' },
  { label: 'My Growth', body: 'ten metrics trended across every session you\'ve recorded — talk ratio, higher-order-question %, average wait time, checks for understanding, follow-up questions, redirection language, positive-vs-corrective tone, clear directions given, student names used, and feedback specificity. Pick one as your active focus and it\'s highlighted here and on Summary.' },
]

const INSIGHTS_SECTIONS: SpecItem[] = [
  { label: 'Talk & Participation', body: 'the teacher / student / silence split for the period, how many separate times students spoke, and a coach-voice read of what the balance suggests.' },
  { label: 'Questions & Thinking', body: 'every question you asked, logged and tagged recall or higher-order, with the wait time after each one and any follow-ups that built on it — plus your average wait time and higher-order share.' },
  { label: 'Checks & Feedback', body: 'the checks for understanding you used, and how much of your feedback was specific rather than general — each with the actual moments behind the count.' },
  { label: 'Clarity & Content', body: 'a detected stated objective (with the exact quote it came from), real-world connections, key vocabulary moments, teacher and student word clouds sized by frequency, and on-demand "content specialist" notes from a subject-area lens.' },
  { label: 'Climate & Routines', body: 'transitions between activities, clear task directions given, student names used, positive-vs-corrective tone balance, and redirection language — each a plain count with a coach-voice note, never a behavior score.' },
]

const LESSON_DEBRIEF: Feature = {
  id: 'lesson-debrief',
  icon: MicIcon,
  tint: 'bg-mint-tint text-forest',
  nav: 'Coaching → Lesson Debrief',
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

const ASK_PRACTICE: Feature = {
  id: 'ask-practice',
  icon: ChatBubbleIcon,
  tint: 'bg-mint-tint text-forest',
  nav: 'Coaching → Ask & Practice',
  title: 'Ask & Practice',
  guideTo: '/guide/ask-practice',
  intro: 'Two tools, one nav item — one for something real, one for rehearsal.',
  specs: [
    { label: 'Ask — starters', body: 'four suggested prompts for when you\'re not sure where to begin.' },
    { label: 'Ask — input', body: 'describe something that already happened, or ask a general question, by typing or speaking; Wivoza figures out which kind of request it is and answers accordingly, inferring a category automatically (or leaving it uncategorized for general questions).' },
    { label: 'Ask — after your answer', body: 'a "following up" section, plus an open-ended coaching chat to push back or go deeper.' },
    { label: 'Practice — filters', body: 'category, grade band, and difficulty — any or all of them optional.' },
    { label: 'Practice — getting a scenario', body: '"New Scenario" one at a time, or a "Quick Session" of three back to back; respond by typing or speaking.' },
    { label: 'Practice — feedback', body: 'written coaching plus a model response, and a private growth rating that powers a "you\'re improving in this category" callout over time.' },
    { label: 'Both tools', body: 'save anything worth keeping, share a saved item as a link, and revisit your full saved history.' },
  ],
}

const LESSON_PLANNING: Feature = {
  id: 'lesson-planning',
  icon: LessonPlanIcon,
  tint: 'bg-peach-tint text-terracotta',
  nav: 'Plan → Lesson Planning',
  title: 'Lesson Planning',
  guideTo: '/guide/lesson-planning',
  intro: 'Three modes, depending on how much you\'ve already written — a blank page, a draft you want read, or a deck you\'ve already built.',
  specs: [
    { label: 'Generate Ideas — input', body: 'an objective is the only required field; subject, grade level, standard, unit name, and essential question are all optional extras.' },
    { label: 'Generate Ideas — output', body: 'a sample single day modeled on a gradual-release template: Do Now, an I Do / We Do / You Do agenda with each part labeled and timed, Closure, a higher-order-thinking component, and Homework — explicitly framed as a starting point to adapt, not a script.' },
    { label: 'Get Feedback — input', body: 'paste or write your own plan. Coach first works out whether it\'s a single lesson or a multi-day/weekly plan and changes its lens accordingly — internal structure for one day, pacing and coherence across the week for several. An objective is optional here: if the plan states or implies one, it coaches around that instead of just noting none was given.' },
    { label: 'Get Feedback — output', body: 'coaching through a chat thread and a private growth rating; Coach can propose a full "Suggested Revision," shown separately with "Use this version" or "Dismiss" — never applied automatically.' },
    { label: 'Review a Presentation — input', body: 'upload a .pptx or .pdf — export Google Slides or Keynote as PDF first. The file name and slide count show alongside the review.' },
    { label: 'Review a Presentation — output', body: 'a read on grade-level fit, visuals, ideas, length, and implementation, plus the same follow-up chat and "Suggested Revision" as Get Feedback.' },
    { label: 'Generate Ideas and Get Feedback also include', body: 'a "Presentation & Delivery" coaching pass on actually teaching it — opening hook, pacing & timing, engagement checkpoints, explaining the hard part, and closing. Delivery advice, never an edit to the plan itself.' },
    { label: 'Any mode', body: 'save it, share it as a read-only link, or download it.' },
  ],
}

const ASSIGNMENT_COACH: Feature = {
  id: 'assignment-coach',
  icon: BookIcon,
  tint: 'bg-peach-tint text-terracotta',
  nav: 'Plan → Assignment Coach',
  title: 'Assignment Coach',
  guideTo: '/guide/assignment-coach',
  intro: 'Two paths for the work you hand students — an honest read on an assignment you already wrote, or a rebuild so it still means something now that students have AI.',
  specs: [
    { label: 'Adding the assignment', body: 'paste the text or upload a file — .docx, .pdf, .txt, .jpg, .jpeg, or .png, so a photo of a paper worksheet is a valid way in. There\'s no intake form: grade level, subject, assignment type, and estimated time are all detected from the assignment itself.' },
    { label: 'Review — setup', body: 'nothing beyond the assignment. Review asks no questions before it runs.' },
    { label: 'Review — output', body: 'a snapshot covering the assignment\'s purpose, grade-level fit, thinking and rigor, learning value, workload and clarity, and AI completion risk — each a plain phrase with an explanation behind it, never a number or a grade — topped by one "most important opportunity" card.' },
    { label: 'Redesign — the one setup question', body: 'how students may use AI: as a thinking partner (question, brainstorm, get feedback, revise — but show their own reasoning), limited to specific teacher-approved steps, or not at all. A "let Wivoza recommend" checkbox picks one for you and says why.' },
    { label: 'Redesign — output', body: 'which steps are vulnerable to being outsourced wholesale, thinking safeguards that put student reasoning back into the task, copy-ready student AI guidelines, and a full revised assignment.' },
    { label: 'The workspace', body: 'the assignment sits there as editable text that saves as you type. Seven one-tap quick actions — address the biggest issue, make it AI-resilient, strengthen the rigor, remove low-value work, clarify student directions, adjust the workload, or review everything together — push the coach at one thing, and an open chat handles anything else.' },
    { label: 'Clarifying questions', body: 'when one genuinely material detail is uncertain, you get a single question with options rather than a guess presented as fact — and it never gates the analysis, which is generated either way.' },
    { label: 'Managing assignments', body: 'a finished review hands its text straight into Redesign in one tap, no retyping. Sessions live under My Assignments as Draft or Completed, and each can be starred, exported, or deleted. Unlike most Wivoza tools, there\'s no share link here.' },
  ],
}

const MESSAGE_TOOLS: Feature[] = [
  {
    id: 'write-a-message',
    icon: MailIcon,
    tint: 'bg-peach-tint text-terracotta',
    nav: 'Plan → Communication Coach → Write a Message',
    title: 'Write a Message',
    intro: 'Draft a ready-to-send message from scratch, a reply, or a rough draft you already have.',
    specs: [
      { label: 'Starting point', body: 'Start new, Respond to a message you received, or Improve my draft.' },
      { label: 'Recipient', body: 'parent/caregiver, student, colleague, or administrator.' },
      { label: 'Purpose', body: 'academic concern, behavior concern, attendance concern, positive update, meeting request, follow-up, general information, or other.' },
      { label: 'Tone', body: 'warm and supportive, professional and neutral, firm and direct, or urgent.' },
      { label: 'Format', body: 'email, text message, class announcement, or a written phone-call follow-up.' },
      { label: 'Quick actions on the draft', body: 'Make warmer, Make firmer, Shorten, Simplify language, Translate (pick from common languages or type your own), Create another version.' },
      { label: 'Finishing up', body: 'copy to clipboard, or save it for later.' },
    ],
  },
  {
    id: 'prepare-conversation',
    icon: TargetIcon,
    tint: 'bg-peach-tint text-terracotta',
    nav: 'Plan → Communication Coach → Prepare for a Meeting',
    title: 'Prepare for a Meeting',
    intro: 'A full written plan for a real meeting that\'s already on the calendar.',
    specs: [
      { label: 'Input', body: 'the meeting type — parent or family conference, student conference, IEP or 504, team or department, with an administrator, post-observation, difficult colleague conversation, or other — and what the meeting is about, which is the only required field. How it will happen (in person, phone, video call, or formal meeting), who\'s attending, the outcome you\'re hoping for, and anything sensitive or difficult are all optional.' },
      { label: 'Supporting material', body: 'paste or upload an agenda, email, report, or notes you already have — .docx, .pdf, .txt, .jpg, .jpeg, or .png — so the plan is built around what\'s actually been said rather than a blank slate.' },
      { label: 'Output — twelve sections', body: 'a suggested meeting agenda, a suggested opening, key talking points, important facts to present, questions to ask, possible reactions, how to respond, language to avoid, boundaries to maintain, a suggested closing, next steps, and honest guidance on when to involve an administrator — with a complete model response sitting in the middle, there to read aloud if the moment gets away from you.' },
      { label: 'After the plan', body: 'a follow-up chat that revises the plan in place rather than just discussing it alongside, plus two handoffs — "Practice This Meeting" and "Create a Follow-Up Message" — that carry the situation into the relevant tool pre-filled. Save it, or print it to take into the room.' },
    ],
  },
  {
    id: 'practice-conversation',
    icon: ScenarioIcon,
    tint: 'bg-peach-tint text-terracotta',
    nav: 'Plan → Communication Coach → Practice a Conversation',
    title: 'Practice a Conversation',
    intro: 'Rehearse a hard conversation before you have it.',
    specs: [
      { label: 'Setup', body: 'who you\'re talking to, the challenge type, grade band (when the other person is a student), and difficulty.' },
      { label: 'Your turn', body: 'generate a scenario or write your own, then respond by typing or speaking.' },
      { label: 'Feedback — six rated dimensions', body: 'clarity, empathy, use of evidence, professional boundaries, collaboration, and resolution — each rated strong / developing / needs work with specific feedback.' },
      { label: 'Also included', body: 'what you did well, your single top priority, a stronger phrase to try, and a full model response.' },
      { label: 'Next', body: '"Practice Again" resets with a fresh scenario.' },
    ],
  },
  {
    id: 'review-communication',
    icon: CheckIcon,
    tint: 'bg-peach-tint text-terracotta',
    nav: 'Plan → Communication Coach → Review My Communication',
    title: 'Review My Communication',
    intro: 'An honest second read on a message and your planned response before you send it.',
    specs: [
      { label: 'Input', body: 'the message you received, your planned response, and a review mode — feedback only, rewrite only, or both.' },
      { label: 'Output', body: 'an overall assessment, what\'s working, what might land badly, specific recommended changes, a revised response (when requested), and — only when it genuinely applies — honest guidance on looping in an administrator.' },
      { label: 'After the review', body: 'quick actions (Make warmer / Make firmer / Shorten), a full follow-up chat, save, and share.' },
    ],
  },
]

const GROW: Chapter = {
  id: 'grow',
  label: 'Grow',
  tint: 'bg-lavender-tint text-[#6B5FA0]',
  intro: 'The tools that build on everything else you\'ve done in Wivoza.',
  features: [
    {
      id: 'profile',
      icon: UserIcon,
      tint: 'bg-lavender-tint text-[#6B5FA0]',
      nav: 'Grow → Profile & Settings',
      title: 'Profile & Settings',
      intro: 'Everything about your account and your data, in one place.',
      specs: [
        { label: 'Basic info', body: 'your name, grade levels, and subjects taught.' },
        { label: 'What Coach remembers', body: 'read the running profile Coach keeps about you, turn it off, or clear it entirely.' },
        { label: 'School', body: 'join with a code, or see the school/district you\'re already part of.' },
        { label: 'Lesson Debrief retention', body: 'keep transcripts and reports indefinitely, or auto-delete after 7, 30, or 90 days.' },
        { label: 'Export playbook', body: 'a printable page of everything you\'ve saved.' },
        { label: 'Reset & clear data', body: 'a permanent, confirmation-gated wipe of your saved scenarios, answers, messages, and Lesson Debrief sessions.' },
      ],
    },
    {
      id: 'cheat-sheet',
      icon: StarIcon,
      tint: 'bg-lavender-tint text-[#6B5FA0]',
      nav: 'Grow → Cheat Sheet',
      title: 'Cheat Sheet',
      guideTo: '/guide/cheat-sheet',
      intro: 'A personal reference built automatically — nothing shows up until you\'ve saved something, on purpose.',
      specs: [
        { label: 'What feeds it', body: 'two things, both a single star tap elsewhere — a saved Practice attempt contributes its model response, and a saved Ask answer contributes its follow-up guidance.' },
        { label: 'How it\'s grouped', body: 'by situation, not by source: both kinds land together under the same six headings used across the app (responding to resistance, engagement & participation, conflict & repair, interruptions & redirection, routines & transitions, devices & digital routines). A heading only appears once you\'ve saved something into it.' },
        { label: 'General tips', body: 'saved Ask answers with no specific category — a broader question rather than a situation — collect here instead.' },
        { label: 'Every entry', body: 'shows the phrase, then a "For:" line naming the original scenario or incident it came from, so an old note still makes sense months later.' },
      ],
    },
    {
      id: 'first-30-days',
      icon: ArrowUpIcon,
      tint: 'bg-lavender-tint text-[#6B5FA0]',
      nav: 'Grow → First 30 Days',
      title: 'First 30 Days',
      intro: 'A fixed checklist for getting the most out of Wivoza early on.',
      specs: [
        { label: 'Progress', body: 'a running complete/incomplete count across every item.' },
        { label: 'Shortcuts', body: 'several items link straight into the relevant tool, sometimes pre-filled, so checking one off is one click.' },
      ],
    },
  ],
}

export default function Guide() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="border-b border-hairline bg-cream-card">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold text-forest">
              <ChartBarIcon className="h-4 w-4" />
            </span>
            <span className="font-heading text-base font-bold text-forest">Wivoza</span>
          </Link>
          <div className="flex items-center gap-5">
            <Link to="/" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">
              Home
            </Link>
            <Link
              to="/#get-started"
              className="flex items-center gap-1.5 rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
            >
              Try Wivoza
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-4xl px-6 pb-14 pt-16 text-center">
        <span className="mx-auto inline-flex items-center gap-2 rounded-full bg-mint-tint px-4 py-2 text-sm font-semibold text-forest">
          <SparkleIcon className="h-4 w-4" />
          The complete Wivoza guide
        </span>
        <h1 className="mt-6 font-heading text-4xl font-extrabold leading-[1.1] tracking-tight text-forest sm:text-5xl">
          Every feature, in full.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-soft">
          Not a highlight reel — every field, tab, and button in every Wivoza tool, organized the same way
          you'll find them in the app.
        </p>
      </section>

      {/* Quick nav */}
      <nav className="border-y border-hairline bg-cream-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap justify-center gap-2 px-6 py-4">
          {['Getting started', 'Coaching', 'Plan', 'Grow', 'Across the app', 'Privacy', 'For schools'].map((label) => (
            <a
              key={label}
              href={`#${label.toLowerCase().replace(/\s+/g, '-')}`}
              className="rounded-full border border-hairline bg-cream px-3.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
            >
              {label}
            </a>
          ))}
        </div>
      </nav>

      <div className="mx-auto w-full max-w-5xl px-6 py-16">
        {/* Getting started */}
        <section id={GETTING_STARTED.id} className="scroll-mt-20 border-b border-hairline pb-16">
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${GETTING_STARTED.tint}`}>
            {GETTING_STARTED.label}
          </span>
          <p className="mt-4 max-w-xl text-lg text-ink-soft">{GETTING_STARTED.intro}</p>
          <div className="mt-8 flex flex-col gap-5">
            {GETTING_STARTED.features.map((f) => (
              <FeatureBlock key={f.id} feature={f} />
            ))}
          </div>
        </section>

        {/* Coaching */}
        <section id="coaching" className="scroll-mt-20 border-b border-hairline py-16">
          <span className="rounded-full bg-mint-tint px-3 py-1 text-xs font-bold uppercase tracking-wide text-forest">
            Coaching
          </span>
          <p className="mt-4 max-w-xl text-lg text-ink-soft">
            Three ways to get real coaching, from a thirty-second check-in to a full recorded lesson.
          </p>
          <div className="mt-8 flex flex-col gap-5">
            <FeatureBlock feature={TALK_IT_THROUGH} />
            <FeatureBlock feature={LESSON_DEBRIEF} />

            <div className="rounded-2xl border border-hairline bg-cream-card p-7">
              <h4 className="font-heading text-lg font-bold text-forest">Inside a Lesson Debrief report — all four tabs</h4>
              <SpecList items={REPORT_TABS} />
              <h4 className="mt-7 font-heading text-lg font-bold text-forest">The five Insights sections</h4>
              <SpecList items={INSIGHTS_SECTIONS} />
              <div className="mt-5 flex items-start gap-3 rounded-xl border-l-4 border-mint-text bg-mint-tint/40 p-4">
                <BrainIcon className="mt-0.5 h-5 w-5 shrink-0 text-forest" />
                <p className="text-sm text-forest">
                  Every number is honest about its own confidence — something Wivoza couldn't reliably
                  measure shows as unavailable, never as a hidden zero, and a real confirmed zero always
                  shows as a plain, full-strength zero. The two never look the same, on purpose.
                </p>
              </div>
            </div>

            <FeatureBlock feature={ASK_PRACTICE} />
          </div>
        </section>

        {/* Plan */}
        <section id="plan" className="scroll-mt-20 border-b border-hairline py-16">
          <span className="rounded-full bg-peach-tint px-3 py-1 text-xs font-bold uppercase tracking-wide text-terracotta">
            Plan
          </span>
          <p className="mt-4 max-w-xl text-lg text-ink-soft">Get ready for what's ahead — a lesson to teach, work to hand out, or a conversation to have.</p>
          <div className="mt-8 flex flex-col gap-5">
            <FeatureBlock feature={LESSON_PLANNING} />
            <FeatureBlock feature={ASSIGNMENT_COACH} />
            {/* The four message tools are one nav item, so the deep guide
                covers all four together rather than each block linking to it. */}
            <div className="rounded-2xl border border-hairline bg-cream-card p-7">
              <div className="flex items-center gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-peach-tint text-terracotta">
                  <MailIcon className="h-5 w-5" />
                </span>
                <h4 className="font-heading text-xl font-bold text-forest">Communication Coach</h4>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-ink-soft">
                One nav item, four separate tools — picked by where you are relative to the conversation: it
                needs writing, it's on the calendar, you're dreading it, or you've drafted a reply and
                something feels off. Each one is detailed below.
              </p>
              <Link
                to="/guide/communication-coach"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-terracotta-600 hover:text-terracotta"
              >
                Read the teacher's guide to Communication Coach
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            </div>
            {MESSAGE_TOOLS.map((f) => (
              <FeatureBlock key={f.id} feature={f} />
            ))}
          </div>
        </section>

        {/* Grow */}
        <section id={GROW.id} className="scroll-mt-20 border-b border-hairline py-16">
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${GROW.tint}`}>{GROW.label}</span>
          <p className="mt-4 max-w-xl text-lg text-ink-soft">{GROW.intro}</p>
          <div className="mt-8 flex flex-col gap-5">
            {GROW.features.map((f) => (
              <FeatureBlock key={f.id} feature={f} />
            ))}
          </div>
        </section>

        {/* Across the app */}
        <section id="across-the-app" className="scroll-mt-20 border-b border-hairline py-16">
          <span className="rounded-full bg-gold-tint px-3 py-1 text-xs font-bold uppercase tracking-wide text-terracotta-600">
            Across the app
          </span>
          <p className="mt-4 max-w-xl text-lg text-ink-soft">Three things that work the same way almost everywhere in Wivoza.</p>
          <div className="mt-8 rounded-2xl border border-hairline bg-cream-card p-7">
            <SpecList
              items={[
                { label: 'Save', body: 'a star toggle on practice attempts, answers, messages, and plans — keeps the good ones out of the noise and feeds your Cheat Sheet.' },
                { label: 'Share', body: 'a private, read-only link. No account is needed to view it, and the recipient sees only that one item — nothing else in your account.' },
                { label: 'Export', body: 'one printable "Wivoza — Your Playbook" page of everything you\'ve saved, ready to print or save as a PDF.' },
              ]}
            />
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="scroll-mt-20 border-b border-hairline py-16">
          <span className="rounded-full bg-mint-tint px-3 py-1 text-xs font-bold uppercase tracking-wide text-forest">Privacy</span>
          <h2 className="mt-4 font-heading text-2xl font-extrabold text-forest sm:text-3xl">Privacy & what Coach remembers</h2>
          <p className="mt-3 max-w-2xl text-lg text-ink-soft">
            Wivoza is built to be honest with you about evidence, and careful with what it keeps about you and your students.
          </p>
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <div className="rounded-2xl border border-hairline bg-cream-card p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-mint-tint text-forest">
                <BrainIcon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-heading text-lg font-bold text-forest">Coach's memory</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                A short, running note about your recurring strengths and any ongoing challenges — built only
                from your real Ask and Talk It Through conversations, never from Practice rehearsals. On by
                default, but entirely yours: read it, turn it off, or clear it anytime.
              </p>
            </div>
            <div className="rounded-2xl border border-hairline bg-cream-card p-7">
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
          <span className="rounded-full bg-peach-tint px-3 py-1 text-xs font-bold uppercase tracking-wide text-terracotta">
            For schools & districts
          </span>
          <h2 className="mt-4 font-heading text-2xl font-extrabold text-forest sm:text-3xl">Admin dashboard</h2>
          <p className="mt-3 max-w-2xl text-lg text-ink-soft">
            Visible only to school and district admins — built around aggregate trends, never an individual teacher's attempts or ratings.
          </p>
          <div className="mt-8 rounded-2xl border border-hairline bg-cream-card p-7">
            <SpecList
              items={[
                { label: 'Overview', body: 'total and active-this-week teacher counts, a staff-wide growth signal, a weekly activity chart, practice-by-category breakdown, and a member list — each row with Remove from org, Suspend, and (for platform admins) Delete. Every admin sees this.' },
                { label: 'Organizations', body: 'platform admins only — create, edit, or remove school and district accounts, including their join code and admin emails.' },
                { label: 'Users', body: 'platform admins only — every account across Wivoza, including independent teachers who aren\'t part of any school.' },
                { label: 'Joining a school', body: 'a teacher enters a short code during onboarding or later from Profile & Settings; whoever\'s email is listed as that school\'s admin becomes its admin automatically.' },
              ]}
            />
            <div className="mt-5 flex items-start gap-3 rounded-xl border-l-4 border-terracotta bg-peach-tint/40 p-4">
              <HeadsetIcon className="mt-0.5 h-5 w-5 shrink-0 text-terracotta" />
              <p className="text-sm text-forest">
                A banner on every admin view says it plainly: only aggregate trends are ever shown here —
                never one teacher's individual attempts, answers, or ratings.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Closing CTA */}
      <section className="bg-forest py-20">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold text-forest">
            <ChartBarIcon className="h-6 w-6" />
          </span>
          <h2 className="font-heading text-3xl font-extrabold leading-tight text-cream sm:text-4xl">
            Ready to see it for yourself?
          </h2>
          <p className="max-w-md text-cream/70">Every feature in this guide is free to start exploring today.</p>
          <Link
            to="/#get-started"
            className="flex items-center gap-2 rounded-full bg-terracotta px-6 py-3.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
          >
            Start growing—free
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="bg-cream py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-ink-soft sm:flex-row">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold text-forest">
              <ChartBarIcon className="h-3.5 w-3.5" />
            </span>
            <p className="font-heading font-bold text-forest">Wivoza</p>
            <span className="hidden sm:inline">Practice. Reflect. Grow.</span>
          </div>
          <div className="flex items-center gap-5">
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
            <span>&copy; 2026 Wivoza. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
