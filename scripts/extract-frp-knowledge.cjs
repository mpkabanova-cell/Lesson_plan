/**
 * Извлекает и размечает ФРП из docs/frp → src/lib/knowledge/frp/
 * Запуск: npm run extract:frp
 */
const fs = require("fs");
const path = require("path");
const { FRP_SUBJECTS } = require("./frp-config.cjs");

const SECTION_MARKERS = [
  { key: "content", title: "СОДЕРЖАНИЕ ОБУЧЕНИЯ", patterns: [/СОДЕРЖАНИЕ\s+ОБУЧЕНИЯ/i] },
  {
    key: "results",
    title: "ПЛАНИРУЕМЫЕ РЕЗУЛЬТАТЫ",
    patterns: [/ПЛАНИРУЕМЫЕ\s+РЕЗУЛЬТАТЫ/i],
  },
  {
    key: "thematic",
    title: "ТЕМАТИЧЕСКОЕ ПЛАНИРОВАНИЕ",
    patterns: [/ТЕМАТИЧЕСКОЕ\s+ПЛАНИРОВАНИЕ/i],
  },
];

function normalizeWhitespace(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanRawFrpText(text) {
  let t = text.replace(/\r\n/g, "\n");
  t = t.replace(/^Федеральная рабочая программа[^\n]*\n/gm, "");
  t = t.replace(/^## \d+\s*$/gm, "");
  t = t.replace(/\.{4,}\s*\d+\s*$/gm, "");
  return normalizeWhitespace(t);
}

function findSectionStart(text, patterns) {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m && m.index >= 0) return m.index;
  }
  return -1;
}

function splitSections(text) {
  const hits = [];
  for (const marker of SECTION_MARKERS) {
    const idx = findSectionStart(text, marker.patterns);
    if (idx >= 0) hits.push({ ...marker, index: idx });
  }
  hits.sort((a, b) => a.index - b.index);

  const sections = {};
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index;
    const end = i + 1 < hits.length ? hits[i + 1].index : text.length;
    let chunk = text.slice(start, end).trim();
    chunk = chunk.replace(new RegExp(`^##?\\s*${hits[i].title}[^\\n]*`, "i"), "").trim();
    sections[hits[i].key] = normalizeWhitespace(chunk);
  }
  return sections;
}

