import katex from "katex";

/**
 * Заменяет span[data-latex] на разметку KaTeX для экспорта в Word (иначе пустые span).
 */
export function expandMathSpansForExport(html: string): string {
  return html.replace(
    /<span\b[^>]*\bdata-latex="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi,
    (_full, latexEnc: string) => {
      const latex = latexEnc
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\\\\/g, "\\");
      try {
        return katex.renderToString(latex, { throwOnError: false, displayMode: false });
      } catch {
        return `<span>${latex}</span>`;
      }
    },
  );
}
