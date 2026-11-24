-- Self Evaluations a supervisor hasn't opened yet show as New, and the
-- supervisor can tick one Reviewed for themselves. Two empty columns; no
-- existing value changes.
-- AlterTable
ALTER TABLE "AudioSession" ADD COLUMN "selfEvalSeenAt" TIMESTAMP(3),
ADD COLUMN "selfEvalReviewedAt" TIMESTAMP(3);
