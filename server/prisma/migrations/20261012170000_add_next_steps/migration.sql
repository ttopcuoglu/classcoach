-- One "next time" line per Insights section, written in the same model call
-- as the class summary. Nullable: reports summarized before this keep NULL
-- and simply list fewer things to try.
ALTER TABLE "AudioSession" ADD COLUMN "nextSteps" JSONB;
