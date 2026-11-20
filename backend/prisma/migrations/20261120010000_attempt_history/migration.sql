-- AlterTable
ALTER TABLE "User" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "quizTitle" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3) NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "passed" BOOLEAN NOT NULL,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attempt_userId_finalizedAt_id_idx" ON "Attempt"("userId", "finalizedAt", "id");

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "User_archive_requires_inactive_student"
    CHECK ("archivedAt" IS NULL OR (NOT "active" AND "role" = 'STUDENT'));

ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_score_range"
    CHECK ("score" BETWEEN 0 AND 100);
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_finalized_after_start"
    CHECK ("finalizedAt" >= "startedAt");
