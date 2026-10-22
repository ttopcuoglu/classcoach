-- Lesson plan templates: a school's or a teacher's own lesson plan format,
-- and on each lesson the format picked plus the lesson laid out in it.
-- Everything new is nullable or defaulted; no existing row changes.
CREATE TABLE "LessonTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cadence" TEXT NOT NULL DEFAULT 'daily',
    "sections" JSONB NOT NULL,
    "sourceFileName" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "LessonTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LessonTemplate_organizationId_idx" ON "LessonTemplate"("organizationId");
CREATE INDEX "LessonTemplate_userId_idx" ON "LessonTemplate"("userId");

ALTER TABLE "LessonTemplate" ADD CONSTRAINT "LessonTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonTemplate" ADD CONSTRAINT "LessonTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LessonPlan" ADD COLUMN "templateChoice" TEXT;
ALTER TABLE "LessonPlan" ADD COLUMN "templateContent" JSONB;
