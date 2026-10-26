# Checks for understanding: what the recordings can actually support

Status: **recommendation is to NOT build the metric as scoped.** Written
2026-10-22. Supersedes the first draft of this file, which proposed a `check:`
flag on questions; that draft was written against corpus numbers that turned
out to be seeded data.

## What prompted this

A teacher's last lesson reported **1 check for understanding** against 11
higher-order questions. The 1 was "Does anyone have any questions so far about
what is going on?" — the weakest kind of check there is, since the students who
don't understand are the ones who can't say so.

Two causes were found. One is a real bug with a verified fix. The other turned
out not to be fixable the way it first appeared.

## Finding 1: a parser bug (fix verified, ship it)

`extractTag` used a non-global `text.match()`, so it returned only the **first**
`<tag>` block. When a model answers a list prompt by repeating the tag per item
— which it does on some transcripts — everything after the first block is
silently dropped.

On the Oct 22 lesson the model returned 30 moments and the parser kept 9. Every
category came back holding exactly one item.

The fix joins all blocks with that name. On that lesson: 9 moments → 30,
1 question → 12. All 14 `teachingMoves` unit tests pass. It affects 3 of 103
analyzed lessons, all of them genuine classroom recordings:
Oct 22, Oct 20 and Oct 8, all `ttopcuoglu@`.

`extractTag` is shared by ten reads — Hard Look, Rubric Lens, routines, lesson
arc, checks loop, export models, coach stream, repeated redirections — so all
of them stop losing repeated blocks too.

**This is independent of everything below. Ship it first.** Any measurement of
check behaviour taken through the old parser is measured through data loss.

## Finding 2: the check count is low because the prompt contradicts itself

`classroomMoves.ts` says, eight lines apart:

> line 80: "A probing question can be BOTH a question and a check — list it in
> both places when it is."

> line 88: "A moment belongs to ONE kind. If it could be two, choose the one it
> most plainly is."

The model obeys line 88, so every probing question is filed under
`<questions_higher_order>` and `<checks>` keeps only the moments explicit enough
that nothing else could claim them — the rituals and the vague "any questions?".

The dedupe is not the blocker: `checks` and the question tags use separate
`onceWithin` groups, so the same sentence in both tags would survive today.
Only the prompt stops it.

**This contradiction should be resolved regardless of what else is decided.**
It is a straight defect: the prompt gives two incompatible instructions.

## Why the obvious fix was abandoned

The first draft proposed narrowing `<checks>` to **whole-class moves** — a move
where every student produces something at once (thumbs, hands, whiteboards,
turn-and-talk, exit tickets) — and tagging questions separately. Conceptually
that is still the right distinction: it is the only measure of how many students
a teacher actually heard from, and an explain question samples whoever answers,
usually one confident student.

It does not survive contact with the recordings.

| | lessons | questions | higher-order | whole-class checks |
| --- | ---: | ---: | ---: | ---: |
| Seeded (`demo.*`, `*.mapleridge.example`, `*.example.com`) | 84 | 1061 | 430 | ~127 |
| **Genuine classroom recordings** | **20** | **162** | **49** | **2** |

Across every real recording in the database there are **two** whole-class
checks:

> "Raise your hand if you selected it." — `ttopcuoglu`
> "So let's do this right now, folks. Do me a favor. Raise your hand if you have four or more" — `tarkantopcuoglu`

The ~127 ritual checks that made the metric look viable are almost entirely
seeded fixtures, written by us, in the stock phrasing we invented.

A widened phrase list does not rescue it. Scanning 4,328 teacher segments across
60 lessons for the obvious additions:

| phrase | hits |
| --- | ---: |
| `whiteboard` / `white board` | 0 |
| `show me your` | 0 |
| `hold it up` / `hold them up` | 0 |
| `on your board` | 0 |
| `tell your partner` / `turn to your partner` | 0 |
| `stand up if` | 0 |
| `show of hands` | 1 (seeded lesson) |
| `pair share` | 2 (seeded lessons) |

The vocabulary is not there. Either these teachers rarely run whole-class
checks, or a room mic at 13–72% coverage does not catch them. **The recording
cannot tell us which**, which is the whole problem.

## What this rules out

A **counted** whole-class check metric. It would read 0 on essentially every
real lesson, and on 13 of the 20 real lessons coverage is under the 50%
`MIN_SHARE_FOR_ABSENCE_CLAIM` threshold — so the report could not even honestly
say "you did none", only "we did not hear one". A box that is empty and cannot
explain why is worse than no box.

This is the same conclusion reached for "building on student answers"
(`project_uptake_not_ready`): built, dry-run, not shipped, because the
transcripts could not support it.

## What to build instead

**1. Lean on question demand, which is thin but real.** Genuine recordings carry
8.1 questions and 2.5 higher-order questions per lesson. That is a signal that
exists without seeded data, and `recall → explain → justify → compare →
evaluate` already measures it.

**2. Make a whole-class check a named moment, not a metric.** When one occurs,
name it with its quote — the way the escalation card reports a `found` state.
Never a count, never a ratio, never a zero. If none was heard, say nothing,
because on most of these recordings "none heard" is a fact about the microphone.

**3. Resolve the prompt contradiction** by deleting the "list it in both places"
sentence and leaving rule 88 to stand. With checks no longer competing for
probing questions, `<checks>` means only the explicit moves, which is what it
already contains in practice.

**4. Delete `checkKinds.ts`.** It is a second model call grading checks
`general | explain | evidence | whole_class | uncertainty | not_a_check`. It is
called only from `backfillCheckKinds.ts`, never from the live pipeline, and has
never been run: `kind` is unset on all 103 lessons. Deleting it removes a model
call and the duplicate "Explain" label that started this investigation.

**5. Rename the section.** "Checks for understanding" claims more than the
measure delivers. It reports moments the teacher asked the room something
explicit. Name it that.

## What would change this decision

Re-run the numbers if any of these becomes true:

- Real recordings reach 50%+ coverage routinely (today 13 of 20 are below it).
- Speaker separation improves enough to tell a whole-class response from one
  student's — which is also the gate on `project_uptake_not_ready`.
- Real whole-class checks appear at more than a handful per corpus, meaning the
  teachers are doing them and we are simply failing to hear them.

Until then, every number in this area must be read against the seeded/real split
above. **Corpus-wide figures in this database are dominated 4:1 by fixtures we
wrote**, and any metric validated against them will look far healthier than it
is.

## Order of work

1. Ship the `extractTag` fix (verified, uncommitted in the working tree).
2. Re-run the reads on the 3 affected lessons and confirm the recovered moments.
3. Delete the contradictory prompt sentence; delete `checkKinds.ts` and its
   backfill.
4. Rename the section and drop the count in favour of named moments.
