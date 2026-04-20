/**
 * Извлекает текст из docs/KONSTRUKTOR_UROKA.pdf → src/lib/knowledge/konstruktorUroka.md
 * Запуск: npm run extract:knowledge (из корня репозитория)
 */
const fs = require("fs");
const path = require("path");

async function main() {
  let pdf;
  try {
    pdf = require("pdf-parse");
  } catch {
    console.error("Установите зависимость: npm install pdf-parse --save-dev");
    process.exit(1);
  }

  const root = path.join(__dirname, "..");
  const pdfPath = path.join(root, "docs", "KONSTRUKTOR_UROKA.pdf");
  const outPath = path.join(root, "src", "lib", "knowledge", "konstruktorUroka.md");

  if (!fs.existsSync(pdfPath)) {
    console.error("Не найден файл:", pdfPath);
    console.error("Скопируйте KONSTRUKTOR_UROKA.pdf в папку docs/ и повторите.");
    process.exit(1);
  }

  const buf = fs.readFileSync(pdfPath);
  const res = await pdf(buf);
  const header =
    "# KONSTRUKTOR_UROKA\n\n" +
    "<!-- Автоматически извлечено из docs/KONSTRUKTOR_UROKA.pdf. Редактируйте или перегенерируйте npm run extract:knowledge -->\n\n";
  fs.writeFileSync(outPath, header + (res.text || "").trim() + "\n", "utf-8");
  console.log("Готово:", outPath);
  console.log("Страниц:", res.numpages, "символов:", (res.text || "").length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
