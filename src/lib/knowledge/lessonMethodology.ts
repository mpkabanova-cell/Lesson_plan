import fs from "node:fs";
import path from "node:path";

import { DEFAULT_GOAL_SYSTEM_PROMPT } from "@/lib/defaultGoalSystemPrompt";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/defaultSystemPrompt";

const DEFAULT_MAX_METHODOLOGY_CHARS = 120_000;
const DEFAULT_MAX_SUBJECT_KNOWLEDGE_CHARS = 120_000;

/** Контекст для подмешивания предметных файлов знаний (например рабочей программы). */
export type KnowledgePromptContext = {
  subject?: string;
  grade?: string;
};

const INFORMATICS_SUBJECT = "Информатика";
const INFORMATICS_PROGRAM_FILE = "informatika_7_9.md";
const INFORMATICS_GRADES = new Set(["7", "8", "9"]);

const SUBJECT_KNOWLEDGE_HEADER_INFORMATICS = `Предметная опора (рабочая программа по информатике, 7–9 классы). Учитывай при подборе содержания урока; оформление плана — по системному промпту выше.`;

let cachedRaw: string | null = null;
const optionalKnowledgeCache = new Map<string, string>();

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

function readOptionalKnowledgeFile(relativeName: string): string {
  const cached = optionalKnowledgeCache.get(relativeName);
  if (cached !== undefined) return cached;
  const filePath = path.join(process.cwd(), "src/lib/knowledge", relativeName);
  let raw = "";
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    raw = "";
  }
  optionalKnowledgeCache.set(relativeName, raw);
  return raw;
}

/**
 * Текст предметного файла с учётом лимита `LESSON_SUBJECT_KNOWLEDGE_MAX_CHARS` (сервер только).
 */
function getSubjectKnowledgeForApi(relativeName: string): string {
  const raw = stripHtmlComments(readOptionalKnowledgeFile(relativeName));
  if (!raw) return "";

  const envMax = process.env.LESSON_SUBJECT_KNOWLEDGE_MAX_CHARS?.trim();
  const max =
    envMax && /^\d+$/.test(envMax)
      ? Number.parseInt(envMax, 10)
      : DEFAULT_MAX_SUBJECT_KNOWLEDGE_CHARS;

  if (raw.length <= max) return raw;
  return (
    raw.slice(0, max).trimEnd() +
    "\n\n[…текст предметной базы обрезан по LESSON_SUBJECT_KNOWLEDGE_MAX_CHARS]"
  );
}

function shouldAppendInformaticsProgram(ctx?: KnowledgePromptContext): boolean {
  if (!ctx?.subject?.trim()) return false;
  if (ctx.subject.trim() !== INFORMATICS_SUBJECT) return false;
  const g = ctx.grade?.trim();
  if (!g) return false;
  return INFORMATICS_GRADES.has(g);
}

function appendInformaticsSubjectKnowledge(base: string, ctx?: KnowledgePromptContext): string {
  if (!shouldAppendInformaticsProgram(ctx)) return base;
  const sk = getSubjectKnowledgeForApi(INFORMATICS_PROGRAM_FILE);
  if (!sk.trim()) return base;
  return `${base}

---

${SUBJECT_KNOWLEDGE_HEADER_INFORMATICS}

${sk}`;
}

const METHODOLOGY_HEADER = `Методическая база (документ KONSTRUKTOR_UROKA и связанные принципы). Опирайся на правила ниже при выборе приёмов, формулировок целей этапов, типов активности и обратной связи.

По **организации сценария, тегам HTML и внешнему виду плана** главный источник — текст системного промпта выше (то, что пользователь ввёл в поле интерфейса). Этот блок методики не переопределяет оформление: при любом противоречии следуй системному промпту.

Если указания системного промпта выше конфликтуют с перечисленными этапами из запроса пользователя — приоритет у этапов и длительности из входных данных пользователя. Общая длительность урока в минутах задаётся пользователем: сумма времени по этапам должна ей соответствовать без отклонений.`;

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
 * При предмете «Информатика» и классе 7–9 дополнительно подмешивается `informatika_7_9.md`.
 */
export function buildGoalSystemPromptForGeneration(
  userInstructions: string,
  ctx?: KnowledgePromptContext,
): string {
  const instructions = userInstructions.trim() || DEFAULT_GOAL_SYSTEM_PROMPT;
  const section = getGoalMethodologyForApi();
  if (!section) return appendInformaticsSubjectKnowledge(instructions, ctx);

  const merged = `${instructions}

---

${GOAL_METHODOLOGY_HEADER}

${section}`;

  return appendInformaticsSubjectKnowledge(merged, ctx);
}

/**
 * Собирает итоговое системное сообщение для OpenRouter.
 *
 * Политика: **инструкции из интерфейса** (роль, формат HTML, требования к оформлению) задаёт пользователь через `userInstructions` — они идут первыми и главнее по структуре плана;
 * к ним **всегда добавляется** блок методики из `konstruktorUroka.md`, если файл не пустой (содержательная опора, без навязывания таблицы).
 * При предмете «Информатика» и классе 7–9 после методики добавляется `informatika_7_9.md`.
 */
export function buildSystemPromptForGeneration(
  userInstructions: string,
  ctx?: KnowledgePromptContext,
): string {
  const instructions = userInstructions.trim() || DEFAULT_SYSTEM_PROMPT;
  const kb = getMethodologyKnowledgeForApi();
  if (!kb) return appendInformaticsSubjectKnowledge(instructions, ctx);

  const merged = `${instructions}

---

${METHODOLOGY_HEADER}

${kb}`;

  return appendInformaticsSubjectKnowledge(merged, ctx);
}
