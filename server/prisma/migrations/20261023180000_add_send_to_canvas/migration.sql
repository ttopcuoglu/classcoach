-- Send to Canvas: a school's Canvas API key on its Canvas install, and each
-- teacher's permission for Wivoza to add pages to their courses.
-- AlterTable
ALTER TABLE "LtiPlatform" ADD COLUMN     "apiClientId" TEXT,
ADD COLUMN     "apiClientSecretEnc" TEXT,
ADD COLUMN     "canvasUrl" TEXT;

-- CreateTable
CREATE TABLE "CanvasToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "canvasUserId" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CanvasToken_userId_platformId_key" ON "CanvasToken"("userId", "platformId");

-- AddForeignKey
ALTER TABLE "CanvasToken" ADD CONSTRAINT "CanvasToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasToken" ADD CONSTRAINT "CanvasToken_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "LtiPlatform"("id") ON DELETE CASCADE ON UPDATE CASCADE;

