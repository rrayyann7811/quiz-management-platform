import { PrismaClient } from '@prisma/client';

const fixtures = [
  {
    category: 'Web Foundations', key: 'html', title: 'HTML Fundamentals',
    description: 'Practice semantic elements, navigation, and accessible images.',
    questions: [
      ['Which element marks the primary content of a page?', ['<main>', '<aside>', '<footer>'], '<main> identifies the dominant content of the document body.'],
      ['Which attribute supplies a text alternative for an image?', ['alt', 'title', 'src'], 'The alt attribute supplies text for users who cannot see the image.'],
      ['Which attribute sets the destination of a link?', ['href', 'src', 'target'], 'href gives the URL the anchor navigates to. The target attribute controls where it opens.'],
    ],
  },
  {
    category: 'Web Foundations', key: 'css', title: 'CSS Basics',
    description: 'Review selectors, the box model, and common layout properties.',
    questions: [
      ['Which selector matches an element with class card?', ['.card', '#card', 'card'], 'A dot introduces a class selector. A hash introduces an ID selector.'],
      ['Which property adds space between content and its border?', ['padding', 'margin', 'gap'], 'Padding is inside the border. Margin is outside it.'],
      ['Which declaration creates a flex container?', ['display: flex', 'position: flex', 'flex: 1'], 'display: flex lays out the element’s direct children as flex items.'],
    ],
  },
  {
    category: 'Programming', key: 'javascript', title: 'JavaScript Fundamentals',
    description: 'Review declarations, array transformations, and comparisons.',
    questions: [
      ['Which declaration prevents reassignment of a binding?', ['const', 'let', 'var'], 'A const binding cannot be reassigned. An object stored in that binding can still be mutated.'],
      ['What does [1, 2, 3].map(n => n * 2) return?', ['[2, 4, 6]', '[1, 2, 3]', '6'], 'map calls the function for each item and returns an array of the transformed values.'],
      ['What does 2 === "2" evaluate to?', ['false', 'true', 'undefined'], 'Strict equality compares values without coercion, so a number and a string are unequal.'],
    ],
  },
  {
    category: 'Programming', key: 'python', title: 'Python Basics',
    description: 'Review collections, iteration, and basic Python expressions.',
    questions: [
      ['Which expression creates an empty list?', ['[]', '{}', '()'], 'Square brackets create a list literal. Braces here create a dictionary and parentheses create a tuple.'],
      ['What is list(range(3))?', ['[0, 1, 2]', '[1, 2, 3]', '[0, 1, 2, 3]'], 'range(3) begins at zero and excludes its stop value, three.'],
      ['What does len("quiz") return?', ['4', '3', '5'], 'len returns the number of elements. The string quiz contains four characters.'],
    ],
  },
  {
    category: 'Databases', key: 'database', title: 'Database Fundamentals',
    description: 'Review relational keys, filtering, and joins.',
    questions: [
      ['Which constraint identifies each row uniquely and disallows null?', ['PRIMARY KEY', 'DEFAULT', 'CHECK'], 'A primary key enforces both uniqueness and non-nullability for its columns.'],
      ['Which SQL clause filters rows before grouping?', ['WHERE', 'ORDER BY', 'HAVING'], 'WHERE filters input rows. HAVING filters groups after aggregation.'],
      ['Which join keeps all rows from the left table even without a match?', ['LEFT JOIN', 'INNER JOIN', 'CROSS JOIN'], 'LEFT JOIN retains unmatched left rows with null values in the right-side columns.'],
    ],
  },
];

const url = new URL(process.env.DATABASE_URL ?? 'invalid:');
const database = url.pathname.slice(1);
const allowedDatabase = /^quiz_platform(?:_[a-z0-9]+)*$/.test(database);
if (process.env.NODE_ENV === 'production' || process.env.SEED_DEMO !== '1'
    || !['postgresql:', 'postgres:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || !allowedDatabase || url.search || url.hash) {
  throw new Error('Demo seeding requires SEED_DEMO=1 and an unmodified local quiz_platform database URL.');
}

const db = new PrismaClient();
try {
  const [{ server, name }] = await db.$queryRaw`SELECT host(inet_server_addr()) AS server, current_database() AS name`;
  if (name !== database || !['127.0.0.1', '::1'].includes(server)) {
    throw new Error('Demo seed refused a database that did not identify itself as local.');
  }
  const added = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(20261120, 3)`;
    let count = 0;
    for (const fixture of fixtures) {
      if (await tx.quiz.findUnique({ where: { demoKey: fixture.key }, select: { id: true } })) continue;
      const [category] = await tx.$queryRaw`
        INSERT INTO "Category" (id, name, "updatedAt")
        VALUES (gen_random_uuid(), ${fixture.category}, CURRENT_TIMESTAMP)
        ON CONFLICT (lower(name)) DO UPDATE SET name = "Category".name
        RETURNING id
      `;
      await tx.quiz.create({
        data: {
          demoKey: fixture.key, title: fixture.title, description: fixture.description, categoryId: category.id,
          difficulty: 'EASY', durationMinutes: 10, passingPercent: 60, maxAttempts: 3, status: 'PUBLISHED',
          questions: { create: fixture.questions.map(([question, options, explanation], index) => ({
            text: question, explanation, marks: index + 1, difficulty: index === 2 ? 'MEDIUM' : 'EASY',
            options: { create: options.map((text, originalPosition) => ({
              text, position: (originalPosition + index) % options.length, isCorrect: originalPosition === 0,
            })) },
          })) },
        },
      });
      count += 1;
    }
    return count;
  }, { timeout: 15000 });
  console.log(`Added ${added} demonstration quizzes.`);
} finally {
  await db.$disconnect();
}
