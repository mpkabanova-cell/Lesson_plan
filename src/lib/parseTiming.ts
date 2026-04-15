export type StageTiming = { stage: string; minutes: number };

/**
 * Из HTML плана: сначала секции с data-minutes, иначе разбор по блокам h2 + «Время: N мин»
 * (после unwrap section тегов секций уже нет).
 */
export function extractTimingFromHtml(html: string): StageTiming[] {
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
