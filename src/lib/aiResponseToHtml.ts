import { marked } from "marked";
import { convertAsciiLatexDelimitersToMathSpans } from "./latexAsciiDelimitersToHtmlSpans";
import { applyLessonPlanTimingNormalization } from "./normalizeLessonPlanTimingHtml";
import { prepareLessonPlanHtmlForEditor } from "./prepareEditorHtml";

marked.setOptions({ gfm: true, breaks: true });

/**
 * Model may return HTML or Markdown; normalize to sanitized HTML for TipTap.
 * Один пайплайн с клиентом: [`prepareLessonPlanHtmlForEditor`](./prepareEditorHtml.ts).
 */
export async function aiResponseToHtml(
  raw: string,
  opts?: { durationMinutes?: number },
): Promise<string> {
  const trimmed = raw.trim();
  if (!trimmed) return "<p></p>";

  /** До marked: иначе `\\(` теряется/ломается и KaTeX не получает формулы. */
  const withMathSpans = convertAsciiLatexDelimitersToMathSpans(trimmed);

  const looksLikeHtml = /<section[\s>]|<h[1-6][\s>]|<table[\s>]|<div[\s>]|<p[\s>]/i.test(
    withMathSpans,
  );

  const parsed = await marked.parse(withMathSpans);
  const html = looksLikeHtml ? withMathSpans : String(parsed);
  let out = prepareLessonPlanHtmlForEditor(html);
  const d = opts?.durationMinutes;
  if (d != null && Number.isFinite(d) && d >= 1) {
    out = applyLessonPlanTimingNormalization(out, d);
  }
  return out;
}
