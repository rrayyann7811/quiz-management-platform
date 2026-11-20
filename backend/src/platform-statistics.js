export async function platformStatistics(db) {
  const [rows] = await db.$queryRaw`
    WITH students AS (
      SELECT COUNT(*)::int AS "totalStudents",
        (COUNT(*) FILTER (WHERE active))::int AS "activeStudents",
        (COUNT(*) FILTER (WHERE NOT active AND "archivedAt" IS NULL))::int AS "inactiveStudents",
        (COUNT(*) FILTER (WHERE "archivedAt" IS NOT NULL))::int AS "archivedStudents"
      FROM "User" WHERE role = 'STUDENT'
    ), quizzes AS (
      SELECT COUNT(*)::int AS "totalQuizzes",
        (COUNT(*) FILTER (WHERE status = 'PUBLISHED'))::int AS "publishedQuizzes",
        (COUNT(*) FILTER (WHERE status = 'DRAFT'))::int AS "draftQuizzes",
        (COUNT(*) FILTER (WHERE status = 'UNPUBLISHED'))::int AS "unpublishedQuizzes",
        (SELECT COUNT(*)::int FROM "Question" s JOIN "Quiz" q ON q.id = s."quizId" WHERE q."archivedAt" IS NULL) AS "totalQuestions"
      FROM "Quiz" WHERE "archivedAt" IS NULL
    ), attempts AS (
      SELECT COUNT(*)::int AS "totalAttempts", COUNT("finalizedAt")::int AS "completedAttempts",
        (COUNT(*) FILTER (WHERE "finalizedAt" IS NOT NULL AND passed))::int AS "passedAttempts",
        (COUNT(*) FILTER (WHERE "finalizedAt" IS NOT NULL AND NOT passed))::int AS "failedAttempts",
        ROUND(AVG(score) FILTER (WHERE "finalizedAt" IS NOT NULL), 2)::float8 AS "averageScore"
      FROM "Attempt"
    )
    SELECT * FROM students CROSS JOIN quizzes CROSS JOIN attempts
  `;
  return rows;
}
