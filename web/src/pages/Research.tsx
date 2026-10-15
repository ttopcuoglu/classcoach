import { Link } from 'react-router-dom'
import SupportChat from '../components/SupportChat'
import FooterContact from '../components/FooterContact'
import {
  ArrowRightIcon,
  ChartBarIcon,
  ChatBubbleIcon,
  CheckIcon,
  GraduationCapIcon,
  LessonPlanIcon,
  LockIcon,
  ScenarioIcon,
  WaveformIcon,
} from '../components/icons'

// The case this page makes: coaching, rehearsal and feedback on real lessons
// are among the best-studied ways teachers improve, and the hardest to get.
// Wivoza is built to put them in every teacher's week. Every study here
// evaluated other programs and tools, so the research is stated as what it
// found and Wivoza is described by what it does — never by a study's numbers.
// Don't add Wivoza results, pilots, partners or testimonials unless a direct
// evaluation exists to back them.
//
// Small terracotta text uses a deeper shade (#9a4b2c) than terracotta-600,
// which falls just short of WCAG AA on cream.

type Finding = {
  text: React.ReactNode
  cite: string
  href: string
  details: React.ReactNode
}

type Feature = {
  id: string
  name: string
  icon: (props: { className?: string }) => React.ReactElement
  badge: string
  need: string
  intro: string
  does: string[]
  findings: Finding[]
}

const KRAFT = 'https://www.matthewakraft.com/new-page-78'
const COHEN = 'https://doi.org/10.3102/0162373720906217'
const DEMSZKY = 'https://doi.org/10.3102/01623737231169270'
const DARLING_HAMMOND = 'https://learningpolicyinstitute.org/product/effective-teacher-professional-development-brief'
const ROWE = 'https://doi.org/10.1177/002248718603700110'
const HOWE = 'https://doi.org/10.1080/10508406.2019.1573730'

