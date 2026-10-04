-- Look It Over: one drop zone, one document, several lenses.
--
-- A new table rather than an extension of the four it supersedes
-- (LessonPlan's feedback and presentation modes, AssignmentCoachSession's
-- review mode, ConversationPrep's review rows). Nothing is migrated into it:
-- those four keep their rows, keep their result pages, and keep appearing in
-- the unified history, so no teacher loses a review they already have.
--
-- Three of the seven document types — quiz, homework, project — had no home
-- at all before this. The other reason for a new table is the result page:
-- per-edit accept/reject over a marked-up diff, and a lens set the teacher
-- can toggle, neither of which fits any of the four existing shapes.
-- LessonPlan.suggestedRevision is the closest thing and it is a whole
-- replacement document, which is exactly what this surface rules out.

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "detectedType" TEXT,
    "docTypeConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "sourceKind" TEXT NOT NULL,
    "fileName" TEXT,
    "pageCount" INTEGER,
    "originalText" TEXT NOT NULL,
    "focusArea" TEXT,
    "classProfileId" TEXT,
    "lenses" JSONB NOT NULL,
    "oneThing" TEXT,
    "edits" JSONB NOT NULL,
    "timingBasis" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "shareToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Review_shareToken_key" ON "Review"("shareToken");

-- CreateIndex
CREATE INDEX "Review_userId_idx" ON "Review"("userId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull, not Cascade: deleting a class must never delete the reviews that
-- happened to be read against it.
ALTER TABLE "Review" ADD CONSTRAINT "Review_classProfileId_fkey"
    FOREIGN KEY ("classProfileId") REFERENCES "ClassProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
