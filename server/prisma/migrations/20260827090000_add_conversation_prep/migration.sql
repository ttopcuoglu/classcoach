-- CreateTable
CREATE TABLE "ConversationPrep" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "situationText" TEXT NOT NULL,
    "responseText" TEXT NOT NULL,
    "feedback" TEXT,
    "modelResponse" TEXT,
    "rating" INTEGER,
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "shareToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationPrep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationPrep_shareToken_key" ON "ConversationPrep"("shareToken");

-- AddForeignKey
ALTER TABLE "ConversationPrep" ADD CONSTRAINT "ConversationPrep_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

