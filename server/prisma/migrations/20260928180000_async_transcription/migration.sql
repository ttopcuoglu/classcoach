-- Transcription becomes a background job: the upload request returns as soon
-- as the audio is accepted, and these two columns are what the client polls
-- against instead of holding an eight-minute HTTP request open.
ALTER TABLE "AudioSession" ADD COLUMN "transcribeStartedAt" TIMESTAMP(3);
ALTER TABLE "AudioSession" ADD COLUMN "failureReason" TEXT;
