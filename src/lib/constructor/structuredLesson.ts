import { aiResponseToHtml } from "@/lib/aiResponseToHtml";
import { convertAllMathToSpans } from "@/lib/convertInlineMathToSpans";
import { embedAnswerKeysInStages } from "@/lib/embedAnswerKeysInStages";
import type { StageResult } from "./constructSession";
import {
  GENERIC_TEACHER_PHRASES,
  STAGE_BLOCK_LABELS,
  type StageMethodologicalBlock,
} from "./stageBlockSchema";
import { hasNewKnowledgeContinuationWording } from "./lessonTypeContentRules";
import {
  getStageDefinition,
  LESSON_TYPE_LABELS,
  type LessonTypeId,
} from "./stageRegistry";
import { parseStageBlock, parseStageTasks, type ParsedStageTask } from "./stageValidators";

export type StageFieldKey =
  | "goal"
  | "teacherSpeech"
  | "studentActions"
  | "expectedAnswers"
  | "task"
  | "answer"
  | "result"
  | "teacherComment";

export type StageMethod = {
  id: string;
  name: string;
  description?: string;
};

export type StructuredLessonStage = {
  id: string;
  title: string;
  time: string;
  goal: string;
  method: StageMethod | null;
  teacherSpeech: string;
  studentActions: string;
  expectedAnswers: string;
  task: string;
  answer: string;
  result: string;
  teacherComment: string;
  sourceMarkdown?: string;
};

export type LessonPassport = {
  lessonTypeLabel: string;
  duration: string;
  kit?: string;
  ktpPlace?: string;
};

export type LessonPlannedResults = {
  subject: string[];
  meta: string[];
  personal: string[];
};

export type LessonFrpCoverage = {
  matchedTopic?: string;
  topicCode?: string;
  section?: string;
  covered: string[];
  deferred: string[];
  note: string;
};

export type StructuredLesson = {
  subject: string;
  grade: string;
  topic: string;
  goal: string;
  durationMinutes: number;
  lessonType: LessonTypeId;
  homework?: string;
  passport?: LessonPassport;
  plannedResults?: LessonPlannedResults;
  frpCoverage?: LessonFrpCoverage;
  materials?: string[];
  crossCuttingQuestion?: string;
  methodologyComment?: string[];
  assessmentCriteria?: string[];
  stages: StructuredLessonStage[];
};

const REPEATED_NEW_TOPIC_OPENING_RE =
  /^\s*«?\s*(?:здравствуйте[!.]?\s*)?(?:(?:сегодня|на\s+этом\s+уроке)\s+мы\s+)?(?:начн[её]м\s+изучать|будем\s+изучать|познакомимся\s+с|откроем|рассмотрим)\s+[^.!?]+[.!?]\s*/i;

function removeRepeatedNewTopicOpening(text: string): string {
  const original = text.trim();
  if (!original) return text;
  const hadOpeningQuote = original.startsWith("«");
  const next = original.replace(REPEATED_NEW_TOPIC_OPENING_RE, "").trimStart();
  if (next === original || !next) return text;
  if (hadOpeningQuote && !next.startsWith("«") && next.includes("»")) {
    return `«${next}`;
  }
  return next;
}

export function sanitizeStructuredLessonStageOpenings(lesson: StructuredLesson): StructuredLesson {
  if (lesson.lessonType !== "new_knowledge") return lesson;

  let changed = false;
  const stages = lesson.stages.map((stage) => {
    if (stage.id === "organizational_moment") return stage;
    const teacherSpeech = removeRepeatedNewTopicOpening(stage.teacherSpeech);
    if (teacherSpeech === stage.teacherSpeech) return stage;
    changed = true;
    return { ...stage, teacherSpeech };
  });

  return changed ? { ...lesson, stages } : lesson;
}

export type StructuredStageIssue = {
  field: StageFieldKey | "method";
  message: string;
};

