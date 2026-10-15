import { Link } from 'react-router-dom'
import SupportChat from '../components/SupportChat'
import FooterContact from '../components/FooterContact'
import { ArrowRightIcon, BookIcon } from '../components/icons'

// Every study on this page evaluated something other than Wivoza. The copy is
// written so that line never blurs: findings are the study's, the Wivoza line
// is a design rationale, and each card says what the study did not test.
// Don't add Wivoza results, pilots, partners or testimonials here unless a
// direct evaluation exists to back them.
//
// Small terracotta text uses a deeper shade (#9a4b2c) than terracotta-600,
// which falls just short of WCAG AA on cream.

type Study = {
  id: string
  topic: string
  title: string
  citation: string
  found: React.ReactNode
  connection: string
  context: string
  details: React.ReactNode
  href: string
  accent: string
}

const STUDIES: Study[] = [
  {
    id: 'coaching',
    topic: 'Personalized coaching',
    title: 'Coaching can change what happens in classrooms',
    citation: 'Kraft, Blazar & Hogan (2018)',
    found:
      'Across 60 studies using causal research designs, teacher coaching had positive average effects on instructional practice and student achievement.',
    connection:
      'Talk It Through is designed to give teachers an accessible space to discuss classroom challenges, consider strategies, and identify a next step.',
    context:
      'Much of the evidence involved early childhood and elementary literacy coaching. These results do not establish the effectiveness of Wivoza’s AI coaching.',
    details: (
      <>
        <p>
          A meta-analysis of studies of human coaching programs. The pooled effects were about 0.49 standard deviations
          on instruction and 0.18 standard deviations on achievement.
        </p>
        <p>
          The authors also found that larger programs, studied as they were rolled out at scale, showed average effects
          that were only a fraction of those found in smaller, closely supported programs. Implementation matters.
        </p>
      </>
    ),
    href: 'https://www.matthewakraft.com/new-page-78',
    accent: 'bg-terracotta text-cream',
  },
  {
    id: 'practice',
    topic: 'Practice with feedback',
    title: 'Rehearsal helps more when feedback comes with it',
    citation: 'Cohen, Wong, Krishnamachari & Berlin (2020)',
    found:
      'In a randomized study of 105 prospective teachers, participants who received coaching between simulated teaching sessions improved targeted skills more than participants who reflected without coaching.',
    connection:
      'Practice gives teachers a space to rehearse classroom situations and conversations, receive feedback, and try a different approach.',
    context:
      'The study evaluated coached simulations with prospective teachers, rather than Wivoza’s AI role-play or its effects in everyday classrooms.',
    details: (
      <>
        <p>
          Teacher candidates in a preparation program practiced in mixed-reality simulations with simulated students.
          Between sessions, they were randomly assigned either to receive coaching or to reflect on their own teaching.
        </p>
        <p>
          Coached candidates also changed how they perceived student behavior and what next steps they suggested for
          addressing it. The authors conclude that some skills novices struggle with can be developed before they
          reach a classroom.
        </p>
      </>
    ),
    href: 'https://doi.org/10.3102/0162373720906217',
    accent: 'bg-gold text-forest',
  },
  {
    id: 'feedback',
    topic: 'Feedback on classroom conversations',
    title: 'Automated feedback can shift how teachers respond to students',
    citation: 'Demszky, Liu, Hill, Jurafsky & Piech (2024)',
    found: (
      <>
        A randomized trial involving 1,136 online instructors found that an automated feedback tool increased
        instructors’ <span className="font-semibold text-forest">uptake</span> of student contributions by 13%. Uptake
        means building on what students say: picking up a student’s idea and taking it further, so students feel heard.
      </>
    ),
    connection:
      'Lesson Debrief is designed to help teachers examine classroom conversations, reflect on questioning and participation, and select an instructional move to try.',
    context:
      'The study tested a different tool in an online computer science course. The reported improvement is not a Wivoza result.',
    details: (
      <>
        <p>
          The researchers built a tool called M-Powering Teachers, which used natural language processing to give
          instructors feedback on their uptake of student contributions. Instructors in a large online course were
          randomly assigned to receive the feedback or not.
        </p>
        <p>
          The authors also report suggestive evidence of higher student satisfaction and assignment completion. First
          published online in 2023.
        </p>
      </>
    ),
    href: 'https://doi.org/10.3102/01623737231169270',
    accent: 'bg-forest text-gold',
  },
  {
    id: 'professional-learning',
    topic: 'Ongoing professional learning',
    title: 'Effective professional development shares common features',
    citation: 'Darling-Hammond, Hyler & Gardner (2017)',
    found:
      'A review of 35 rigorous studies identified common features of effective professional development, including active learning, modeling, coaching, feedback, reflection, and sustained duration.',
    connection:
      'Planning Coach, Practice, Talk It Through, and Lesson Debrief offer opportunities to connect preparation, rehearsal, and reflection across lessons.',
    context:
      'The review identified features shared by successful programs. Including those features does not, by itself, establish a product’s effectiveness.',
    details: (
      <>
        <p>
          The Learning Policy Institute reviewed studies that found a positive link between professional development,
          teaching practice, and student outcomes, and described the features those programs tended to share.
        </p>
        <p>
          Alongside the features above, the review also names content focus, collaboration, and expert support. The
          linked brief summarizes the full report.
        </p>
      </>
    ),
    href: 'https://learningpolicyinstitute.org/product/effective-teacher-professional-development-brief',
    accent: 'bg-mint-tint text-forest',
  },
]

