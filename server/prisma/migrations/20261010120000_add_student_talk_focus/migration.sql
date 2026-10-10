-- What the audible student talk was about. Nullable, and null is the normal
-- state for a lesson with few audible student turns — the report reads null as
-- "not measured", never as zero. Existing reports keep NULL and render exactly
-- as they do now until they are re-analyzed.
ALTER TABLE "AudioSession" ADD COLUMN "studentTalkFocus" JSONB;
