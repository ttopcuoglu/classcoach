-- Sign in with Microsoft: the Microsoft account a Wivoza account signs in with.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "microsoftId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_microsoftId_key" ON "User"("microsoftId");

