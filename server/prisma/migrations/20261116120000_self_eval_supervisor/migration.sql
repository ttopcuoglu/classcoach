-- Self-Eval sharing: a superadmin-assigned supervisor per teacher, and
-- which lesson's Self-Eval the teacher shared with them.
ALTER TABLE "User" ADD COLUMN "supervisorId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "User_supervisorId_idx" ON "User"("supervisorId");

ALTER TABLE "AudioSession" ADD COLUMN "selfEvalSharedWithId" TEXT;
ALTER TABLE "AudioSession" ADD COLUMN "selfEvalSharedAt" TIMESTAMP(3);
CREATE INDEX "AudioSession_selfEvalSharedWithId_idx" ON "AudioSession"("selfEvalSharedWithId");
