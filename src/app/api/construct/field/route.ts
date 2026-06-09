import { NextResponse } from "next/server";
import {
  verifyConstructSession,
} from "@/lib/constructor/constructSession";
import { generateStageField, type StageFieldGenerationMode } from "@/lib/constructor/stageFieldGenerator";
import { getOpenRouterConfig, isConstructorV3Enabled } from "@/lib/constructor/openRouter";
import type { LessonTypeId } from "@/lib/constructor/stageRegistry";
import type {
  StageFieldKey,
  StageMethod,
  StructuredLessonStage,
} from "@/lib/constructor/structuredLesson";
import { resolveConstructorFrpContext } from "@/lib/constructor/frpContext";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  sessionId?: string;
  mode?: StageFieldGenerationMode;
  field?: StageFieldKey;
  method?: StageMethod | null;
  lesson?: {
    subject?: string;
    grade?: string;
    topic?: string;
    goal?: string;
    lessonType?: LessonTypeId;
    durationMinutes?: number;
  };
  stage?: StructuredLessonStage;
  previousStageSummary?: string;
  nextStageSummary?: string;
};

const FIELD_KEYS = new Set<StageFieldKey>([
  "goal",
  "teacherSpeech",
  "studentActions",
  "expectedAnswers",
  "task",
  "answer",
  "result",
  "teacherComment",
]);

function validMode(value: unknown): value is StageFieldGenerationMode {
  return value === "improve" || value === "regenerate" || value === "improve-stage" || value === "apply-method";
}

export async function POST(req: Request) {
  if (!isConstructorV3Enabled()) {
    return NextResponse.json({ error: "Конструктор v3 отключён" }, { status: 503 });
  }

  const cfg = getOpenRouterConfig();
  if (!cfg) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY не задан" }, { status: 500 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (!validMode(body.mode)) {
    return NextResponse.json({ error: "Некорректный режим генерации" }, { status: 400 });
  }

  if ((body.mode === "improve" || body.mode === "regenerate") && !FIELD_KEYS.has(body.field as StageFieldKey)) {
    return NextResponse.json({ error: "Некорректное поле для перегенерации" }, { status: 400 });
  }

  if (!body.stage || !body.lesson?.subject || !body.lesson.grade || !body.lesson.topic || !body.lesson.lessonType) {
    return NextResponse.json({ error: "Недостаточно данных этапа или урока" }, { status: 400 });
  }

  const session = body.sessionId ? verifyConstructSession(body.sessionId.trim()) : null;
  if (body.sessionId && !session) {
    return NextResponse.json({ error: "Сессия недействительна или истекла" }, { status: 401 });
  }

  const lesson = {
    subject: session?.subject ?? body.lesson.subject,
    grade: session?.grade ?? body.lesson.grade,
    topic: session?.topic ?? body.lesson.topic,
    goal: session?.goal ?? body.lesson.goal ?? "",
    lessonType: session?.lessonType ?? body.lesson.lessonType,
    durationMinutes: session?.durationMinutes ?? body.lesson.durationMinutes,
  };

  const frp = resolveConstructorFrpContext(lesson.subject, lesson.grade, lesson.topic);

  try {
    const result = await generateStageField(cfg.key, cfg.model, {
      mode: body.mode,
      field: body.field,
      lesson,
      stage: body.stage,
      method: body.method,
      previousStageSummary: body.previousStageSummary,
      nextStageSummary: body.nextStageSummary,
      frpMeta: frp.available ? frp : session?.frpMeta,
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
