import { NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { wrapHtmlForPdfExport } from "@/lib/exportHtmlDocument";
import { sanitizeLessonHtml } from "@/lib/sanitizeHtml";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  html: string;
  title?: string;
};

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

  const inner = sanitizeLessonHtml(innerRaw);
  const title = body.title?.trim() || "План урока";
  const fullHtml = wrapHtmlForPdfExport(title, inner);

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=medium"],
    });
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "networkidle0", timeout: 60_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    });
    await browser.close();
    browser = null;

    const pdfBytes = Uint8Array.from(Buffer.from(pdf));
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(title)}.pdf"`,
      },
    });
  } catch (e) {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
    const msg = e instanceof Error ? e.message : "Ошибка PDF";
    return NextResponse.json(
      {
        error: msg,
        hint:
          "Убедитесь, что Puppeteer может запустить Chromium (локально обычно работает из коробки).",
      },
      { status: 500 },
    );
  }
}
