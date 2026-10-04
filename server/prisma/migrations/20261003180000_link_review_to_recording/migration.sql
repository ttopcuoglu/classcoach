-- Look It Over (a plan) <-> Lesson Debrief (the recording of that lesson).
--
-- The handoff the consolidation is really for: a teacher who had a plan read
-- over on Sunday and recorded that lesson on Tuesday should get a report that
-- compares the two, rather than two unrelated documents about the same forty
-- minutes. "You planned 12 minutes for the discussion; the recording suggests
-- about 4" is a sentence neither surface could say on its own.
--
-- Nullable and opt-in: the vast majority of recordings have no reviewed plan,
-- and guessing which plan a recording belongs to would be worse than asking.
--
-- SET NULL, not CASCADE. Deleting a review must never delete the recording of
-- the lesson it was a plan for — that is a teacher's own class, and the
-- review is the disposable half of the pair.
ALTER TABLE "AudioSession" ADD COLUMN "reviewId" TEXT;

CREATE INDEX "AudioSession_reviewId_idx" ON "AudioSession"("reviewId");

ALTER TABLE "AudioSession" ADD CONSTRAINT "AudioSession_reviewId_fkey"
    FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE;
