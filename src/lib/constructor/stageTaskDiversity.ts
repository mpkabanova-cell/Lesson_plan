import { parseStageTasks } from "./stageValidators";

const DUPLICATE_THRESHOLD = 0.55;

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4);
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) {
    if (b.has(x)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function extractTaskConditions(markdown: string): string[] {
  return parseStageTasks(markdown)
    .map((t) => t.condition.trim())
    .filter((c) => c.length > 0);
}

function normalizeCondition(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4);
}

function sharesCorePhrase(a: string, b: string): boolean {
  const wa = significantWords(a);
  const wb = significantWords(b);
  if (wa.length < 2 || wb.length < 2) return false;
  const shared = wa.filter((w) => wb.includes(w));
  if (shared.length < 2) return false;
  return shared.includes(wa[0]) && shared.includes(wa[1]);
}

export function isDuplicateTask(newCondition: string, previousConditions: string[]): boolean {
  if (!newCondition.trim() || previousConditions.length === 0) return false;
  const a = tokenize(newCondition);
  const normNew = normalizeCondition(newCondition);
  for (const prev of previousConditions) {
    const normPrev = normalizeCondition(prev);
    if (normNew === normPrev) return true;
    if (normNew.length > 24 && (normPrev.includes(normNew) || normNew.includes(normPrev))) return true;
    if (jaccard(a, tokenize(prev)) >= DUPLICATE_THRESHOLD) return true;
    if (sharesCorePhrase(newCondition, prev)) return true;
  }
  return false;
}

export function collectPreviousTaskConditions(stageMarkdowns: string[]): string[] {
  const all: string[] = [];
  for (const md of stageMarkdowns) {
    all.push(...extractTaskConditions(md));
  }
  return all;
}

export function findDuplicateTasksInStage(
  markdown: string,
  previousConditions: string[],
): string | null {
  for (const condition of extractTaskConditions(markdown)) {
    if (isDuplicateTask(condition, previousConditions)) return condition;
  }
  return null;
}
