-- The v3 Insights coach notes (lib/insightsNotes.ts), written from the page's
-- findings and checked before they are stored. Nullable: no lesson has them
-- until its Insights page is opened in the new layout.
ALTER TABLE "AudioSession" ADD COLUMN "insightsNotes" JSONB;
