-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'TIMED_OUT');

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "answers" JSONB,
ADD COLUMN     "correctCount" INTEGER,
ADD COLUMN     "elapsedSeconds" INTEGER,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "incorrectCount" INTEGER,
ADD COLUMN     "maximumMarks" INTEGER,
ADD COLUMN     "obtainedMarks" INTEGER,
ADD COLUMN     "quizId" UUID,
ADD COLUMN     "snapshot" JSONB,
ADD COLUMN     "status" "AttemptStatus",
ADD COLUMN     "unansweredCount" INTEGER,
ALTER COLUMN "finalizedAt" DROP NOT NULL,
ALTER COLUMN "score" DROP NOT NULL,
ALTER COLUMN "passed" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Attempt_userId_quizId_idx" ON "Attempt"("userId", "quizId");

-- CreateIndex
CREATE INDEX "Attempt_quizId_idx" ON "Attempt"("quizId");

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Attempt_one_in_progress" ON "Attempt" ("userId", "quizId")
    WHERE "status" = 'IN_PROGRESS';

ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_lifecycle" CHECK (
    CASE
        WHEN "status" IS NULL THEN
            "quizId" IS NULL AND "expiresAt" IS NULL AND "snapshot" IS NULL AND "answers" IS NULL
            AND "finalizedAt" IS NOT NULL AND "score" IS NOT NULL AND "passed" IS NOT NULL
            AND "correctCount" IS NULL AND "incorrectCount" IS NULL AND "unansweredCount" IS NULL
            AND "maximumMarks" IS NULL AND "obtainedMarks" IS NULL AND "elapsedSeconds" IS NULL
        ELSE
            "quizId" IS NOT NULL AND "expiresAt" IS NOT NULL AND "expiresAt" > "startedAt"
            AND "snapshot" IS NOT NULL AND jsonb_typeof("snapshot") = 'object'
            AND "answers" IS NOT NULL AND jsonb_typeof("answers") = 'object'
            AND CASE
                WHEN "status" = 'IN_PROGRESS' THEN
                    "finalizedAt" IS NULL AND "score" IS NULL AND "passed" IS NULL
                    AND "correctCount" IS NULL AND "incorrectCount" IS NULL AND "unansweredCount" IS NULL
                    AND "maximumMarks" IS NULL AND "obtainedMarks" IS NULL AND "elapsedSeconds" IS NULL
                ELSE
                    "finalizedAt" IS NOT NULL AND "score" IS NOT NULL AND "passed" IS NOT NULL
                    AND "finalizedAt" <= "expiresAt"
                    AND ("status" = 'TIMED_OUT') = ("finalizedAt" = "expiresAt")
                    AND "correctCount" IS NOT NULL AND "correctCount" >= 0
                    AND "incorrectCount" IS NOT NULL AND "incorrectCount" >= 0
                    AND "unansweredCount" IS NOT NULL AND "unansweredCount" >= 0
                    AND "maximumMarks" IS NOT NULL AND "maximumMarks" > 0
                    AND "obtainedMarks" IS NOT NULL AND "obtainedMarks" BETWEEN 0 AND "maximumMarks"
                    AND "elapsedSeconds" IS NOT NULL AND "elapsedSeconds" >= 0
            END
    END
);

CREATE FUNCTION enforce_attempt_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."finalizedAt" IS NOT NULL THEN
        RAISE EXCEPTION 'Finalized attempts cannot be updated' USING ERRCODE = '23514';
    END IF;
    IF ROW(NEW.id, NEW."userId", NEW."quizId", NEW."quizTitle", NEW."startedAt", NEW."expiresAt", NEW.snapshot)
        IS DISTINCT FROM ROW(OLD.id, OLD."userId", OLD."quizId", OLD."quizTitle", OLD."startedAt", OLD."expiresAt", OLD.snapshot) THEN
        RAISE EXCEPTION 'Attempt identity, deadline and snapshot cannot be updated' USING ERRCODE = '23514';
    END IF;
    IF NEW."finalizedAt" IS NOT NULL AND NEW.answers IS DISTINCT FROM OLD.answers THEN
        RAISE EXCEPTION 'Answers cannot change during finalization' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "Attempt_protect_history" BEFORE UPDATE ON "Attempt"
    FOR EACH ROW EXECUTE FUNCTION enforce_attempt_update();
