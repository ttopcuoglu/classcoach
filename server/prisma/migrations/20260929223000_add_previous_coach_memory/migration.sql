-- One step of undo for Coach's memory. applyMemoryUpdate overwrites, and what
-- it overwrites can be weeks of accumulated context — recurring strengths, a
-- growth area, several open situations tracked across conversations. A single
-- bad model turn could destroy all of it with nothing to go back to.
ALTER TABLE "User" ADD COLUMN "previousCoachMemory" TEXT;
