-- When a teacher acknowledged the before-your-first-recording notice. Null on
-- every existing row, so every current teacher sees the notice once.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "recordingNoticeAt" TIMESTAMP(3);