function extractTopicsFromThematic(thematicText) {
  if (!thematicText) return [];
  const topics = [];
  const lines = thematicText.split("\n");
  let currentGrade = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const gradeMatch = line.match(/^(?:##\s*)?(\d{1,2})\s*КЛАСС/i);
    if (gradeMatch) {
      currentGrade = gradeMatch[1];
      continue;
    }

    const sectionMatch = line.match(/^Раздел\s+(\d+(?:\.\d+)?)[.:]?\s*(.+)$/i);
    if (sectionMatch) {
      topics.push({
        grade: currentGrade,
        code: `раздел_${sectionMatch[1]}`,
        title: sectionMatch[2].trim(),
        type: "section",
      });
      continue;
    }

    const topicMatch = line.match(/^(?:##\s*)?(\d+\.\d+)\s+(.+)$/);
    if (topicMatch) {
      const titleParts = [topicMatch[2].trim()];
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const next = lines[j].trim();
        if (!next || /^##/.test(next) || /^\d+\.\d+/.test(next) || /^Раздел/.test(next)) break;
        if (next.length < 80) titleParts.push(next);
      }
      topics.push({
        grade: currentGrade,
        code: topicMatch[1],
        title: titleParts.join(" ").replace(/\s+/g, " ").slice(0, 200),
        type: "topic",
      });
    }
  }

  const seen = new Set();
  return topics.filter((t) => {
    const key = `${t.grade}|${t.code}|${t.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return t.title.length >= 3;
  });
}

function buildMarkedMarkdown(meta, sections) {
  const header = [
    "---",
    `frp_subject: ${meta.subject}`,
    `frp_file_id: ${meta.id}`,
    `frp_level: ${meta.level}`,
    `frp_grades: ${meta.grades.join(",")}`,
    `frp_track: базовый`,
    `frp_source_pdf: ${meta.pdf}`,
    "---",
    "",
    `# ФРП: ${meta.subject} (${meta.level}, ${meta.grades.join("–")} классы)`,
    "",
  ];
  if (meta.note) header.push(`> ${meta.note}`, "");

  const body = [];
  if (sections.content) {
    body.push("## СОДЕРЖАНИЕ ОБУЧЕНИЯ", "", sections.content, "");
  }
  if (sections.results) {
    body.push("## ПЛАНИРУЕМЫЕ РЕЗУЛЬТАТЫ", "", sections.results, "");
  }
  if (sections.thematic) {
    body.push("## ТЕМАТИЧЕСКОЕ ПЛАНИРОВАНИЕ", "", sections.thematic, "");
  }

  if (body.length === 0) {
    body.push("## ПОЛНЫЙ ТЕКСТ (разделы не распознаны автоматически)", "", meta.rawFallback || "");
  }

  return header.join("\n") + body.join("\n") + "\n";
}

async function extractPdf(pdfPath) {
  const pdf = require("pdf-parse");
  const buf = fs.readFileSync(pdfPath);
  return pdf(buf);
}

async function main() {
  const root = path.join(__dirname, "..");
  const summary = [];

  for (const subjectEntry of FRP_SUBJECTS) {
    const allTopics = [];

    for (const file of subjectEntry.files) {
      const pdfPath = path.join(root, file.pdf);
      const outPath = path.join(root, file.out);

      if (!fs.existsSync(pdfPath)) {
        console.error("PDF не найден:", pdfPath);
        process.exitCode = 1;
        continue;
      }

      console.log("Извлечение:", file.pdf);
      const res = await extractPdf(pdfPath);
      const cleaned = cleanRawFrpText(res.text || "");
      const sections = splitSections(cleaned);

      const meta = {
        subject: subjectEntry.subject,
        id: file.id,
        level: file.level,
        grades: file.grades,
        pdf: file.pdf,
        note: file.note,
        rawFallback: cleaned.slice(0, 50000),
      };

      const markdown = buildMarkedMarkdown(meta, sections);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, markdown, "utf-8");

      const topics = extractTopicsFromThematic(sections.thematic).map((t) => ({
        ...t,
        fileId: file.id,
        mdPath: file.out,
      }));
      allTopics.push(...topics);

      summary.push({
        subject: subjectEntry.subject,
        file: file.id,
        pages: res.numpages,
        chars: cleaned.length,
        sections: Object.keys(sections),
        topics: topics.length,
        out: file.out,
      });
      console.log(
        `  → ${file.out} (${res.numpages} стр., разделы: ${Object.keys(sections).join(", ") || "нет"}, тем: ${topics.length})`,
      );
    }

    const topicsPath = path.join(root, "src/lib/knowledge/frp", subjectEntry.subject, "topics.json");
    fs.mkdirSync(path.dirname(topicsPath), { recursive: true });
    fs.writeFileSync(
      topicsPath,
      JSON.stringify(
        {
          subject: subjectEntry.subject,
          appAliases: subjectEntry.appAliases,
          generatedAt: new Date().toISOString(),
          topics: allTopics,
        },
        null,
        2,
      ),
      "utf-8",
    );
    console.log(`  index: ${topicsPath} (${allTopics.length} тем)`);
  }

  const manifestPath = path.join(root, "src/lib/knowledge/frp/manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        track: "базовый",
        subjects: FRP_SUBJECTS.map((s) => ({
          subject: s.subject,
          appAliases: s.appAliases,
          files: s.files.map((f) => ({
            id: f.id,
            level: f.level,
            grades: f.grades,
            pdf: f.pdf,
            md: f.out,
            note: f.note ?? null,
          })),
        })),
        summary,
      },
      null,
      2,
    ),
    "utf-8",
  );

  console.log("\nГотово. Manifest:", manifestPath);
  console.log("Сводка:", JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
