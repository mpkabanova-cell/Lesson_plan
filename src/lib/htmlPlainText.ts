/** Извлечь приблизительную длину видимого текста из HTML (для сравнения с редактором). */
export function approxPlainTextLengthFromHtml(html: string): number {
  if (typeof document === "undefined") {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim().length;
  }
  try {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const text = doc.body?.textContent ?? "";
    return text.replace(/\s+/g, " ").trim().length;
  } catch {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Текст для фолбэка: переносы абзацев из DOM. */
export function plainTextFromHtmlForFallback(html: string): string {
  if (typeof document === "undefined") {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  try {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    return (doc.body?.textContent ?? "").trim();
  } catch {
    return html.replace(/<[^>]+>/g, "").trim();
  }
}

/** Простой фолбэк: один или несколько &lt;p&gt; с экранированием. */
export function buildParagraphsFromPlainText(plain: string): string {
  const parts = plain
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "<p></p>";
  return parts.map((p) => `<p>${escapeHtml(p.replace(/\n+/g, " "))}</p>`).join("");
}
