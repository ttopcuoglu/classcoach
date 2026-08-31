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
  ShareIcon,
  SparkleIcon,
  StarIcon,
  TargetIcon,
  UserIcon,
  WaveformIcon,
} from '../components/icons'

type IconComponent = (props: { className?: string }) => React.ReactElement
type GuideItem = { id: string; icon: IconComponent; tint: string; nav: string; title: string; body: string }
type GuideChapter = { id: string; label: string; kicker: string; tint: string; intro: string; items: GuideItem[] }

const CHAPTERS: GuideChapter[] = [
  {
    id: 'getting-started',
    label: 'Getting started',
    kicker: 'Getting started',
    tint: 'bg-gold-tint text-terracotta-600',
    intro: "Everything between opening wivoza.com and landing on your own dashboard.",
    items: [
      {
        id: 'signup',
        icon: LockIcon,
        tint: 'bg-gold-tint text-terracotta-600',
        nav: 'wivoza.com',
        title: 'Signing up',
        body: 'One click with Google, or an email and password (8 characters minimum). Either way you land in the same place — there\'s no separate "teacher" vs "admin" signup.',
      },
      {
        id: 'onboarding',
        icon: ChecklistIcon,
        tint: 'bg-gold-tint text-terracotta-600',
        nav: 'First sign-in',
        title: 'A six-step welcome',
        body: 'About you, your classroom, a mic check, a live demo of Coach in action, your goal, and an initial focus metric. Every step can be skipped, and whatever you\'ve already filled in is saved as you go.',
      },
      {
        id: 'home-nav',
        icon: HomeIcon,
        tint: 'bg-gold-tint text-terracotta-600',
        nav: 'Home',
        title: 'Your dashboard',
        body: 'Three big buttons to your most-used tools, a classroom-pulse chart built from your real recordings, a daily tip, and a feed of your recent work — nothing generic, all of it yours.',
      },
    ],
  },
  {
    id: 'coaching',
    label: 'Coaching',
    kicker: 'Coaching',
    tint: 'bg-mint-tint text-forest',
    intro: 'Three ways to get real coaching, from a thirty-second check-in to a full recorded lesson.',
    items: [
      {
        id: 'talk-it-through',
        icon: WaveformIcon,
        tint: 'bg-mint-tint text-forest',
        nav: 'Coaching → Talk It Through',
        title: 'Talk It Through',
        body: 'A live, spoken conversation with Coach. Just start talking — Coach listens, thinks, and replies out loud, back and forth, like a real conversation. Nothing about your voice is ever saved, only the resulting text.',
      },
      {
        id: 'lesson-debrief',
        icon: MicIcon,
        tint: 'bg-mint-tint text-forest',
        nav: 'Coaching → Lesson Debrief',
        title: 'Lesson Debrief',
        body: 'Record a real class period and get back an honest, evidence-only report across six tabs: Overview, My Growth, Reflect, Lesson Content, Climate & Routines, and Discourse Details. No audio is ever kept — only the transcript and what it shows.',
      },
      {
        id: 'ask-practice',
        icon: ChatBubbleIcon,
        tint: 'bg-mint-tint text-forest',
        nav: 'Coaching → Ask & Practice',
        title: 'Ask & Practice',
        body: 'Ask a real question about something that happened, or Practice a hypothetical scenario before you face the real thing. Every answer comes with a follow-up chat to go deeper.',
      },
    ],
  },
  {
    id: 'plan',
    label: 'Plan',
    kicker: 'Plan',
    tint: 'bg-peach-tint text-terracotta',
    intro: 'Get ready for what\'s ahead — a lesson to teach, or a conversation to have.',
    items: [
      {
        id: 'lesson-planning',
        icon: LessonPlanIcon,
        tint: 'bg-peach-tint text-terracotta',
        nav: 'Plan → Lesson Planning',
        title: 'Lesson Planning',
        body: 'Generate a sample lesson from just an objective, or paste your own plan and get real coaching on it — with a proposed revision you can accept or dismiss, never applied automatically.',
      },
      {
        id: 'messages',
        icon: MailIcon,
        tint: 'bg-peach-tint text-terracotta',
        nav: 'Plan → Messages',
        title: 'Messages',
        body: 'Four tools in one place: Write a Message, Prepare for a Conversation, Practice a Conversation, and Review My Communication — for everything from a quick parent email to a hard, high-stakes meeting.',
      },
    ],
  },
  {
    id: 'grow',
    label: 'Grow',
    kicker: 'Grow',
    tint: 'bg-lavender-tint text-[#6B5FA0]',
    intro: 'The tools that build on everything else you\'ve done in Wivoza.',
    items: [
      {
        id: 'profile',
        icon: UserIcon,
        tint: 'bg-lavender-tint text-[#6B5FA0]',
        nav: 'Grow → Profile & Settings',
        title: 'Profile & Settings',
        body: 'Your info, what Coach remembers about you, your school, data-retention preferences, and a full export or reset of your data — all in one place.',
      },
      {
        id: 'cheat-sheet',
        icon: StarIcon,
        tint: 'bg-lavender-tint text-[#6B5FA0]',
        nav: 'Grow → Cheat Sheet',
        title: 'Cheat Sheet',
        body: 'A personal reference built automatically from what you\'ve saved — model responses and follow-up guidance, grouped by category. Nothing shows up until you save something.',
      },
      {
        id: 'first-30-days',
        icon: ArrowUpIcon,
        tint: 'bg-lavender-tint text-[#6B5FA0]',
        nav: 'Grow → First 30 Days',
        title: 'First 30 Days',
        body: 'A simple checklist for getting the most out of Wivoza early on, with several items linking straight into the right tool so checking one off is one click.',
      },
    ],
  },
]

