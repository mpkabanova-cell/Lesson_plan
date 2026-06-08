import {
  convertAsciiLatexDelimitersToMathSpans,
  escapeHtmlAttributeValue,
} from "./latexAsciiDelimitersToHtmlSpans";

function toMathSpan(latex: string, display: boolean): string {
  const esc = escapeHtmlAttributeValue(latex.trim());
  return display
    ? `<span data-latex="${esc}" data-math-block=""></span>`
    : `<span data-latex="${esc}" data-math-inline=""></span>`;
}

function mapTextOutsideHtmlTags(text: string, mapFn: (chunk: string) => string): string {
  const parts = text.split(/(<[^>]+>)/g);
  return parts.map((part) => (part.startsWith("<") ? part : mapFn(part))).join("");
}

function replaceDollarDelimiters(text: string): string {
  let t = text;
  t = t.replace(/\$\$([\s\S]+?)\$\$/g, (_m, inner: string) => toMathSpan(inner, true));
  t = t.replace(/(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g, (_m, inner: string) => toMathSpan(inner, false));
  return t;
}

const MATH_ATOM =
  /(?:\\frac\{[^{}]*\}\{[^{}]*\}|\\sqrt(?:\[[^\]]*\])?\{[^{}]*\}|[a-zA-Z](?:\^\{[0-9]+\}|\^[0-9]+|_\{[0-9]+\}|_[0-9]+)?|[0-9]+(?:[.,][0-9]+)?)/;

/** Выражения вида a^2 + b^2 = c^2 или одиночное c^2 без делимитеров LaTeX. */
const BARE_MATH_EXPR = new RegExp(
  `${MATH_ATOM.source}(?:\\s*[+\\-·=≤≥≠<>]\\s*${MATH_ATOM.source})*`,
  "g",
);

function convertBareMathInChunk(chunk: string): string {
  if (!/[\\^_]|\\frac|\\sqrt/.test(chunk)) return chunk;
  if (chunk.includes("data-latex")) return chunk;
  return chunk.replace(BARE_MATH_EXPR, (m) => {
    if (!/[\\^]|\\frac|\\sqrt/.test(m)) return m;
    return toMathSpan(m, false);
  });
}

function convertBareMathExpressions(text: string): string {
  if (!/[\\^_]|\\frac|\\sqrt/.test(text)) return text;
  return mapTextOutsideHtmlTags(text, convertBareMathInChunk);
}

/** Полный пайплайн: \\( \\), $ $, «голые» a^2 и \\frac{}{}. */
export function convertAllMathToSpans(text: string): string {
  if (!text.trim()) return text;
  let t = convertAsciiLatexDelimitersToMathSpans(text);
  if (t.includes("$")) t = replaceDollarDelimiters(t);
  t = convertBareMathExpressions(t);
  return t;
}
