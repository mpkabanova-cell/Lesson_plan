import HTMLtoDOCX from "html-to-docx";
import { NextResponse } from "next/server";
import { expandMathSpansForExport } from "@/lib/expandMathSpansForExport";
import { sanitizeLessonHtml } from "@/lib/sanitizeHtml";

export const runtime = "nodejs";

type Body = {
  html: string;
  title?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const innerRaw = body.html?.trim();
  if (!innerRaw) {
    return NextResponse.json({ error: "Пустой HTML" }, { status: 400 });
  }

  const inner = expandMathSpansForExport(sanitizeLessonHtml(innerRaw));
  const title = body.title?.trim() || "План урока";
  const fragment = `<h1>${escapeHtml(title)}</h1>${inner}`;

  try {
    const buffer = await HTMLtoDOCX(fragment, null, {
      table: { row: { cantSplit: true } },
      footer: false,
      pageNumber: false,
    });

    const arr = Buffer.isBuffer(buffer)
      ? buffer
      : Buffer.from(new Uint8Array(buffer as ArrayBuffer));

    // Buffer не входит в тип BodyInit в DOM-типах TS — копируем в Uint8Array
    const body = Uint8Array.from(arr);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(title)}.docx"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка конвертации";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
