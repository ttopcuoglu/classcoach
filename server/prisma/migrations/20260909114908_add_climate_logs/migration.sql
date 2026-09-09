-- AlterTable
ALTER TABLE "AudioSession" ADD COLUMN     "directiveLog" JSONB,
ADD COLUMN     "redirectionLog" JSONB,
ADD COLUMN     "toneLog" JSONB;

