-- Class context moves off every screen and into the teacher's profile.
--
-- Ask, Practice, Lesson Planning, Assignment Coach and Lesson Debrief each
-- asked for the same room (grade band, subject, course, level, who is in the
-- room) in their own words, into their own columns. A teacher answered the
-- same questions in five places and no screen could learn from another. This
-- table is the one answer, surfaced everywhere as a single editable line.
--
-- It is a list, not a single row per teacher: most teachers have two or three
-- preps, and one stored room made the app wrong for all but one of them.
--
-- Nothing is dropped. The per-feature columns (LessonPlan.subject,
-- AudioSession.classSubject, Debrief.gradeBand and the rest) stay exactly as
-- they are — they record what a given piece of work was actually about, which
-- is history and must not change when a teacher later edits their profile.
-- User.gradeLevels and User.subjects also stay: the admin dashboards read
-- them, and so does the iOS app.
--
-- DDL only, deliberately. The seed-by-inference that fills this table for
-- existing teachers lives in the application layer
-- (server/src/lib/classProfile.ts, inferClassProfile), not in this file, for
-- three reasons: it reads the teacher's plans, assignments and recordings as
-- well as their profile text, which is a join this file has no business
-- doing; it shares one implementation with the inference every later signup
-- needs, rather than having a SQL copy drift from a TypeScript one; and it is
-- unit-tested, which a hand-translated POSIX regex standing in for
-- bandFromProfile's \b word boundaries could not be without a Postgres to run
-- it against. Inference happens the first time a teacher's prep list is read.

-- CreateTable
CREATE TABLE "ClassProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "gradeBand" TEXT NOT NULL,
    "subject" TEXT,
    "course" TEXT,
    "courseLevel" TEXT,
    "classMakeup" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'teacher',
    "confirmedAt" TIMESTAMP(3),
    "schoolYear" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassProfile_userId_idx" ON "ClassProfile"("userId");

-- AddForeignKey
ALTER TABLE "ClassProfile" ADD CONSTRAINT "ClassProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
