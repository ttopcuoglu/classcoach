-- Practice "Something real": a teacher's own situation is stored as a Scenario
-- owned by that teacher, so it is never listed to others and is deleted with
-- the account. Null on every existing (generated / curated) row.
-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "Scenario_userId_idx" ON "Scenario"("userId");

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
