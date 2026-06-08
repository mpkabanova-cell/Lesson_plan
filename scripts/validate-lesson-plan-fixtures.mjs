import assert from "node:assert/strict";

// Run: npm run test:fixtures

const { resolveSubjectGenerationMode } = await import(
  "../src/lib/subjectGenerationMode.ts"
);
const { validateLessonPlan } = await import("../src/lib/lessonPlanValidator.ts");
const { compareFingerprints, extractLessonFingerprint } = await import(
  "../src/lib/lessonPlanDiversity.ts"
);
const { SUBJECT_OPTIONS } = await import("../src/config/subjectClassMap.ts");

// --- subject mode ---
assert.equal(resolveSubjectGenerationMode("История", "8"), "humanities");
assert.equal(resolveSubjectGenerationMode("Русский язык", "6"), "languages");
assert.equal(resolveSubjectGenerationMode("Физика", "9"), "natural_sciences");
assert.equal(resolveSubjectGenerationMode("Алгебра", "8"), "mathematics");
assert.equal(resolveSubjectGenerationMode("Математика", "3"), "primary");
assert.equal(resolveSubjectGenerationMode("Окружающий мир", "2"), "primary");

for (const subject of SUBJECT_OPTIONS) {
  const mode = resolveSubjectGenerationMode(subject, "5");
  assert.ok(mode, `mode for ${subject}`);
}

// --- validator: shallow discussion lesson fails ---
const shallow = `
## Мотивация к учебной деятельности
Время: 5 мин
Учитель: Обсудите тему.
Ученики: Обсудите и подумайте.

## Актуализация знаний и пробное действие
Время: 10 мин
Учитель: Подумайте и ответьте.

## Выявление места и причины затруднения
Время: 5 мин

## Построение проекта выхода из затруднения
Время: 10 мин

## Реализация построенного проекта
Время: 10 мин
Ученики: Сформулируйте ответ.
`;

const shallowResult = validateLessonPlan(shallow, {
  subject: "История",
  grade: "8",
  topic: "Тест",
  mode: "humanities",
  selectedStages: [],
});
assert.equal(shallowResult.ok, false);
assert.ok(
  shallowResult.issues.some((i) =>
    ["subject_content", "discussion_heavy", "tasks_count", "opening_materials"].includes(i.code),
  ),
);

// --- validator: rich lesson passes ---
const rich = `
## Актуализация знаний и пробное действие
Время: 10 мин
Ученики: Выполняют пробное задание по источнику.
Задание / материал: Текст источника о событии 1812 года. Таблица дат.

## Выявление места и причины затруднения
Время: 5 мин
Ученики: Столкнулись с затруднением — разные ответы.

## Построение проекта выхода из затруднения
Время: 10 мин
Эталон: 1. Найди причину. 2. Найди следствие.

## Реализация построенного проекта
Время: 10 мин
Задание 1. Объясни причинно-следственную связь по документу.
Задание 2. Найди личность на карте.
Задание 3. Сравни два факта из источника.

## Первичное закрепление с проговариванием
Время: 10 мин
Задание 4. Заполни таблицу событий.
`;

const richResult = validateLessonPlan(rich, {
  subject: "История",
  grade: "8",
  topic: "1812",
  mode: "humanities",
  selectedStages: [],
});
assert.equal(richResult.ok, true);

// --- diversity ---
const fp1 = extractLessonFingerprint(
  "## Актуализация\nУченики: читают текст и заполняют таблицу\nЗадание 1",
  "История",
  "Тема A",
);
const fp2 = extractLessonFingerprint(
  "## Актуализация\nУченики: читают текст и заполняют таблицу\nЗадание 1",
  "История",
  "Тема B",
);
const { maxSimilarity } = compareFingerprints(fp1, [fp2]);
assert.ok(maxSimilarity > 0.3);

console.log("All fixture checks passed.");
