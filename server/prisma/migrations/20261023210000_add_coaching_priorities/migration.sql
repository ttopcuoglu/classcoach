-- Coaching Priorities: a school's shared focus areas, each teacher's private
-- choice about them, and the one idea a lesson plan may carry.

-- AlterTable
ALTER TABLE "LessonPlan" ADD COLUMN     "schoolFocusIdea" JSONB;

-- CreateTable
CREATE TABLE "SchoolPriority" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "looksLike" TEXT NOT NULL,
    "whenItFits" TEXT NOT NULL,
    "ideas" TEXT NOT NULL,
    "whenNotToUse" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3),
    "endsOn" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "changeNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolPriority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherPriorityChoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "priorityId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherPriorityChoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolPriority_organizationId_status_idx" ON "SchoolPriority"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherPriorityChoice_userId_priorityId_key" ON "TeacherPriorityChoice"("userId", "priorityId");

-- AddForeignKey
ALTER TABLE "SchoolPriority" ADD CONSTRAINT "SchoolPriority_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherPriorityChoice" ADD CONSTRAINT "TeacherPriorityChoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherPriorityChoice" ADD CONSTRAINT "TeacherPriorityChoice_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "SchoolPriority"("id") ON DELETE CASCADE ON UPDATE CASCADE;
