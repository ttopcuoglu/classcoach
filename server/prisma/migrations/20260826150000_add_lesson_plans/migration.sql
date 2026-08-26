-- CreateTable
CREATE TABLE "LessonPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "unitName" TEXT,
    "essentialQuestion" TEXT,
    "standard" TEXT,
    "subject" TEXT,
    "gradeLevel" TEXT,
    "planText" TEXT,
    "feedback" TEXT,
    "rating" INTEGER,
    "doNow" TEXT,
    "agenda" TEXT,
    "closure" TEXT,
    "hots" TEXT,
    "homework" TEXT,
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "shareToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonPlan_shareToken_key" ON "LessonPlan"("shareToken");

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

