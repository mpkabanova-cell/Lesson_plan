import fs from "node:fs";
import path from "node:path";

import { DEFAULT_GOAL_SYSTEM_PROMPT } from "@/lib/defaultGoalSystemPrompt";
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

const GOAL_SECTION_START = "## Целеполагание и результат";

const FALLBACK_GOAL_SECTION = `## Целеполагание и результат

- Цель урока формулируется через **ожидаемый результат**: что ученик сможет сделать, объяснить, применить к концу урока (глаголы деятельности: объяснить, построить, сравнить, решить, обосновать).
- Согласуйте цель с **возрастом**, **уровнем класса** и **темой**: избегайте слишком широких формулировок и дублирования формулировок учебника без операционализации.
- На этапах **целеполагания** и **мотивации** кратко покажите связь темы с жизнью, предыдущим материалом или будущим применением.`;

/**
 * Извлекает из konstruktorUroka.md раздел «Целеполагание и результат» до следующего ##.
 */
export function extractGoalSectionFromKnowledge(raw: string): string {
  const text = stripHtmlComments(raw);
  const idx = text.indexOf(GOAL_SECTION_START);
  if (idx === -1) return FALLBACK_GOAL_SECTION;

  const after = text.slice(idx + GOAL_SECTION_START.length);
  const next = after.search(/\n## /);
  const body = next === -1 ? after : after.slice(0, next);
  const section = `${GOAL_SECTION_START}${body}`.trim();
  return section.length > 20 ? section : FALLBACK_GOAL_SECTION;
}

function getGoalMethodologyForApi(): string {
  const raw = readKnowledgeFile();
  if (!raw) return extractGoalSectionFromKnowledge("");
  return extractGoalSectionFromKnowledge(raw);
}

const GOAL_METHODOLOGY_HEADER = `Фрагмент методической базы KONSTRUKTOR_UROKA (целеполагание). Учитывай при формулировке цели урока.`;

/**
 * Системный промпт для эндпоинта генерации цели урока: инструкции пользователя + секция целеполагания из методики.
 */
export function buildGoalSystemPromptForGeneration(userInstructions: string): string {
  const instructions = userInstructions.trim() || DEFAULT_GOAL_SYSTEM_PROMPT;
  const section = getGoalMethodologyForApi();
  if (!section) return instructions;

  return `${instructions}

---

${GOAL_METHODOLOGY_HEADER}

${section}`;
}

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
