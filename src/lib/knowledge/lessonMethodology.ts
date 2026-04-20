import fs from "node:fs";
import path from "node:path";

import { DEFAULT_SYSTEM_PROMPT } from "@/lib/defaultSystemPrompt";

const DEFAULT_MAX_METHODOLOGY_CHARS = 120_000;

let cachedRaw: string | null = null;

function readKnowledgeFile(): string {
  if (cachedRaw !== null) return cachedRaw;
  const filePath = path.join(process.cwd(), "src/lib/knowledge/konstruktorUroka.md");
  try {
    cachedRaw = fs.readFileSync(filePath, "utf-8");
  } catch {
    cachedRaw = "";
  }
  return cachedRaw;
}

/** Убирает HTML-комментарии из markdown (служебные пометки). */
function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

/**
 * Сырой текст методики из файла (для тестов/диагностики).
 */
export function getMethodologyKnowledgeRaw(): string {
  return readKnowledgeFile();
}

/**
 * Текст методики с учётом лимита символов (переменная окружения LESSON_METHODOLOGY_MAX_CHARS).
 */
export function getMethodologyKnowledgeForApi(): string {
  const raw = stripHtmlComments(readKnowledgeFile());
  if (!raw) return "";

  const envMax = process.env.LESSON_METHODOLOGY_MAX_CHARS?.trim();
  const max =
    envMax && /^\d+$/.test(envMax)
      ? Number.parseInt(envMax, 10)
      : DEFAULT_MAX_METHODOLOGY_CHARS;

  if (raw.length <= max) return raw;
  return (
    raw.slice(0, max).trimEnd() +
    "\n\n[…текст методики обрезан по LESSON_METHODOLOGY_MAX_CHARS]"
  );
}

const METHODOLOGY_HEADER = `Методическая база (документ KONSTRUKTOR_UROKA и связанные принципы). Опирайся на правила ниже при выборе приёмов, формулировок целей этапов, типов активности и обратной связи. Если указания системного промпта выше конфликтуют с перечисленными этапами из запроса пользователя — приоритет у этапов и длительности из входных данных пользователя.`;

/**
 * Собирает итоговое системное сообщение для OpenRouter.
 *
 * Политика: **инструкции из интерфейса** (роль, формат HTML, требования к разметке) задаёт пользователь через `userInstructions`;
 * к ним **всегда добавляется** блок методики из `konstruktorUroka.md`, если файл не пустой.
 */
export function buildSystemPromptForGeneration(userInstructions: string): string {
  const instructions = userInstructions.trim() || DEFAULT_SYSTEM_PROMPT;
  const kb = getMethodologyKnowledgeForApi();
  if (!kb) return instructions;

  return `${instructions}

---

${METHODOLOGY_HEADER}

${kb}`;
}
