import { NextResponse } from "next/server";
import { aiResponseToHtml } from "@/lib/aiResponseToHtml";
import { buildSystemPromptForGeneration } from "@/lib/knowledge/lessonMethodology";
import type { LessonTypeId } from "@/lib/lessonTypes";
import { lessonTypeForPrompt } from "@/lib/lessonTypes";
import {
  buildPipelineWriterUserPayload,
  LESSON_PLANNER_SYSTEM_PROMPT,
  parseAndNormalizeLessonPlanner,
} from "@/lib/lessonPlanner";

export const runtime = "nodejs";
export const maxDuration = 240;

type GenerationVersion = 1 | 2;

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
  /**
   * 1 — один запрос к модели (как раньше).
   * 2 — два шага: JSON-планировщик, затем полный сценарий Markdown.
   */
  generationVersion?: GenerationVersion;
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
    `Распредели ровно ${b.durationMinutes} минут между этими этапами: в каждом этапе укажи «Время: N мин» так, как задано в системном промпте; сумма всех N по этапам должна быть строго ${b.durationMinutes}, не больше и не меньше.`,
    `Перед завершением ответа проверь арифметику: сложи минуты всех этапов — должно получиться ${b.durationMinutes}.`,
    "",
    "Включённые этапы:",
    stagesList,
    "",
    "Сформируй сценарий урока в **Markdown** по инструкциям из системного сообщения (структура и оформление — как там задано), соблюдая только перечисленные этапы.",
    "Каждый этап наполни конкретикой под тему и предмет из JSON: готовая речь учителя, действия учеников, материалы и проверяемые задания там, где нужен продукт — чтобы по сценарию можно было вести урок, а не восстанавливать его из намёков.",
    "Если в системном промпте предусмотрен раздел **Ключи к заданиям** (жирный заголовок в Markdown), выведи ответы к проверяемым заданиям только там; не перегружай ход урока лишними разборами.",
    "Поле homework в JSON — запрос учителя о домашнем задании: если там не готовый текст, а пожелание (например, число заданий, уровни сложности), разверни его в реальные предметные задания по теме и типу урока в этапе про ДЗ; не ограничивайся повтором формулировки учителя без содержания.",
  ].join("\n");
}

function buildPlannerUserPayload(b: Body): string {
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
    `durationMinutes (сумма minutes по stages должна быть равна этому числу): ${b.durationMinutes}`,
    "",
    "Этапы (в таком порядке, используй ТОЧНО эти строки в поле stageTitle каждого элемента stages):",
    stagesList,
    "",
    "Верни только JSON по инструкции из системного сообщения.",
  ].join("\n");
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function openRouterCompletion(
  key: string,
  model: string,
  headers: Record<string, string>,
  messages: ChatMessage[],
  temperature: number,
): Promise<
  | { ok: true; content: string }
  | { ok: false; status: number; detail: string; network?: boolean }
> {
  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 502,
      detail: msg.slice(0, 500),
      network: true,
    };
  }

  if (!res.ok) {
    const errText = await res.text();
    const fromApi = parseOpenRouterErrorBody(errText);
    const detail = (fromApi || errText).slice(0, 2000);
    return { ok: false, status: res.status, detail };
  }

  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return { ok: false, status: 502, detail: "Ответ OpenRouter не JSON." };
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return { ok: false, status: 502, detail: "Пустой ответ модели." };
  }

  return { ok: true, content };
}

