import { marked } from "marked";
import { sanitizeLessonHtml } from "./sanitizeHtml";
import { unwrapSemanticWrapperTags } from "./unwrapLessonHtml";

marked.setOptions({ gfm: true, breaks: true });

/**
 * Model may return HTML or Markdown; normalize to sanitized HTML for TipTap.
 */
export async function aiResponseToHtml(raw: string): Promise<string> {
  const trimmed = raw.trim();
  if (!trimmed) return "<p></p>";

  const looksLikeHtml = /<section[\s>]|<h[1-6][\s>]|<table[\s>]|<div[\s>]|<p[\s>]/i.test(
    trimmed,
  );

  const parsed = await marked.parse(trimmed);
  const html = looksLikeHtml ? trimmed : String(parsed);
  const clean = sanitizeLessonHtml(html);
  return unwrapSemanticWrapperTags(clean);
}
