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
const { validateStageMarkdown, parseStageTasks, parseStageBlock } = await import(
  "../src/lib/constructor/stageValidators.ts"
);
const { pickTechniqueForStage, getTechniquesForStage } = await import(
  "../src/lib/constructor/stageTechniques.ts"
);
const { isDuplicateTask } = await import("../src/lib/constructor/stageTaskDiversity.ts");
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

// --- constructor: stage validator (methodological block v3) ---
const profile = resolveSubjectProfile("Математика", "8");
const activationStage = getStageDefinition("new_knowledge", "knowledge_activation");
const activationTechnique = pickTechniqueForStage("knowledge_activation", 2, "Уравнения", []);

const badStage = `## Актуализация\nВремя: 5 мин\nУчитель: Обсудите.\nУченики: Думают.`;
const badVal = validateStageMarkdown(badStage, activationStage, profile);
assert.equal(badVal.ok, false);

const goodStage = `## Актуализация знаний
Время: 10 мин
Цель: Актуализировать опорные знания по линейным уравнениям и зафиксировать затруднение в пробном действии.
Методический приём: ${activationTechnique.name}
Речь учителя: «Откройте тетради. Решите уравнение x + 2 = 5. Если получите другой ответ — запишите ход решения и отметьте, на каком шаге возникло затруднение при переносе слагаемого.»
Предполагаемые ответы учеников:
- «x = 3»
- «x = 5, перенёс 2 неправильно»
- Типичное затруднение: ошибка при переносе слагаемого через знак равенства
Ученики: Выполняют пробное действие в тетради, сравнивают ответы, фиксируют затруднение при переносе слагаемого.
Задание 3.1: Решите уравнение x + 2 = 5 и запишите проверку подстановкой.
Ответ: x = 3; проверка: 3 + 2 = 5.
Ожидаемый результат: Учащиеся вспомнили способ решения простых уравнений и осознали затруднение при переносе слагаемого.
Методический комментарий: Не объясняйте новый способ — только зафиксируйте типичную ошибку для последующего этапа.`;
const goodVal = validateStageMarkdown(goodStage, activationStage, profile, {
  requiredTechnique: activationTechnique,
  topic: "Уравнения",
});
assert.equal(goodVal.ok, true);

const parsedBlock = parseStageBlock(goodStage);
assert.ok(parsedBlock.goal?.includes("Актуализировать"));
assert.ok(parsedBlock.technique?.includes(activationTechnique.name.split(" ")[0]));
assert.ok(parsedBlock.teacherSpeech?.includes("«"));
assert.ok(parsedBlock.studentAnswers?.includes("затруднен"));

const parsedTasks = parseStageTasks(goodStage);
assert.equal(parsedTasks.length, 1);
assert.ok(parsedTasks[0].condition.length >= 12);
assert.ok(parsedTasks[0].answer?.includes("x = 3"));

const genericSpeechStage = `## Актуализация знаний
Время: 10 мин
Цель: Актуализация опорных знаний по уравнениям с фиксацией затруднения.
Методический приём: ${activationTechnique.name}
Речь учителя: Учитель организует обсуждение.
Предполагаемые ответы учеников:
- вариант 1
- вариант 2
Ученики: Выполняют пробное действие, фиксируют затруднение.
Задание 3.1: Решите уравнение x + 1 = 4.
Ответ: x = 3.
Ожидаемый результат: Зафиксировано затруднение при решении уравнений.
Методический комментарий: Контролируйте записи в тетради.`;
const genericSpeechVal = validateStageMarkdown(genericSpeechStage, activationStage, profile, {
  requiredTechnique: activationTechnique,
});
assert.equal(genericSpeechVal.ok, false);
assert.ok(genericSpeechVal.issues.some((i) => i.code === "missing_teacher_speech" || i.code === "generic_teacher_speech"));

const emptyAnswerStage = `## Актуализация
Время: 10 мин
Цель: Актуализация.
Методический приём: Блиц-опрос
Речь учителя: «Решите уравнение в тетради и отметьте затруднение, если оно возникнет при переносе слагаемого через знак равенства.»
Предполагаемые ответы учеников:
- «x = 3»
- «не получилось»
- Типичное затруднение: ошибка переноса
Ученики: Выполняют пробное действие, фиксируют затруднение.
Задание 3.1. Решите уравнение x + 2 = 5.
Ответ:`;
const emptyAnswerVal = validateStageMarkdown(emptyAnswerStage, activationStage, profile);
assert.equal(emptyAnswerVal.ok, false);
assert.ok(emptyAnswerVal.issues.some((i) => i.code === "empty_answer"));

