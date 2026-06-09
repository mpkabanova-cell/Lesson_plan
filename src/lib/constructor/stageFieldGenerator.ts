import { openRouterCompletion, openRouterHeaders } from "./openRouter";
import type { LessonTypeId } from "./stageRegistry";
import type {
  StageFieldKey,
  StageMethod,
  StructuredLessonStage,
} from "./structuredLesson";

export type StageFieldGenerationMode =
  | "improve"
  | "regenerate"
  | "improve-stage"
  | "apply-method";

export type StageFieldGenerationInput = {
  mode: StageFieldGenerationMode;
  field?: StageFieldKey;
  lesson: {
    subject: string;
    grade: string;
    topic: string;
    goal: string;
    lessonType: LessonTypeId;
    durationMinutes?: number;
  };
  stage: StructuredLessonStage;
  method?: StageMethod | null;
  previousStageSummary?: string;
  nextStageSummary?: string;
  frpMeta?: unknown;
};

export type StageFieldPatch = Partial<
  Pick<
    StructuredLessonStage,
    | "teacherSpeech"
    | "studentActions"
    | "expectedAnswers"
    | "task"
    | "answer"
    | "result"
    | "teacherComment"
  >
>;

const FIELD_LABELS: Record<StageFieldKey, string> = {
  goal: "цель этапа",
  teacherSpeech: "речь учителя",
  studentActions: "действия учеников",
  expectedAnswers: "предполагаемые ответы учеников",
  task: "задание / материал",
  answer: "ответ / ключ",
  result: "ожидаемый результат",
  teacherComment: "комментарий учителю",
};

const PATCH_FIELDS = [
  "teacherSpeech",
  "studentActions",
  "expectedAnswers",
  "task",
  "answer",
  "result",
  "teacherComment",
] as const;

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Модель вернула не JSON.");
  }
}

function sanitizeValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePatch(value: unknown): StageFieldPatch {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const fields = raw.fields && typeof raw.fields === "object" ? raw.fields as Record<string, unknown> : raw;
  const out: StageFieldPatch = {};
  for (const field of PATCH_FIELDS) {
    const next = sanitizeValue(fields[field]);
    if (next) out[field] = next;
  }
  return out;
}

function buildSystemPrompt(input: StageFieldGenerationInput): string {
  if (input.mode === "improve" || input.mode === "regenerate") {
    const label = input.field ? FIELD_LABELS[input.field] : "поле";
    return `Ты — опытный методист. Переписываешь только одно поле этапа урока: ${label}.
Верни строго JSON вида {"value":"..."}.
Не возвращай весь этап, Markdown, пояснения или другие поля.
Пиши конкретно, по-русски, без плейсхолдеров (..., TODO, TBD, null).
Если это речь учителя — дай готовую речь в кавычках «...».
Если это задание — дай предметное задание по теме.
Если это ответ — дай ключ/эталон проверки.`;
  }

  return `Ты — опытный методист. Улучшаешь только текущий этап урока.
Верни строго JSON вида {"fields":{"teacherSpeech":"...","studentActions":"...","expectedAnswers":"...","task":"...","answer":"...","result":"...","teacherComment":"..."}}.
Не меняй название этапа, время, цель этапа и выбранный методический приём.
Не возвращай другие этапы, Markdown или пояснения.
Пиши конкретно, по-русски, без плейсхолдеров (..., TODO, TBD, null).
Речь учителя должна быть готовой речью в кавычках «...».
Задание и ответ должны соответствовать теме, предмету, классу и выбранному приёму.`;
}

function buildUserPayload(input: StageFieldGenerationInput): string {
  return JSON.stringify(
    {
      regenerateField: input.field,
      mode: input.mode,
      lesson: input.lesson,
      stage: {
        id: input.stage.id,
        title: input.stage.title,
        time: input.stage.time,
        goal: input.stage.goal,
        method: input.method ?? input.stage.method,
        currentStageData: input.stage,
      },
      previousStageSummary: input.previousStageSummary,
      nextStageSummary: input.nextStageSummary,
      frpContext: input.frpMeta,
    },
    null,
    2,
  );
}

export async function generateStageField(
  key: string,
  model: string,
  input: StageFieldGenerationInput,
): Promise<{ value?: string; fields?: StageFieldPatch }> {
  const out = await openRouterCompletion(
    key,
    model,
    openRouterHeaders(key),
    [
      { role: "system", content: buildSystemPrompt(input) },
      { role: "user", content: buildUserPayload(input) },
    ],
    input.mode === "regenerate" ? 0.45 : 0.3,
  );

  if (!out.ok) {
    throw new Error(`OpenRouter: ${out.detail}`);
  }

  const json = extractJsonObject(out.content);
  if (input.mode === "improve" || input.mode === "regenerate") {
    const value = sanitizeValue((json as { value?: unknown }).value);
    if (!value) throw new Error("Модель не вернула значение поля.");
    return { value };
  }

  const fields = normalizePatch(json);
  if (Object.keys(fields).length === 0) throw new Error("Модель не вернула поля этапа.");
  return { fields };
}
