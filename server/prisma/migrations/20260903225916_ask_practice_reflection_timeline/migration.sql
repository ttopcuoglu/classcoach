-- AlterTable
ALTER TABLE "Debrief" ADD COLUMN     "reflectionNote" TEXT,
ADD COLUMN     "triedAt" TIMESTAMP(3),
ADD COLUMN     "wordsToTry" TEXT;

-- AlterTable
ALTER TABLE "ScenarioAttempt" ADD COLUMN     "reflectionNote" TEXT,
ADD COLUMN     "triedAt" TIMESTAMP(3);

