-- AlterTable
ALTER TABLE "User" ADD COLUMN     "leaderboardExcluded" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "User_role_createdAt_idx" ON "User"("role", "createdAt");

-- CreateIndex
CREATE INDEX "Attempt_startedAt_idx" ON "Attempt"("startedAt");

-- CreateIndex
CREATE INDEX "Attempt_finalizedAt_quizId_idx" ON "Attempt"("finalizedAt", "quizId");

CREATE INDEX "Attempt_snapshot_category_finalized_idx"
    ON "Attempt" (("snapshot"->>'categoryId'), "finalizedAt")
    WHERE "finalizedAt" IS NOT NULL AND "quizId" IS NOT NULL;
