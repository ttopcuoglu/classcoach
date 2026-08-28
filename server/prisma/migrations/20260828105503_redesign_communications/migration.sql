-- Data migration: rename the "real" source value to "review" ahead of the
-- app-layer rename (Difficult Conversations' "Prepare a Real Conversation"
-- becomes "Review My Communication"). Must run before any code that could
-- write a new "real" row exists.
UPDATE "ConversationPrep" SET "source" = 'review' WHERE "source" = 'real';

-- AlterTable
ALTER TABLE "ConversationPrep" ADD COLUMN     "coachingReport" JSONB,
ADD COLUMN     "difficulty" TEXT,
ADD COLUMN     "personType" TEXT,
ADD COLUMN     "reviewMode" TEXT,
ADD COLUMN     "title" TEXT,
ALTER COLUMN "category" DROP NOT NULL,
ALTER COLUMN "source" SET DEFAULT 'review';

-- AlterTable
ALTER TABLE "ParentMessage" ADD COLUMN     "existingDraft" TEXT,
ADD COLUMN     "format" TEXT,
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "receivedMessage" TEXT,
ADD COLUMN     "recipientType" TEXT,
ADD COLUMN     "startingAction" TEXT,
ADD COLUMN     "title" TEXT,
ALTER COLUMN "incidentSummary" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ConversationPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipientType" TEXT,
    "situationText" TEXT NOT NULL,
    "desiredOutcome" TEXT,
    "concerns" TEXT,
    "background" TEXT,
    "meetingFormat" TEXT,
    "planContent" JSONB,
    "title" TEXT,
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversation" JSONB,

    CONSTRAINT "ConversationPlan_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ConversationPlan" ADD CONSTRAINT "ConversationPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

