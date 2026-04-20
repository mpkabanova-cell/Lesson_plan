export type StageTiming = { stage: string; minutes: number };

/**
 * Пропорционально перераспределяет минуты по этапам так, чтобы сумма равнялась `targetTotal`
 * (целые минуты; остаток по наибольшим дробным частям).
 */
export function normalizeStageMinutesToTotal(
  rows: StageTiming[],
  targetTotal: number,
): StageTiming[] {
  if (rows.length === 0 || !Number.isFinite(targetTotal) || targetTotal < 1) {
    return [];
  }

  const n = rows.length;
  const sumM = rows.reduce((s, r) => s + r.minutes, 0);

  if (sumM <= 0) {
    const base = Math.floor(targetTotal / n);
    const rem = targetTotal - base * n;
    return rows.map((row, i) => ({
      ...row,
      minutes: base + (i < rem ? 1 : 0),
    }));
  }

  const exact = rows.map((r) => (r.minutes * targetTotal) / sumM);
  const floors = exact.map((x) => Math.floor(x));
  const allocated = floors.reduce((a, b) => a + b, 0);
  let remainder = targetTotal - allocated;

  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);

  const minutes = [...floors];
  let o = 0;
  while (remainder > 0 && order.length > 0) {
    minutes[order[o % order.length].i]++;
    remainder--;
    o++;
  }

  return rows.map((row, i) => ({ ...row, minutes: minutes[i] }));
}

/**
 * Тайминг из таблицы плана (`table.lesson-plan-table`, строки `tr` с data-stage и data-minutes).
 */
export function extractTimingFromLessonPlanTable(html: string): StageTiming[] {
  const out: StageTiming[] = [];
  const tableMatch = /<table[^>]*class="[^"]*lesson-plan-table[^"]*"[^>]*>([\s\S]*?)<\/table>/i.exec(
    html,
  );
  if (!tableMatch) return [];
  const tableInner = tableMatch[1];
  const tbodyMatch = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(tableInner);
  const body = tbodyMatch ? tbodyMatch[1] : tableInner;
  const trRe = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(body)) !== null) {
    const attrs = m[1] || "";
    if (/lesson-plan-header-row/i.test(attrs)) continue;
    const ds = /data-stage="([^"]*)"/i.exec(attrs);
    const dm = /data-minutes="(\d+)"/i.exec(attrs);
    if (!ds || !dm) continue;
    const stage = ds[1].replace(/<[^>]+>/g, "").trim();
    const minutes = parseInt(dm[1], 10);
    if (stage && Number.isFinite(minutes)) {
      out.push({ stage, minutes });
    }
  }
  return out;
}

/**
 * Из HTML плана: таблица плана → секции с data-minutes → разбор по блокам h2 + «Время: N мин».
 */
export function extractTimingFromHtml(html: string): StageTiming[] {
  const fromTable = extractTimingFromLessonPlanTable(html);
  if (fromTable.length > 0) {
    return fromTable;
  }

  const fromSections =
    typeof window === "undefined"
      ? extractTimingFromSectionsServer(html)
      : extractTimingFromSectionsClient(html);

  if (fromSections.length > 0) {
    return fromSections;
  }
  return extractTimingFromH2Blocks(html);
}

function extractTimingFromSectionsClient(html: string): StageTiming[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const sections = doc.querySelectorAll("section.lesson-stage");
  const out: StageTiming[] = [];
  sections.forEach((el) => {
    const name =
      el.getAttribute("data-stage")?.trim() ||
      el.querySelector("h1, h2, h3")?.textContent?.trim() ||
      "";
    const dm = el.getAttribute("data-minutes");
    const minutes = dm ? parseInt(dm, 10) : NaN;
    if (name && Number.isFinite(minutes)) {
      out.push({ stage: name, minutes });
    }
  });
  return out;
}

function extractTimingFromSectionsServer(html: string): StageTiming[] {
  const out: StageTiming[] = [];
  const chunkRe = /<section([^>]*)>([\s\S]*?)<\/section>/gi;
  let match: RegExpExecArray | null;
  while ((match = chunkRe.exec(html)) !== null) {
    const attrs = match[1] || "";
    const inner = match[2] || "";
    if (!/lesson-stage/.test(attrs)) continue;
    const ds = /data-stage="([^"]*)"/i.exec(attrs);
    const dm = /data-minutes="(\d+)"/i.exec(attrs);
    const stage = ds?.[1]?.trim() || "";
    const minutes = dm ? parseInt(dm[1], 10) : NaN;
    if (!stage && inner) {
      const h = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(inner);
      const fallback = h?.[1]?.replace(/<[^>]+>/g, "")?.trim() || "";
      if (fallback) {
        if (Number.isFinite(minutes)) out.push({ stage: fallback, minutes });
      }
      continue;
    }
    if (stage && Number.isFinite(minutes)) {
      out.push({ stage, minutes });
    }
  }
  return out;
}

/** После снятия section: этапы по заголовкам h2 и строке «Время: … N мин …». */
function extractTimingFromH2Blocks(html: string): StageTiming[] {
  const out: StageTiming[] = [];
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  const matches: Array<{ index: number; stage: string; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const stage = m[1].replace(/<[^>]+>/g, "").trim();
    matches.push({ index: m.index, stage, end: m.index + m[0].length });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].end;
    const end = i + 1 < matches.length ? matches[i + 1].index : html.length;
    const block = html.slice(start, end);
    const tm =
      block.match(/Время:[\s\S]*?(\d+)\s*мин/i) ||
      block.match(/(\d+)\s*мин(?:\s*<\/p>|\s*<br)/i);
    const minutes = tm ? parseInt(tm[1], 10) : NaN;
    const stage = matches[i].stage;
    if (stage && Number.isFinite(minutes)) {
      out.push({ stage, minutes });
    }
  }
  return out;
}
