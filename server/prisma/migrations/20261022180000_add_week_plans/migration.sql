-- Plan a Week: the week on a planKind "week" lesson plan, and on a lesson
-- opened from one of its days, the week it came from. Both nullable.
ALTER TABLE "LessonPlan" ADD COLUMN "week" JSONB;
ALTER TABLE "LessonPlan" ADD COLUMN "weekPlanId" TEXT;
