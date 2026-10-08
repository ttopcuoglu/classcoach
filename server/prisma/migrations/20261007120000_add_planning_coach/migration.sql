-- Planning Coach. Build a Lesson now produces either a complete lesson draft
-- or a short list of teaching ideas, so the five fixed template slots
-- (doNow/agenda/closure/hots/homework) are no longer the only shape a
-- generated plan can take. Those columns stay exactly as they are: every
-- sample plan a teacher has already saved still reads from them.
--
-- The new columns are all nullable. A plan generated before today has
-- planKind NULL and renders from the old fields; a plan generated after it
-- has planKind set and renders from these.
ALTER TABLE "LessonPlan" ADD COLUMN "planKind" TEXT;
ALTER TABLE "LessonPlan" ADD COLUMN "durationMinutes" INTEGER;
ALTER TABLE "LessonPlan" ADD COLUMN "additionalContext" TEXT;
ALTER TABLE "LessonPlan" ADD COLUMN "sourceMaterial" TEXT;
ALTER TABLE "LessonPlan" ADD COLUMN "approach" TEXT;
ALTER TABLE "LessonPlan" ADD COLUMN "successCriteria" TEXT;
ALTER TABLE "LessonPlan" ADD COLUMN "materials" TEXT;
ALTER TABLE "LessonPlan" ADD COLUMN "sequence" JSONB;
ALTER TABLE "LessonPlan" ADD COLUMN "checks" JSONB;
ALTER TABLE "LessonPlan" ADD COLUMN "misconceptions" JSONB;
ALTER TABLE "LessonPlan" ADD COLUMN "exitTicket" JSONB;
ALTER TABLE "LessonPlan" ADD COLUMN "quickIdeas" JSONB;

-- An adaptation is drafted, reviewed, and only then applied — and applying it
-- pushes the version it replaced onto versionHistory, so the original draft
-- survives every adaptation a teacher runs.
ALTER TABLE "LessonPlan" ADD COLUMN "pendingAdaptation" JSONB;
ALTER TABLE "LessonPlan" ADD COLUMN "versionHistory" JSONB;
