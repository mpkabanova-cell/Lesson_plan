import { NextResponse } from "next/server";
import { enrichMaterialArticleSections } from "@/lib/materialPageMeta";
import type { MaterialSearchResult } from "@/lib/materialsSearchRanking";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  results?: Array<{
    title: string;
    url: string;
    snippet?: string;
    articleSection?: string;
    articlePublishedTime?: string;
  }>;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const input = Array.isArray(body.results) ? body.results : [];
  if (input.length === 0) {
    return NextResponse.json({ results: [] });
  }

  if (input.length > 15) {
    return NextResponse.json({ error: "Слишком много результатов (макс. 15)" }, { status: 400 });
  }

  const enriched = await enrichMaterialArticleSections(input);
  return NextResponse.json({ results: enriched as MaterialSearchResult[] });
}
