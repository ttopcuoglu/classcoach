-- Leader's Corner: responsibilities and whether the leader evaluates staff.
ALTER TABLE "User" ADD COLUMN "leaderAreas" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "leaderEvaluates" BOOLEAN NOT NULL DEFAULT false;