function jsonOpenRouterFailure(
  openRouterStatus: number,
  detail: string,
  opts?: { network?: boolean; stepLabel?: string },
): NextResponse {
  if (opts?.network) {
    return NextResponse.json(
      {
        error:
          (opts.stepLabel ? `${opts.stepLabel}: ` : "") +
          "Не удалось подключиться к OpenRouter (сеть или DNS). Если это Render — проверьте, что исходящие HTTPS разрешены; локально — интернет и прокси.",
        detail: detail.slice(0, 500),
      },
      { status: 502 },
    );
  }

  let error = `Ошибка OpenRouter (${openRouterStatus})`;
  if (openRouterStatus === 401) {
    error =
      "Ключ OpenRouter отклонён (401). Проверьте, что OPENROUTER_API_KEY скопирован полностью, без лишних пробелов и кавычек; на https://openrouter.ai/keys создайте новый ключ при необходимости.";
  } else if (openRouterStatus === 402) {
    error =
      "OpenRouter: недостаточно средств или нужна оплата (402). Пополните баланс на openrouter.ai.";
  } else if (openRouterStatus === 403) {
    error =
      "Доступ запрещён (403). Проверьте ключ и доступ к выбранной модели на OpenRouter.";
  } else if (openRouterStatus === 429) {
    error = "Слишком много запросов к OpenRouter (429). Подождите и повторите.";
  } else if (openRouterStatus === 502) {
    error = detail.includes("Пустой")
      ? "Пустой ответ модели."
      : "Не удалось выполнить запрос к OpenRouter.";
  }

  if (opts?.stepLabel) {
    error = `${opts.stepLabel}: ${error}`;
  }

  return NextResponse.json({ error, detail }, { status: 502 });
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

  const rawV = body.generationVersion;
  const generationVersion: GenerationVersion =
    rawV === 2 || rawV === "2" ? 2 : 1;

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

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  const title = process.env.OPENROUTER_APP_TITLE?.trim();
  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;

  const systemContent = buildSystemPromptForGeneration(body.systemPrompt, {
    subject: body.subject,
    grade: body.grade,
  });
  const baseUserContent = buildUserPayload(body);

  let raw: string;
  let plannerRaw: string | undefined;

  if (generationVersion === 1) {
    const out = await openRouterCompletion(key, model, headers, [
      { role: "system", content: systemContent },
      { role: "user", content: baseUserContent },
    ], 0.4);

    if (!out.ok) {
      return jsonOpenRouterFailure(out.status, out.detail, { network: out.network });
    }
    raw = out.content;
  } else {
    const plannerUser = buildPlannerUserPayload(body);
    const plannerOut = await openRouterCompletion(
      key,
      model,
      headers,
      [
        { role: "system", content: LESSON_PLANNER_SYSTEM_PROMPT },
        { role: "user", content: plannerUser },
      ],
      0.25,
    );

    if (!plannerOut.ok) {
      return jsonOpenRouterFailure(plannerOut.status, plannerOut.detail, {
        network: plannerOut.network,
        stepLabel: "Версия 2, шаг 1 (планировщик)",
      });
    }

    plannerRaw = plannerOut.content;
    const parsed = parseAndNormalizeLessonPlanner(
      plannerOut.content,
      body.selectedStages,
      body.durationMinutes,
    );

    if (!parsed.ok) {
      return NextResponse.json(
        {
          error: "Шаг планировщика (версия 2): некорректный ответ.",
          detail: parsed.error,
          plannerRaw: plannerOut.content.slice(0, 8000),
        },
        { status: 422 },
      );
    }

    const writerUser = buildPipelineWriterUserPayload(baseUserContent, parsed.plan);
    const writerOut = await openRouterCompletion(
      key,
      model,
      headers,
      [
        { role: "system", content: systemContent },
        { role: "user", content: writerUser },
      ],
      0.4,
    );

    if (!writerOut.ok) {
      return jsonOpenRouterFailure(writerOut.status, writerOut.detail, {
        network: writerOut.network,
        stepLabel: "Версия 2, шаг 2 (сценарий)",
      });
    }

    raw = writerOut.content;
  }

  try {
    const html = await aiResponseToHtml(raw, { durationMinutes: body.durationMinutes });
    const json: {
      html: string;
      raw: string;
      generationVersion: GenerationVersion;
      plannerRaw?: string;
    } = { html, raw, generationVersion };
    if (plannerRaw !== undefined) {
      json.plannerRaw = plannerRaw;
    }
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Ошибка при разборе ответа модели", detail: msg.slice(0, 500) },
      { status: 502 },
    );
  }
}
