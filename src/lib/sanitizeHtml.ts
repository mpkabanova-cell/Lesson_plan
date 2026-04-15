import DOMPurify from "isomorphic-dompurify";

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
];

const ALLOW_ATTR = [
  "href",
  "title",
  "target",
  "rel",
  "src",
  "alt",
  "width",
  "height",
  "class",
  "style",
  "data-stage",
  "data-minutes",
  "colspan",
  "rowspan",
];

export function sanitizeLessonHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [...ALLOW_TAGS, "iframe"],
    ALLOWED_ATTR: [...ALLOW_ATTR, "sandbox", "allow", "allowfullscreen", "referrerpolicy", "loading"],
    ADD_ATTR: ["target"],
  });
}
