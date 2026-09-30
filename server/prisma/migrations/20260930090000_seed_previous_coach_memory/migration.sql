-- Seeds the undo with whatever Coach's note says right now, so the notes that
-- already exist are protected from the first bad write rather than only from
-- the second. Without this, previousCoachMemory is null for every teacher and
-- "go back to the previous version" cannot appear until Coach has changed the
-- note once — which is exactly one bad write too late.
--
-- The previousCoachMemory IS NULL guard matters: if the application code ships
-- before this runs, persistMemoryUpdate will already have captured real undo
-- targets for anyone who had a conversation in between, and those must not be
-- overwritten with the current text.
--
-- For a short while after this, restoring is a no-op — it returns the same text
-- that is already live. That resolves itself the first time Coach writes
-- something different, and is a better failure than having no undo at all.
UPDATE "User"
SET "previousCoachMemory" = "coachMemory"
WHERE "coachMemory" IS NOT NULL
  AND "previousCoachMemory" IS NULL;
