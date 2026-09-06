-- CreateTable
CREATE TABLE "AssignmentCoachSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "gradeLevel" TEXT,
    "subject" TEXT,
    "objective" TEXT,
    "originalText" TEXT,
    "title" TEXT,
    "conversation" JSONB,
    "finalMaterials" JSONB,
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentCoachSession_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AssignmentCoachSession" ADD CONSTRAINT "AssignmentCoachSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

