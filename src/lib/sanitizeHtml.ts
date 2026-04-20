import sanitizeHtml from "sanitize-html";

/** Без JSDOM / isomorphic-dompurify — иначе `next build` падает (ENOENT default-stylesheet.css на Render). */

const ALLOW_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "sub",
  "sup",
  "h1",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "a",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "section",
  "div",
  "span",
  "iframe",
  "hr",
] as const;

const STYLE_VALUE = /^[\s\w#%,.()+\-:/"']+$/i;

const sanitizeOptions: Parameters<typeof sanitizeHtml>[1] = {
  allowedTags: [...ALLOW_TAGS],
  allowedAttributes: {
    "*": [
      "class",
      "style",
      "data-stage",
      "data-minutes",
      "data-latex",
      "data-math-inline",
      "data-math-block",
    ],
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "width", "height", "loading"],
    iframe: [
      "src",
      "sandbox",
      "allow",
      "allowfullscreen",
      "referrerpolicy",
      "loading",
      "title",
      "width",
      "height",
    ],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
    table: ["class", "style", "width", "border"],
  },
  allowedStyles: {
    "*": {
      color: [STYLE_VALUE],
      "background-color": [STYLE_VALUE],
      border: [STYLE_VALUE],
      "border-collapse": [STYLE_VALUE],
      "text-align": [STYLE_VALUE],
      width: [STYLE_VALUE],
      height: [STYLE_VALUE],
      "max-width": [STYLE_VALUE],
      padding: [STYLE_VALUE],
      margin: [STYLE_VALUE],
      "font-size": [STYLE_VALUE],
      "font-weight": [STYLE_VALUE],
      "vertical-align": [STYLE_VALUE],
      display: [STYLE_VALUE],
      float: [STYLE_VALUE],
    },
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: {
    img: ["http", "https", "data"],
    iframe: ["http", "https"],
  },
};

export function sanitizeLessonHtml(dirty: string): string {
  return sanitizeHtml(dirty, sanitizeOptions);
}
