-- Focus area: the new top level of the Ask & Practice taxonomy. The six
-- original categories (defiance, disengagement, peer_conflict, disruption,
-- transitions, technology_misuse) become Classroom Management's
-- sub-categories, so `category` itself needs no rewriting — every existing row
-- already carries a value that identifies its area.

-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN     "focusArea" TEXT,
                       ADD COLUMN     "subject" TEXT;

-- AlterTable
ALTER TABLE "Debrief" ADD COLUMN     "focusArea" TEXT,
                      ADD COLUMN     "gradeBand" TEXT,
                      ADD COLUMN     "subject" TEXT;

-- Backfill: everything that existed before this migration was
-- classroom-management-only, by construction.
UPDATE "Scenario" SET "focusArea" = 'classroom_management' WHERE "focusArea" IS NULL;
UPDATE "Debrief" SET "focusArea" = 'classroom_management' WHERE "focusArea" IS NULL AND "category" IS NOT NULL;
