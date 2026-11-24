-- Supervisor classroom observations: a recording, ten Danielson questions,
-- the supervisor's notes and an optional plan, combined into a report the
-- supervisor sends to the teacher. A new table only; no existing row changes.
-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "observerId" TEXT NOT NULL,
    "organizationId" TEXT,
    "teacherId" TEXT,
    "teacherName" TEXT NOT NULL,
    "lessonTitle" TEXT,
    "subject" TEXT,
    "gradeLevel" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSec" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'recording',
    "failureReason" TEXT,
    "transcript" JSONB,
    "notes" JSONB,
    "answers" JSONB,
    "closingNote" TEXT,
    "answeredAt" TIMESTAMP(3),
    "plan" JSONB,
    "report" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Observation_observerId_observedAt_idx" ON "Observation"("observerId", "observedAt");

-- CreateIndex
CREATE INDEX "Observation_teacherId_sentAt_idx" ON "Observation"("teacherId", "sentAt");

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_observerId_fkey" FOREIGN KEY ("observerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
