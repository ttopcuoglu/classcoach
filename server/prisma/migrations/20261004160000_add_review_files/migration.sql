-- One review, several files.
--
-- "An assignment plus its rubric, or a packet photographed page by page, is
-- one review — not five." Until now a review had exactly one document, held
-- as a single column of text, so a teacher who wanted the rubric checked
-- against the assignment had to run two reviews and compare them by hand.
--
-- Text only for now, by decision: `text` holds what was extracted, and
-- `originalFileKey` is the column the uploaded original will hang off once
-- there is somewhere to put it. Nullable from the start so adding storage is
-- a backfill rather than another migration.
--
-- Review.originalText stays, and stays authoritative: it is the concatenation
-- of these files, and it is what edit anchors, the name guard and section
-- detection all run against. Splitting that would mean an anchor that matches
-- in one file and not in the review.
CREATE TABLE "ReviewFile" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    -- Position in the review, so "the assignment" stays first and the
    -- combined text reads in the order the teacher dropped them.
    "position" INTEGER NOT NULL DEFAULT 0,
    "fileName" TEXT,
    -- "file" | "paste" | "photo", per file: a teacher can drop a .docx and
    -- photograph the rubric in the same review.
    "sourceKind" TEXT NOT NULL DEFAULT 'file',
    "mime" TEXT,
    "bytes" INTEGER,
    "pageCount" INTEGER,
    -- What detection made of this file ON ITS OWN, which is what lets the
    -- page say "an assignment and a rubric" rather than naming only the set's
    -- winner.
    "docType" TEXT,
    -- Pages that came from OCR, where accuracy is lower. Empty when none did.
    "ocrPages" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReviewFile_reviewId_idx" ON "ReviewFile"("reviewId");

ALTER TABLE "ReviewFile" ADD CONSTRAINT "ReviewFile_reviewId_fkey"
    FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 2 fills this; it exists now so that is a backfill, not a migration.
ALTER TABLE "ReviewFile" ADD COLUMN "originalFileKey" TEXT;
