-- An observation's recording becomes an ordinary analyzed lesson (Summary,
-- Insights, Content Specialist), owned by the supervisor and linked here. Every
-- existing lesson has no observation, so nothing that exists changes.
-- AlterTable
ALTER TABLE "AudioSession" ADD COLUMN "observationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AudioSession_observationId_key" ON "AudioSession"("observationId");

-- AddForeignKey
ALTER TABLE "AudioSession" ADD CONSTRAINT "AudioSession_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
