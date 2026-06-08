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
const { embedAnswerKeysInStages } = await import("../src/lib/embedAnswerKeysInStages.ts");
const {
  getLessonTypeStages,
  getStageDefinition,
  allocateStageMinutes,
  requiredStageIds,
  LESSON_TYPE_IDS,
} = await import("../src/lib/constructor/stageRegistry.ts");
const { resolveConstructorFrpContext } = await import("../src/lib/constructor/frpContext.ts");
const { assembleLessonMarkdown } = await import("../src/lib/constructor/assemblePlan.ts");
const { validateStageMarkdown, parseStageTasks } = await import(
  "../src/lib/constructor/stageValidators.ts"
);
const { resolveSubjectProfile } = await import("../src/lib/constructor/subjectProfiles.ts");
const { validateAssembledLesson } = await import("../src/lib/lessonPlanValidator.ts");

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

// --- answer keys embedded in stages ---
const endKeys = embedAnswerKeysInStages(`
## Этап 6
Задание 6.1
Постройте треугольники.

**Ключи к заданиям**
Задание 6.1
Ответ: Треугольники равны.
`);
assert.ok(!endKeys.includes("**Ключи к заданиям**"));
assert.ok(endKeys.includes("Ответ: Треугольники равны."));

const endKeysFail = validateLessonPlan(
  `## Этап\nЗадание 3.1\nНайдите c.\n\n**Ключи к заданиям**\nЗадание 3.1\nОтвет: 5 см`,
  { subject: "Математика", grade: "8", topic: "T", mode: "mathematics", selectedStages: [] },
);
assert.ok(endKeysFail.issues.some((i) => i.code === "answer_keys_at_end"));

// --- constructor: FGOS registry ---
assert.equal(LESSON_TYPE_IDS.length, 3);
for (const lt of LESSON_TYPE_IDS) {
  const stages = getLessonTypeStages(lt);
  assert.ok(stages.length >= 7, `${lt} has stages`);
  assert.ok(stages.some((s) => s.fgosFlag === "required"), `${lt} has required`);
}
assert.ok(getStageDefinition("new_knowledge", "knowledge_activation"));
assert.equal(requiredStageIds("new_knowledge").includes("primary_acquisition"), true);

const minutes = allocateStageMinutes("new_knowledge", requiredStageIds("new_knowledge"), 45);
const sum = Object.values(minutes).reduce((a, b) => a + b, 0);
assert.equal(sum, 45);

// --- constructor: FRP context ---
const frpCtx = resolveConstructorFrpContext("Информатика", "8", "Условный оператор");
assert.equal(frpCtx.available, true);
if (frpCtx.available) {
  assert.ok(frpCtx.topic.title.length > 3);
  assert.ok(Array.isArray(frpCtx.concepts));
  assert.ok(frpCtx.results.subject.length >= 0);
}

// --- constructor: stage validator ---
const profile = resolveSubjectProfile("Математика", "8");
const activationStage = getStageDefinition("new_knowledge", "knowledge_activation");
const badStage = `## Актуализация\nВремя: 5 мин\nУчитель: Обсудите.\nУченики: Думают.`;
const badVal = validateStageMarkdown(badStage, activationStage, profile);
assert.equal(badVal.ok, false);

const goodStage = `## Актуализация знаний
Время: 10 мин
Учитель: Даёт пробное задание.
Ученики: Выполняют пробное действие, фиксируют затруднение — разные ответы.
Задание 3.1. Задача: решите уравнение x + 2 = 5.
Ответ: x = 3.`;
const goodVal = validateStageMarkdown(goodStage, activationStage, profile);
assert.equal(goodVal.ok, true);

const parsedTasks = parseStageTasks(goodStage);
assert.equal(parsedTasks.length, 1);
assert.ok(parsedTasks[0].condition.length >= 12);
assert.equal(parsedTasks[0].answer, "x = 3.");

const emptyAnswerStage = `## Актуализация
Время: 10 мин
Учитель: Даёт задание.
Ученики: Выполняют пробное действие, фиксируют затруднение.
Задание 3.1. Решите уравнение.
Ответ:`;
const emptyAnswerVal = validateStageMarkdown(emptyAnswerStage, activationStage, profile);
assert.equal(emptyAnswerVal.ok, false);
assert.ok(emptyAnswerVal.issues.some((i) => i.code === "empty_answer"));

const placeholderStage = `## Актуализация
Время: 10 мин
Учитель: TODO
Ученики: ...
Задание 3.1. Задача.
Ответ: TBD`;
const placeholderVal = validateStageMarkdown(placeholderStage, activationStage, profile);
assert.equal(placeholderVal.ok, false);
assert.ok(
  placeholderVal.issues.some((i) =>
    ["empty_teacher_activity", "empty_student_activity", "empty_answer", "placeholder_condition"].includes(
      i.code,
    ),
  ),
);

const consolidationStage = getStageDefinition("new_knowledge", "primary_consolidation");
const pollStage = `## Первичное закрепление
Время: 10 мин
Учитель: Проводит фронтальный опрос класса.
Ученики: Отвечают устно.
Задание 6.1. Тренировочная задача: вычислите 2+2.
Ответ: 4.`;
const pollVal = validateStageMarkdown(pollStage, consolidationStage, profile);
assert.equal(pollVal.ok, false);
assert.ok(pollVal.issues.some((i) => i.code === "stage_content_rule" || i.code === "forbidden_pattern"));

const goodConsolidation = `## Первичное закрепление
Время: 10 мин
Учитель: Организует самостоятельное решение задач, даёт эталон для самопроверки.
Ученики: Выполняют тренировочные задания, сверяются с эталоном.
Задание 6.1. Задача: решите 3x - 6 = 0.
Ответ: x = 2.
Пояснение для учителя: при затруднении напомните про перенос слагаемого.`;
const goodConsolidationVal = validateStageMarkdown(goodConsolidation, consolidationStage, profile);
assert.equal(goodConsolidationVal.ok, true);

// --- constructor: assemble plan ---
const assembled = assembleLessonMarkdown({
  lessonType: "new_knowledge",
  selectedStageIds: ["organizational_moment", "knowledge_activation"],
  stageResults: [
    {
      stageId: "organizational_moment",
      title: "Организационный момент",
      markdown: "## Организационный момент\nВремя: 2 мин\nУчитель: Привет.\nУченики: Готовятся.",
      summary: "Орг",
      attempts: 1,
    },
    {
      stageId: "knowledge_activation",
      title: "Актуализация знаний",
      markdown: goodStage,
      summary: "Акт",
      attempts: 1,
    },
  ],
  subject: "Математика",
  grade: "8",
  topic: "Уравнения",
  goal: "Решать линейные уравнения",
});
assert.ok(assembled.includes("Задание 2.1"));
assert.ok(assembled.includes("План урока"));

const assembledVal = validateAssembledLesson(assembled, {
  subject: "Математика",
  grade: "8",
  topic: "Уравнения",
  mode: "mathematics",
  selectedStages: ["Организационный момент", "Актуализация знаний"],
  lessonType: "new_knowledge",
  selectedStageIds: ["organizational_moment", "knowledge_activation"],
  frpContext: frpCtx,
});
assert.ok(Array.isArray(assembledVal.failedStageIds));

console.log("All fixture checks passed.");
