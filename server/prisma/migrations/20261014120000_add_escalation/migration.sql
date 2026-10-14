-- Whether a teacher's bid for the room's attention held, or whether she had
-- to ask again and climb (lib/escalation.ts). Nullable: NULL means not read
-- yet, which is every report that already exists. A read that finds nothing
-- is stored with its own state — 'confirmed_none' when enough of the lesson
-- was audible to mean it, 'not_measurable' when it was not — so "looked and
-- found nothing" can never be confused with "never looked", and a recording
-- the mic lost can never be reported as a calm room.
ALTER TABLE "AudioSession" ADD COLUMN "escalation" JSONB;
