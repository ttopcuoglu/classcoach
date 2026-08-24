-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "UserProfile";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "googleId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'teacher',
    "gradeLevels" TEXT,
    "subjects" TEXT,
    "onboardingProgress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Debrief" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "incidentText" TEXT NOT NULL,
    "category" TEXT,
    "feedback" TEXT,
    "followUp" TEXT,
    "rating" INTEGER,
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "shareToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Debrief_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Debrief" ("category", "createdAt", "feedback", "followUp", "id", "incidentText", "rating", "saved", "shareToken") SELECT "category", "createdAt", "feedback", "followUp", "id", "incidentText", "rating", "saved", "shareToken" FROM "Debrief";
DROP TABLE "Debrief";
ALTER TABLE "new_Debrief" RENAME TO "Debrief";
CREATE UNIQUE INDEX "Debrief_shareToken_key" ON "Debrief"("shareToken");
CREATE TABLE "new_ParentMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "incidentSummary" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "draftText" TEXT NOT NULL,
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ParentMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ParentMessage" ("createdAt", "draftText", "id", "incidentSummary", "saved", "tone") SELECT "createdAt", "draftText", "id", "incidentSummary", "saved", "tone" FROM "ParentMessage";
DROP TABLE "ParentMessage";
ALTER TABLE "new_ParentMessage" RENAME TO "ParentMessage";
CREATE TABLE "new_QAExchange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QAExchange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_QAExchange" ("answer", "createdAt", "id", "question", "starred") SELECT "answer", "createdAt", "id", "question", "starred" FROM "QAExchange";
DROP TABLE "QAExchange";
ALTER TABLE "new_QAExchange" RENAME TO "QAExchange";
CREATE TABLE "new_ScenarioAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "responseText" TEXT NOT NULL,
    "feedback" TEXT,
    "modelResponse" TEXT,
    "rating" INTEGER,
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "shareToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScenarioAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScenarioAttempt_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ScenarioAttempt" ("createdAt", "feedback", "id", "modelResponse", "rating", "responseText", "saved", "scenarioId", "shareToken") SELECT "createdAt", "feedback", "id", "modelResponse", "rating", "responseText", "saved", "scenarioId", "shareToken" FROM "ScenarioAttempt";
DROP TABLE "ScenarioAttempt";
ALTER TABLE "new_ScenarioAttempt" RENAME TO "ScenarioAttempt";
CREATE UNIQUE INDEX "ScenarioAttempt_shareToken_key" ON "ScenarioAttempt"("shareToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

