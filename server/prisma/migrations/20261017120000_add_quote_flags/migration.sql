-- "Not right?" on an Insights quote (QuoteFlag in schema.prisma). Recorded,
-- never acted on: the quote stays on the page, and the flags become the eval
-- set for the reads that choose quotes. Deleted with the lesson.
CREATE TABLE "QuoteFlag" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "findingKey" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "timestampSec" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteFlag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuoteFlag_sessionId_idx" ON "QuoteFlag"("sessionId");

CREATE UNIQUE INDEX "QuoteFlag_sessionId_userId_findingKey_segmentId_key" ON "QuoteFlag"("sessionId", "userId", "findingKey", "segmentId");

ALTER TABLE "QuoteFlag" ADD CONSTRAINT "QuoteFlag_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AudioSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
