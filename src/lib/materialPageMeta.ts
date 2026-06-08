const FETCH_TIMEOUT_MS = 3500;
const MAX_PARALLEL_FETCHES = 4;
const UROK_HOST = "urok.1sept.ru";

const ARTICLE_SECTION_PATTERNS = [
  /<meta\s+[^>]*property\s*=\s*["']article:section["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i,
  /<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']article:section["'][^>]*>/i,
  /<meta\s+[^>]*name\s*=\s*["']article:section["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i,
];

export function extractArticleSectionFromHtml(html: string): string | undefined {
  const head = html.slice(0, 120_000);
  for (const re of ARTICLE_SECTION_PATTERNS) {
    const m = re.exec(head);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return undefined;
}

type PagemapMetatags = Record<string, string | undefined>;

export function extractArticleSectionFromPagemap(
  pagemap?: { metatags?: PagemapMetatags[] },
): string | undefined {
  const tags = pagemap?.metatags;
  if (!Array.isArray(tags) || tags.length === 0) return undefined;
  for (const block of tags) {
    const section = block?.["article:section"]?.trim();
    if (section) return section;
  }
  return undefined;
}

function isUrokPublicationUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") === UROK_HOST && u.pathname.includes("/publication");
  } catch {
    return false;
  }
}

export async function fetchArticleSectionFromUrl(url: string): Promise<string | undefined> {
  if (!isUrokPublicationUrl(url)) return undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "LessonPlanBot/1.0 (materials subject enrichment)",
      },
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    return extractArticleSectionFromHtml(html);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let index = 0;

  async function run(): Promise<void> {
    while (index < items.length) {
      const i = index;
      index += 1;
      out[i] = await worker(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(workers);
  return out;
}

export type MaterialWithSection = {
  url: string;
  articleSection?: string;
};

/** Дозагружает article:section для результатов без метаданных (CSE embed и т.п.). */
export async function enrichMaterialArticleSections<T extends MaterialWithSection>(
  results: T[],
): Promise<T[]> {
  const pending = results
    .map((r, index) => ({ r, index }))
    .filter(({ r }) => !r.articleSection?.trim() && isUrokPublicationUrl(r.url));

  if (pending.length === 0) return results;

  const sections = await mapPool(
    pending,
    MAX_PARALLEL_FETCHES,
    async ({ r }) => fetchArticleSectionFromUrl(r.url),
  );

  const out = [...results];
  pending.forEach(({ index }, i) => {
    const section = sections[i];
    if (section) {
      out[index] = { ...out[index], articleSection: section };
    }
  });
  return out;
}
