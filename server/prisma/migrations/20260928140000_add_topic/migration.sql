-- Subject and course say what room a teacher is in; topic says what is
-- happening in it this week. Practice had no other channel for it — the teacher
-- types nothing before a scenario is generated — so the model picked the topic,
-- and a scenario about protein synthesis is no use to someone teaching
-- photosynthesis on Thursday.

-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN     "topic" TEXT;

-- AlterTable
ALTER TABLE "Debrief" ADD COLUMN     "topic" TEXT;
