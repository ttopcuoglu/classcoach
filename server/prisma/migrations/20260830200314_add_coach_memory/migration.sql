-- AlterTable
ALTER TABLE "User" ADD COLUMN     "coachMemory" TEXT,
ADD COLUMN     "coachMemoryEnabled" BOOLEAN NOT NULL DEFAULT true;

