-- AlterTable
ALTER TABLE "AssignmentCoachSession" ADD COLUMN     "assignmentType" TEXT,
ADD COLUMN     "estimatedTime" TEXT,
ADD COLUMN     "liveAssignmentText" TEXT,
ADD COLUMN     "reviewSummary" JSONB,
ADD COLUMN     "specificNeeds" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft',
ADD COLUMN     "typeDetails" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

