-- CreateTable
CREATE TABLE "CoachFollowUp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceDebriefId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "checkInQuestion" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "respondedDebriefId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachFollowUp_sourceDebriefId_key" ON "CoachFollowUp"("sourceDebriefId");

-- CreateIndex
CREATE INDEX "CoachFollowUp_userId_status_dueAt_idx" ON "CoachFollowUp"("userId", "status", "dueAt");

-- AddForeignKey
ALTER TABLE "CoachFollowUp" ADD CONSTRAINT "CoachFollowUp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachFollowUp" ADD CONSTRAINT "CoachFollowUp_sourceDebriefId_fkey" FOREIGN KEY ("sourceDebriefId") REFERENCES "Debrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

