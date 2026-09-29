-- Narratives for Talk & Participation and Questions & Thinking, written in
-- the same model call as the others.
ALTER TABLE "AudioSession" ADD COLUMN "talkNarrative" TEXT;
ALTER TABLE "AudioSession" ADD COLUMN "questionsNarrative" TEXT;
