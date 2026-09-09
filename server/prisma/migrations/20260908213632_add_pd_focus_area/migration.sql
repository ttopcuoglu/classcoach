-- CreateTable
CREATE TABLE "PdFocusArea" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "themeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "suggestedAction" TEXT,
    "baselineSnapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "PdFocusArea_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PdFocusArea" ADD CONSTRAINT "PdFocusArea_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdFocusArea" ADD CONSTRAINT "PdFocusArea_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

