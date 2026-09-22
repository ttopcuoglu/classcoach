-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramLinkedAt" TIMESTAMP(3),
ADD COLUMN     "telegramLinkToken" TEXT,
ADD COLUMN     "telegramLinkTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "telegramDebriefId" TEXT;

-- AlterTable
ALTER TABLE "Debrief" ADD COLUMN     "channel" TEXT;

-- AlterTable
ALTER TABLE "CoachFollowUp" ADD COLUMN     "telegramSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramLinkToken_key" ON "User"("telegramLinkToken");
