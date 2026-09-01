-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "pilotEndsAt" TIMESTAMP(3),
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'free',
ADD COLUMN     "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'free',
ADD COLUMN     "planRenewsAt" TIMESTAMP(3),
ADD COLUMN     "planStatus" TEXT,
ADD COLUMN     "stripeCustomerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

