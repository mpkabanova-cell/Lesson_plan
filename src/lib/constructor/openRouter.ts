type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function openRouterCompletion(
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
      body: JSON.stringify({ model, messages, temperature }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 502, detail: msg.slice(0, 500), network: true };
  }

  if (!res.ok) {
    const errText = await res.text();
    let detail = errText.slice(0, 2000);
    try {
      const j = JSON.parse(errText) as { error?: { message?: string }; message?: string };
      detail = j.error?.message ?? j.message ?? detail;
    } catch {
      // keep raw
    }
    return { ok: false, status: res.status, detail };
  }

  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return { ok: false, status: 502, detail: "Ответ OpenRouter не JSON." };
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return { ok: false, status: 502, detail: "Пустой ответ модели." };
  return { ok: true, content };
}

export function getOpenRouterConfig(): { key: string; model: string } | null {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return null;
  const modelRaw = process.env.OPENROUTER_MODEL?.trim();
  const model = modelRaw && modelRaw.length > 0 ? modelRaw : "openai/gpt-4o-mini";
  return { key, model };
}

export function openRouterHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://lesson-plan.local",
    "X-Title": process.env.OPENROUTER_APP_TITLE?.trim() || "Lesson Plan Constructor",
  };
}

export function isConstructorV3Enabled(): boolean {
  const v = process.env.CONSTRUCTOR_V3_ENABLED?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}
