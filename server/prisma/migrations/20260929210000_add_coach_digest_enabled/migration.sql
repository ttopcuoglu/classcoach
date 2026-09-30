-- Per-teacher consent for the recording digest (see server/src/lib/coachDigest.ts).
-- Separate from coachMemoryEnabled on purpose: that one covers a narrative Coach
-- writes about the teacher, this one covers Coach reading what their own class
-- recordings measured while they are using a different feature. Different
-- promise, so it needs its own yes — and it defaults to no.
ALTER TABLE "User" ADD COLUMN "coachDigestEnabled" BOOLEAN NOT NULL DEFAULT false;
