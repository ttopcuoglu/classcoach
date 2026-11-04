-- Leader's Corner: a superadmin-assigned level per person (null on every
-- existing row, so nobody sees Leader's Corner until assigned), and the
-- leader's own practice, kept in its own table so no dashboard reads it.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "leaderLevel" TEXT;

-- CreateTable
CREATE TABLE "LeaderAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "curatedId" TEXT,
    "audience" TEXT,
    "scenarioText" TEXT NOT NULL,
    "responseText" TEXT NOT NULL,
    "feedback" TEXT,
    "modelResponse" TEXT,
    "conversation" JSONB,
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaderAttempt_userId_createdAt_idx" ON "LeaderAttempt"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeaderAttempt" ADD CONSTRAINT "LeaderAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
