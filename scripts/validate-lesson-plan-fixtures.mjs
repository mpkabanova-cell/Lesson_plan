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
const { resolveFrpKnowledgeContext, resolveFrpCanonicalSubject } = await import(
  "../src/lib/knowledge/frpResolve.ts"
);
const { buildFrpSystemPromptBlock, shouldSkipLegacyInformaticsStub } = await import(
  "../src/lib/knowledge/frpUsage.ts"
);
const { convertAllMathToSpans } = await import("../src/lib/convertInlineMathToSpans.ts");
const { consolidateAnswerKeys } = await import("../src/lib/consolidateAnswerKeys.ts");

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

// --- validator: orphan answer keys fail ---
const orphanKeysPlan = `
## Реализация построенного проекта
Время: 10 мин
Задание / материал:
Задание 3.1. Найдите гипотенузу.

**Ключи к заданиям**
Задание 2.1
Ответ: 5 см
Задание 6.1
Ответ: 13 см
`;
const orphanKeysResult = validateLessonPlan(orphanKeysPlan, {
  subject: "Математика",
  grade: "8",
  topic: "Тест",
  mode: "mathematics",
  selectedStages: [],
});
assert.equal(orphanKeysResult.ok, false);
assert.ok(orphanKeysResult.issues.some((i) => i.code === "orphan_answer_keys"));

// --- validator: deferred material fails ---
const deferredPlan = `
## Первичное закрепление
Время: 10 мин
Учитель: «Сравните свои ответы с эталоном, который я вам дам».
Эталон
1. Шаг один.
`;
const deferredResult = validateLessonPlan(deferredPlan, {
  subject: "Математика",
  grade: "8",
  topic: "Тест",
  mode: "mathematics",
  selectedStages: [],
});
assert.ok(deferredResult.issues.some((i) => i.code === "deferred_material"));

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

// --- FRP knowledge ---
assert.equal(resolveFrpCanonicalSubject("Алгебра"), "Математика");
assert.equal(resolveFrpCanonicalSubject("Физика"), null);

const frpInfo = resolveFrpKnowledgeContext("Информатика", "8", "Условный оператор");
assert.equal(frpInfo.available, true);
if (frpInfo.available) {
  assert.equal(frpInfo.canonicalSubject, "Информатика");
  assert.ok(frpInfo.excerpt.length > 200);
  assert.ok(["topic", "topic_partial", "grade", "program"].includes(frpInfo.matchQuality));
  const block = buildFrpSystemPromptBlock(frpInfo);
  assert.ok(block && block.includes("ФЕДЕРАЛЬНАЯ РАБОЧАЯ ПРОГРАММА"));
  assert.equal(shouldSkipLegacyInformaticsStub(frpInfo, "Информатика", "8"), true);
}

const frpHist = resolveFrpKnowledgeContext("История", "8", "Отечественная война 1812 года");
assert.equal(frpHist.available, true);

// --- math spans ---
const mathHtml = convertAllMathToSpans("Теорема: a^2 + b^2 = c^2, пример \\(x^2\\).");
assert.ok(mathHtml.includes('data-latex="a^2 + b^2 = c^2"'));
assert.ok(mathHtml.includes('data-latex="x^2"'));

// --- answer keys consolidation ---
const inlineKeys = consolidateAnswerKeys(`
## Этап
Задание 3.1
Найдите c.
Ответ: 5 см

**Ключи к заданиям**
Задание 3.1
Ответ: 5 см
`);
assert.ok(!inlineKeys.includes("Найдите c.\nОтвет:"));
assert.ok(inlineKeys.includes("**Ключи к заданиям**"));

console.log("All fixture checks passed.");
