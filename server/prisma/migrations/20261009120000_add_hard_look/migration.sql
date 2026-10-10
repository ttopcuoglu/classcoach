-- The Hard Look: an on-demand, least-generous reading of a lesson's own
-- evidence, stored once and kept like rubricLens beside it. Nullable, and
-- null is the normal state — it is only ever written when a teacher asks
-- for one, so every existing report stays exactly as it is.
ALTER TABLE "AudioSession" ADD COLUMN "hardLook" JSONB;
