import { Link } from 'react-router-dom'
import SupportChat from '../components/SupportChat'
import { ArrowRightIcon, SparkleIcon } from '../components/icons'
import FooterContact from '../components/FooterContact'

type QA = { q: string; a: React.ReactNode }
type Category = { id: string; label: string; tint: string; items: QA[] }

const LINK = 'font-semibold text-terracotta-600 hover:underline'

const CATEGORIES: Category[] = [
  {
    id: 'about',
    label: 'About Wivoza',
    tint: 'bg-mint-tint text-forest',
    items: [
      {
        q: 'What is Wivoza?',
        a: (
          <>
            Wivoza is a private coach for teachers, there after every lesson. Record a class and you get a report on
            how you taught the content: your explanations, examples, models, vocabulary and the order you put ideas
            in, read the way a specialist in your subject would. The same report covers how the lesson ran: Teacher
            Talk, Student Talk, Group Talk, Silence, pace, questions and checks for understanding. Around it sit tools
            to think a problem through out loud, rehearse a hard conversation, and plan the next lesson. Everything is
            private to the teacher. The{' '}
            <Link to="/research" className={LINK}>research page</Link> explains why each tool is built the way it is.
          </>
        ),
      },
      {
        q: 'How does Wivoza work?',
        a: 'Teachers record a lesson on a phone, tablet or computer. There is no voice sample or setup recording. Wivoza transcribes the recording, deletes the audio, and builds a private report: one thing to try next lesson, notes on how you taught the content, each tied to a moment you actually said, and the lesson\'s numbers. Coach can then talk it through with you and help you plan what comes next.',
      },
      {
        q: 'Does Wivoza work on any device?',
        a: (
          <>
            Yes, on any device with a microphone and a browser: phone, tablet, laptop or desktop, with nothing to
            download. Wivoza is also{' '}
            <a href="https://apps.apple.com/us/app/wivoza/id6808223345" target="_blank" rel="noreferrer" className={LINK}>
              on the App Store for iPhone
            </a>
            , using the same account.
          </>
        ),
      },
      {
        q: 'Can I reach Coach without opening Wivoza?',
        a: 'Yes. Connect Telegram from Profile & Settings and Coach is a chat on your phone: type, send a voice note, photograph a worksheet, or forward an email you need to answer. Short things, like a few lesson ideas or a draft reply, arrive in the chat; longer ones arrive as a PDF or open in Wivoza already signed in.',
      },
      {
        q: 'Is the feedback from a real person or AI?',
        a: 'It\'s AI-generated, grounded only in real evidence. Wivoza is built not to invent a quote, number, or moment that wasn\'t actually said or measured. When something is unclear or missing, it says so rather than guessing.',
      },
      {
        q: 'What if Coach gets something wrong or misses something?',
        a: 'Treat it the way you\'d treat a colleague\'s read on a moment they weren\'t fully present for: a useful outside perspective, not the final word. Your own judgment always comes first.',
      },
    ],
  },
  {
    id: 'lesson-debrief',
    label: 'Lesson Debrief',
    tint: 'bg-gold-tint text-terracotta-600',
    items: [
      {
        q: 'What do I get from a Lesson Debrief?',
        a: 'A private report with six tabs, built around how you taught the content. Summary is the 60-second read: one thing to try next lesson, what the lesson covered, an idea for taking the content further, how the lesson moved, and its numbers (Teacher Talk, Student Talk, Group Talk, Silence, pace, questions and checks for understanding). Content Specialist reads how you taught the content the way a specialist in your subject would: what worked and why, where it could go further, and where students usually get stuck in this topic. Insights has the detail in four sections (Talk & Participation, Questioning & Checking, Clarity & Content, and Climate & Routines), always shown in your own words, with the time you said them. Rubric lens, Reflect, and My Growth cover the rest.',
      },
      {
        q: 'What does Content Specialist look at, and does it check whether my content is right?',
        a: 'It reads how you taught the content: your explanations, examples, models and vocabulary, the order you put ideas in, and what the next layer of depth would be. Every note points to a moment you actually said, with its time, and you always get both what worked and where it could go further. It then lists where students usually get stuck in the topic; that part is subject knowledge, not a claim about your class. It does not grade your accuracy: it works from a transcript, so anything that may need a second look is put as a gentle check, never a correction. It recognises math, ELA, science, social studies and the arts; a world-language class taught in the target language is not yet recognised.',
      },
      {
        q: 'What if the recording only caught part of the lesson?',
        a: 'The report says so at the top (how much of the recording came through as audible speech) and its numbers come only from that part. Anything it could not measure shows as unavailable rather than as a zero.',
      },
      {
        q: 'Does the Rubric lens rate my lesson?',
        a: 'No. On request, it sorts what your recording captured under the Danielson rubric’s classroom domains and gives one next step for each component. It never assigns a level or a score.',
      },
      {
        q: 'What is the Hard Look?',
        a: 'An optional second reading of a Lesson Debrief that says the least generous thing the evidence can support, with the moments it is based on, for the whole lesson, from the Rubric lens tab. You ask for it; it never appears on its own. Where the recording cannot carry a criticism it says so, and it is left out of the PDF, so it stays between you and Coach.',
      },
      {
        q: 'Can I save or share a Lesson Debrief?',
        a: 'Yes. On the Summary, choose Save the full report as a PDF. You get the Summary, Content Specialist, and all four Insights sections, each on its own page, with every list opened up. The Hard Look is never included. The PDF is yours to keep or pass on; nothing is shared unless you send it.',
      },
    ],
  },
  {
    id: 'access',
    label: 'Access for schools',
    tint: 'bg-peach-tint text-terracotta',
    items: [
      // Invite-only since 2026-11-04: no prices, and only a school asks for
      // access. A teacher's way in is their school's code.
      {
        q: 'What does Wivoza cost?',
        a: 'Teachers don\'t buy Wivoza. Access is set up with each school directly, so there is nothing to pay or upgrade on your own. A school leader can ask about access at hello@wivoza.com.',
      },
      {
        q: 'How do I get access?',
        a: 'Wivoza is invite-only right now. Your school gives you a school code, and you enter it when you sign up. If you don\'t have one, ask your school leader.',
      },
      {
        q: 'Can our school start with a few teachers?',
        a: 'Yes. A school can start with a handful of teachers and add more later. Everyone joins with the same school code, and no teacher is signed up without choosing to be.',
      },
      {
        q: 'What if I switch schools?',
        a: 'Your account and everything in it belongs to you; it isn\'t tied to a specific school. If you move to another school that uses Wivoza, enter its code in Profile & Settings.',
      },
    ],
  },
  {
    id: 'research',
    label: 'Research',
    tint: 'bg-lavender-tint text-[#6B5FA0]',
    items: [
      {
        q: 'Why coach after every lesson? Is that backed by research?',
        a: (
          <>
            Yes. Across 60 rigorous studies, coaching improved both teaching practice and student achievement on
            average (Kraft, Blazar &amp; Hogan, 2018). But regular, individual feedback takes time and people most
            schools don&rsquo;t have, and as coaching programs grew larger their effects shrank. Wivoza is built to
            close that gap: feedback on a real lesson, for every teacher, whenever they have ten minutes. The{' '}
            <Link to="/research" className={LINK}>research page</Link> lists the studies behind each tool, with
            their setting, scope and source.
          </>
        ),
      },
    ],
  },
  {
    id: 'privacy',
    label: 'Privacy, data & evaluation',
    tint: 'bg-mint-tint text-forest',
    items: [
      {
        q: 'Who can see my Lesson Debrief reports?',
        a: 'Only you. Your recordings, transcripts, reports, answers and ratings are yours. School and platform admins see only school-wide trends, like how many teachers are using Wivoza or how often clear directions or questions beyond recall come up across recorded lessons. No number is tied to a teacher, and every admin view says this plainly on screen.',
      },
      {
        q: 'Will Wivoza be used to evaluate me?',
        a: 'No. Only you can see your reports. Wivoza is a private self-coaching companion, not an evaluation tool: Coach never gives you a grade, score or rating, and it is built to avoid language that works like one. Using it to judge teachers would go against the reason it exists.',
      },
      {
        q: 'Is Wivoza FERPA and COPPA compliant?',
        a: 'Wivoza is built for FERPA and COPPA. We sign your school\'s student data privacy agreement before any classroom is recorded. Audio is deleted after transcription, student names are masked in transcripts, nothing is used to train AI, and nothing is sold.',
      },
      {
        q: 'My school shared a focus. Does my admin know whether I turned it on?',
        a: 'No. A school can share up to two coaching priorities, like academic discussion. Whether Wivoza brings one into your coaching is your choice alone: it is off until you turn it on, you can pause or turn it off any time in Profile & Settings, and your admin never sees who turned it on, paused it, or said no. When it is on, Wivoza only offers an idea when it fits what you are working on, and labels it "Connected to your selected school focus".',
      },
      {
        q: 'I have concerns about AI. How is my data used?',
        a: (
          <>
            Your data is used only to give you your own coaching. Transcription (Deepgram) and coaching
            (Anthropic&rsquo;s Claude) both run under terms that keep your content out of model training, and every
            request we send to Deepgram opts out of its model-improvement program. We don&rsquo;t sell personal
            information or use it for advertising. AI is the tool that makes private feedback possible after every
            lesson, not a way to watch teachers. The{' '}
            <a href="/terms" className={LINK}>Privacy Notice</a> has the full detail.
          </>
        ),
      },
      {
        q: 'Does Wivoza keep my voice or video?',
        a: 'No audio is kept. Talk It Through transcribes your voice as you speak and never stores it. Lesson Debrief deletes a recording once it has been transcribed: on our server it is a temporary file removed as soon as transcription finishes, and an iPhone keeps its own copy only until the transcript is ready (never more than 7 days), so a dropped connection does not lose the lesson. Only the resulting text and metrics remain. Wivoza never records video. A camera is used only if you choose to photograph a worksheet or lesson materials, and that photo is read for its text and not stored.',
      },
      {
        q: 'Are student names or identifying details stored?',
        a: 'Coach is built to keep them out of its feedback. It refers to people by role ("a student," "the class") even if you type a real name yourself, and it avoids quoting anything that could indirectly identify a specific student. A lesson transcript is different: it is a record of what was said, so if a student\'s name is said aloud, it appears in the text. It stays in your private account, and you can delete any lesson at any time or have transcripts delete themselves after 7, 30 or 90 days.',
      },
      {
        q: 'What happens to a presentation or document I upload?',
        a: 'The file itself is not stored. It is read in memory to pull out its text (and, if you choose to keep them, its pictures) and then discarded. The text is kept with that work like anything else you submit. When you attach your original file so your own pictures are carried into a new deck or document, those pictures are used only for that request and go straight into the file you download.',
      },
      {
        q: 'Where do the pictures Wivoza adds come from?',
        a: 'When a slide needs a picture you didn\'t supply, Wivoza searches Wikimedia Commons using a few words about the slide\'s topic, never your name, your file, or student details. It uses only public-domain and Creative Commons pictures, shows the credit line on the slide, and skips anything that isn\'t classroom-safe. If nothing fits well, it leaves a marked spot instead of a random photo.',
      },
      {
        q: 'What is "Coach\'s memory," and can I turn it off?',
        a: 'A short, running note Coach keeps about your recurring strengths and any ongoing challenges, built only from your real Talk It Through conversations and Lesson Debrief reflections, never from Practice rehearsals. It\'s on by default, but you can view it, turn it off, or clear it anytime from Profile & Settings.',
      },
      {
        q: 'What happens to what I send Coach on Telegram?',
        a: 'The text of the conversation is saved in your account like any Talk It Through conversation, and you can delete it the same way. A voice note is transcribed and a photo is read, and neither file is kept. An email you forward is saved with the draft reply it produced. Messages reach Wivoza through Telegram, which handles them under its own privacy policy, and you can disconnect the chat at any time.',
      },
      {
        q: 'Can I delete my data?',
        a: 'Yes. Profile & Settings has a "Reset & clear data" option that permanently removes your saved scenarios, answers, messages, and Lesson Debrief sessions.',
      },
    ],
  },
  {
    id: 'classroom',
    label: 'In the classroom & support',
    tint: 'bg-gold-tint text-terracotta-600',
    items: [
      {
        q: 'Am I allowed to record audio of my lessons?',
        a: (
          <>
            Yes, for your own growth. Check your school&rsquo;s recording policy first, and follow it if there is
            one. Wivoza keeps no audio, the transcript stays in your private
            account, and students are not identified: voices are only ever &ldquo;teacher&rdquo; or
            &ldquo;student&rdquo;. If your principal asks,{' '}
            <Link to="/classroom-recording" className={LINK}>this page</Link> answers what they usually want to know,
            with a ready-made note for families and a line a school can add to its start-of-year form.
          </>
        ),
      },
      {
        q: 'Do I need to tell my students?',
        a: (
          <>
            We encourage it, and once is enough, not every lesson. Students usually take it well: it shows them
            you&rsquo;re working on your teaching, the same way you ask them to work on their learning. There are no
            student accounts and nothing students have to do.
            <span className="mt-3 block">Here&rsquo;s an example of what you might say:</span>
            <span className="mt-2 block border-l-4 border-gold pl-4 italic">
              &ldquo;This year I&rsquo;m going to record some of my lessons. It&rsquo;s not about you, it&rsquo;s
              about me: it helps me see how clearly I explain things and whether I&rsquo;m leaving enough room for
              your ideas. It&rsquo;s just for me, and the recording is deleted once it&rsquo;s been read. Can I get a
              volunteer to remind me to press record?&rdquo;
            </span>
            <span className="mt-3 block">
              Some teachers also share the &ldquo;one thing to try&rdquo; from the last lesson&rsquo;s report with
              the class, so students can help with it.
            </span>
          </>
        ),
      },
      {
        q: 'Will Coach follow up with me?',
        a: 'A few days after a Talk It Through conversation, Coach checks in once on the next step you chose. It is one check-in at a time, and you can skip it or turn check-ins off.',
      },
      {
        q: 'How long does it take to get started?',
        a: 'A few minutes: sign up with your school code, walk through a short six-step welcome (skippable at any point), and you\'re on your dashboard.',
      },
      {
        q: 'How can I get help using Wivoza?',
        a: (
          <>
            Ask the help chat in the corner of this page, email{' '}
            <a href="mailto:support@wivoza.com" className={LINK}>support@wivoza.com</a>, or read the{' '}
            <Link to="/guide" className={LINK}>full feature guide</Link>, which covers every tool, field, and button.
          </>
        ),
      },
    ],
  },
]

