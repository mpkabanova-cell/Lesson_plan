const FETCH_TIMEOUT_MS = 3500;
const MAX_PARALLEL_FETCHES = 4;
const UROK_HOST = "urok.1sept.ru";

const ARTICLE_SECTION_PATTERNS = [
  /<meta\s+[^>]*property\s*=\s*["']article:section["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i,
  /<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']article:section["'][^>]*>/i,
  /<meta\s+[^>]*name\s*=\s*["']article:section["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i,
];

const ARTICLE_PUBLISHED_TIME_PATTERNS = [
  /<meta\s+[^>]*property\s*=\s*["']article:published_time["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i,
  /<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']article:published_time["'][^>]*>/i,
  /<meta\s+[^>]*name\s*=\s*["']article:published_time["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i,
];

export function extractArticleSectionFromHtml(html: string): string | undefined {
  const head = html.slice(0, 120_000);
  for (const re of ARTICLE_SECTION_PATTERNS) {
    const m = re.exec(head);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return undefined;
}

export function extractArticlePublishedTimeFromHtml(html: string): string | undefined {
  const head = html.slice(0, 120_000);
  for (const re of ARTICLE_PUBLISHED_TIME_PATTERNS) {
    const m = re.exec(head);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return undefined;
}

export type MaterialPageMeta = {
  articleSection?: string;
  articlePublishedTime?: string;
};

export function extractMaterialPageMetaFromHtml(html: string): MaterialPageMeta {
  return {
    articleSection: extractArticleSectionFromHtml(html),
    articlePublishedTime: extractArticlePublishedTimeFromHtml(html),
  };
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

export function extractArticlePublishedTimeFromPagemap(
  pagemap?: { metatags?: PagemapMetatags[] },
): string | undefined {
  const tags = pagemap?.metatags;
  if (!Array.isArray(tags) || tags.length === 0) return undefined;
  for (const block of tags) {
    const publishedTime = block?.["article:published_time"]?.trim();
    if (publishedTime) return publishedTime;
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

export async function fetchMaterialPageMetaFromUrl(url: string): Promise<MaterialPageMeta> {
  if (!isUrokPublicationUrl(url)) return {};

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
    if (!res.ok) return {};
    const html = await res.text();
    return extractMaterialPageMetaFromHtml(html);
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchArticleSectionFromUrl(url: string): Promise<string | undefined> {
  const meta = await fetchMaterialPageMetaFromUrl(url);
  return meta.articleSection;
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
  articlePublishedTime?: string;
};

/** Дозагружает meta со страницы публикации для результатов без метаданных (CSE embed и т.п.). */
export async function enrichMaterialArticleSections<T extends MaterialWithSection>(
  results: T[],
): Promise<T[]> {
  const pending = results
    .map((r, index) => ({ r, index }))
    .filter(
      ({ r }) =>
        (!r.articleSection?.trim() || !r.articlePublishedTime?.trim()) &&
        isUrokPublicationUrl(r.url),
    );

  if (pending.length === 0) return results;

  const metas = await mapPool(
    pending,
    MAX_PARALLEL_FETCHES,
    async ({ r }) => fetchMaterialPageMetaFromUrl(r.url),
  );

  const out = [...results];
  pending.forEach(({ index }, i) => {
    const meta = metas[i];
    out[index] = {
      ...out[index],
      ...(meta.articleSection ? { articleSection: meta.articleSection } : {}),
      ...(meta.articlePublishedTime ? { articlePublishedTime: meta.articlePublishedTime } : {}),
    };
  });
  return out;
}
