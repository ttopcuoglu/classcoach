-- AlterTable
ALTER TABLE "User" ADD COLUMN     "audioRetentionDays" INTEGER;

-- CreateTable
CREATE TABLE "AudioSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teacherName" TEXT,
    "classSubject" TEXT,
    "period" TEXT,
    "gradeLevel" TEXT,
    "sessionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'setup',
    "durationSec" INTEGER,
    "teacherTalkPct" DOUBLE PRECISION,
    "studentTalkPct" DOUBLE PRECISION,
    "questionCount" INTEGER,
    "higherOrderPct" DOUBLE PRECISION,
    "avgWaitTimeSec" DOUBLE PRECISION,
    "cfuCount" INTEGER,
    "metricsDetail" JSONB,
    "highlights" JSONB,
    "phases" JSONB,
    "strengths" TEXT,
    "growthAreas" TEXT,
    "nextStep" TEXT,
    "followUpDate" TIMESTAMP(3),
    "deleteAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptSegment" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "speakerLabel" TEXT NOT NULL,
    "rawSpeakerTag" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AudioSession" ADD CONSTRAINT "AudioSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AudioSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

