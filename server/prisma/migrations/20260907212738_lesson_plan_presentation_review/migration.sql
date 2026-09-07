-- AlterTable
ALTER TABLE "LessonPlan" ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "presentationReview" JSONB,
ADD COLUMN     "slideCount" INTEGER;

