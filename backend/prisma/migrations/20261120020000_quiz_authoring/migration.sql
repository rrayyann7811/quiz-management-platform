-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED');

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "passingPercent" INTEGER NOT NULL,
    "maxAttempts" INTEGER NOT NULL,
    "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
    "thumbnailUrl" TEXT,
    "archivedAt" TIMESTAMP(3),
    "demoKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" UUID NOT NULL,
    "quizId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "marks" INTEGER NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Option" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_demoKey_key" ON "Quiz"("demoKey");

-- CreateIndex
CREATE INDEX "Quiz_categoryId_idx" ON "Quiz"("categoryId");

-- CreateIndex
CREATE INDEX "Quiz_status_archivedAt_idx" ON "Quiz"("status", "archivedAt");

-- CreateIndex
CREATE INDEX "Question_quizId_createdAt_id_idx" ON "Question"("quizId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Option_questionId_position_key" ON "Option"("questionId", "position");

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Category_name_ci_key" ON "Category" (lower("name"));
CREATE UNIQUE INDEX "Option_one_correct_per_question" ON "Option" ("questionId") WHERE "isCorrect";
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_assessment_limits"
    CHECK ("durationMinutes" BETWEEN 1 AND 240 AND "passingPercent" BETWEEN 0 AND 100 AND "maxAttempts" BETWEEN 1 AND 20);
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_archived_not_published"
    CHECK ("archivedAt" IS NULL OR "status" <> 'PUBLISHED');
ALTER TABLE "Question" ADD CONSTRAINT "Question_marks_range" CHECK ("marks" BETWEEN 1 AND 100);
ALTER TABLE "Option" ADD CONSTRAINT "Option_position_range" CHECK ("position" BETWEEN 0 AND 5);
