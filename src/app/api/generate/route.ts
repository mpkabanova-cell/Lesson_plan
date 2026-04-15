import { NextResponse } from "next/server";
import { aiResponseToHtml } from "@/lib/aiResponseToHtml";
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
};

function buildUserPayload(b: Body): string {
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
      },
      null,
      2,
    ),
    "",
    "Сформируй план урока в HTML по инструкциям из системного сообщения.",
  ].join("\n");
}

export async function POST(req: Request) {
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

  if (!key) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY не задан. Скопируйте .env.example в .env и укажите ключ." },
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

  const userContent = buildUserPayload(body);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const referer = process.env.OPENROUTER_HTTP_REFERER;
  const title = process.env.OPENROUTER_APP_TITLE;
  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: body.systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json(
      { error: `OpenRouter: ${res.status}`, detail: errText.slice(0, 2000) },
      { status: 502 },
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    return NextResponse.json({ error: "Пустой ответ модели" }, { status: 502 });
  }

  const html = await aiResponseToHtml(raw);

  return NextResponse.json({ html, raw });
}
