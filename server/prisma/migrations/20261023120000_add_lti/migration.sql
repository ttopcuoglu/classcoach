-- Canvas over LTI 1.3: a school's Canvas installs, Canvas users connected to
-- Wivoza accounts, and launches waiting for a teacher to confirm theirs.
-- CreateTable
CREATE TABLE "LtiPlatform" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "authUrl" TEXT NOT NULL,
    "jwksUrl" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "LtiPlatform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LtiUserLink" (
    "id" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "sub" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLaunchAt" TIMESTAMP(3),

    CONSTRAINT "LtiUserLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LtiPendingLink" (
    "tokenHash" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "sub" TEXT NOT NULL,
    "name" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LtiPendingLink_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "LtiPlatform_issuer_clientId_key" ON "LtiPlatform"("issuer", "clientId");

-- CreateIndex
CREATE INDEX "LtiUserLink_userId_idx" ON "LtiUserLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LtiUserLink_platformId_sub_key" ON "LtiUserLink"("platformId", "sub");

-- AddForeignKey
ALTER TABLE "LtiPlatform" ADD CONSTRAINT "LtiPlatform_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiUserLink" ADD CONSTRAINT "LtiUserLink_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "LtiPlatform"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiUserLink" ADD CONSTRAINT "LtiUserLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiPendingLink" ADD CONSTRAINT "LtiPendingLink_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "LtiPlatform"("id") ON DELETE CASCADE ON UPDATE CASCADE;