const FEATURES: Feature[] = [
  {
    id: 'talk-it-through',
    name: 'Talk It Through',
    icon: ChatBubbleIcon,
    badge: 'bg-terracotta text-cream',
    need: 'A coach to think out loud with',
    intro:
      'Most classroom problems get clearer once you have to say them in order. Talk It Through is a voice coach for exactly that: a prep period or a car ride is enough.',
    does: [
      'Asks more questions than it answers, so the thinking stays yours',
      'Helps separate what happened from what it felt like',
      'Ends with one practical next step, small enough to try tomorrow',
    ],
    findings: [
      {
        text: 'Across 60 studies with causal research designs, teacher coaching had positive average effects on both instructional practice and student achievement.',
        cite: 'Kraft, Blazar & Hogan, 2018',
        href: KRAFT,
        details: (
          <>
            <p>
              A meta-analysis of human coaching programs, with pooled effects of about 0.49 standard deviations on
              instruction and 0.18 on achievement. Much of the evidence came from early childhood and elementary
              literacy coaching.
            </p>
            <p>
              The authors also found that larger programs showed only a fraction of the effects of smaller ones, which
              is part of why making coaching widely available is hard.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'practice',
    name: 'Practice',
    icon: ScenarioIcon,
    badge: 'bg-gold text-forest',
    need: 'Somewhere safe to rehearse',
    intro:
      'The hard moments in teaching are loud, public, and three seconds long. Practice lets teachers find their words beforehand, on a scenario instead of a real student.',
    does: [
      'Rehearse a classroom moment or a hard conversation',
      'Get feedback, and compare your response with a strong model side by side',
      'Try again with a different approach. No one else sees a practice attempt',
    ],
    findings: [
      {
        text: 'In a randomized study of 105 prospective teachers, those coached between simulated teaching sessions improved targeted skills more than those who only reflected on their own.',
        cite: 'Cohen, Wong, Krishnamachari & Berlin, 2020',
        href: COHEN,
        details: (
          <p>
            Teacher candidates practiced in mixed-reality simulations with simulated students. Coached candidates also
            changed how they read student behavior and what next steps they proposed. The authors conclude that some
            skills new teachers struggle with don’t have to be learned on the job.
          </p>
        ),
      },
    ],
  },
  {
    id: 'lesson-debrief',
    name: 'Lesson Debrief',
    icon: WaveformIcon,
    badge: 'bg-forest text-gold',
    need: 'An honest look at your own lesson',
    intro:
      'While you teach, you are busy running the lesson. Lesson Debrief listens to one class period and gives you a private report on what the conversation in your room actually sounded like.',
    does: [
      'Talk share, wait time, questioning, and how transitions went',
      'One named strength, with the moment it came from',
      'A “Try next time” list to carry into your next plan',
    ],
    findings: [
      {
        text: 'Teachers typically wait less than one second for a student to respond to a question, and respond just as quickly once a student stops speaking.',
        cite: 'Rowe, 1986',
        href: ROWE,
        details: (
          <p>
            Rowe reviewed the research on “wait time”: the pause after a teacher asks a question, and the pause after a
            student answers. The review also describes approaches used to help teachers lengthen those pauses and
            improve their questioning.
          </p>
        ),
      },
      {
        text: 'In 72 classrooms, when students participated extensively, teachers elaborating on and querying earlier contributions was positively associated with how well students mastered the curriculum.',
        cite: 'Howe, Hennessy, Mercer, Vrikki & Wheatley, 2019',
        href: HOWE,
        details: (
          <p>
            Two lessons were video recorded in each of 72 demographically diverse classrooms with students aged 10–11,
            and teacher–student dialogue was related to student outcomes while accounting for prior attainment and
            other factors. The study shows an association rather than a tested intervention.
          </p>
        ),
      },
      {
        text: 'In a randomized trial with 1,136 instructors, an automated tool giving feedback on classroom talk increased instructors’ uptake of student ideas (building on what students say) by 13%.',
        cite: 'Demszky, Liu, Hill, Jurafsky & Piech, 2024',
        href: DEMSZKY,
        details: (
          <p>
            The tool, M-Powering Teachers, used natural language processing and was tested in a large online computer
            science course. The authors describe individualized feedback as essential but often too resource-intensive
            to provide, and report suggestive evidence of higher student satisfaction. First published online in 2023.
          </p>
        ),
      },
    ],
  },
  {
    id: 'planning-coach',
    name: 'Planning Coach',
    icon: LessonPlanIcon,
    badge: 'bg-mint-tint text-forest',
    need: 'Follow-through into the next lesson',
    intro:
      'Reflection only pays off if it reaches the next lesson. Planning Coach is where it lands: build a lesson, strengthen one you wrote, or adapt it before class.',
    does: [
      'Build from a topic or from your own materials',
      'Get a second read on a plan before your students see it',
      'Bring your “Try next time” list straight from a Lesson Debrief',
    ],
    findings: [
      {
        text: 'A review of 35 rigorous studies found that effective professional development shares common features, including active learning, modeling, coaching, feedback, reflection, and sustained duration.',
        cite: 'Darling-Hammond, Hyler & Gardner, 2017',
        href: DARLING_HAMMOND,
        details: (
          <p>
            The Learning Policy Institute reviewed studies linking professional development to changes in teaching and
            student outcomes. Alongside the features above, it names content focus, collaboration, and expert support.
            The linked brief summarizes the full report.
          </p>
        ),
      },
    ],
  },
]

const CYCLE = [
  { step: 'Plan', where: 'Planning Coach' },
  { step: 'Practice', where: 'Practice' },
  { step: 'Teach', where: 'Your classroom' },
  { step: 'Reflect', where: 'Lesson Debrief & Talk It Through' },
  { step: 'Adjust', where: 'Into the next plan' },
]

const SCHOOL_POINTS = [
  {
    icon: GraduationCapIcon,
    badge: 'bg-terracotta text-cream',
    title: 'A coach for every teacher',
    body: 'Every teacher gets their own coach, available between PD sessions and outside the school day, not only when a coach’s calendar allows.',
  },
  {
    icon: LockIcon,
    badge: 'bg-forest text-gold',
    title: 'Coaching, not evaluation',
    body: 'Teachers’ recordings, conversations, and practice stay private to them. Leaders never see an individual teacher’s work, so teachers can be honest with their coach.',
  },
  {
    icon: ChartBarIcon,
    badge: 'bg-gold text-forest',
    title: 'PD aimed at real needs',
    body: 'Leaders see school-wide patterns from recorded lessons, such as wait time and pace, explained in plain words, so professional learning can target what teachers actually need.',
  },
  {
    icon: CheckIcon,
    badge: 'bg-mint-tint text-forest',
    title: 'Follow-through you can see',
    body: 'Choose a focus area as a school and watch whether it shows up in fewer lessons over time, in aggregate, with groups under five combined.',
  },
]

const REFERENCES = [
  {
    text: (
      <>
        Cohen, J., Wong, V., Krishnamachari, A., &amp; Berlin, R. (2020). Teacher coaching in a simulated environment.{' '}
        <em>Educational Evaluation and Policy Analysis, 42</em>(2), 208–231.
      </>
    ),
    href: COHEN,
  },
  {
    text: (
      <>
        Darling-Hammond, L., Hyler, M. E., &amp; Gardner, M. (2017). <em>Effective teacher professional development</em>.
        Learning Policy Institute.
      </>
    ),
    href: DARLING_HAMMOND,
  },
  {
    text: (
      <>
        Demszky, D., Liu, J., Hill, H. C., Jurafsky, D., &amp; Piech, C. (2024). Can automated feedback improve teachers’
        uptake of student ideas? Evidence from a randomized controlled trial in a large-scale online course.{' '}
        <em>Educational Evaluation and Policy Analysis, 46</em>(3), 483–505.
      </>
    ),
    href: DEMSZKY,
  },
  {
    text: (
      <>
        Howe, C., Hennessy, S., Mercer, N., Vrikki, M., &amp; Wheatley, L. (2019). Teacher–student dialogue during
        classroom teaching: Does it really impact on student outcomes? <em>Journal of the Learning Sciences, 28</em>
        (4–5), 462–512.
      </>
    ),
    href: HOWE,
  },
  {
    text: (
      <>
        Kraft, M. A., Blazar, D., &amp; Hogan, D. (2018). The effect of teacher coaching on instruction and achievement:
        A meta-analysis of the causal evidence. <em>Review of Educational Research, 88</em>(4), 547–588.
      </>
    ),
    href: KRAFT,
  },
  {
    text: (
      <>
        Rowe, M. B. (1986). Wait time: Slowing down may be a way of speeding up! <em>Journal of Teacher Education, 37</em>
        (1), 43–50.
      </>
    ),
    href: ROWE,
  },
]

function ExternalLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

function Plus() {
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold text-base font-bold leading-none text-forest transition-transform duration-200 group-open:rotate-45 group-open:bg-terracotta group-open:text-cream"
    >
      +
    </span>
  )
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <div className="rounded-2xl border border-hairline bg-cream p-5">
      <p className="text-sm leading-relaxed text-ink">{finding.text}</p>
      <p className="mt-2 text-xs font-semibold text-ink-soft">{finding.cite}</p>
      <details className="group mt-3 border-t border-hairline pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-forest marker:content-none [&::-webkit-details-marker]:hidden">
          About this study
          <Plus />
        </summary>
        <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-ink-soft">{finding.details}</div>
        <ExternalLink
          href={finding.href}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#9a4b2c] hover:underline"
        >
          Read the research
          <ArrowRightIcon className="h-4 w-4" />
        </ExternalLink>
      </details>
    </div>
  )
}

function FeatureSection({ feature }: { feature: Feature }) {
  const Icon = feature.icon
  const headingId = `feature-${feature.id}`
  return (
    <article
      aria-labelledby={headingId}
      className="grid gap-6 rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm sm:p-8 lg:grid-cols-[1fr_1.1fr] lg:gap-10"
    >
      <div>
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${feature.badge}`}>
            <Icon className="h-5 w-5" />
          </span>
          <p className="font-heading text-sm font-bold uppercase tracking-[0.12em] text-[#9a4b2c]">{feature.name}</p>
        </div>
        <h3 id={headingId} className="mt-4 font-heading text-2xl font-bold leading-snug text-forest">
          {feature.need}
        </h3>
        <p className="mt-2 leading-relaxed text-ink-soft">{feature.intro}</p>
        <ul className="mt-5 flex flex-col gap-2.5">
          {feature.does.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-forest">
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#9a4b2c]" />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">What the research found</p>
        <div className="mt-3 flex flex-col gap-3">
          {feature.findings.map((finding) => (
            <FindingCard key={finding.cite} finding={finding} />
          ))}
        </div>
      </div>
    </article>
  )
}

export default function Research() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="border-b border-hairline bg-cream-card">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo/wivoza-lockup-light.png" alt="Wivoza" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-5">
            <Link to="/for-schools" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">
              For Schools
            </Link>
            <Link to="/guide" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">
              Guide
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

      <main>
        {/* Hero */}
        <section className="mx-auto w-full max-w-4xl px-6 pb-12 pt-14 text-center sm:pt-20">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.18em] text-[#9a4b2c]">
            Research behind Wivoza
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl font-heading text-4xl font-extrabold leading-[1.1] tracking-tight text-forest sm:text-5xl">
            Built on what research says helps teachers grow<span className="text-gold">.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">
            Coaching, rehearsal, and feedback on real lessons are among the best-studied ways teachers improve. They are
            also the hardest to get. Wivoza puts all three into a teacher’s week.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#teachers"
              className="inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3.5 text-sm font-semibold text-cream shadow-lg transition-colors hover:bg-forest-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
            >
              How it helps teachers
              <ArrowRightIcon className="h-4 w-4 rotate-90" />
            </a>
            <a
              href="#schools"
              className="inline-flex items-center gap-2 rounded-full border border-forest/25 bg-cream-card px-6 py-3.5 text-sm font-semibold text-forest transition-colors hover:border-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
            >
              How it helps schools
              <ArrowRightIcon className="h-4 w-4 rotate-90" />
            </a>
          </div>
        </section>

        {/* The gap */}
        <section aria-labelledby="gap-heading" className="mx-auto w-full max-w-6xl px-6 py-8">
          <div className="grid gap-8 rounded-3xl bg-forest p-7 text-cream sm:p-10 lg:grid-cols-[1fr_1.3fr] lg:items-center">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">The problem Wivoza is built for</p>
              <h2 id="gap-heading" className="mt-2 font-heading text-3xl font-extrabold leading-tight">
                Coaching works. Most teachers can’t get enough of it<span className="text-gold">.</span>
              </h2>
            </div>
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl bg-cream/10 p-5">
                <p className="leading-relaxed text-cream">
                  Across 60 rigorous studies, coaching improved both teaching practice and student achievement on
                  average.
                </p>
                <p className="mt-1.5 text-xs text-cream/70">Kraft, Blazar &amp; Hogan, 2018</p>
              </div>
              <div className="rounded-2xl bg-cream/10 p-5">
                <p className="leading-relaxed text-cream">
                  But regular, individualized feedback is resource-intensive, and as coaching programs grew larger, their
                  average effects shrank to a fraction of those in smaller programs.
                </p>
                <p className="mt-1.5 text-xs text-cream/70">
                  Kraft, Blazar &amp; Hogan, 2018; Demszky et al., 2024
                </p>
              </div>
              <p className="text-sm leading-relaxed text-cream/85">
                Wivoza is designed to close that gap: a private coach for every teacher, ready whenever they have ten
                minutes, built around the practices this research studies.
              </p>
            </div>
          </div>
        </section>

        {/* For teachers */}
        <section id="teachers" aria-labelledby="teachers-heading" className="mx-auto w-full max-w-6xl scroll-mt-6 px-6 py-10">
          <div className="mb-8 max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9a4b2c]">For teachers</p>
            <h2 id="teachers-heading" className="mt-2 font-heading text-3xl font-extrabold text-forest">
              How Wivoza helps teachers<span className="text-gold">.</span>
            </h2>
            <p className="mt-3 text-ink-soft">
              Each tool is built around a practice that research connects to teacher growth. Open “About this study” on
              any finding for its setting, scope, and source.
            </p>
          </div>
          <div className="flex flex-col gap-5">
            {FEATURES.map((feature) => (
              <FeatureSection key={feature.id} feature={feature} />
            ))}
          </div>
        </section>

        {/* Cycle */}
        <section aria-labelledby="cycle-heading" className="mx-auto w-full max-w-6xl px-6 py-8">
          <div className="rounded-3xl border-l-8 border-gold bg-gold-tint/40 p-6 sm:p-9">
            <h2 id="cycle-heading" className="font-heading text-2xl font-extrabold text-forest sm:text-3xl">
              One cycle, not one-off workshops<span className="text-gold">.</span>
            </h2>
            <p className="mt-2 max-w-2xl text-ink-soft">
              Research on professional development points to learning that is active and sustained. Wivoza connects the
              tools into a cycle teachers can repeat lesson after lesson.
            </p>
            <ol className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch lg:flex-nowrap">
              {CYCLE.map((item, i) => {
                const isClassroom = item.step === 'Teach'
                return (
                  <li key={item.step} className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center lg:flex-1">
                    <div
                      className={`flex flex-1 flex-col rounded-2xl px-4 py-3 ${
                        isClassroom ? 'bg-forest text-cream' : 'bg-cream-card'
                      }`}
                    >
                      <span className={`font-heading text-lg font-bold ${isClassroom ? 'text-cream' : 'text-forest'}`}>
                        {item.step}
                      </span>
                      <span className={`text-xs font-semibold ${isClassroom ? 'text-gold' : 'text-ink-soft'}`}>
                        {item.where}
                      </span>
                    </div>
                    {i < CYCLE.length - 1 && (
                      <span aria-hidden="true" className="flex justify-center text-[#9a4b2c]">
                        <ArrowRightIcon className="h-4 w-4 rotate-90 sm:rotate-0" />
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        </section>

        {/* For schools */}
        <section id="schools" aria-labelledby="schools-heading" className="mx-auto w-full max-w-6xl scroll-mt-6 px-6 py-10">
          <div className="mb-8 max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9a4b2c]">For schools</p>
            <h2 id="schools-heading" className="mt-2 font-heading text-3xl font-extrabold text-forest">
              How Wivoza helps schools<span className="text-gold">.</span>
            </h2>
            <p className="mt-3 text-ink-soft">
              Effective professional development combines coaching, feedback, and reflection over time (Darling-Hammond,
              Hyler &amp; Gardner, 2017). Wivoza gives a school’s PD that follow-through between sessions.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {SCHOOL_POINTS.map(({ icon: Icon, badge, title, body }) => (
              <div key={title} className="flex items-start gap-4 rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${badge}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-heading text-lg font-bold text-forest">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{body}</p>
                </div>
              </div>
            ))}
          </div>
          <Link
            to="/for-schools"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#9a4b2c] hover:underline"
          >
            See what a school license includes
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </section>

        {/* Closing */}
        <section className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="rounded-3xl bg-forest px-6 py-12 text-center text-cream sm:px-12">
            <h2 className="mx-auto max-w-2xl font-heading text-3xl font-extrabold sm:text-4xl">
              Bring reflection into your next lesson<span className="text-gold">.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-cream/80">
              Talk It Through and Practice are free. Start with one conversation.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/#get-started"
                className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3.5 text-sm font-semibold text-forest shadow-lg transition-colors hover:bg-gold/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
              >
                Start free
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
              <Link
                to="/for-schools"
                className="inline-flex items-center gap-2 rounded-full border border-cream/30 px-6 py-3.5 text-sm font-semibold text-cream transition-colors hover:border-cream hover:bg-cream/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
              >
                Bring Wivoza to your school
              </Link>
            </div>
          </div>
        </section>

        {/* References */}
        <section aria-labelledby="references-heading" className="mx-auto w-full max-w-4xl px-6 pb-16 pt-6">
          <h2 id="references-heading" className="font-heading text-xl font-bold text-forest">
            References
          </h2>
          <p className="mt-2 text-sm text-ink-soft">
            These studies examined coaching programs and tools in their own settings. Findings vary with setting,
            implementation, and who takes part.
          </p>
          <ul className="mt-4 flex flex-col gap-4 text-sm leading-relaxed text-ink-soft">
            {REFERENCES.map((ref) => (
              <li key={ref.href} className="pl-6 -indent-6">
                {ref.text}{' '}
                <ExternalLink href={ref.href} className="break-all text-[#9a4b2c] hover:underline">
                  {ref.href}
                </ExternalLink>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-ink-soft">
            Wivoza is not affiliated with, or endorsed by, the authors or institutions of these studies.
          </p>
        </section>
      </main>

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
            <Link to="/research" aria-current="page" className="hover:text-ink">
              Research
            </Link>
            <a href="/terms" className="hover:text-ink">
              Privacy
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
