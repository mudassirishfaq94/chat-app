-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Message" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "roomId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "editedAt" DATETIME,
    "attachmentUrl" TEXT,
    "attachmentType" TEXT,
    "attachmentName" TEXT,
    "attachmentSize" INTEGER,
    "attachmentMime" TEXT,
    "attachmentEnc" BOOLEAN DEFAULT false,
    "attachmentIv" TEXT,
    "replyToId" INTEGER,
    "forwardFromMessageId" INTEGER,
    "forwardedByUserId" INTEGER,
    "forwardedOriginalSenderName" TEXT,
    "forwardedOriginalTimestamp" DATETIME,
    CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Message_forwardFromMessageId_fkey" FOREIGN KEY ("forwardFromMessageId") REFERENCES "Message" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Message_forwardedByUserId_fkey" FOREIGN KEY ("forwardedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Message_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("attachmentEnc", "attachmentIv", "attachmentMime", "attachmentName", "attachmentSize", "attachmentType", "attachmentUrl", "createdAt", "deletedAt", "editedAt", "id", "roomId", "text", "userId") SELECT "attachmentEnc", "attachmentIv", "attachmentMime", "attachmentName", "attachmentSize", "attachmentType", "attachmentUrl", "createdAt", "deletedAt", "editedAt", "id", "roomId", "text", "userId" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE INDEX "Message_roomId_createdAt_idx" ON "Message"("roomId", "createdAt");
CREATE INDEX "Message_replyToId_idx" ON "Message"("replyToId");
CREATE INDEX "Message_forwardFromMessageId_idx" ON "Message"("forwardFromMessageId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
