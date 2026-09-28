-- Ask & Practice now asks for a single grade rather than a three-year band: a
-- 6th-grade scenario and an 8th-grade one are not the same scenario. gradeBand
-- stays on both tables — it is derived from the level on write, the curated
-- fallback bank is written per band, and every row predating this has a band
-- and no level.

-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN     "gradeLevel" TEXT;

-- AlterTable
ALTER TABLE "Debrief" ADD COLUMN     "gradeLevel" TEXT;
