-- The focus loop (lib/lessonFocus.ts): the focus picked on a lesson's report
-- for the teacher's next lesson, and the check-in that lesson received from
-- the one before it. Nullable: no lesson has either until a focus is picked.
ALTER TABLE "AudioSession" ADD COLUMN "lessonFocus" JSONB;
