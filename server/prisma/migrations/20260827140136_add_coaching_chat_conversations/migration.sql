-- AlterTable
ALTER TABLE "ConversationPrep" ADD COLUMN     "conversation" JSONB;

-- AlterTable
ALTER TABLE "Debrief" ADD COLUMN     "conversation" JSONB;

-- AlterTable
ALTER TABLE "ParentMessage" ADD COLUMN     "conversation" JSONB;

-- AlterTable
ALTER TABLE "ScenarioAttempt" ADD COLUMN     "conversation" JSONB;

