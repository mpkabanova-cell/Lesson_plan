/**
 * Поиск по 1sept.ru через обычную страницу Google (без Custom Search API и биллинга).
 * Пользователь уходит на google.com с ограничением site:1sept.ru.
 */
export function buildGoogleFallbackSearchUrl(
  query: string,
  opts?: { subject?: string; grade?: string },
): string {
  const parts: string[] = ["site:1sept.ru"];
  const q = query.trim().replace(/\s+/g, " ");
  if (q) parts.push(q);
  const sub = opts?.subject?.trim();
  if (sub) parts.push(sub);
  const gr = opts?.grade?.trim();
  if (gr) parts.push(`${gr} класс`);
  const combined = parts.join(" ").trim();
  return `https://www.google.com/search?q=${encodeURIComponent(combined)}`;
}
