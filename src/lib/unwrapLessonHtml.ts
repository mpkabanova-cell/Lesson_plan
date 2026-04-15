/**
 * TipTap StarterKit не содержит узлов `section` / `article` / `main` — `setContent` с такими корнями
 * часто даёт пустой документ. Снимаем обёртки, сохраняя внутренний HTML.
 */
const WRAPPER_TAGS = ["section", "article", "main"] as const;

export function unwrapSemanticWrapperTags(html: string): string {
  let out = html;
  for (const tag of WRAPPER_TAGS) {
    let prev = "";
    while (prev !== out) {
      prev = out;
      out = out.replace(
        new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"),
        "$1",
      );
    }
  }
  return out;
}

/** @deprecated используйте unwrapSemanticWrapperTags */
export function unwrapSectionTags(html: string): string {
  return unwrapSemanticWrapperTags(html);
}

/**
 * Один корневой `<div>…</div>` TipTap не всегда разбирает в документ — снимаем оболочку по слоям.
 */
export function unwrapOuterDivWrappers(html: string): string {
  let t = html.trim();
  let prev = "";
  while (prev !== t) {
    prev = t;
    const m = /^<div\b[^>]*>([\s\S]*)<\/div>\s*$/i.exec(t);
    if (!m) break;
    const inner = m[1].trim();
    if (!inner) break;
    t = inner;
  }
  return t;
}
