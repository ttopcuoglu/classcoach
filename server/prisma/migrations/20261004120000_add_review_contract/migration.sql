-- The analysis contract: the parts of a result that were previously either
-- prose inside one string or not captured at all.
--
-- All nullable and all additive. A review written before this renders exactly
-- as it did: `oneThing` still holds the headline, and the detail, assumptions
-- and limits are simply absent rather than empty.

-- The headline keeps using "oneThing"; this is the sentence under it.
ALTER TABLE "Review" ADD COLUMN "oneThingDetail" TEXT;

-- [{ label, value, calibratable }] — every number the result shows has to
-- trace back to one of these, which is why they are stored rather than
-- re-derived: a figure whose basis is gone is a figure nobody can check.
ALTER TABLE "Review" ADD COLUMN "assumptions" JSONB;

-- ["what you'll say out loud", ...] — what this read could not see. Stored
-- per review because it depends on the document and the lenses that ran, not
-- only on the type.
ALTER TABLE "Review" ADD COLUMN "notVisible" JSONB;

-- "whole" | "section", and the teacher-facing label for the part reviewed
-- ("p. 12-20"). Null means the whole document, which is the common case.
ALTER TABLE "Review" ADD COLUMN "scopeMode" TEXT;
ALTER TABLE "Review" ADD COLUMN "scopeLabel" TEXT;
