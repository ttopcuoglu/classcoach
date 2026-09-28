-- Level was doing two jobs at once. AP, Honors and Regular describe how a
-- section is tracked; Inclusion describes who is in it. As one single-select
-- they forced a false choice — a co-taught Algebra 1 with fourteen English
-- learners is Regular AND inclusion AND ESL — so who-is-in-the-room becomes its
-- own multi-select, which is also what lets English learners sit beside
-- inclusion rather than inside it.

-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN "classMakeup" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Debrief" ADD COLUMN "classMakeup" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Rows that recorded Inclusion as a level move to the new axis, so nothing is
-- left holding a level value that is no longer offered.
UPDATE "Scenario" SET "classMakeup" = ARRAY['inclusion'], "courseLevel" = NULL WHERE "courseLevel" = 'Inclusion';
UPDATE "Debrief" SET "classMakeup" = ARRAY['inclusion'], "courseLevel" = NULL WHERE "courseLevel" = 'Inclusion';
