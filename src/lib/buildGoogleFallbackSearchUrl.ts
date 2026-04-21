/**
 * Поиск по разделу публикаций через обычную страницу Google (без Custom Search API и биллинга).
 */
export function buildGoogleFallbackSearchUrl(
  query: string,
  opts?: { subject?: string; grade?: string },
): string {
  const parts: string[] = ["site:urok.1sept.ru/publication"];
  const q = query.trim().replace(/\s+/g, " ");
  if (q) parts.push(q);
  const sub = opts?.subject?.trim();
  if (sub) parts.push(sub);
  const gr = opts?.grade?.trim();
  if (gr) parts.push(`${gr} класс`);
  const combined = parts.join(" ").trim();
  return `https://www.google.com/search?q=${encodeURIComponent(combined)}`;
}
