import {
  BookIcon,
  CheckIcon,
  ClockIcon,
  QuoteIcon,
  RobotIcon,
  SparkleIcon,
  UploadIcon,
  WarningIcon,
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

// Teacher's guide to Look It Over. Layout and section order come from
// components/featureGuide.tsx; everything below is content only.
//
// This one guide replaced three — Lesson Planning, Assignment Coach and
// Communication Coach each had their own, because each was a separate tool.
// They were one act performed on four file types, and the guide reads better
// as one too.

const WHY = [
  {
    title: 'The cheapest moment to change something',
    body: 'Before thirty copies are printed, and before anyone has started it.',
  },
  {
    title: 'You cannot see your own blind spot',
    body: 'You know what you meant. A reader only has what is on the page.',
  },
  {
    title: 'One read, not four tools',
    body: 'A quiz, a plan, a deck, an assignment, a message you have drafted — same drop zone.',
  },
  {
    title: 'Changes you can take or leave',
    body: 'Every suggestion is one edit, with a reason, that you accept or decline on its own.',
  },
]

const TYPES = [
  { title: 'Quiz or exam', body: 'What each item measures, reading load, answer choices, standards coverage, whether it fits the period.' },
  { title: 'Homework', body: 'How much of it a chatbot could just do, what it actually asks for, the workload both ways, who can start it unaided.' },
  { title: 'Assignment', body: 'The same, plus where in the task the students do the thinking.' },
  { title: 'Project', body: 'The same again, over a longer arc — milestones, group roles, what gets assessed.' },
  { title: 'Lesson plan', body: 'Timing realism, objective-to-activity fit, where the thinking happens, your checks for understanding, what to cut if it runs long.' },
  { title: 'Presentation', body: 'Slide load, grade-level fit, legibility from the back row, and how to actually run it.' },
  { title: 'Message', body: 'Tone as it will land, what you are asking the reader to do, and observable fact separated from characterisation.' },
]

function ResultSample() {
  return (
    <GuideSample
      title="A lesson plan, read through five lenses"
      caption="Illustrative. Suggested edits always quote your own words — a review can never put a sentence in your document that you did not write."
    >
      <div className="rounded-xl border-l-8 border-gold bg-gold-tint/50 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
          If you change one thing
        </p>
        <p className="mt-1.5 text-sm text-ink">
          The twelve minutes on the paired discussion is where this plan is most likely to come apart &mdash;
          nothing in it says what students produce, so you will not know who was thinking.
        </p>
      </div>

      <div className="rounded-xl bg-cream-card p-4">
        <p className="text-sm font-semibold text-ink">Timing: 34&ndash;46 minutes</p>
        <p className="mt-1 text-xs text-ink-soft">
          Assuming: four minutes of settling, and that the Do Now runs while you take the register.
        </p>
      </div>

      <div className="rounded-xl border border-hairline bg-cream-card p-4">
        <p className="text-sm text-ink-soft line-through decoration-terracotta/50">
          Students will discuss the reading in pairs. (12 min)
        </p>
        <p className="mt-1.5 text-sm font-medium text-ink">
          In pairs, each student names one claim the author makes and one sentence that supports it. (12 min)
        </p>
        <p className="mt-2 text-xs text-ink-soft">
          Names what students produce, so you can tell from the doorway who is thinking.
        </p>
        <div className="mt-3 flex gap-2">
          <span className="rounded-full bg-forest px-3 py-1 text-[11px] font-semibold text-cream">Use this</span>
          <span className="rounded-full bg-cream px-3 py-1 text-[11px] font-semibold text-ink-soft">
            Keep mine
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-terracotta px-4 py-2 text-xs font-semibold text-cream">
          Export with 1 change
        </span>
        <span className="text-xs text-ink-soft">
          Reads &ldquo;Export my original&rdquo; until you accept something.
        </span>
      </div>
    </GuideSample>
  )
}

export default function GuideLookItOver() {
  return (
    <GuideShell appTo="/look-it-over">
      <GuideHero
        icon={BookIcon}
        title="Look It Over"
        paragraphs={[
          'Drop in something you made — a quiz, a lesson plan, a slide deck, an assignment, a message you have drafted — and get a careful read before students or parents see it.',
          'Wivoza works out what it is and asks you to confirm, picks the questions worth asking about that kind of document, and shows you suggested changes as a marked-up diff you take or leave one at a time. It never hands you back a rewritten version of your own work.',
        ]}
      />

      <GuidePathway />

      <div className="mx-auto w-full max-w-4xl px-6">
        <GuideSection
          id="why-it-helps"
          eyebrow="Why it helps"
          title="A second reader, before it goes out"
          lede="Not a grader, and not a rewriter. Someone who reads the page as a student or a parent would, and tells you what they found."
        >
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {WHY.map(({ title, body }) => (
              <div key={title} className="rounded-2xl border border-hairline bg-cream-card p-5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gold-tint text-terracotta-600">
                    <CheckIcon className="h-4 w-4" />
                  </span>
                  <p className="font-heading text-base font-bold text-forest">{title}</p>
                </div>
                <p className="mt-2 text-sm text-ink-soft">{body}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
              It replaced four tools
            </p>
            <p className="mt-2 text-sm text-ink">
              Getting feedback on a plan, reviewing a presentation, reviewing an assignment and getting a second
              read on a message used to be four separate places you had to choose between before you could start.
              They were one act performed on four kinds of file. Now you drop the file.
            </p>
          </div>
        </GuideSection>

        <GuideSection
          id="how-it-works"
          eyebrow="How it works"
          title="Drop it, confirm what it is, choose what to look at"
        >
          <div className="mt-8 flex flex-col gap-3">
            <div className="flex items-start gap-4 rounded-2xl border border-hairline bg-cream-card p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-forest text-gold">
                <UploadIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-heading text-base font-bold text-forest">One drop zone</p>
                <p className="mt-1 text-sm text-ink-soft">
                  A file (.docx, .pdf, .pptx, .xlsx, .txt), a paste, or a photo. The photo is not a workaround
                  &mdash; a paper quiz snapped on your phone is a first-class way in, and it has its own button.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-2xl border border-hairline bg-cream-card p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-forest text-gold">
                <SparkleIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-heading text-base font-bold text-forest">
                  &ldquo;Looks like a quiz &mdash; right?&rdquo;
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  You are asked to confirm, not interrogated. If the guess is wrong, correcting it is one tap from
                  seven chips. Getting it wrong costs you a tap; being asked &ldquo;what is this?&rdquo; before
                  anything happens costs you more.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-2xl border border-hairline bg-cream-card p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-forest text-gold">
                <BookIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-heading text-base font-bold text-forest">Lenses you can turn off</p>
                <p className="mt-1 text-sm text-ink-soft">
                  Each type opens with the questions worth asking about it, and you can toggle any of them. The
                  count is always visible, so you can see how much you have asked for.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-2xl bg-cream-card p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-peach-tint text-terracotta-600">
                <RobotIcon className="h-4 w-4" />
              </span>
              <p className="font-heading text-base font-bold text-forest">
                Why AI-completion risk is off for a quiz
              </p>
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              Because a quiz is sat in the room, under supervision. Asking how much of it a chatbot could do
              answers a question nobody asked and implies a suspicion you do not have. For homework, an assignment
              or a project &mdash; work that leaves with the student &mdash; it is on by default, because there it
              is the first question.
            </p>
          </div>

          <div className="mt-8">
            <p className="font-heading text-xl font-bold text-forest">The seven kinds, and what each one is read for</p>
            <div className="mt-4 flex flex-col gap-2.5">
              {TYPES.map(({ title, body }) => (
                <div key={title} className="rounded-2xl bg-cream-card p-4">
                  <p className="text-sm font-semibold text-forest">{title}</p>
                  <p className="mt-1 text-sm text-ink-soft">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </GuideSection>

        <GuideSection
          id="teacher-story"
          eyebrow="Teacher story"
          title="Twelve minutes on the page, four in the room"
        >
          <div className="mt-8 flex flex-col gap-5">
            <div className="rounded-2xl border-l-8 border-terracotta bg-peach-tint/40 p-6">
              <QuoteIcon className="h-5 w-5 text-terracotta-600" />
              <p className="mt-3 text-base leading-relaxed text-ink">
                Priya writes Monday&rsquo;s plan on Sunday evening and drops it in. The one thing it tells her is
                that the paired discussion does not say what students produce.
              </p>
            </div>

            <div className="rounded-2xl bg-cream-card p-6">
              <p className="text-sm leading-relaxed text-ink">
                She takes that edit &mdash; students each name one claim and one supporting sentence &mdash; and
                declines the other two. The export button changes from &ldquo;Export my original&rdquo; to
                &ldquo;Export with 1 change&rdquo;, which is how she knows what she is downloading.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink">
                On Tuesday she records the lesson. In the debrief she links it to the plan she had read over, and
                the report says: <span className="font-semibold">you planned 34&ndash;46 minutes for this lesson;
                the recording suggests about 22.</span> Underneath, it says that running short might be the right
                call &mdash; a room that has it already does not need the full time.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink">
                It was not the right call. The discussion collapsed in four minutes because she still had not said
                it out loud. But neither screen could have told her that on its own.
              </p>
            </div>
          </div>
        </GuideSection>

        <GuideSection
          id="try-it"
          eyebrow="Try it"
          title="The result leads with one thing"
          lede="Then the lenses you left on, then the suggested edits — each with the original struck through, the revision, and why."
        >
          <div className="mt-8">
            <ResultSample />
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-cream-card p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gold-tint text-terracotta-600">
                  <ClockIcon className="h-4 w-4" />
                </span>
                <p className="font-heading text-base font-bold text-forest">Every estimate shows its working</p>
              </div>
              <p className="mt-1.5 text-sm text-ink-soft">
                A timing claim is always a range with the assumption printed under it. A single number would read
                as a measurement, and it is not one &mdash; it is a guess you are allowed to disagree with.
              </p>
            </div>
            <div className="rounded-2xl bg-cream-card p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-mint-tint text-forest">
                  <RobotIcon className="h-4 w-4" />
                </span>
                <p className="font-heading text-base font-bold text-forest">Redesign for meaningful AI use</p>
              </div>
              <p className="mt-1.5 text-sm text-ink-soft">
                On student work, this is an action from the result rather than a separate tool &mdash; already
                carrying the assignment you just uploaded, so you do not paste it twice.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <GuidePrimaryButton to="/look-it-over">Look something over</GuidePrimaryButton>
            <span className="text-sm text-ink-soft">Three reviews a month on the free plan.</span>
          </div>
        </GuideSection>

        <GuideSection
          id="debrief"
          eyebrow="Debrief"
          title="What a document review cannot see"
          lede="Printed in the footer of every result, because it is the thing most worth remembering about it."
        >
          <div className="mt-8 flex flex-col gap-4">
            <div className="rounded-2xl border-l-8 border-terracotta bg-peach-tint/40 p-6">
              <div className="flex items-center gap-2.5">
                <WarningIcon className="h-5 w-5 shrink-0 text-terracotta-600" />
                <p className="font-heading text-base font-bold text-forest">It read the document only</p>
              </div>
              <p className="mt-2 text-sm text-ink">
                It has not met your students, it does not know how last week went, and it cannot hear what you will
                say out loud while you run it. Where those matter more than the page, trust yourself over this.
              </p>
            </div>

            <div className="rounded-2xl border border-hairline bg-cream-card p-5">
              <p className="font-heading text-base font-bold text-forest">It never rewrites your work</p>
              <p className="mt-2 text-sm text-ink-soft">
                Every suggestion names the exact sentence it would replace, shows what it would become, and says
                why. You accept them one at a time, you can change your mind, and the document you export is your
                original plus whatever you said yes to &mdash; nothing else. A suggestion that quotes a sentence
                not actually in your document is discarded rather than shown.
              </p>
            </div>

            <div className="rounded-2xl bg-mint-tint/50 p-5">
              <p className="font-heading text-base font-bold text-forest">Not sure what to do with a finding?</p>
              <p className="mt-2 text-sm text-ink">
                &ldquo;Talk this through&rdquo; hands the review to Talk It Through, carrying the main suggestion
                with it. Sometimes what you want is not another pass over the same page &mdash; it is a colleague.
              </p>
            </div>
          </div>
        </GuideSection>
      </div>

      <GuideClosing
        icon={BookIcon}
        title="Read it before they do"
        body="Drop in the thing you are least sure about. The worst case is you learn it was fine."
        ctaTo="/look-it-over"
        ctaLabel="Open Look It Over"
      />
    </GuideShell>
  )
}
