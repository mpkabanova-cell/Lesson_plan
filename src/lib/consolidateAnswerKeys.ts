const KEYS_HEADER_RE = /^\s*(?:\*\*)?ключи к заданиям(?:\*\*)?\s*$/i;
const TASK_LINE_RE = /^\s*(?:\*\*)?задание\s+(\d+\.\d+)(?:\*\*)?/i;
const ANSWER_LINE_RE = /^\s*(?:\*\*)?(ответ|разбор)(?:\*\*)?:/i;
const ANSWER_CONT_RE = /^\s*(?:шаг\s+\d|разбор:|вывод:)/i;

function taskIdFromBlock(block: string[]): string | null {
  const first = block[0] ?? "";
  return first.match(/задание\s+(\d+\.\d+)/i)?.[1] ?? null;
}

function dedupeBlocks(blocks: string[][]): string[][] {
  const byId = new Map<string, string[]>();
  for (const block of blocks) {
    const id = taskIdFromBlock(block);
    if (id) byId.set(id, block);
    else byId.set(`__${byId.size}`, block);
  }
  return [...byId.values()];
}

function formatKeysSection(blocks: string[][]): string {
  const lines = ["", "**Ключи к заданиям**", ""];
  for (const block of blocks) {
    lines.push(...block, "");
  }
  return lines.join("\n");
}

/**
 * Убирает «Ответ:/Разбор:» сразу после заданий в этапах и собирает их в конец сценария.
 */
export function consolidateAnswerKeys(markdown: string): string {
  const lines = markdown.split("\n");
  const keysHeaderIdx = lines.findIndex((l) => KEYS_HEADER_RE.test(l));

  const bodyEnd = keysHeaderIdx >= 0 ? keysHeaderIdx : lines.length;
  const extracted: string[][] = [];
  const body: string[] = [];
  let pendingTaskId: string | null = null;

  for (let i = 0; i < bodyEnd; i++) {
    const line = lines[i];
    const taskMatch = line.match(TASK_LINE_RE);
    if (taskMatch) pendingTaskId = taskMatch[1];

    if (ANSWER_LINE_RE.test(line) && pendingTaskId) {
      const block = [`Задание ${pendingTaskId}`, line];
      while (i + 1 < bodyEnd && ANSWER_CONT_RE.test(lines[i + 1])) {
        i++;
        block.push(lines[i]);
      }
      extracted.push(block);
      pendingTaskId = null;
      continue;
    }

    body.push(line);
  }

  if (extracted.length === 0) return markdown;

  if (keysHeaderIdx >= 0) {
    const tail = lines.slice(keysHeaderIdx);
    const existingIds = new Set<string>();
    for (const line of tail) {
      const m = line.match(TASK_LINE_RE);
      if (m) existingIds.add(m[1]);
    }
    const additions = extracted.filter((b) => {
      const id = taskIdFromBlock(b);
      return id && !existingIds.has(id);
    });
    if (additions.length === 0) {
      return `${body.join("\n").trimEnd()}\n\n${tail.join("\n").trimEnd()}`.trimEnd();
    }
    return `${body.join("\n").trimEnd()}\n\n${tail.join("\n").trimEnd()}\n\n${additions.map((b) => b.join("\n")).join("\n\n")}`.trimEnd();
  }

  return `${body.join("\n").trimEnd()}\n${formatKeysSection(dedupeBlocks(extracted))}`.trimEnd();
}