function FaqItem({ q, a }: QA) {
  return (
    <details className="group rounded-2xl border border-hairline bg-cream-card p-5 transition-colors open:border-gold/60 open:bg-gold-tint/30">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-heading text-base font-bold text-forest marker:content-none [&::-webkit-details-marker]:hidden">
        <span>{q}</span>
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold text-lg font-bold leading-none text-forest transition-transform duration-200 group-open:rotate-45 group-open:bg-terracotta group-open:text-cream">
          +
        </span>
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">{a}</p>
    </details>
  )
}

export default function Faq() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="border-b border-hairline bg-cream-card">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo/wivoza-lockup-light.png" alt="Wivoza" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-5">
            <Link to="/research" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">
              Research
            </Link>
            <Link to="/guide" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">
              Guide
            </Link>
            <Link
              to="/#get-started"
              className="flex items-center gap-1.5 rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
            >
              Sign up
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
          Frequently asked questions
        </span>
        <h1 className="mt-6 font-heading text-4xl font-extrabold leading-[1.1] tracking-tight text-cream sm:text-5xl">
          Good questions<span className="text-gold">.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-cream/70">
          The things teachers and school leaders actually ask before trying Wivoza — on privacy, evaluation,
          and how it works.
        </p>
        </div>
      </section>

      {/* Quick nav */}
      <nav className="border-y border-hairline bg-cream-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap justify-center gap-2 px-6 py-4">
          {CATEGORIES.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              className="rounded-full border border-hairline bg-cream px-3.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
            >
              {c.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        {CATEGORIES.map((category, i) => (
          <section key={category.id} id={category.id} className="scroll-mt-20 pb-14">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl font-heading text-base font-bold ${
                  ['bg-gold text-forest', 'bg-terracotta text-cream', 'bg-forest text-gold'][i % 3]
                }`}
              >
                {i + 1}
              </span>
              <h2 className="font-heading text-2xl font-extrabold text-forest">{category.label}</h2>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              {category.items.map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </section>
        ))}

        <div className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-7 text-center">
          <p className="font-heading text-lg font-bold text-forest">Still have a question?</p>
          <p className="mt-1.5 text-sm text-ink-soft">
            Take a look at the <Link to="/guide" className="font-semibold text-terracotta-600 hover:underline">full feature guide</Link>, or reach out through the app once you're signed in.
          </p>
        </div>
      </div>

      {/* Closing CTA */}
      <section className="bg-forest py-20">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 text-center">
          <img src="/logo/wivoza-lockup-dark.png" alt="Wivoza" className="h-12 w-auto" />
          <h2 className="font-heading text-3xl font-extrabold leading-tight text-cream sm:text-4xl">
            Ready to try it yourself?
          </h2>
          <p className="max-w-md text-cream/70">Have a school code? Private by design.</p>
          <Link
            to="/#get-started"
            className="flex items-center gap-2 rounded-full bg-terracotta px-6 py-3.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
          >
            Sign up
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
            <Link to="/classroom-recording" className="hover:text-ink">
              Recording in class
            </Link>
            <Link to="/research" className="hover:text-ink">
              Research
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
