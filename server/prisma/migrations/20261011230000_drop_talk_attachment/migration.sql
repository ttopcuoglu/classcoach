-- Talk It Through's attached document, removed. The columns were added the
-- same day and the feature was never announced, so there is nothing here to
-- preserve; a conversation's own text was never in these columns.
ALTER TABLE "Debrief" DROP COLUMN IF EXISTS "attachmentName";
ALTER TABLE "Debrief" DROP COLUMN IF EXISTS "attachmentText";
