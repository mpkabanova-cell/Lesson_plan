import { normalizeStageMinutesToTotal, type StageTiming } from "@/lib/parseTiming";

/** Результат шага «планировщик» для двухшаговой генерации (версия 2). */
export type LessonPlannerStage = {
  /** Должно совпадать с переданным названием этапа (порядок как у учителя). */
  stageTitle: string;
  minutes: number;
  stageIntent: string;
  keyActivity: string;
};

export type LessonPlannerResult = {
  stages: LessonPlannerStage[];
  /** Что именно открывают ученики (кратко, без отдельного блока в сценарии). */
  whatStudentsOpen: string;
  /** Тип нового знания по методике (понятие, правило, алгоритм и т.д.). */
  knowledgeType: string;
  /** Учебный продукт к концу урока. */
  learningProduct: string;
  /** Идея пробного действия (без готовых подсказок для ученика). */
  trialActionIdea: string;
  /** Где и в чём затруднение после пробного действия. */
  difficultyPlace: string;
};

export const LESSON_PLANNER_SYSTEM_PROMPT = `Ты — методист. Твоя задача — спроектировать каркас урока открытия нового знания перед написанием полного сценария.

Верни ТОЛЬКО один JSON-объект без текста до и после, без Markdown-ограждений.

Структура JSON (все поля обязательны, строки на русском):
{
  "stages": [
    {
      "stageTitle": "точная строка из списка этапов пользователя",
      "minutes": <целое число минут>,
      "stageIntent": "зачем этот этап в логике открытия",
      "keyActivity": "что делают ученики и учитель одной фразой"
    }
  ],
  "whatStudentsOpen": "…",
  "knowledgeType": "…",
  "learningProduct": "…",
  "trialActionIdea": "…",
  "difficultyPlace": "…"
}

Правила:
- В массиве stages столько элементов и в том же порядке, сколько этапов передал пользователь; в поле stageTitle укажи ту же строку, что в списке этапов (посимвольно, если можешь — сервер при необходимости подставит канонические названия).
- Сумма minutes по всем stages должна равняться durationMinutes из входа. Проверь арифметику перед ответом.
- trialActionIdea не должен раскрывать новое знание и не должен содержать готовый вывод урока — только замысел пробного действия.
- Будь краток в строковых полях: по 1–3 предложения.`;

function stripJsonFence(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    const first = t.indexOf("\n");
    if (first !== -1) {
      t = t.slice(first + 1);
    }
    const last = t.lastIndexOf("```");
    if (last !== -1) {
      t = t.slice(0, last);
    }
  }
  return t.trim();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Разбор и нормализация ответа планировщика: ровно один этап на каждый выбранный,
 * минуты пересчитываются к durationMinutes (целые, сумма точная).
 */
export function parseAndNormalizeLessonPlanner(
  raw: string,
  selectedStages: string[],
  durationMinutes: number,
): { ok: true; plan: LessonPlannerResult } | { ok: false; error: string } {
  const cleaned = stripJsonFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: "Планировщик вернул не JSON. Повторите запрос или переключитесь на версию 1." };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: "Корень ответа планировщика не объект." };
  }

  const stagesRaw = parsed.stages;
  if (!Array.isArray(stagesRaw)) {
    return { ok: false, error: "В JSON нет массива stages." };
  }

  if (stagesRaw.length !== selectedStages.length) {
    return {
      ok: false,
      error: `Ожидалось ${selectedStages.length} этапов в stages, получено ${stagesRaw.length}.`,
    };
  }

  const stages: LessonPlannerStage[] = [];
  for (let i = 0; i < selectedStages.length; i++) {
    const row = stagesRaw[i];
    if (!isRecord(row)) {
      return { ok: false, error: `Элемент stages[${i}] не объект.` };
    }
    const expected = selectedStages[i]!.trim();
    const minutes = typeof row.minutes === "number" && Number.isFinite(row.minutes) ? Math.round(row.minutes) : NaN;
    if (!Number.isFinite(minutes) || minutes < 1) {
      return { ok: false, error: `Некорректные minutes для этапа «${expected}».` };
    }
    const stageIntent = typeof row.stageIntent === "string" ? row.stageIntent.trim() : "";
    const keyActivity = typeof row.keyActivity === "string" ? row.keyActivity.trim() : "";
    if (!stageIntent || !keyActivity) {
      return { ok: false, error: `Пустые stageIntent или keyActivity для этапа «${expected}».` };
    }
    stages.push({
      stageTitle: expected,
      minutes,
      stageIntent,
      keyActivity,
    });
  }

  const str = (k: string): string | null => {
    const v = parsed[k];
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  };

  const whatStudentsOpen = str("whatStudentsOpen");
  const knowledgeType = str("knowledgeType");
  const learningProduct = str("learningProduct");
  const trialActionIdea = str("trialActionIdea");
  const difficultyPlace = str("difficultyPlace");

  if (!whatStudentsOpen || !knowledgeType || !learningProduct || !trialActionIdea || !difficultyPlace) {
    return { ok: false, error: "Заполните все строковые поля проекта урока в JSON (не пустые строки)." };
  }

  const timingRows: StageTiming[] = stages.map((s) => ({ stage: s.stageTitle, minutes: s.minutes }));
  const normalizedMinutes = normalizeStageMinutesToTotal(timingRows, durationMinutes);

  const normalizedStages: LessonPlannerStage[] = stages.map((s, i) => ({
    ...s,
    minutes: normalizedMinutes[i]?.minutes ?? s.minutes,
  }));

  return {
    ok: true,
    plan: {
      stages: normalizedStages,
      whatStudentsOpen,
      knowledgeType,
      learningProduct,
      trialActionIdea,
      difficultyPlace,
    },
  };
}

/** Дополнение к пользовательскому сообщению для шага «писатель» (версия 2). */
export function buildPipelineWriterUserPayload(baseUserPayload: string, plan: LessonPlannerResult): string {
  return [
    baseUserPayload,
    "",
    "ПРОЕКТ УРОКА (результат шага планировщика — используй как основу, не копируй этот JSON в ответ учителю как отдельный блок сценария):",
    JSON.stringify(plan, null, 2),
    "",
    "ИНСТРУКЦИЯ:",
    "Напиши полный практический сценарий урока в Markdown по системному промпту выше.",
    "Соблюдай минуты и смысл каждого этапа из проекта; заголовки этапов в сценарии должны соответствовать переданному списку этапов.",
    "Воплощай замысел пробного действия, затруднение, открываемое знание и учебный продукт внутри этапов сценария — без отдельной вводной таблицы с целью/продуктом/типом знания (как в основном промпте).",
  ].join("\n");
}
