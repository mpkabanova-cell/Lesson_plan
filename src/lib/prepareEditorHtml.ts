import { sanitizeLessonHtml } from "./sanitizeHtml";
import { unwrapOuterDivWrappers, unwrapSemanticWrapperTags } from "./unwrapLessonHtml";

/**
 * Тот же пайплайн, что на сервере в aiResponseToHtml (sanitize → unwrap).
 * Повторяем перед загрузкой в TipTap, чтобы не потерять контент из-за обёрток
 * и чтобы родитель не перезаписался пустым getHTML() после setContent.
 */
export function prepareLessonPlanHtmlForEditor(dirty: string): string {
  const clean = sanitizeLessonHtml(dirty);
  const unwrapped = unwrapSemanticWrapperTags(clean);
  return unwrapOuterDivWrappers(unwrapped);
}
