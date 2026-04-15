export type StageTiming = { stage: string; minutes: number };

/**
 * Extract timing from generated HTML: prefers data-minutes on .lesson-stage sections.
 */
export function extractTimingFromHtml(html: string): StageTiming[] {
  if (typeof window === "undefined") {
    return extractTimingServer(html);
  }
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

function extractTimingServer(html: string): StageTiming[] {
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
