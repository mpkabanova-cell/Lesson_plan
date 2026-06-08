/**
 * Полуавтоматическое извлечение FGOS-этапов из docs/KONSTRUKTOR_UROKA.md.
 * Результат — черновик; ручная вычитка в fgosStages.json обязательна.
 *
 * Run: node scripts/extract-fgos-stages.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "docs/KONSTRUKTOR_UROKA.md");
const OUT = path.join(ROOT, "src/lib/constructor/data/fgosStages.extracted.json");

const SECTIONS = [
  { id: "new_knowledge", start: /Структура урока усвоения новых знаний/i },
  { id: "consolidation", start: /Структура урока комплексного применения/i },
  { id: "review", start: /Структура урока актуализации знаний/i },
];

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

function extractStages(block) {
  const stages = [];
  const chunks = block.split(/##\s*([+*]+)\s*/);
  for (let i = 1; i < chunks.length; i += 2) {
    const flagRaw = chunks[i].trim();
    const body = chunks[i + 1] ?? "";
    const titleMatch = body.match(/^[\d.]+\s*([\s\S]*?)(?:\n|```)/);
    const title = titleMatch
      ? titleMatch[1].replace(/\s+/g, " ").trim()
      : body.split("\n")[0].replace(/\s+/g, " ").trim();
    if (!title || title.length < 4) continue;
    const fgosFlag = flagRaw.includes("+") ? "required" : "optional";
    stages.push({
      id: slugify(title),
      title,
      fgosFlag,
      goal: "",
      tasks: [],
      successIndicators: [],
      allowedTeacher: [],
      allowedStudent: [],
      forbidden: [],
      requiredOutputs: [],
    });
  }
  return stages;
}

const md = fs.readFileSync(SRC, "utf-8");
const out = {};

for (let s = 0; s < SECTIONS.length; s++) {
  const { id, start } = SECTIONS[s];
  const startIdx = md.search(start);
  if (startIdx < 0) {
    console.warn(`Section not found: ${id}`);
    continue;
  }
  const endIdx =
    s + 1 < SECTIONS.length ? md.search(SECTIONS[s + 1].start) : md.length;
  const block = md.slice(startIdx, endIdx > startIdx ? endIdx : md.length);
  out[id] = {
    label: id,
    stages: extractStages(block),
  };
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf-8");
console.log(`Wrote draft to ${OUT} (${Object.keys(out).length} lesson types)`);
