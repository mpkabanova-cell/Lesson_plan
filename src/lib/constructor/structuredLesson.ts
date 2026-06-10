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
import { getStageDefinition, type LessonTypeId } from "./stageRegistry";
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

export type StructuredLesson = {
  subject: string;
  grade: string;
  topic: string;
  goal: string;
  durationMinutes: number;
  lessonType: LessonTypeId;
  homework?: string;
  stages: StructuredLessonStage[];
};

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

  return {
    subject: input.subject,
    grade: input.grade,
    topic: input.topic,
    goal: input.goal,
    durationMinutes: input.durationMinutes,
    lessonType: input.lessonType,
    homework: input.homework,
    stages,
  };
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

export function structuredLessonToMarkdown(lesson: StructuredLesson): string {
  const parts = [
    `# План урока: ${lesson.subject}, ${lesson.grade} класс`,
    `**Тема:** ${lesson.topic}`,
  ];
  if (lesson.goal.trim()) parts.push(`**Цель:** ${lesson.goal.trim()}`);
  parts.push("");
  lesson.stages.forEach((stage, index) => {
    parts.push(stageToMarkdown(stage, index, lesson.lessonType));
    parts.push("");
  });
  if (lesson.homework?.trim()) {
    parts.push(`## Домашнее задание\n${lesson.homework.trim()}`);
  }
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