const REPORT_TABS = [
  { name: 'Overview', body: 'A 60-second summary — one strength, one priority, your talk balance, and a next step.' },
  { name: 'My Growth', body: 'Ten metrics trended across every session, with one you pick as your active focus.' },
  { name: 'Reflect', body: 'A live coaching chat grounded only in this session\'s real evidence.' },
  { name: 'Lesson Content', body: 'Detected objective, vocabulary, and topic word clouds split by speaker.' },
  { name: 'Climate & Routines', body: 'Transitions and tone, framed as patterns — never a behavior score.' },
  { name: 'Discourse Details', body: 'The full question-by-question breakdown, for anyone who wants to go deep.' },
]

const MESSAGE_TOOLS = [
  { icon: MailIcon, title: 'Write a Message', body: 'Start new, respond, or improve a draft — pick a recipient, purpose, tone, and format, and get a ready-to-send message. Quick actions revise it instantly: warmer, firmer, shorter, simpler, or translated into another language.' },
  { icon: TargetIcon, title: 'Prepare for a Conversation', body: 'A full plan for a real upcoming conversation — an opening line, the facts to bring, likely reactions, phrases to avoid, and a complete model response.' },
  { icon: ScenarioIcon, title: 'Practice a Conversation', body: 'Rehearse a hard conversation before you have it, rated across six dimensions with a stronger phrase to try.' },
  { icon: CheckIcon, title: 'Review My Communication', body: 'Get an honest read on a message and your planned response — what works, what might land badly, and a revised version.' },
]

const PRIVACY_POINTS = [
  { title: 'Your voice is never kept', body: 'Talk It Through and Lesson Debrief both discard audio right after transcription — only text and metrics remain.' },
  { title: 'Names stay out of it', body: 'Coach refers to people by role — "a student," "the class" — even if you use a name yourself, and avoids quoting anything that could indirectly identify someone.' },
  { title: 'You\'re never scored', body: "Wivoza never grades, ranks, or evaluates you. A few private internal self-assessments power your own growth trends and are never shown to anyone as a number." },
]