const CYCLE = [
  { step: 'Plan', where: 'Planning Coach', body: 'Shape the lesson and think ahead about where it might go.' },
  { step: 'Practice', where: 'Practice', body: 'Rehearse a classroom moment or conversation and get feedback.' },
  { step: 'Teach', where: 'Your classroom', body: 'The real work happens with your students, not in an app.' },
  { step: 'Reflect', where: 'Lesson Debrief & Talk It Through', body: 'Look back at the lesson and talk through what you noticed.' },
  { step: 'Adjust', where: 'Your next lesson', body: 'Choose one move to try, and carry it into your next plan.' },
]

const EVIDENCE_POINTS = [
  {
    title: 'Related approaches show promise',
    body: 'Research supports the potential of coaching, practice with feedback, reflection, and automated feedback as ways to support teachers’ professional learning.',
  },
  {
    title: 'Results depend on context',
    body: 'Findings vary by setting, by how a program is implemented, and by who takes part. Effects found in one study may not appear in another.',
  },
  {
    title: 'Wivoza needs its own evidence',
    body: 'None of these studies evaluated Wivoza. Its own impact on teaching and learning requires direct evaluation.',
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
    href: 'https://doi.org/10.3102/0162373720906217',
  },
  {
    text: (
      <>
        Darling-Hammond, L., Hyler, M. E., &amp; Gardner, M. (2017). <em>Effective teacher professional development</em>.
        Learning Policy Institute.
      </>
    ),
    href: 'https://learningpolicyinstitute.org/product/effective-teacher-professional-development-brief',
  },
  {
    text: (
      <>
        Demszky, D., Liu, J., Hill, H. C., Jurafsky, D., &amp; Piech, C. (2024). Can automated feedback improve teachers’
        uptake of student ideas? Evidence from a randomized controlled trial in a large-scale online course.{' '}
        <em>Educational Evaluation and Policy Analysis, 46</em>(3), 483–505. (First published online 2023.)
      </>
    ),
    href: 'https://doi.org/10.3102/01623737231169270',
  },
  {
    text: (
      <>
        Kraft, M. A., Blazar, D., &amp; Hogan, D. (2018). The effect of teacher coaching on instruction and achievement:
        A meta-analysis of the causal evidence. <em>Review of Educational Research, 88</em>(4), 547–588.
      </>
    ),
    href: 'https://www.matthewakraft.com/new-page-78',
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

function StudyCard({ study, index }: { study: Study; index: number }) {
  const headingId = `study-${study.id}`
  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm sm:p-7"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-heading text-sm font-bold ${study.accent}`}
        >
          {index + 1}
        </span>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9a4b2c]">{study.topic}</p>
      </div>
      <h3 id={headingId} className="mt-4 font-heading text-xl font-bold leading-snug text-forest">
        {study.title}
      </h3>
      <p className="mt-1 text-sm text-ink-soft">{study.citation}</p>

      <dl className="mt-5 flex flex-1 flex-col gap-4 text-sm leading-relaxed">
        <div>
          <dt className="font-semibold text-forest">What the research found</dt>
          <dd className="mt-1 text-ink-soft">{study.found}</dd>
        </div>
        <div className="rounded-2xl bg-mint-tint/40 p-4">
          <dt className="font-semibold text-forest">How it connects to Wivoza’s design</dt>
          <dd className="mt-1 text-ink-soft">{study.connection}</dd>
        </div>
        <div className="rounded-2xl border-l-4 border-gold bg-gold-tint/40 px-4 py-3">
          <dt className="font-semibold text-forest">Important context</dt>
          <dd className="mt-1 text-ink-soft">{study.context}</dd>
        </div>
      </dl>

      <details className="group mt-5 rounded-2xl border border-hairline bg-cream/60 px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-forest marker:content-none [&::-webkit-details-marker]:hidden">
          More about this study
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold text-base font-bold leading-none text-forest transition-transform duration-200 group-open:rotate-45 group-open:bg-terracotta group-open:text-cream"
          >
            +
          </span>
        </summary>
        <div className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-ink-soft">{study.details}</div>
      </details>

      <ExternalLink
        href={study.href}
        className="mt-5 inline-flex items-center gap-1.5 self-start rounded-sm text-sm font-semibold text-[#9a4b2c] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
      >
        Read the research
        <ArrowRightIcon className="h-4 w-4" />
      </ExternalLink>
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
            <Link to="/guide" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">
              Guide
            </Link>
            <Link to="/faq" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">
              FAQ
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
        <section className="mx-auto w-full max-w-4xl px-6 pb-10 pt-14 text-center sm:pt-20">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.18em] text-[#9a4b2c]">
            Research behind Wivoza
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl font-heading text-4xl font-extrabold leading-[1.1] tracking-tight text-forest sm:text-5xl">
            Built around research on how teachers grow<span className="text-gold">.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">
            Wivoza brings coaching conversations, practice, and classroom reflection into teachers’ everyday work. Its
            design draws on research about professional learning and instructional improvement.
          </p>
          <p className="mx-auto mt-7 flex max-w-2xl items-start gap-3 rounded-2xl border border-gold/60 bg-cream-card px-5 py-4 text-left text-sm font-medium text-forest shadow-sm">
            <BookIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#9a4b2c]" />
            The studies featured here examine related approaches and tools. They do not evaluate Wivoza itself.
          </p>
          <a
            href="#research"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3.5 text-sm font-semibold text-cream shadow-lg transition-colors hover:bg-forest-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
          >
            Explore the Research
            <ArrowRightIcon className="h-4 w-4 rotate-90" />
          </a>
        </section>

        {/* Research cards */}
        <section id="research" aria-labelledby="research-heading" className="mx-auto w-full max-w-6xl scroll-mt-6 px-6 py-10">
          <div className="mb-8 max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9a4b2c]">Four lines of research</p>
            <h2 id="research-heading" className="mt-2 font-heading text-3xl font-extrabold text-forest">
              What the studies found, and why it matters to us<span className="text-gold">.</span>
            </h2>
            <p className="mt-3 text-ink-soft">
              Each card pairs a published finding with the design choice it informed. The Wivoza line is our reasoning,
              not a result.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {STUDIES.map((study, i) => (
              <StudyCard key={study.id} study={study} index={i} />
            ))}
          </div>
        </section>

        {/* Learning cycle */}
        <section aria-labelledby="cycle-heading" className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="rounded-3xl bg-cream-card p-6 shadow-sm sm:p-9">
            <div className="max-w-2xl">
              <h2 id="cycle-heading" className="font-heading text-3xl font-extrabold text-forest">
                A practical cycle for professional growth<span className="text-gold">.</span>
              </h2>
              <p className="mt-3 text-ink-soft">
                This is the approach Wivoza is designed around: one cycle that connects preparation, rehearsal, and
                reflection. It describes our intended approach, not a validated intervention.
              </p>
            </div>
            <ol className="mt-7 grid gap-3 lg:grid-cols-5">
              {CYCLE.map((item, i) => {
                const isClassroom = item.step === 'Teach'
                return (
                  <li
                    key={item.step}
                    className={`relative flex flex-col rounded-2xl p-5 ${
                      isClassroom ? 'bg-forest text-cream' : 'border border-hairline bg-cream'
                    }`}
                  >
                    <span className={`font-heading text-xs font-bold ${isClassroom ? 'text-gold' : 'text-[#9a4b2c]'}`}>
                      Step {i + 1}
                    </span>
                    <span className={`mt-1 font-heading text-xl font-bold ${isClassroom ? 'text-cream' : 'text-forest'}`}>
                      {item.step}
                    </span>
                    <span className={`mt-1 text-sm font-semibold ${isClassroom ? 'text-gold' : 'text-forest'}`}>
                      {item.where}
                    </span>
                    <span className={`mt-2 text-sm leading-relaxed ${isClassroom ? 'text-cream/80' : 'text-ink-soft'}`}>
                      {item.body}
                    </span>
                    {i < CYCLE.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="absolute -bottom-3 left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 rotate-90 items-center justify-center rounded-full bg-cream-card text-terracotta lg:-right-3.5 lg:bottom-auto lg:left-auto lg:top-1/2 lg:-translate-y-1/2 lg:translate-x-0 lg:rotate-0"
                      >
                        <ArrowRightIcon className="h-4 w-4" />
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
            <p className="mt-5 text-sm text-ink-soft">
              Then the cycle starts again: what you adjust becomes part of the next plan.
            </p>
          </div>
        </section>

        {/* Evidence transparency */}
        <section aria-labelledby="evidence-heading" className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="grid gap-8 rounded-3xl border-l-8 border-gold bg-gold-tint/40 p-6 sm:p-9 lg:grid-cols-[1fr_1.6fr] lg:items-start">
            <div>
              <h2 id="evidence-heading" className="font-heading text-3xl font-extrabold text-forest">
                Understanding the evidence<span className="text-gold">.</span>
              </h2>
              <p className="mt-3 text-sm text-ink-soft">
                How to read this page, and what it does and does not tell you.
              </p>
            </div>
            <ul className="flex flex-col gap-4">
              {EVIDENCE_POINTS.map((point) => (
                <li key={point.title} className="rounded-2xl bg-cream-card p-5">
                  <h3 className="font-heading text-base font-bold text-forest">{point.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{point.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Closing */}
        <section className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="rounded-3xl bg-forest px-6 py-12 text-center text-cream sm:px-12">
            <h2 className="mx-auto max-w-2xl font-heading text-3xl font-extrabold sm:text-4xl">
              Bring reflection into your next lesson<span className="text-gold">.</span>
            </h2>
            <Link
              to="/"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3.5 text-sm font-semibold text-forest shadow-lg transition-colors hover:bg-gold/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
            >
              Explore Wivoza
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* References */}
        <section aria-labelledby="references-heading" className="mx-auto w-full max-w-4xl px-6 pb-16 pt-6">
          <h2 id="references-heading" className="font-heading text-xl font-bold text-forest">
            References
          </h2>
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
