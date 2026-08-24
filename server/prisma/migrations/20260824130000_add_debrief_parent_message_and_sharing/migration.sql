-- AlterTable
ALTER TABLE "ScenarioAttempt" ADD COLUMN "shareToken" TEXT;

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN "onboardingProgress" TEXT;

-- CreateTable
CREATE TABLE "Debrief" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentText" TEXT NOT NULL,
    "category" TEXT,
    "feedback" TEXT,
    "followUp" TEXT,
    "rating" INTEGER,
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "shareToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ParentMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentSummary" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "draftText" TEXT NOT NULL,
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Debrief_shareToken_key" ON "Debrief"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioAttempt_shareToken_key" ON "ScenarioAttempt"("shareToken");

