/** Раздел «Публикации» портала: материалы Открытого урока (urok.1sept.ru/publication/…). */
export const PUBLICATIONS_SITE_OPERATOR = "site:urok.1sept.ru/publication";

const MAX_QUERY_LEN = 2000;

/**
 * Строка запроса для Google: текст + предмет + класс + ограничение по разделу публикаций.
 * В консоли Programmable Search в список сайтов нужно добавить **urok.1sept.ru** (или поиск по всей сети с уточнением в запросе).
 */
export function build1septSearchQuery(
  query: string,
  opts?: { subject?: string; grade?: string },
): string {
  const parts: string[] = [];
  const q = query.trim().replace(/\s+/g, " ");
  if (q) parts.push(q);
  const sub = opts?.subject?.trim();
  if (sub) parts.push(sub);
  const gr = opts?.grade?.trim();
  if (gr) {
    parts.push(`${gr} класс`);
  }
  parts.push(PUBLICATIONS_SITE_OPERATOR);
  const combined = parts.join(" ").replace(/\s+/g, " ").trim();
  if (combined.length <= MAX_QUERY_LEN) return combined;
  return combined.slice(0, MAX_QUERY_LEN).trim();
}