export type StructuredStageValidation = {
  ok: boolean;
  issues: StructuredStageIssue[];
};

const FIELD_LABELS: Record<StageFieldKey, string> = {
  goal: "Цель этапа",
  teacherSpeech: "Речь учителя",
  studentActions: "Действия учеников",
  expectedAnswers: "Предполагаемые ответы",
  task: "Задание / материал",
  answer: "Ответ / ключ",
  result: "Ожидаемый результат",
  teacherComment: "Комментарий учителю",
};

const PLACEHOLDER_RE = /^(?:\.{2,}|…|tbd|todo|null|—|-)?$/i;
const INLINE_PLACEHOLDER_RE = /(?:^|\s)(?:\.\.\.|…|\bTBD\b|\bTODO\b|\bnull\b)(?:\s|$)/i;
const GENERIC_STUDENT_PHRASES = [
  "ученики отвечают",
  "учащиеся отвечают",
  "ученики выполняют задание",
  "дети отвечают",
];

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

function parseTime(markdown: string, fallbackMinutes?: number): string {
  const m = markdown.match(/^\s*(?:\*\*)?время(?:\*\*)?\s*:\s*(.+)$/im);
  const raw = cleanText(m?.[1]);
  if (raw) return raw;
  return typeof fallbackMinutes === "number" ? `${fallbackMinutes} мин` : "—";
}

function methodIdFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "method";
}

function methodFromTechnique(technique: string): StageMethod | null {
  const name = cleanText(technique);
  if (!name) return null;
  return { id: methodIdFromName(name), name };
}

function taskText(tasks: ParsedStageTask[]): string {
  return tasks.map((task) => task.condition).filter(Boolean).join("\n\n");
}

