-- Any LTI 1.3 LMS, not only Canvas: which LMS an install is, and the
-- deployment it covers. Schoology and Blackboard share one client id across
-- schools, so (issuer, clientId) is no longer unique; the routes keep
-- (issuer, clientId, deploymentId) unique instead.
-- DropIndex
DROP INDEX "LtiPlatform_issuer_clientId_key";

-- AlterTable
ALTER TABLE "LtiPlatform" ADD COLUMN     "deploymentId" TEXT,
ADD COLUMN     "lms" TEXT NOT NULL DEFAULT 'canvas';

-- CreateIndex
CREATE INDEX "LtiPlatform_issuer_clientId_idx" ON "LtiPlatform"("issuer", "clientId");

