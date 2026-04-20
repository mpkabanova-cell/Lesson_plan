import { NextResponse } from "next/server";
import { aiResponseToHtml } from "@/lib/aiResponseToHtml";
import { buildSystemPromptForGeneration } from "@/lib/knowledge/lessonMethodology";
import type { LessonTypeId } from "@/lib/lessonTypes";
import { lessonTypeForPrompt } from "@/lib/lessonTypes";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  systemPrompt: string;
  subject: string;
  grade: string;
  topic: string;
  goal: string;
  durationMinutes: number;
  lessonType: LessonTypeId;
  homework?: string;
  /** Этапы, которые нужно включить в план (порядок сохраняется). */
  selectedStages: string[];
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

function buildUserPayload(b: Body): string {
  const stagesList = b.selectedStages.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return [
    "Входные данные урока (JSON):",
    JSON.stringify(
      {
        subject: b.subject,
        grade: b.grade,
        topic: b.topic,
        goal: b.goal,
        durationMinutes: b.durationMinutes,
        lessonType: lessonTypeForPrompt(b.lessonType),
        homework: b.homework?.trim() || null,
        selectedStages: b.selectedStages,
      },
      null,
      2,
    ),
    "",
    "КРИТИЧЕСКИ ВАЖНО:",
    `Учитель включил в план только следующие этапы (в таком порядке). Разработай сценарий ТОЛЬКО для них — не добавляй пропущенные этапы из полного списка методики для этого типа урока.`,
    `Длительность урока в минутах (единственный ориентир): ${b.durationMinutes}.`,
    `Распредели ровно ${b.durationMinutes} минут между этими этапами: сумма значений data-minutes по всем section и сумма чисел в строках «Время: … мин» должна быть строго ${b.durationMinutes}, не больше и не меньше.`,
    `Перед завершением ответа проверь арифметику: сложи минуты всех этапов — должно получиться ${b.durationMinutes}.`,
    "",
    "Включённые этапы:",
    stagesList,
    "",
    "Сформируй план урока в HTML по инструкциям из системного сообщения (структура и оформление — как там задано), соблюдая только перечисленные этапы.",
    "Каждый этап наполни конкретикой под тему и предмет из JSON: вопросы к классу, ход объяснения, задания, ориентиры для учителя — чтобы по плану можно было вести урок, а не восстанавливать сценарий из намёков.",
    "Где уместно по смыслу сценария: укажи ожидаемые верные ответы учеников на ключевые вопросы; обсуждение типичных ошибок с классом выдели явно отдельным помеченным фрагментом. Без общих фраз без предметного содержания.",
    "Поле homework в JSON — запрос учителя о домашнем задании: если там не готовый текст, а пожелание (например, число заданий, уровни сложности), разверни его в реальные предметные задания по теме и типу урока в этапе про ДЗ; не ограничивайся повтором формулировки учителя без содержания.",
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
  if (!body.topic?.trim() && !body.goal?.trim()) {
    return NextResponse.json(
      { error: "Укажите тему и/или цель урока" },
      { status: 400 },
    );
  }
  if (!body.lessonType || !Number.isFinite(body.durationMinutes) || body.durationMinutes < 5) {
    return NextResponse.json(
      { error: "Укажите тип урока и длительность (не менее 5 мин)" },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.selectedStages) || body.selectedStages.length === 0) {
    return NextResponse.json(
      { error: "Выберите хотя бы один этап урока" },
      { status: 400 },
    );
  }

  const userContent = buildUserPayload(body);
  const systemContent = buildSystemPromptForGeneration(body.systemPrompt, {
    subject: body.subject,
    grade: body.grade,
  });

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

  try {
    const html = await aiResponseToHtml(raw, { durationMinutes: body.durationMinutes });
    return NextResponse.json({ html, raw });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Ошибка при разборе ответа модели", detail: msg.slice(0, 500) },
      { status: 502 },
    );
  }
}
