/**
 * Модели часто возвращают LaTeX в виде `\\( … \\)` / `\\[ … \\]`.
 * Marked и браузер не рендерят это в KaTeX — превращаем в span до parse / для уже готового HTML.
 */

export function escapeHtmlAttributeValue(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function replaceDelimited(
  text: string,
  open: string,
  close: string,
  display: boolean,
): string {
  const openLen = open.length;
  const closeLen = close.length;
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf(open, i);
    if (start === -1) {
      chunks.push(text.slice(i));
      break;
    }
    chunks.push(text.slice(i, start));
    const innerStart = start + openLen;
    const end = text.indexOf(close, innerStart);
    if (end === -1) {
      chunks.push(text.slice(start));
      break;
    }
    const latex = text.slice(innerStart, end).trim();
    const esc = escapeHtmlAttributeValue(latex);
    if (display) {
      chunks.push(`<span data-latex="${esc}" data-math-block=""></span>`);
    } else {
      chunks.push(`<span data-latex="${esc}" data-math-inline=""></span>`);
    }
    i = end + closeLen;
  }
  return chunks.join("");
}

/** `\\( … \\)` и `\\[ … \\]` → span для KaTeX в редакторе. Повторный вызов безопасен. */
export function convertAsciiLatexDelimitersToMathSpans(text: string): string {
  if (!text.includes("\\(") && !text.includes("\\[")) return text;
  let t = replaceDelimited(text, "\\(", "\\)", false);
  t = replaceDelimited(t, "\\[", "\\]", true);
  return t;
}