const placeholderStage = `## Актуализация
Время: 10 мин
Цель: TODO
Методический приём: Кластер
Речь учителя: «...»
Предполагаемые ответы учеников:
- ...
- ...
Ученики: ...
Задание 3.1. Задача на уравнение с переносом слагаемого.
Ответ: TBD
Ожидаемый результат: ...
Методический комментарий: TBD`;
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
const consolidationTechnique = pickTechniqueForStage("primary_consolidation", 5, "Уравнения", []);
const pollStage = `## Первичное закрепление
Время: 10 мин
Цель: Закрепить способ решения линейных уравнений через самостоятельную работу.
Методический приём: ${consolidationTechnique.name}
Речь учителя: «Сейчас проведём фронтальный опрос класса по уравнениям — ответьте устно на мои вопросы.»
Предполагаемые ответы учеников:
- «x = 2»
- «забыл перенести»
Ученики: Отвечают устно на вопросы учителя.
Задание 6.1. Тренировочная задача: вычислите значение выражения 2+2.
Ответ: 4.
Ожидаемый результат: Учащиеся применяют способ решения уравнений.
Методический комментарий: Сверяйте ответы с эталоном.`;
const pollVal = validateStageMarkdown(pollStage, consolidationStage, profile, {
  requiredTechnique: consolidationTechnique,
});
assert.equal(pollVal.ok, false);
assert.ok(pollVal.issues.some((i) => i.code === "stage_content_rule" || i.code === "forbidden_pattern"));

const goodConsolidation = `## Первичное закрепление
Время: 10 мин
Цель: Закрепить способ решения линейных уравнений методом переноса слагаемых.
Методический приём: ${consolidationTechnique.name}
Речь учителя: «Решите в тетради три уравнения самостоятельно. После решения сверьтесь с эталоном на доске и отметьте, где была ошибка.»
Предполагаемые ответы учеников:
- «все верно»
- «ошибся в переносе»
- Типичное затруднение: знак при переносе слагаемого
Ученики: Выполняют тренировочные задания на применение способа, сверяются с эталоном.
Задание 6.1. Задача: решите уравнение 3x - 6 = 0 методом переноса слагаемых.
Ответ: x = 2.
Ожидаемый результат: Учащиеся самостоятельно применяют открытый способ решения линейных уравнений.
Методический комментарий: При затруднении напомните про перенос слагаемого через знак равенства.`;
const goodConsolidationVal = validateStageMarkdown(goodConsolidation, consolidationStage, profile, {
  requiredTechnique: consolidationTechnique,
});
assert.equal(goodConsolidationVal.ok, true);

assert.ok(getTechniquesForStage("reflection").some((t) => t.name === "Светофор"));
assert.ok(isDuplicateTask("Найти гипотенузу в прямоугольном треугольнике", ["Найти гипотенузу по теореме Пифагора"]));

const duplicateVal = validateStageMarkdown(goodConsolidation, consolidationStage, profile, {
  requiredTechnique: consolidationTechnique,
  previousTaskConditions: ["Решите уравнение 3x - 6 = 0 методом переноса слагаемых"],
});
assert.equal(duplicateVal.ok, false);
assert.ok(duplicateVal.issues.some((i) => i.code === "duplicate_task"));

const problemStage = getStageDefinition("new_knowledge", "problem_situation_goal");
const problemTechnique = pickTechniqueForStage("problem_situation_goal", 1, "Теорема Пифагора", []);
const prematureProblem = `## Создание проблемной ситуации
Время: 8 мин
Цель: Создать познавательное затруднение по теме теорема Пифагора.
Методический приём: ${problemTechnique.name}
Речь учителя: «Найдите гипотенузу в прямоугольном треугольнике со сторонами 3 и 4, применяя теорему Пифагора и формулу c² = a² + b².»
Предполагаемые ответы учеников:
- «c = 5»
- «не знаю формулу»
- Типичное затруднение: не знают теорему Пифагора
Ученики: Решают задачу в тетради, применяя формулу теоремы Пифагора.
Задание 2.1: Найдите гипотенузу треугольника с катетами 3 и 4, используя теорему Пифагора.
Ответ: c = 5.
Ожидаемый результат: Учащиеся осознают необходимость нового способа.
Методический комментарий: Не давайте готовый алгоритм — только затруднение.`;
const prematureVal = validateStageMarkdown(prematureProblem, problemStage, profile, {
  requiredTechnique: problemTechnique,
  topic: "Теорема Пифагора",
});
assert.equal(prematureVal.ok, false);
assert.ok(
  prematureVal.issues.some((i) =>
    ["premature_solution", "stage_content_rule", "forbidden_pattern"].includes(i.code),
  ),
);

