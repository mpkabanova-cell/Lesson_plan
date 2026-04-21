/** Ограничение выдачи Google Custom Search по домену «1 сентября». */
export const SITE_1SEPT = "site:1sept.ru";

const MAX_QUERY_LEN = 2000;

/**
 * Собирает строку запроса для Google: основной текст + предмет + класс + site:1sept.ru.
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
  parts.push(SITE_1SEPT);
  const combined = parts.join(" ").replace(/\s+/g, " ").trim();
  if (combined.length <= MAX_QUERY_LEN) return combined;
  return combined.slice(0, MAX_QUERY_LEN).trim();
}
