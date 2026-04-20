import { normalizeStageMinutesToTotal, type StageTiming } from "@/lib/parseTiming";

function parseMinutesFromSection(attrs: string, inner: string): number {
  const dm = /\bdata-minutes\s*=\s*"(\d+)"/i.exec(attrs);
  if (dm) return parseInt(dm[1], 10);
  const dm2 = /\bdata-minutes\s*=\s*'(\d+)'/i.exec(attrs);
  if (dm2) return parseInt(dm2[1], 10);
  const tm = inner.match(
    /(?:<strong>\s*Время:\s*<\/strong>\s*|Время:\s*)(\d+)\s*мин/i,
  );
  if (tm) return parseInt(tm[1], 10);
  return 0;
}

function parseStageTitle(attrs: string, inner: string, fallbackIndex: number): string {
  const ds = /\bdata-stage\s*=\s*"([^"]*)"/i.exec(attrs);
  if (ds?.[1]?.trim()) return ds[1].trim();
  const ds2 = /\bdata-stage\s*=\s*'([^']*)'/i.exec(attrs);
  if (ds2?.[1]?.trim()) return ds2[1].trim();
  const h2 = inner.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (h2) return h2[1].replace(/<[^>]+>/g, "").trim() || `Этап ${fallbackIndex + 1}`;
  return `Этап ${fallbackIndex + 1}`;
}

function replaceTimeInLastTableCell(rowInner: string, minutes: number): string {
  const matches = [...rowInner.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
  if (matches.length === 0) return rowInner;
  const last = matches[matches.length - 1]!;
  const full = last[0];
  const content = last[1] ?? "";
  const newContent = content.replace(/\d+\s*мин/i, `${minutes} мин`);
  if (newContent === content) return rowInner;
  return rowInner.replace(full, full.replace(content, newContent));
}

function tryNormalizeLessonPlanTable(html: string, durationMinutes: number): string | null {
  const tableRx =
    /(<table\b[^>]*class="[^"]*lesson-plan-table[^"]*"[^>]*>\s*<tbody[^>]*>)([\s\S]*?)(<\/tbody>\s*<\/table>)/i;
  const match = tableRx.exec(html);
  if (!match) return null;

  const tbodyContent = match[2];
  const rowMatches: Array<{ attrs: string; inner: string }> = [];
  const trRe = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  let tm: RegExpExecArray | null;
  while ((tm = trRe.exec(tbodyContent)) !== null) {
    const attrs = tm[1] || "";
    if (/lesson-plan-header-row/i.test(attrs)) continue;
    if (!/data-stage=/i.test(attrs)) continue;
    rowMatches.push({ attrs, inner: tm[2] || "" });
  }

  if (rowMatches.length === 0) return null;

  const rows: StageTiming[] = rowMatches.map((r, i) => ({
    stage:
      (/data-stage="([^"]*)"/i.exec(r.attrs)?.[1] ?? "")
        .trim()
        .replace(/<[^>]+>/g, "") || `Этап ${i + 1}`,
    minutes: (() => {
      const dm = /data-minutes="(\d+)"/i.exec(r.attrs);
      return dm ? parseInt(dm[1], 10) : 0;
    })(),
  }));

  const normalized = normalizeStageMinutesToTotal(rows, durationMinutes);
  if (normalized.length !== rowMatches.length) return null;

  let idx = 0;
  const newTbodyInner = tbodyContent.replace(
    /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi,
    (full, attrs: string, inner: string) => {
      const a = attrs || "";
      if (/lesson-plan-header-row/i.test(a)) return full;
      if (!/data-stage=/i.test(a)) return full;
      const row = normalized[idx];
      idx += 1;
      if (!row) return full;

      let newA = a;
      if (/\bdata-minutes\s*=\s*"/i.test(newA)) {
        newA = newA.replace(/\bdata-minutes\s*=\s*"\d+"/i, `data-minutes="${row.minutes}"`);
      } else if (/\bdata-minutes\s*=\s*'/i.test(newA)) {
        newA = newA.replace(/\bdata-minutes\s*=\s*'\d+'/i, `data-minutes='${row.minutes}'`);
      } else {
        newA = `${newA.trimEnd()} data-minutes="${row.minutes}"`;
      }

      const newInner = replaceTimeInLastTableCell(inner, row.minutes);
      return `<tr${newA.startsWith(" ") ? newA : ` ${newA}`}>${newInner}</tr>`;
    },
  );

  if (idx !== normalized.length) return null;

  const rebuilt = match[0].replace(tbodyContent, newTbodyInner);
  return html.replace(match[0], rebuilt);
}

/**
 * После ответа модели: для таблицы плана или для `<section class="lesson-stage">`
 * переписывает минуты так, чтобы сумма равнялась заявленной длительности урока.
 */
export function applyLessonPlanTimingNormalization(
  html: string,
  durationMinutes: number,
): string {
  if (!html?.trim() || !Number.isFinite(durationMinutes) || durationMinutes < 1) {
    return html;
  }

  if (/<table[^>]*lesson-plan-table/i.test(html)) {
    const t = tryNormalizeLessonPlanTable(html, durationMinutes);
    if (t !== null) return t;
  }

  const re = /<section\b([^>]*)>([\s\S]*?)<\/section>/gi;
  const matches: Array<{ attrs: string; inner: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || "";
    if (!/lesson-stage/i.test(attrs)) continue;
    matches.push({ attrs, inner: m[2] || "" });
  }

  if (matches.length === 0) return html;

  const rows: StageTiming[] = matches.map((sec, i) => ({
    stage: parseStageTitle(sec.attrs, sec.inner, i),
    minutes: parseMinutesFromSection(sec.attrs, sec.inner),
  }));

  const normalized = normalizeStageMinutesToTotal(rows, durationMinutes);
  if (normalized.length !== matches.length) return html;

  let idx = 0;
  return html.replace(
    /<section\b([^>]*)>([\s\S]*?)<\/section>/gi,
    (full, attrs: string, inner: string) => {
      const a = attrs || "";
      if (!/lesson-stage/i.test(a)) return full;

      const row = normalized[idx];
      idx += 1;
      if (!row) return full;

      let newAttrs = a;
      if (/\bdata-minutes\s*=\s*"/i.test(newAttrs)) {
        newAttrs = newAttrs.replace(/\bdata-minutes\s*=\s*"\d+"/i, `data-minutes="${row.minutes}"`);
      } else if (/\bdata-minutes\s*=\s*'/i.test(newAttrs)) {
        newAttrs = newAttrs.replace(/\bdata-minutes\s*=\s*'\d+'/i, `data-minutes='${row.minutes}'`);
      } else {
        newAttrs = `${newAttrs.trimEnd()} data-minutes="${row.minutes}"`;
      }

      const newInner = replaceInnerTimeMinutes(inner, row.minutes);
      return `<section${newAttrs}>${newInner}</section>`;
    },
  );
}

function replaceInnerTimeMinutes(inner: string, minutes: number): string {
  const withStrong = inner.replace(
    /(<strong>\s*Время:\s*<\/strong>\s*)(\d+)(\s*мин(?:\.)?)/i,
    `$1${minutes}$3`,
  );
  if (withStrong !== inner) return withStrong;
  return inner.replace(/(Время:\s*)(\d+)(\s*мин(?:\.)?)/i, `$1${minutes}$3`);
}
