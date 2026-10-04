-- Practice's feedback becomes three named parts rather than a block of
-- coaching plus a model answer: what the move did, what it left on the table,
-- and one line worth keeping.
--
-- Added alongside feedback/modelResponse rather than replacing them. Those two
-- are read by the iOS app, by the printable export and by the Cheat Sheet,
-- none of which know about this column — dropping or repurposing them would
-- blank out a teacher's existing history in three places at once. New attempts
-- write both; old attempts have a null here and render exactly as before.
ALTER TABLE "ScenarioAttempt" ADD COLUMN "coachingParts" JSONB;
