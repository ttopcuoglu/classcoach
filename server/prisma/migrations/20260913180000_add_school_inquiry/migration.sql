-- CreateTable
CREATE TABLE "SchoolInquiry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "organizationType" TEXT NOT NULL,
    "state" TEXT,
    "teacherCount" TEXT,
    "interests" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolInquiry_createdAt_idx" ON "SchoolInquiry"("createdAt");

