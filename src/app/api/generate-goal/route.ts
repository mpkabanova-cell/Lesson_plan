import { NextResponse } from "next/server";
import { buildGoalSystemPromptForGeneration } from "@/lib/knowledge/lessonMethodology";
import type { LessonTypeId } from "@/lib/lessonTypes";
import { LESSON_TYPE_LABELS, lessonTypeForPrompt } from "@/lib/lessonTypes";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  systemPrompt: string;
  subject: string;
  grade: string;
  topic: string;
  lessonType: LessonTypeId;
};

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

function isLessonTypeId(v: unknown): v is LessonTypeId {
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

function buildUserMessage(b: Body): string {
  const payload = {
    subject: b.subject.trim(),
    grade: b.grade.trim(),
    topic: b.topic.trim(),
    lessonType: lessonTypeForPrompt(b.lessonType),
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

export async function POST(req: Request) {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  const modelRaw = process.env.OPENROUTER_MODEL?.trim();
  const model =
    modelRaw && modelRaw.length > 0 ? modelRaw : "openai/gpt-4o-mini";

  if (!key) {
    return NextResponse.json(
      {
        error: "OPENROUTER_API_KEY не задан на сервере.",
        detail:
          "Локально: скопируйте .env.example в .env и задайте ключ. На Render: Settings → Environment → добавьте OPENROUTER_API_KEY (без кавычек и без пробелов в начале/конце).",
      },
      { status: 500 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (!body.systemPrompt?.trim()) {
    return NextResponse.json({ error: "Пустой системный промпт" }, { status: 400 });
  }
  if (!body.subject?.trim() || !body.grade?.trim()) {
    return NextResponse.json({ error: "Укажите предмет и класс" }, { status: 400 });
  }
  if (!body.topic?.trim()) {
    return NextResponse.json({ error: "Укажите тему урока" }, { status: 400 });
  }
  if (!isLessonTypeId(body.lessonType)) {
    return NextResponse.json({ error: "Некорректный тип урока" }, { status: 400 });
  }

  const userContent = buildUserMessage(body);
  const systemContent = buildGoalSystemPromptForGeneration(body.systemPrompt);

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
          { role: "user", content: userContent },
        ],
        temperature: 0.4,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error:
          "Не удалось подключиться к OpenRouter (сеть или DNS). Если это Render — проверьте, что исходящие HTTPS разрешены; локально — интернет и прокси.",
        detail: msg.slice(0, 500),
      },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const errText = await res.text();
    const fromApi = parseOpenRouterErrorBody(errText);
    const detail = (fromApi || errText).slice(0, 2000);

    let error = `Ошибка OpenRouter (${res.status})`;
    if (res.status === 401) {
      error =
        "Ключ OpenRouter отклонён (401). Проверьте, что OPENROUTER_API_KEY скопирован полностью, без лишних пробелов и кавычек; на https://openrouter.ai/keys создайте новый ключ при необходимости.";
    } else if (res.status === 402) {
      error =
        "OpenRouter: недостаточно средств или нужна оплата (402). Пополните баланс на openrouter.ai.";
    } else if (res.status === 403) {
      error =
        "Доступ запрещён (403). Проверьте ключ и доступ к выбранной модели на OpenRouter.";
    } else if (res.status === 429) {
      error = "Слишком много запросов к OpenRouter (429). Подождите и повторите.";
    }

    return NextResponse.json({ error, detail }, { status: 502 });
  }

  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return NextResponse.json(
      { error: "Некорректный JSON от OpenRouter", detail: "Ответ не удалось разобрать." },
      { status: 502 },
    );
  }

  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    return NextResponse.json({ error: "Пустой ответ модели" }, { status: 502 });
  }

  const goal = parseGoalJson(raw);
  if (!goal) {
    return NextResponse.json(
      {
        error: "Не удалось разобрать цель из ответа модели",
        detail: raw.slice(0, 800),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ goal });
}
