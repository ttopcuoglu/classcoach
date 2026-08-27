-- AlterTable
ALTER TABLE "LessonPlan" ADD COLUMN     "conversation" JSONB,
ALTER COLUMN "objective" DROP NOT NULL;

