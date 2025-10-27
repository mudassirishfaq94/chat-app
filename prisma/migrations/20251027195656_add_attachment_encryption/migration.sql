-- AlterTable
ALTER TABLE "Message" ADD COLUMN "attachmentEnc" BOOLEAN DEFAULT false;
ALTER TABLE "Message" ADD COLUMN "attachmentIv" TEXT;
