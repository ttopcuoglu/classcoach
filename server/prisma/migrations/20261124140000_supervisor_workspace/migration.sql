-- Supervisor workspace: whether a supervisor also teaches (off by default,
-- which hides My Coaching for them), and lesson plan reviews. Existing rows
-- only gain alsoTeaches = false; the new table starts empty.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "alsoTeaches" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LessonPlanReview" (
    "id" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "organizationId" TEXT,
    "teacherId" TEXT,
    "teacherName" TEXT NOT NULL,
    "lessonTitle" TEXT,
    "gradeLevel" TEXT,
    "planLabel" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failureReason" TEXT,
    "report" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonPlanReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonPlanReview_reviewerId_createdAt_idx" ON "LessonPlanReview"("reviewerId", "createdAt");

-- CreateIndex
CREATE INDEX "LessonPlanReview_teacherId_sentAt_idx" ON "LessonPlanReview"("teacherId", "sentAt");

-- AddForeignKey
ALTER TABLE "LessonPlanReview" ADD CONSTRAINT "LessonPlanReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlanReview" ADD CONSTRAINT "LessonPlanReview_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
