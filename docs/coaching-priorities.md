# Coaching Priorities: a school shares a focus, each teacher decides

Status: **phase one live since 2026-10-23 (de40c68).** Spec written
2026-10-21, mock-up made 2026-10-23 (private canvas:
https://claude.ai/artifact/S8y2GKa5eMxFqcXLtt9xhB). Phase one is the admin
screen, the teacher's opt-in (web Home and Profile), Planning Coach's Build a
Lesson and Talk It Through (web, iPhone, Telegram). Lesson Debrief followed
on 2026-10-24 (2d7e5a5): "Find an idea in this lesson", on request, web only.
Not yet: Practice, the iPhone opt-in screens.

**Deploy order.** Migration `20261023210000_add_coaching_priorities` must be
applied to the production database by hand BEFORE the server deploys: it adds
`LessonPlan.schoolFocusIdea`, and the regenerated client reads that column on
every lesson-plan query.

**Tests.** `server/src/routes/schoolPriorities.privacy.test.ts` covers the
privacy requirements below against a throwaway in-memory Postgres. It walks
every admin GET route as a school admin and as Wivoza staff. The dry run
`server/src/scripts/tryCoachingPriorities.ts` makes real model calls and
stores nothing.

## What it is

A school admin describes up to two instructional priorities (for example
Academic Discussions, Contextual Learning). Each teacher decides privately
whether Wivoza brings one into their coaching. It is **off by default**, and the
invitation is shown once. When it is on, the Coach may offer one invitational,
labelled idea ("Connected to your selected school focus") where it fits what the
teacher is already doing: Planning Coach and Talk It Through (including
Telegram) first, Lesson Debrief's "Try next time" list second, Practice last.

Information flows one way: the school's guidance goes into a teacher's
coaching, and nothing about the teacher comes back out.

## Launch requirements: privacy

Every item below must be done and tested before this ships. Missing any one of
them is a reason not to launch, not a follow-up.

1. **Nothing per teacher reaches admins, enforced on the server.** A teacher's
   on/paused/off state, invitation answers and use of suggestions are stored
   where no admin endpoint can read them. An automated test signs in as an
   org admin and proves that every admin API (overview, members, focus areas,
   CSV export, the new priority endpoints) returns no opt-in state, no
   per-teacher suggestion data, and no coaching content. Hiding it in the UI
   does not count.
2. **The label stays off anything that leaves the screen.** "Connected to your
   selected school focus" is never printed on the PDF/printout, the export, or
   anything sent to Canvas or shared, unless the teacher turns that on in
   Settings. Test: a report with a priority-shaped item, exported, carries no
   label.
3. **No uptake numbers that could single anyone out.** By default admins get no
   count of who has a priority on. If an aggregate count is ever added, it
   shows only at 5 or more teachers and never by grade, subject or group. The
   existing staff-wide numbers keep their rule of combining groups under 5.
   Test: a school where 4 teachers opt in shows the admin nothing.
4. **Social pressure is named on both sides.** The admin screen says, in plain
   words, that teachers choose privately and admins should not ask who has it
   on. The teacher screen says the choice is theirs alone and is not shared.
5. **Privacy wording claims only what is enforced.** Copy says "your school's
   administrators can't see…", never "no one can see…", because Wivoza's own
   platform admins (superadmins) can see more. Every privacy sentence is checked
   against the code before launch.
6. **The setting lives in the setting, nowhere else.** The Coach's memory of a
   teacher never records that they opted in, paused or declined. Turning a
   priority off stops it from that moment; past reports and conversations stay
   as they were.

## Launch requirements: coaching

- Before a teacher turns it on, a priority cannot influence anything they see.
  Test: the same plan/report with the priority off is identical to today.
- Admin-written guidance is data, not instructions: length cap, passed to the
  model as quoted material, rejected if it names a teacher or reads as a
  directive ("tell them to stop…"). It can never override the Coach's rules.
- At most one labelled idea per plan, conversation or report, only when it fits
  the teacher's goal or concern, and it may come back empty.
- Invitational language only ("One option here…", "If it fits your goal…").
  Never "your administrator expects", never a score, rating, count or claim
  that the strategy didn't happen. Never in the Summary headline, Rubric Lens,
  The Hard Look, or as a My Growth trend.
- Lesson Debrief ideas start from a timestamped quote of the teacher's own
  words and never claim what students did, thought or understood.
- When an admin edits a published priority they choose "Wording only" (applies
  silently) or "Changed what it means" (it switches off for every teacher until
  they choose again).
- Each priority states where Wivoza can use it. A strategy the recording can't
  hear (student presentations) is planning-only, and the admin is told so.
- New fields are optional in the iPhone app's decoder (a strict decoder broke
  every live app on 2026-10-18).