// --- constructor: assemble plan ---
const assembled = assembleLessonMarkdown({
  lessonType: "new_knowledge",
  selectedStageIds: ["organizational_moment", "knowledge_activation"],
  stageResults: [
    {
      stageId: "organizational_moment",
      title: "Организационный момент",
      markdown: `## Организационный момент
Время: 2 мин
Цель: Подготовить класс к уроку.
Методический приём: Пробный вопрос
Речь учителя: «Здравствуйте! Проверьте готовность к уроку.»
Предполагаемые ответы учеников:
- «готовы»
- «нужна тетрадь»
- Типичное затруднение: шум
Ученики: Готовят рабочее место.
Ожидаемый результат: Класс готов к работе.
Методический комментарий: Кратко, без нового материала.`,
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

// --- materials search ranking v2 ---
const { rankAndLimitMaterials, scoreMaterial, extractYear } = await import(
  "../src/lib/materialsSearchRanking.ts"
);

assert.equal(extractYear("18 мая 2012 г. Условный оператор"), 2012);
assert.equal(extractYear("17 февр. 2009 г. материал"), 2009);
assert.equal(extractYear("20 июл. 2013 г. урок"), 2013);

const rankCtx = { query: "дроби", subject: "Математика", grade: "5" };

const oldIrrelevant = {
  title: "Общая методическая статья 2010",
  snippet: "советы педагогам без темы",
  url: "https://urok.1sept.ru/publication/old1",
};
const oldRelevant = {
  title: "Дроби для начальной школы 2010",
  snippet: "конспект урока",
  url: "https://urok.1sept.ru/publication/old2",
};
const freshRelevant = {
  title: "Дроби обыкновенные",
  snippet: "конспект урока 5 класс математика 2024",
  url: "https://urok.1sept.ru/publication/new1",
};

const oldGateBad = scoreMaterial(oldIrrelevant, rankCtx);
assert.equal(oldGateBad.passesStrictGate, false);

const oldGateGood = scoreMaterial(oldRelevant, rankCtx);
assert.equal(oldGateGood.passesStrictGate, true);

const strictPool = [
  oldIrrelevant,
  oldRelevant,
  freshRelevant,
  {
    title: "Дроби: практикум 2022",
    snippet: "математика 5 класс конспект",
    url: "https://urok.1sept.ru/publication/p1",
  },
  {
    title: "Дроби: задания 2023",
    snippet: "математика 5 класс",
    url: "https://urok.1sept.ru/publication/p2",
  },
];
const strictRanked = rankAndLimitMaterials(strictPool, 10, rankCtx);
assert.ok(!strictRanked.some((r) => r.title.includes("Общая методическая")));
assert.ok(strictRanked[0].title.toLowerCase().includes("дроби"));

const g5 = {
  title: "Дроби 5 класс конспект урока",
  snippet: "математика задания",
  url: "https://urok.1sept.ru/publication/g5",
};
const g8 = {
  title: "Дроби 8 класс конспект урока",
  snippet: "математика задания",
  url: "https://urok.1sept.ru/publication/g8",
};
const gradeRanked = rankAndLimitMaterials([g8, g5], 2, rankCtx);
assert.equal(gradeRanked[0].title, g5.title);

const noTopic = {
  title: "Новости школы",
  snippet: "объявление мероприятия",
  url: "https://urok.1sept.ru/publication/news",
};
const withTopic = {
  title: "Дроби конспект",
  snippet: "урок математика",
  url: "https://urok.1sept.ru/publication/ok",
};
assert.ok(
  scoreMaterial(withTopic, rankCtx).breakdown.finalScore >
    scoreMaterial(noTopic, rankCtx).breakdown.finalScore,
);

const konspekt = {
  title: "Конспект урока: дроби",
  snippet: "математика 5 класс",
  url: "https://urok.1sept.ru/publication/k",
};
const news = {
  title: "Новости образования",
  snippet: "анонс конкурса",
  url: "https://urok.1sept.ru/publication/n",
};
const typeRanked = rankAndLimitMaterials([news, konspekt], 2, rankCtx);
assert.ok(typeRanked[0].title.toLowerCase().includes("конспект"));

const sparseCandidates = [
  { title: "Старый материал 2008", snippet: "общее", url: "https://urok.1sept.ru/publication/s1" },
  { title: "Старый материал 2009", snippet: "общее", url: "https://urok.1sept.ru/publication/s2" },
  { title: "Старый материал 2011", snippet: "общее", url: "https://urok.1sept.ru/publication/s3" },
  { title: "Старый материал 2012", snippet: "общее", url: "https://urok.1sept.ru/publication/s4" },
  {
    title: "Дроби конспект 5 класс",
    snippet: "математика дроби 2024",
    url: "https://urok.1sept.ru/publication/s5",
  },
];
const relaxedRanked = rankAndLimitMaterials(sparseCandidates, 10, rankCtx, {
  minStrictResults: 3,
});
assert.ok(relaxedRanked.length >= 3);

assert.ok(rankAndLimitMaterials([konspekt], 1, rankCtx)[0].meta?.materialType);

console.log("All fixture checks passed.");
