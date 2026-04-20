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

/**
 * После ответа модели: переписывает `data-minutes` и строку «Время: … мин» в каждом
 * `<section class="lesson-stage">` так, чтобы сумма минут **точно** равнялась
 * заявленной длительности урока (пропорциональное округление).
 */
export function applyLessonPlanTimingNormalization(
  html: string,
  durationMinutes: number,
): string {
  if (!html?.trim() || !Number.isFinite(durationMinutes) || durationMinutes < 1) {
    return html;
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
