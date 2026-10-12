-- The one moment in the lesson most worth a second look, chosen by a read of
-- the transcript (lib/momentToRevisit.ts). Nullable: NULL means not read yet,
-- and the report asks for it the first time the Summary tab is opened, so
-- existing reports need no backfill.
ALTER TABLE "AudioSession" ADD COLUMN "momentToRevisit" JSONB;
