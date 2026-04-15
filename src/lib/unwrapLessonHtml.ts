/**
 * TipTap StarterKit не содержит узла `section` — `setContent` с `<section>` даёт пустой/битый документ.
 * Снимаем обёртки, сохраняя внутренний HTML (h2, p, таблицы и т.д.).
 */
export function unwrapSectionTags(html: string): string {
  let out = html;
  let prev = "";
  while (prev !== out) {
    prev = out;
    out = out.replace(/<section\b[^>]*>([\s\S]*?)<\/section>/gi, "$1");
  }
  return out;
}
