import { NextResponse } from "next/server";
import { build1septSearchQuery, PUBLICATIONS_SITE_OPERATOR } from "@/lib/build1septSearchQuery";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  query: string;
  subject?: string;
  grade?: string;
};

type GoogleCseItem = {
  title?: string;
  link?: string;
  snippet?: string;
};

type GoogleCseResponse = {
  items?: GoogleCseItem[];
  error?: { message?: string; code?: number };
};

/** Подсказка по типичным ответам Google (для отображения на клиенте). */
function hintForGoogleCseMessage(message: string): string | undefined {
  if (message.includes("does not have the access to Custom Search JSON API")) {
    return [
      "Что сделать:",
      "1) В Google Cloud привяжите к этому проекту Billing (Платёжный аккаунт): меню Billing — часто без этого Custom Search JSON API возвращает именно эту 403, даже при бесплатной квоте.",
      "2) Убедитесь, что в том же проекте включён Custom Search API (APIs & Services → Enabled APIs).",
      "3) Подождите 1–2 минуты, повторите запрос. При необходимости создайте новый API key в этом проекте и обновите GOOGLE_CUSTOM_SEARCH_API_KEY на Render.",
    ].join("\n");
  }
  return undefined;
}

export async function POST(req: Request) {
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY?.trim();
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID?.trim();

  if (!apiKey || !cx) {
    return NextResponse.json(
      {
        error:
          "Поиск не настроен на сервере: задайте GOOGLE_CUSTOM_SEARCH_API_KEY и GOOGLE_CUSTOM_SEARCH_ENGINE_ID.",
        hint:
          "На Render, Vercel и других хостингах добавьте обе переменные в раздел Environment сервиса (они не подхватываются из .env.local — этот файл только на вашем компьютере и не попадает в Git). После сохранения — redeploy.",
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

  const rawQ = typeof body.query === "string" ? body.query : "";
  if (!rawQ.trim()) {
    return NextResponse.json(
      { error: "Введите запрос: поле поиска не может быть пустым." },
      { status: 400 },
    );
  }

  const q = build1septSearchQuery(rawQ, {
    subject: body.subject,
    grade: body.grade,
  });

  if (!q.includes(PUBLICATIONS_SITE_OPERATOR)) {
    return NextResponse.json({ error: "Некорректная сборка запроса" }, { status: 500 });
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", q);
  url.searchParams.set("num", "10");

  let res: Response;
  try {
    res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Не удалось выполнить поиск. Попробуйте позже.", detail: msg.slice(0, 200) },
      { status: 502 },
    );
  }

  const text = await res.text();
  let data: GoogleCseResponse;
  try {
    data = JSON.parse(text) as GoogleCseResponse;
  } catch {
    return NextResponse.json(
      { error: "Не удалось выполнить поиск. Попробуйте позже.", detail: "Некорректный ответ API" },
      { status: 502 },
    );
  }

  /** Иногда в теле приходит объект error даже при HTTP 200 (квота, неверный cx и т.д.). */
  if (res.ok && data.error) {
    const msg =
      typeof data.error === "object" && data.error !== null && "message" in data.error
        ? String((data.error as { message?: string }).message)
        : JSON.stringify(data.error);
    const hint = hintForGoogleCseMessage(msg);
    return NextResponse.json(
      {
        error: "Ошибка Google Custom Search.",
        detail: msg,
        ...(hint ? { hint } : {}),
      },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const apiErr = data.error?.message || text.slice(0, 300);
    const hint = hintForGoogleCseMessage(apiErr);
    return NextResponse.json(
      {
        error: "Не удалось выполнить поиск. Попробуйте позже.",
        detail: apiErr,
        ...(hint ? { hint } : {}),
      },
      { status: res.status >= 500 ? 502 : 400 },
    );
  }

  const items = data.items ?? [];
  const results = items.map((it) => ({
    title: (it.title ?? "").replace(/<[^>]+>/g, "").trim() || "Без названия",
    url: it.link ?? "",
    snippet: (it.snippet ?? "").trim(),
  }));

  return NextResponse.json({ results });
}
