import { DEFAULT_GOAL_SYSTEM_PROMPT } from "@/lib/defaultGoalSystemPrompt";
import { buildGoalSystemPromptForGeneration } from "@/lib/knowledge/lessonMethodology";
import type { LessonTypeId } from "@/lib/lessonTypes";
import { LESSON_TYPE_LABELS, lessonTypeForPrompt } from "@/lib/lessonTypes";

export type GenerateLessonGoalInput = {
  subject: string;
  grade: string;
  topic: string;
  lessonType: LessonTypeId;
  systemPrompt?: string;
};

export type GenerateLessonGoalResult =
  | { ok: true; goal: string }
  | { ok: false; error: string; detail?: string };

function parseOpenRouterErrorBody(bodyText: string): string {
  try {
    const j = JSON.parse(bodyText) as {
      error?: { message?: string; code?: number };
      message?: string;
    };
    return j.error?.message ?? j.message ?? "";
  } catch {
    return "";
  }
}

export function isLessonTypeId(v: unknown): v is LessonTypeId {
  return typeof v === "string" && v in LESSON_TYPE_LABELS;
}

function stripCodeFence(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    const first = t.indexOf("\n");
    if (first !== -1) {
      t = t.slice(first + 1);
    }
    const lastFence = t.lastIndexOf("```");
    if (lastFence !== -1) {
      t = t.slice(0, lastFence);
    }
  }
  return t.trim();
}

function parseGoalJson(raw: string): string | null {
  const cleaned = stripCodeFence(raw);
  try {
    const j = JSON.parse(cleaned) as { goal?: unknown };
    if (typeof j.goal === "string" && j.goal.trim().length > 0) {
      return j.goal.trim();
    }
  } catch {
    /* try brace extraction */
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const j = JSON.parse(cleaned.slice(start, end + 1)) as { goal?: unknown };
      if (typeof j.goal === "string" && j.goal.trim().length > 0) {
        return j.goal.trim();
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function buildUserMessage(input: GenerateLessonGoalInput): string {
  const payload = {
    subject: input.subject.trim(),
    grade: input.grade.trim(),
    topic: input.topic.trim(),
    lessonType: lessonTypeForPrompt(input.lessonType),
  };
  return [
    "Входные данные урока (JSON):",
    JSON.stringify(payload, null, 2),
    "",
    "ИНСТРУКЦИЯ:",
    "Верни **одну** формулировку цели урока / ожидаемого результата для учеников.",
    "Формат ответа — только JSON-объект без пояснений до и после: {\"goal\": \"...\"}.",
    "Текст в goal: 2–4 предложения, связная формулировка, без HTML и без списков этапов урока.",
  ].join("\n");
}

export function validateGenerateLessonGoalInput(input: GenerateLessonGoalInput): string | null {
  if (!input.subject?.trim() || !input.grade?.trim()) {
    return "Укажите предмет и класс";
  }
  if (!input.topic?.trim()) {
    return "Укажите тему урока";
  }
  if (!isLessonTypeId(input.lessonType)) {
    return "Некорректный тип урока";
  }
  return null;
}

export async function generateLessonGoal(
  input: GenerateLessonGoalInput,
): Promise<GenerateLessonGoalResult> {
  const validationError = validateGenerateLessonGoalInput(input);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const key = process.env.OPENROUTER_API_KEY?.trim();
  const modelRaw = process.env.OPENROUTER_MODEL?.trim();
  const model = modelRaw && modelRaw.length > 0 ? modelRaw : "openai/gpt-4o-mini";

  if (!key) {
    return {
      ok: false,
      error: "OPENROUTER_API_KEY не задан на сервере.",
      detail:
        "Локально: скопируйте .env.example в .env и задайте ключ. На Render: Settings → Environment → добавьте OPENROUTER_API_KEY.",
    };
  }

  const systemPrompt = input.systemPrompt?.trim() || DEFAULT_GOAL_SYSTEM_PROMPT;
  let systemContent: string;
  try {
    systemContent = buildGoalSystemPromptForGeneration(systemPrompt, {
      subject: input.subject,
      grade: input.grade,
      topic: input.topic,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: "Не удалось собрать промпт для генерации цели.", detail: msg };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  const title = process.env.OPENROUTER_APP_TITLE?.trim();
  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: buildUserMessage(input) },
        ],
        temperature: 0.4,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error:
        "Не удалось подключиться к OpenRouter (сеть или DNS). Проверьте интернет и повторите.",
      detail: msg.slice(0, 500),
    };
  }

  if (!res.ok) {
    const errText = await res.text();
    const fromApi = parseOpenRouterErrorBody(errText);
    const detail = (fromApi || errText).slice(0, 2000);

    let error = `Ошибка OpenRouter (${res.status})`;
    if (res.status === 401) {
      error =
        "Ключ OpenRouter отклонён (401). Проверьте OPENROUTER_API_KEY на сервере или создайте новый ключ на openrouter.ai.";
    } else if (res.status === 402) {
      error = "OpenRouter: недостаточно средств (402). Пополните баланс на openrouter.ai.";
    } else if (res.status === 403) {
      error = "Доступ запрещён (403). Проверьте ключ и доступ к выбранной модели.";
    } else if (res.status === 429) {
      error = "Слишком много запросов к OpenRouter (429). Подождите и повторите.";
    }

    return { ok: false, error, detail };
  }

  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return {
      ok: false,
      error: "Некорректный JSON от OpenRouter",
      detail: "Ответ не удалось разобрать.",
    };
  }

  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    return { ok: false, error: "Пустой ответ модели" };
  }

  const goal = parseGoalJson(raw);
  if (!goal) {
    return {
      ok: false,
      error: "Не удалось разобрать цель из ответа модели",
      detail: raw.slice(0, 800),
    };
  }

  return { ok: true, goal };
}
