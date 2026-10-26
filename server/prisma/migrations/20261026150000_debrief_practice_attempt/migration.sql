-- Talk It Through opened from a Practice attempt's "Discuss with Wivoza Coach":
-- the attempt it rehearses out loud. Null on every existing row.
-- AlterTable
ALTER TABLE "Debrief" ADD COLUMN     "practiceAttemptId" TEXT;

-- CreateIndex
CREATE INDEX "Debrief_practiceAttemptId_idx" ON "Debrief"("practiceAttemptId");

-- AddForeignKey
ALTER TABLE "Debrief" ADD CONSTRAINT "Debrief_practiceAttemptId_fkey" FOREIGN KEY ("practiceAttemptId") REFERENCES "ScenarioAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
