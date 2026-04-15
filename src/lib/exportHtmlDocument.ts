export function wrapHtmlForPdfExport(title: string, innerHtml: string): string {
  const safeTitle = escapeHtml(title);
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Noto Sans", "DejaVu Sans", system-ui, sans-serif; padding: 24px; font-size: 11pt; color: #111; line-height: 1.45; }
    h1 { font-size: 18pt; margin: 0 0 0.75em; }
    h2 { font-size: 14pt; margin: 1em 0 0.4em; }
    h3 { font-size: 12pt; margin: 0.9em 0 0.35em; }
    p { margin: 0.35em 0; }
    ul, ol { margin: 0.35em 0 0.35em 1.2em; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 0.6em 0; }
    th, td { border: 1px solid #333; padding: 6px 8px; vertical-align: top; }
    th { background: #f3f4f6; }
    blockquote { margin: 0.6em 0; padding: 0.4em 0.8em; border-left: 4px solid #9ca3af; background: #f9fafb; }
    pre, code { font-family: ui-monospace, monospace; font-size: 0.95em; }
    pre { background: #f3f4f6; padding: 8px; overflow: auto; }
    section.lesson-stage { margin-bottom: 0.9rem; padding-bottom: 0.6rem; border-bottom: 1px solid #e5e7eb; }
    img { max-width: 100%; height: auto; }
    a { color: #1d4ed8; }
  </style>
  <title>${safeTitle}</title>
</head>
<body>
  <h1>${safeTitle}</h1>
  ${innerHtml}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
