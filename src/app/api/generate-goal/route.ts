import { NextResponse } from "next/server";
import { generateLessonGoal } from "@/lib/generateLessonGoal";
import type { LessonTypeId } from "@/lib/lessonTypes";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  systemPrompt?: string;
  subject: string;
  grade: string;
  topic: string;
  lessonType: LessonTypeId;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const result = await generateLessonGoal(body);
  if (!result.ok) {
    let status = 502;
    if (result.error.includes("Укажите") || result.error.includes("Некорректный")) {
      status = 400;
    } else if (result.error.includes("OPENROUTER_API_KEY")) {
      status = 500;
    }
    return NextResponse.json({ error: result.error, detail: result.detail }, { status });
  }

  return NextResponse.json({ goal: result.goal });
}
