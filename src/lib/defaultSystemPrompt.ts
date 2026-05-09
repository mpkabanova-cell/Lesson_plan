/**
 * Промпт по умолчанию для поля «Системный промпт: план».
 * Полный текст — в `defaultSystemPrompt.txt` (удобно править без экранирования LaTeX).
 * Ответ модели — Markdown (на сервере конвертируется в HTML для редактора).
 * К промпту добавляется методика из `konstruktorUroka.md` (и при «Информатика» 7–9 — `informatika_7_9.md`) — см. `buildSystemPromptForGeneration`.
 */
import defaultSystemPromptText from "./defaultSystemPrompt.txt";

export const DEFAULT_SYSTEM_PROMPT = defaultSystemPromptText.trimEnd();