function GuideCard({ item }: { item: GuideItem }) {
  const Icon = item.icon
  return (
    <div id={item.id} className="scroll-mt-24 rounded-2xl border border-hairline bg-cream-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.tint}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="rounded-full border border-hairline bg-cream px-2.5 py-1 text-[11px] font-medium text-ink-soft">
          {item.nav}
        </span>
      </div>
      <h3 className="mt-4 font-heading text-lg font-bold text-forest">{item.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{item.body}</p>
    </div>
  )
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
          Every feature, start to finish.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-soft">
          Wivoza is a private self-coaching companion for teachers — a place to talk through a hard moment,
          understand a real lesson, prepare for a difficult conversation, and get feedback that's honest
          without ever grading you. Here's what's inside, from your first sign-in to the tools you'll use most.
        </p>
      </section>

      {/* Quick nav */}
      <nav className="border-y border-hairline bg-cream-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap justify-center gap-2 px-6 py-4">
          {CHAPTERS.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              className="rounded-full border border-hairline bg-cream px-3.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
            >
              {c.label}
            </a>
          ))}
          <a
            href="#privacy"
            className="rounded-full border border-hairline bg-cream px-3.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
          >
            Privacy
          </a>
          <a
            href="#admin"
            className="rounded-full border border-hairline bg-cream px-3.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
          >
            For schools
          </a>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        {/* Standard chapters */}
        {CHAPTERS.map((chapter) => (
          <section key={chapter.id} id={chapter.id} className="scroll-mt-20 border-b border-hairline pb-16 pt-16 first:pt-0">
            <div className="mb-8 flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${chapter.tint}`}>
                {chapter.kicker}
              </span>
            </div>
            <p className="max-w-xl text-lg text-ink-soft">{chapter.intro}</p>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {chapter.items.map((item) => (
                <GuideCard key={item.id} item={item} />
              ))}
            </div>

            {/* Extra detail blocks woven into the relevant chapter */}
            {chapter.id === 'coaching' && (
              <div className="mt-10 rounded-2xl border border-hairline bg-cream-card p-7">
                <h4 className="font-heading text-lg font-bold text-forest">
                  Inside a Lesson Debrief report — six tabs
                </h4>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {REPORT_TABS.map((tab) => (
                    <div key={tab.name} className="rounded-xl bg-cream p-4">
                      <p className="font-heading text-sm font-bold text-forest">{tab.name}</p>
                      <p className="mt-1 text-sm text-ink-soft">{tab.body}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex items-start gap-3 rounded-xl border-l-4 border-mint-text bg-mint-tint/40 p-4">
                  <BrainIcon className="mt-0.5 h-5 w-5 shrink-0 text-forest" />
                  <p className="text-sm text-forest">
                    Every number is honest about its own confidence — a metric Wivoza couldn't reliably
                    measure shows as unavailable, never as a hidden zero, and a real confirmed zero always
                    shows as a plain, full-strength zero. The two never look the same, on purpose.
                  </p>
                </div>
              </div>
            )}

            {chapter.id === 'plan' && (
              <div className="mt-10 rounded-2xl border border-hairline bg-cream-card p-7">
                <h4 className="font-heading text-lg font-bold text-forest">The four Messages tools</h4>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {MESSAGE_TOOLS.map(({ icon: Icon, title, body }) => (
                    <div key={title} className="flex items-start gap-3.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-peach-tint text-terracotta">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-heading text-sm font-bold text-forest">{title}</p>
                        <p className="mt-0.5 text-sm text-ink-soft">{body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        ))}

        {/* Across the app */}
        <section id="across-the-app" className="scroll-mt-20 border-b border-hairline pb-16 pt-16">
          <div className="mb-8 flex items-center gap-2">
            <span className="rounded-full bg-gold-tint px-3 py-1 text-xs font-bold uppercase tracking-wide text-terracotta-600">
              Across the app
            </span>
          </div>
          <p className="max-w-xl text-lg text-ink-soft">
            Three things that work the same way almost everywhere in Wivoza.
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            <div className="rounded-2xl border border-hairline bg-cream-card p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-tint text-terracotta-600">
                <StarIcon className="h-5 w-5" />
              </span>
              <p className="mt-3 font-heading text-base font-bold text-forest">Save</p>
              <p className="mt-1 text-sm text-ink-soft">
                A star toggle on practice attempts, answers, messages, and plans keeps the good ones out of
                the noise and into your Cheat Sheet.
              </p>
            </div>
            <div className="rounded-2xl border border-hairline bg-cream-card p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-tint text-terracotta-600">
                <ShareIcon className="h-5 w-5" />
              </span>
              <p className="mt-3 font-heading text-base font-bold text-forest">Share</p>
              <p className="mt-1 text-sm text-ink-soft">
                A private, read-only link — no account needed to view it, and the recipient sees only that
                one item, nothing else in your account.
              </p>
            </div>
            <div className="rounded-2xl border border-hairline bg-cream-card p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-tint text-terracotta-600">
                <BookIcon className="h-5 w-5" />
              </span>
              <p className="mt-3 font-heading text-base font-bold text-forest">Export</p>
              <p className="mt-1 text-sm text-ink-soft">
                One printable "Wivoza — Your Playbook" page of everything you've saved, ready to print or
                save as a PDF.
              </p>
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="scroll-mt-20 border-b border-hairline pb-16 pt-16">
          <div className="mb-8 flex items-center gap-2">
            <span className="rounded-full bg-mint-tint px-3 py-1 text-xs font-bold uppercase tracking-wide text-forest">
              Privacy
            </span>
          </div>
          <h2 className="font-heading text-2xl font-extrabold text-forest sm:text-3xl">
            Privacy & what Coach remembers
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-ink-soft">
            Wivoza is built to be honest with you about evidence, and careful with what it keeps about you
            and your students.
          </p>

          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <div className="rounded-2xl border border-hairline bg-cream-card p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-mint-tint text-forest">
                <BrainIcon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-heading text-lg font-bold text-forest">Coach's memory</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                To make coaching feel less like starting over every time, Coach keeps a short, running note
                about your recurring strengths and any ongoing challenges — built only from your real Ask
                and Talk It Through conversations, never from Practice rehearsals. It's on by default, but
                entirely yours: read it, turn it off, or clear it anytime from Profile & Settings.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              {PRIVACY_POINTS.map((p) => (
                <div key={p.title} className="flex items-start gap-3.5 rounded-2xl border border-hairline bg-cream-card p-5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mint-tint text-forest">
                    <LockIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-heading text-sm font-bold text-forest">{p.title}</p>
                    <p className="mt-0.5 text-sm text-ink-soft">{p.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* For schools */}
        <section id="admin" className="scroll-mt-20 pt-16">
          <div className="mb-8 flex items-center gap-2">
            <span className="rounded-full bg-peach-tint px-3 py-1 text-xs font-bold uppercase tracking-wide text-terracotta">
              For schools & districts
            </span>
          </div>
          <h2 className="font-heading text-2xl font-extrabold text-forest sm:text-3xl">Admin dashboard</h2>
          <p className="mt-3 max-w-2xl text-lg text-ink-soft">
            Visible only to school and district admins — built around aggregate trends, never an individual
            teacher's attempts or ratings.
          </p>

          <div className="mt-8 overflow-x-auto rounded-2xl border border-hairline bg-cream-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs font-bold uppercase tracking-wide text-ink-soft">
                  <th className="px-6 py-4">View</th>
                  <th className="px-6 py-4">What it shows</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                <tr>
                  <td className="px-6 py-4 font-heading font-bold text-forest">Overview</td>
                  <td className="px-6 py-4 text-ink-soft">
                    Teacher counts, a staff-wide growth signal, weekly activity, and a member list with
                    remove/suspend/delete controls. Every admin sees this.
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-heading font-bold text-forest">Organizations</td>
                  <td className="px-6 py-4 text-ink-soft">
                    Platform admins only — create, edit, or remove school and district accounts.
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-heading font-bold text-forest">Users</td>
                  <td className="px-6 py-4 text-ink-soft">
                    Platform admins only — every account across Wivoza, including independent teachers.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border-l-4 border-terracotta bg-peach-tint/40 p-5">
            <HeadsetIcon className="mt-0.5 h-5 w-5 shrink-0 text-terracotta" />
            <p className="text-sm text-forest">
              A banner on every admin view says it plainly: only aggregate trends are ever shown here —
              never one teacher's individual attempts, answers, or ratings. Joining a school is as simple as
              entering a short code, either during onboarding or later from Profile & Settings.
            </p>
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
          <p className="max-w-md text-cream/70">
            Every feature in this guide is free to start exploring today.
          </p>
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
            <Link to="/terms" className="hover:text-ink">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-ink">
              Terms
            </Link>
            <span>&copy; 2026 Wivoza. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
