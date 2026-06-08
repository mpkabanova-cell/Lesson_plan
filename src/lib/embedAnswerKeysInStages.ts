const KEYS_HEADER_RE = /^\s*(?:\*\*)?ключи к заданиям(?:\*\*)?\s*$/i;
const TASK_LINE_RE = /^\s*(?:\*\*)?задание\s+(\d+\.\d+)(?:\*\*)?/i;
const ANSWER_LINE_RE = /^\s*(?:\*\*)?(ответ|разбор|ключ)(?:\*\*)?:/i;
const STAGE_BREAK_RE = /^(?:#{1,3}\s|учитель:|ученики:|цель:|время:)/i;

function parseKeysSection(lines: string[]): Map<string, string[]> {
  const answers = new Map<string, string[]>();
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(TASK_LINE_RE);
    if (m) {
      const id = m[1];
      const block: string[] = [];
      i++;
      while (i < lines.length) {
        if (TASK_LINE_RE.test(lines[i]) || KEYS_HEADER_RE.test(lines[i])) break;
        block.push(lines[i]);
        i++;
      }
      if (block.length > 0) answers.set(id, block);
      continue;
    }
    i++;
  }
  return answers;
}

function bodyHasAnswerNearTask(lines: string[], taskIdx: number): boolean {
  for (let j = taskIdx + 1; j < Math.min(lines.length, taskIdx + 16); j++) {
    if (TASK_LINE_RE.test(lines[j]) || STAGE_BREAK_RE.test(lines[j].trim())) break;
    if (ANSWER_LINE_RE.test(lines[j])) return true;
  }
  return false;
}

function findInsertIndex(lines: string[], taskIdx: number): number {
  let idx = taskIdx + 1;
  while (idx < lines.length) {
    const l = lines[idx];
    if (TASK_LINE_RE.test(l)) return idx;
    if (STAGE_BREAK_RE.test(l.trim())) return idx;
    idx++;
  }
  return idx;
}

/**
 * Переносит ответы из раздела **Ключи к заданиям** в конец сценария — сразу после соответствующего задания в этапе.
 * Отдельный раздел в конце удаляется.
 */
export function embedAnswerKeysInStages(markdown: string): string {
  const lines = markdown.split("\n");
  const keysHeaderIdx = lines.findIndex((l) => KEYS_HEADER_RE.test(l));
  if (keysHeaderIdx < 0) return markdown;

  const answers = parseKeysSection(lines.slice(keysHeaderIdx + 1));
  const bodyLines = lines.slice(0, keysHeaderIdx);

  if (answers.size === 0) {
    return bodyLines.join("\n").trimEnd();
  }

  const insertions: Array<{ at: number; lines: string[] }> = [];
  const inserted = new Set<string>();

  for (let i = 0; i < bodyLines.length; i++) {
    const m = bodyLines[i].match(TASK_LINE_RE);
    if (!m) continue;
    const id = m[1];
    if (!answers.has(id) || inserted.has(id)) continue;
    if (bodyHasAnswerNearTask(bodyLines, i)) {
      inserted.add(id);
      continue;
    }
    insertions.push({
      at: findInsertIndex(bodyLines, i),
      lines: ["", ...answers.get(id)!, ""],
    });
    inserted.add(id);
  }

  const result = [...bodyLines];
  insertions.sort((a, b) => b.at - a.at);
  for (const ins of insertions) {
    result.splice(ins.at, 0, ...ins.lines);
  }

  return result.join("\n").trimEnd();
}
