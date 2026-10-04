import {
  CheckIcon,
  ClockIcon,
  QuoteIcon,
  ScenarioIcon,
  SparkleIcon,
  TargetIcon,
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

// Teacher's guide to Practice. Layout and section order come from
// components/featureGuide.tsx; everything below is content only.
//
// Practice used to be the second tab of "Ask & Practice", behind a toggle, and
// this guide is written for what it is now: a surface of its own, four rows,
// one scenario at a time.

const WHY = [
  {
    title: 'The first thirty seconds decide it',
    body: 'Most hard moments are settled by what you say first. That is the part you never get to plan.',
  },
  {
    title: 'Knowing is not doing',
    body: 'You can know exactly what good de-escalation looks like and still freeze. The gap is practice, not knowledge.',
  },
  {
    title: 'Low stakes, on purpose',
    body: 'Nobody is in the room. You can get it wrong, see why, and go again.',
  },
  {
    title: 'Your content, not a generic classroom',
    body: 'A Teaching and Learning scenario is about what you are teaching this week, named specifically.',
  },
]

const ROWS = [
  {
    n: '1',
    title: 'Topic',
    body: 'The same seven topics you see in Talk It Through. Teaching and Learning, Classroom Management, a student you are worried about, Parent Communication, Professionalism, Me and this job, or Something else.',
  },
  {
    n: '2',
    title: 'Kind',
    body: 'What kind of moment, within that topic — and it changes with the topic above. Under Classroom Management you get engagement, behaviour in the moment, routines, phones, group work breaking down. Under Parent Communication you get hard news, angry or accusatory, a grade dispute, attendance, setting a boundary.',
  },
  {
    n: '3',
    title: 'Your class',
    body: 'One line, from your profile — grades, subject, level, who is in the room. Teaching and Learning also asks what you are teaching right now, because that is what its scenarios are actually about.',
  },
  {
    n: '4',
    title: 'Difficulty',
    body: 'Beginner, Intermediate or Advanced. The question is worded carefully: this is the scenario’s difficulty, not yours.',
  },
]

const FEEDBACK = [
  { title: 'What your move did', body: 'The effect it would actually have — in the room, on the page, or on the person reading it.' },
  { title: 'What it left on the table', body: 'One thing. Not a list of five, and never a scolding.' },
  { title: 'One line worth keeping', body: 'A single sentence in your own voice that you could carry into the real version.' },
]

function ScenarioSample() {
  return (
    <GuideSample
      title="A scenario, and what comes back"
      caption="Illustrative. Your scenarios are written for the class and topic you set, and are never shown to anyone else."
    >
      <div className="rounded-xl bg-forest p-4 text-cream">
        <span className="rounded-full bg-cream/10 px-3 py-1 text-xs font-semibold text-cream">
          A misconception in the room · Grades 9&ndash;12 · Biology · Honors · Intermediate
        </span>
        <p className="mt-3 text-sm leading-relaxed">
          You have just finished the light-dependent reactions for the second time this week. A student says,
          &ldquo;So the plant eats the sunlight, right? That&rsquo;s its food.&rdquo; Four other students nod.
          There are eleven minutes left.
        </p>
      </div>

      <div className="rounded-xl bg-cream-card p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
          How would you handle this?
        </p>
        <p className="mt-1.5 text-sm italic text-ink-soft">
          &ldquo;I&rsquo;d ask her to say more about what she means by food, and get the rest of them to vote on
          it.&rdquo;
        </p>
      </div>

      <div className="rounded-xl bg-mint-tint/50 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-forest">What your move did</p>
        <p className="mt-1.5 text-sm text-ink">
          It put the thinking back on her instead of correcting her, and the vote tells you how widely the idea is
          held &mdash; which you did not know before.
        </p>
      </div>

      <div className="rounded-xl bg-peach-tint/50 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
          What it left on the table
        </p>
        <p className="mt-1.5 text-sm text-ink">
          Nothing yet separates &ldquo;food&rdquo; from &ldquo;energy&rdquo;, which is the actual confusion. One
          concrete question about mass &mdash; where the plant&rsquo;s weight comes from &mdash; would surface it.
        </p>
      </div>

      <div className="rounded-xl bg-gold-tint/60 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
          One line worth keeping
        </p>
        <p className="mt-1.5 text-sm text-ink">
          &ldquo;Hold that thought &mdash; if sunlight is the food, where does the wood in a tree come from?&rdquo;
        </p>
      </div>
    </GuideSample>
  )
}

export default function GuidePractice() {
  return (
    <GuideShell appTo="/practice">
      <GuideHero
        icon={ScenarioIcon}
        title="Practice"
        paragraphs={[
          'Rehearse the move before you have to make it. Practice hands you one realistic moment at a time — a misconception, a parent email, a co-teacher who undercut you — and asks what you would do.',
          'You write your answer, you get three short pieces of coaching, and then you can run the same situation one notch harder. Nothing here is scored to your face and nothing is shown to anyone else.',
        ]}
      />

      <GuidePathway />

      <div className="mx-auto w-full max-w-4xl px-6">
        <GuideSection
          id="why-it-helps"
          eyebrow="Why it helps"
          title="You already know what to do. Practice is for doing it."
          lede="The distance between knowing a good response and producing one at 10:15 on a Tuesday is not knowledge. It is reps."
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
              Nobody is watching
            </p>
            <p className="mt-2 text-sm text-ink">
              Practice attempts are never scored to your face and never shown to anyone. Wivoza keeps a private
              rating on each one, used only to steer which scenarios you are offered next &mdash; weighted toward
              what you have practised least. You never see it as a number, and neither does anyone else.
            </p>
          </div>
        </GuideSection>

        <GuideSection
          id="how-it-works"
          eyebrow="How it works"
          title="Four rows, then one scenario"
          lede="Each row narrows the one below it, so you are never shown a choice that cannot apply."
        >
          <div className="mt-8 flex flex-col gap-3">
            {ROWS.map(({ n, title, body }) => (
              <div key={n} className="flex items-start gap-4 rounded-2xl border border-hairline bg-cream-card p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-forest font-heading text-base font-bold text-gold">
                  {n}
                </span>
                <div>
                  <p className="font-heading text-base font-bold text-forest">{title}</p>
                  <p className="mt-1 text-sm text-ink-soft">{body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl bg-cream-card p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-mint-tint text-forest">
                <SparkleIcon className="h-4 w-4" />
              </span>
              <p className="font-heading text-base font-bold text-forest">Or describe your own</p>
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              Every topic offers &ldquo;Describe my own&rdquo;. If you already have the situation in your head,
              type it and rehearse that instead &mdash; your words, not an approximation of them. You can also
              arrive here straight from a conversation: when Talk It Through offers &ldquo;want to rehearse
              it?&rdquo;, what you said out loud lands in that box, ready to edit.
            </p>
          </div>

          <div className="mt-8">
            <p className="font-heading text-xl font-bold text-forest">Then three pieces of coaching</p>
            <p className="mt-1.5 text-sm text-ink-soft">
              Not a grade, and not a model answer to compare yourself against unfavourably. Three short things, in
              this order.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {FEEDBACK.map(({ title, body }, i) => (
                <div key={title} className="rounded-2xl bg-cream-card p-5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-forest font-heading text-sm font-bold text-gold">
                    {i + 1}
                  </span>
                  <p className="mt-3 font-heading text-base font-bold text-forest">{title}</p>
                  <p className="mt-1 text-sm text-ink-soft">{body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-hairline bg-cream-card p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-peach-tint text-terracotta-600">
                <ClockIcon className="h-4 w-4" />
              </span>
              <p className="font-heading text-base font-bold text-forest">Then one notch harder</p>
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              After the coaching, Practice offers the same situation at the next difficulty up. Same topic, same
              class, more pressure. Advanced is the ceiling &mdash; it does not loop back around.
            </p>
          </div>
        </GuideSection>

        <GuideSection
          id="teacher-story"
          eyebrow="Teacher story"
          title="Eleven minutes left and a sentence you have heard before"
        >
          <div className="mt-8 flex flex-col gap-5">
            <div className="rounded-2xl border-l-8 border-terracotta bg-peach-tint/40 p-6">
              <QuoteIcon className="h-5 w-5 text-terracotta-600" />
              <p className="mt-3 text-base leading-relaxed text-ink">
                Marcus teaches four sections of Biology. He has explained photosynthesis for nine years and he
                still loses a quarter of the room to the same confusion every spring.
              </p>
            </div>

            <div className="rounded-2xl bg-cream-card p-6">
              <p className="text-sm leading-relaxed text-ink">
                On a Sunday he sets Teaching and Learning, picks &ldquo;a misconception in the room&rdquo;, and
                types <span className="font-semibold">photosynthesis</span> into what he is teaching now. The
                scenario that comes back is not about questioning technique in the abstract &mdash; it is a
                student saying the plant eats sunlight, with eleven minutes left on the clock.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink">
                He writes what he would say. The coaching tells him his move was good and names the thing it
                missed: nothing in it separates food from energy. The line worth keeping is a question about where
                the wood in a tree comes from.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink">
                He runs it again at Advanced. This time the student is half right and says so confidently, and two
                others have already written the wrong thing down. He gets that one wrong. Better on a Sunday.
              </p>
            </div>

            <div className="rounded-2xl border border-hairline bg-cream-card p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">On Tuesday</p>
              <p className="mt-2 text-sm text-ink">
                A student says the plant eats the sunlight. Marcus asks where the wood comes from. It is not a
                trick he read about &mdash; it is a sentence he has already said once.
              </p>
            </div>
          </div>
        </GuideSection>

        <GuideSection
          id="try-it"
          eyebrow="Try it"
          title="One scenario is about four minutes"
          lede="Set the topic, read the situation, write what you would actually say. Not what you think the right answer is."
        >
          <div className="mt-8">
            <ScenarioSample />
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-cream-card p-5">
              <p className="font-heading text-base font-bold text-forest">Stuck on the blank box?</p>
              <p className="mt-1.5 text-sm text-ink-soft">
                &ldquo;Not sure where to start?&rdquo; gives you a question, never an answer. Recognising a good
                response and producing one are different skills, and only the second one happens in a real
                classroom.
              </p>
            </div>
            <div className="rounded-2xl bg-cream-card p-5">
              <p className="font-heading text-base font-bold text-forest">Say it instead of typing it</p>
              <p className="mt-1.5 text-sm text-ink-soft">
                &ldquo;Speak your response&rdquo; is there because what you would actually say out loud is rarely
                what you would write. Closer to the real thing, and faster.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <GuidePrimaryButton to="/practice">Try a scenario</GuidePrimaryButton>
            <span className="text-sm text-ink-soft">Free, and unlimited.</span>
          </div>
        </GuideSection>

        <GuideSection
          id="debrief"
          eyebrow="Debrief"
          title="What Practice cannot do"
          lede="Worth saying plainly, because the thing that makes rehearsal useful is also its limit."
        >
          <div className="mt-8 flex flex-col gap-4">
            <div className="rounded-2xl border border-hairline bg-cream-card p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-peach-tint text-terracotta-600">
                  <WarningIcon className="h-4 w-4" />
                </span>
                <p className="font-heading text-base font-bold text-forest">A scenario is not your student</p>
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                It is written from a topic, a kind and a class &mdash; not from anyone you teach. It does not know
                what happened last week or which student is having a hard year. Where your judgement and a
                scenario disagree, trust your judgement.
              </p>
            </div>

            <div className="rounded-2xl border border-hairline bg-cream-card p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gold-tint text-terracotta-600">
                  <TargetIcon className="h-4 w-4" />
                </span>
                <p className="font-heading text-base font-bold text-forest">Some things need a person</p>
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                Practice will not rehearse anything that belongs with a counsellor, an administrator, HR or a union
                representative. If you pick a student you are worried about, the coaching stays on what you have
                observed and who to tell &mdash; it will not speculate about a diagnosis or a home.
              </p>
            </div>

            <div className="rounded-2xl bg-mint-tint/50 p-5">
              <p className="font-heading text-base font-bold text-forest">After a rep, it keeps going</p>
              <p className="mt-2 text-sm text-ink">
                Every attempt lands in My Work, filterable by surface and topic. Mark one as tried in class, come
                back and say what happened, and the reflection sits with the attempt &mdash; which is the part that
                turns a rehearsal into a change.
              </p>
            </div>
          </div>
        </GuideSection>
      </div>

      <GuideClosing
        icon={ScenarioIcon}
        title="Get the rep in before it counts"
        body="One scenario, four minutes, nobody watching. The next time it happens for real, it will not be the first time."
        ctaTo="/practice"
        ctaLabel="Open Practice"
      />
    </GuideShell>
  )
}