function answerText(tasks: ParsedStageTask[]): string {
  return tasks
    .map((task) => task.answer)
    .filter((answer): answer is string => Boolean(answer?.trim()))
    .join("\n\n");
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isHistorySubject(subject: string): boolean {
  return subject.toLowerCase().includes("истор");
}

function isMathSubject(subject: string): boolean {
  const lower = subject.toLowerCase();
  return lower.includes("математ") || lower.includes("алгебр") || lower.includes("геометр");
}

function buildPassport(input: {
  subject: string;
  grade: string;
  durationMinutes: number;
  lessonType: LessonTypeId;
  frpMeta?: Record<string, unknown> | null;
}): LessonPassport {
  const section = asString(input.frpMeta?.section);
  return {
    lessonTypeLabel: LESSON_TYPE_LABELS[input.lessonType] ?? input.lessonType,
    duration: `${input.durationMinutes} минут`,
    kit: "УМК и материалы учителя",
    ktpPlace: section ? `Тематический блок ФРП: ${section}` : "Соответствует выбранной теме и классу",
  };
}

function buildCrossCuttingQuestion(subject: string, topic: string, lessonType: LessonTypeId): string {
  if (lessonType !== "new_knowledge") {
    return `Как применить и проверить знания по теме «${topic}»?`;
  }
  if (isHistorySubject(subject)) {
    return `Как тема «${topic}» помогает понять жизнь людей, устройство общества и причины исторических изменений?`;
  }
  if (isMathSubject(subject)) {
    return `Какой новый способ действия по теме «${topic}» мы откроем и где сможем его применить?`;
  }
  return `Какое новое знание по теме «${topic}» мы откроем и как проверим, что поняли его?`;
}

function buildMaterials(subject: string): string[] {
  if (isHistorySubject(subject)) {
    return [
      "учебник и параграф по теме урока",
      "историческая карта или схема",
      "иллюстрации, презентация или короткий видеофрагмент",
      "рабочий лист / карточки для парной или групповой работы",
      "исторический источник или фрагмент текста для анализа",
    ];
  }
  if (isMathSubject(subject)) {
    return [
      "учебник и тетрадь",
      "доска / презентация с примерами",
      "карточки с заданиями разного уровня",
      "эталон решения для самопроверки",
    ];
  }
  return [
    "учебник и тетрадь",
    "презентация или наглядный материал",
    "рабочий лист / карточки",
    "материал для проверки и рефлексии",
  ];
}

function buildPlannedResults(input: {
  subject: string;
  topic: string;
  goal: string;
  frpMeta?: Record<string, unknown> | null;
}): LessonPlannedResults {
  const matchedTopic = asString(input.frpMeta?.topic);
  const topicLabel = matchedTopic || input.topic;
  return {
    subject: [
      `объяснять ключевые понятия и факты по теме «${topicLabel}»`,
      `выполнять предметные задания по теме «${input.topic}» с опорой на новый способ действия`,
      `применять новое знание по теме «${input.topic}» для решения учебных задач и самопроверки по эталону`,
    ],
    meta: [
      "анализировать учебный материал, карту, схему, источник или задачу",
      "выделять причинно-следственные связи и аргументировать ответ",
      "работать в паре или группе, фиксировать выводы и оценивать результат",
    ],
    personal: [
      "проявлять познавательный интерес к изучаемой теме",
      "осознавать ценность учебного сотрудничества и уважительного обсуждения",
      "соотносить новое знание с личным учебным опытом",
    ],
  };
}

function buildFrpCoverage(
  lessonType: LessonTypeId,
  frpMeta?: Record<string, unknown> | null,
): LessonFrpCoverage {
  const topic = asString(frpMeta?.topic);
  const section = asString(frpMeta?.section);
  const topicCode = asString(frpMeta?.topicCode);
  const nextTopic = asString(frpMeta?.nextTopic);
  const covered = [
    topic ? `тема ФРП: ${topic}` : "содержание урока соотнесено с выбранной темой",
    section ? `раздел: ${section}` : "",
    topicCode ? `код/позиция: ${topicCode}` : "",
  ].filter(Boolean);
  return {
    matchedTopic: topic || undefined,
    topicCode: topicCode || undefined,
    section: section || undefined,
    covered,
    deferred: nextTopic ? [`следующая тема / расширение: ${nextTopic}`] : [],
    note:
      lessonType === "new_knowledge"
        ? "Урок открывает новую тему; пройденный материал используется только как опора для актуализации."
        : "Содержание урока соотнесено с выбранным типом урока и ФРП-контекстом.",
  };
}

function buildMethodologyComment(stages: StructuredLessonStage[], question: string): string[] {
  const techniques = Array.from(
    new Set(stages.map((stage) => stage.method?.name).filter((name): name is string => Boolean(name))),
  );
  return [
    `Сквозной вопрос урока: ${question}`,
    techniques.length
      ? `Используемые приёмы: ${techniques.join(", ")}.`
      : "Методические приёмы подбираются под логику этапов.",
    "Предметное содержание должно быть связано с учебником, ФРП и конкретными заданиями для учащихся.",
    "Домашнее задание желательно давать в базовом и повышенном вариантах.",
  ];
}

function buildAssessmentCriteria(): string[] {
  return [
    "«5» — активно участвует в обсуждении, даёт полные ответы, верно выполняет задания и аргументирует выводы.",
    "«4» — работает активно, допускает 1–2 неточности, исправляет их после обсуждения или самопроверки.",
    "«3» — выполняет базовые действия с помощью учителя, ответы неполные, есть затруднения в применении нового знания.",
  ];
}

export function structuredStageFromStageResult(input: {
  result: StageResult;
  lessonType: LessonTypeId;
  minutes?: number;
}): StructuredLessonStage {
  const block = parseStageBlock(input.result.markdown);
  const tasks = parseStageTasks(input.result.markdown);
  const fallbackTitle =
    getStageDefinition(input.lessonType, input.result.stageId)?.title ??
    input.result.title ??
    input.result.stageId;

  return {
    id: input.result.stageId,
    title: input.result.title || fallbackTitle,
    time: parseTime(input.result.markdown, input.minutes),
    goal: cleanText(block.goal),
    method: methodFromTechnique(block.technique ?? ""),
    teacherSpeech: cleanText(block.teacherSpeech),
    studentActions: cleanText(block.students),
    expectedAnswers: cleanText(block.studentAnswers),
    task: taskText(tasks),
    answer: answerText(tasks),
    result: cleanText(block.expectedResult),
    teacherComment: cleanText(block.comment),
    sourceMarkdown: input.result.markdown,
  };
}

export function structuredLessonFromStageResults(input: {
  subject: string;
  grade: string;
  topic: string;
  goal: string;
  durationMinutes: number;
  lessonType: LessonTypeId;
  homework?: string;
  frpMeta?: Record<string, unknown> | null;
  selectedStageIds: string[];
  stageMinutes: Record<string, number>;
  stageResults: StageResult[];
}): StructuredLesson {
  const byId = new Map(input.stageResults.map((result) => [result.stageId, result]));
  const stages = input.selectedStageIds
    .map((stageId) => byId.get(stageId))
    .filter((result): result is StageResult => Boolean(result))
    .map((result) =>
      structuredStageFromStageResult({
        result,
        lessonType: input.lessonType,
        minutes: input.stageMinutes[result.stageId],
      }),
    );
  const crossCuttingQuestion = buildCrossCuttingQuestion(input.subject, input.topic, input.lessonType);

  return sanitizeStructuredLessonStageOpenings({
    subject: input.subject,
    grade: input.grade,
    topic: input.topic,
    goal: input.goal,
    durationMinutes: input.durationMinutes,
    lessonType: input.lessonType,
    homework: input.homework,
    passport: buildPassport(input),
    plannedResults: buildPlannedResults(input),
    frpCoverage: buildFrpCoverage(input.lessonType, input.frpMeta),
    materials: buildMaterials(input.subject),
    crossCuttingQuestion,
    methodologyComment: buildMethodologyComment(stages, crossCuttingQuestion),
    assessmentCriteria: buildAssessmentCriteria(),
    stages,
  });
}

function isInvalidValue(value: string): boolean {
  const text = cleanText(value);
  if (!text) return true;
  if (PLACEHOLDER_RE.test(text)) return true;
  if (INLINE_PLACEHOLDER_RE.test(text) && text.length <= 40) return true;
  return false;
}

export function validateStructuredStage(
  stage: StructuredLessonStage,
  lessonType?: LessonTypeId,
): StructuredStageValidation {
  const issues: StructuredStageIssue[] = [];
  const templateOnly =
    lessonType !== undefined && getStageDefinition(lessonType, stage.id)?.templateOnly === true;
  const required: StageFieldKey[] = [
    "goal",
    "teacherSpeech",
    "studentActions",
    ...(templateOnly ? [] : (["task", "answer"] as StageFieldKey[])),
    "result",
  ];

  if (!stage.method?.name.trim()) {
    issues.push({ field: "method", message: "Методический приём не выбран." });
  }

  for (const field of required) {
    if (isInvalidValue(stage[field])) {
      issues.push({ field, message: `Заполните поле «${FIELD_LABELS[field]}».` });
    }
  }

  if (isInvalidValue(stage.expectedAnswers)) {
    issues.push({ field: "expectedAnswers", message: "Добавьте предполагаемые ответы учеников." });
  }

  const speech = stage.teacherSpeech.toLowerCase();
  if (GENERIC_TEACHER_PHRASES.some((phrase) => speech.includes(phrase))) {
    issues.push({
      field: "teacherSpeech",
      message: "Нужна конкретная речь учителя, а не общая формулировка.",
    });
  }

  const actions = stage.studentActions.toLowerCase();
  if (GENERIC_STUDENT_PHRASES.some((phrase) => actions.includes(phrase))) {
    issues.push({
      field: "studentActions",
      message: "Опишите конкретные действия учеников.",
    });
  }

  if (lessonType === "new_knowledge") {
    const fieldsToCheck: Array<{ field: StageFieldKey; value: string }> = [
      { field: "teacherSpeech", value: stage.teacherSpeech },
      { field: "goal", value: stage.goal },
      { field: "result", value: stage.result },
      { field: "teacherComment", value: stage.teacherComment },
    ];
    for (const item of fieldsToCheck) {
      if (item.value.trim() && hasNewKnowledgeContinuationWording(item.value)) {
        issues.push({
          field: item.field,
          message:
            "На уроке открытия новых знаний тема новая — уберите формулировки о продолжении или повторении уже изученного.",
        });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

function listToMarkdown(items: string[]): string {
  return items.filter((item) => item.trim()).map((item) => `- ${item.trim()}`).join("\n");
}

function resolvePassport(lesson: StructuredLesson): LessonPassport {
  return lesson.passport ?? buildPassport(lesson);
}

function resolvePlannedResults(lesson: StructuredLesson): LessonPlannedResults {
  const matchedTopic = lesson.frpCoverage?.matchedTopic;
  return buildPlannedResults({
    subject: lesson.subject,
    topic: lesson.topic,
    goal: lesson.goal,
    frpMeta: matchedTopic ? { topic: matchedTopic } : null,
  });
}

function resolveFrpCoverage(lesson: StructuredLesson): LessonFrpCoverage {
  return lesson.frpCoverage ?? buildFrpCoverage(lesson.lessonType);
}

function resolveCrossCuttingQuestion(lesson: StructuredLesson): string {
  return lesson.crossCuttingQuestion ?? buildCrossCuttingQuestion(lesson.subject, lesson.topic, lesson.lessonType);
}

function resolveMethodologyComment(lesson: StructuredLesson): string[] {
  const question = resolveCrossCuttingQuestion(lesson);
  return lesson.methodologyComment ?? buildMethodologyComment(lesson.stages, question);
}

function resolveAssessmentCriteria(lesson: StructuredLesson): string[] {
  return lesson.assessmentCriteria ?? buildAssessmentCriteria();
}

function resolveMaterials(lesson: StructuredLesson): string[] {
  return lesson.materials ?? buildMaterials(lesson.subject);
}

function stageToMarkdown(stage: StructuredLessonStage, index: number, lessonType?: LessonTypeId): string {
  const title = lessonType
    ? (getStageDefinition(lessonType, stage.id)?.title ?? stage.title)
    : stage.title;
  const templateOnly =
    lessonType !== undefined && getStageDefinition(lessonType, stage.id)?.templateOnly === true;
  const parts = [
    `## ${title}`,
    `Время: ${stage.time}`,
    `${STAGE_BLOCK_LABELS.goal} ${stage.goal}`,
    `${STAGE_BLOCK_LABELS.technique} ${stage.method?.name ?? ""}`,
    `${STAGE_BLOCK_LABELS.teacherSpeech} ${stage.teacherSpeech}`,
    `${STAGE_BLOCK_LABELS.studentAnswers}\n${stage.expectedAnswers}`,
    `${STAGE_BLOCK_LABELS.students} ${stage.studentActions}`,
    ...(templateOnly
      ? []
      : [`Задание ${index + 1}.1: ${stage.task}`, `Ответ: ${stage.answer}`]),
    `${STAGE_BLOCK_LABELS.expectedResult} ${stage.result}`,
    `${STAGE_BLOCK_LABELS.comment} ${stage.teacherComment}`,
  ];
  return parts.join("\n");
}

function stageFlowRow(stage: StructuredLessonStage, index: number, lessonType: LessonTypeId): string {
  const title = getStageDefinition(lessonType, stage.id)?.title ?? stage.title;
  const teacher = stage.teacherSpeech.replace(/\n+/g, " ").slice(0, 180);
  const students = stage.studentActions.replace(/\n+/g, " ").slice(0, 160);
  return [
    String(index + 1),
    title,
    teacher,
    students,
    stage.time,
  ]
    .map((cell) => cell.replace(/\|/g, "\\|"))
    .join(" | ");
}

export function structuredLessonToMarkdown(lesson: StructuredLesson): string {
  const passport = resolvePassport(lesson);
  const plannedResults = resolvePlannedResults(lesson);
  const frpCoverage = resolveFrpCoverage(lesson);
  const materials = resolveMaterials(lesson);
  const question = resolveCrossCuttingQuestion(lesson);
  const methodologyComment = resolveMethodologyComment(lesson);
  const assessmentCriteria = resolveAssessmentCriteria(lesson);
  const parts = [
    "# Технологическая карта урока",
    "",
    "## Паспорт урока",
    `**Предмет:** ${lesson.subject}`,
    `**Класс:** ${lesson.grade}`,
    `**Тема урока:** ${lesson.topic}`,
    `**Тип урока:** ${passport.lessonTypeLabel}`,
    `**Продолжительность:** ${passport.duration}`,
    passport.kit ? `**УМК / материалы:** ${passport.kit}` : "",
    passport.ktpPlace ? `**Место в КТП:** ${passport.ktpPlace}` : "",
  ];
  if (lesson.goal.trim()) parts.push(`**Цель:** ${lesson.goal.trim()}`);
  parts.push(
    "",
    "## 1. Планируемые результаты",
    "",
    "### Предметные",
    listToMarkdown(plannedResults.subject),
    "",
    "### Метапредметные",
    listToMarkdown(plannedResults.meta),
    "",
    "### Личностные",
    listToMarkdown(plannedResults.personal),
    "",
    "## 2. Программное содержание (ФРП)",
    frpCoverage.covered.length ? listToMarkdown(frpCoverage.covered) : "- Содержание соотнесено с темой урока.",
  );
  if (frpCoverage.deferred.length) {
    parts.push("", "**Что выносится за пределы урока:**", listToMarkdown(frpCoverage.deferred));
  }
  parts.push(
    "",
    frpCoverage.note,
    "",
    "## 3. Оборудование и материалы",
    listToMarkdown(materials),
    "",
    "## 4. Ход урока",
    `**Сквозной проблемный вопрос:** ${question}`,
    "",
    "| № | Этап | Деятельность учителя | Деятельность учащихся | Время |",
    "|---|---|---|---|---|",
    ...lesson.stages.map((stage, index) => `| ${stageFlowRow(stage, index, lesson.lessonType)} |`),
    "",
    "## 5. Методические блоки этапов",
  );
  parts.push("");
  lesson.stages.forEach((stage, index) => {
    parts.push(stageToMarkdown(stage, index, lesson.lessonType));
    parts.push("");
  });
  if (lesson.homework?.trim()) {
    parts.push(`## Домашнее задание\n${lesson.homework.trim()}`);
  }
  parts.push(
    "",
    "## Методический комментарий",
    listToMarkdown(methodologyComment),
    "",
    "## Критерии оценивания работы на уроке",
    listToMarkdown(assessmentCriteria),
  );
  return embedAnswerKeysInStages(parts.join("\n").trim());
}

export async function structuredLessonToHtml(lesson: StructuredLesson): Promise<string> {
  const markdown = structuredLessonToMarkdown(lesson);
  return aiResponseToHtml(convertAllMathToSpans(markdown));
}

export function updateStructuredStageField(
  stage: StructuredLessonStage,
  field: StageFieldKey,
  value: string,
): StructuredLessonStage {
  return { ...stage, [field]: value };
}

export function blockFromStructuredStage(stage: StructuredLessonStage): StageMethodologicalBlock {
  return {
    goal: stage.goal,
    technique: stage.method?.name ?? "",
    teacherSpeech: stage.teacherSpeech,
    studentAnswers: stage.expectedAnswers,
    students: stage.studentActions,
    expectedResult: stage.result,
    comment: stage.teacherComment,
  };
}
