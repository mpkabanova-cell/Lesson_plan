import { createHmac, timingSafeEqual } from "node:crypto";
import type { LessonTypeId } from "./stageRegistry";
import type { ConstructorFrpContext } from "./frpContext";

export type StageResult = {
  stageId: string;
  title: string;
  markdown: string;
  summary: string;
  attempts: number;
};

export type ConstructSessionPayload = {
  v: 1;
  subject: string;
  grade: string;
  topic: string;
  goal: string;
  durationMinutes: number;
  lessonType: LessonTypeId;
  homework?: string;
  selectedStageIds: string[];
  stageMinutes: Record<string, number>;
  frpMeta: Record<string, unknown> | null;
  stageResults: StageResult[];
  createdAt: number;
};

function sessionSecret(): string {
  const key = process.env.CONSTRUCT_SESSION_SECRET?.trim() || process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("CONSTRUCT_SESSION_SECRET or OPENROUTER_API_KEY required for session signing");
  return key;
}

function b64url(data: string): string {
  return Buffer.from(data, "utf-8").toString("base64url");
}

function fromB64url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

export function signConstructSession(payload: ConstructSessionPayload): string {
  const json = JSON.stringify(payload);
  const data = b64url(json);
  const sig = createHmac("sha256", sessionSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyConstructSession(token: string): ConstructSessionPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", sessionSecret()).update(data).digest("base64url");

  try {
    const a = Buffer.from(sig, "base64url");
    const b = Buffer.from(expected, "base64url");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(fromB64url(data)) as ConstructSessionPayload;
    if (payload.v !== 1) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildInitialSession(input: {
  subject: string;
  grade: string;
  topic: string;
  goal: string;
  durationMinutes: number;
  lessonType: LessonTypeId;
  homework?: string;
  selectedStageIds: string[];
  stageMinutes: Record<string, number>;
  frpMeta: Record<string, unknown> | null;
}): ConstructSessionPayload {
  return {
    v: 1,
    ...input,
    stageResults: [],
    createdAt: Date.now(),
  };
}

export function upsertStageResult(
  session: ConstructSessionPayload,
  result: StageResult,
): ConstructSessionPayload {
  const existing = session.stageResults.filter((r) => r.stageId !== result.stageId);
  return { ...session, stageResults: [...existing, result] };
}

export function buildStageSummaries(session: ConstructSessionPayload): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of session.stageResults) {
    out[r.stageId] = r.summary || r.markdown.slice(0, 400);
  }
  return out;
}

export type FrpMetaInput = ConstructorFrpContext;
