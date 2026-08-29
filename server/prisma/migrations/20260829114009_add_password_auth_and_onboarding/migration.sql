-- AlterTable
ALTER TABLE "User" ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "schoolName" TEXT,
ADD COLUMN     "teachingGoal" TEXT,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ALTER COLUMN "googleId" DROP NOT NULL;

