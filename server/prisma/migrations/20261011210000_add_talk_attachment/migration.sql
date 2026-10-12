-- A document attached before a Talk It Through call: the extracted text, not
-- the file. Nullable, no backfill — every existing conversation has none.
ALTER TABLE "Debrief" ADD COLUMN "attachmentName" TEXT;
ALTER TABLE "Debrief" ADD COLUMN "attachmentText" TEXT;
