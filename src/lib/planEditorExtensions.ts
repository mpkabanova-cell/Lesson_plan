import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { CharacterCount } from "@tiptap/extension-character-count";
import type { AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import { InlineMath } from "@/lib/inlineMathExtension";

const MAX_DEFAULT = 100_000;

/**
 * Один список расширений для useEditor и для @tiptap/html generateJSON.
 */
export function createPlanEditorExtensions(options: {
  placeholder: string;
  maxChars?: number;
}): AnyExtension[] {
  const maxChars =
    options.maxChars ??
    (Number(process.env.NEXT_PUBLIC_PLAN_CONTENT_MAX_CHARS) || MAX_DEFAULT);

  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      bulletList: { keepMarks: true },
      orderedList: { keepMarks: true },
    }),
    Underline,
    Subscript,
    Superscript,
    TextAlign.configure({ types: ["heading", "paragraph", "tableCell", "tableHeader"] }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
    }),
    Image.configure({ allowBase64: true }),
    Table.configure({
      resizable: true,
      HTMLAttributes: { class: "tiptap-table" },
    }),
    TableRow,
    TableHeader,
    TableCell,
    InlineMath,
    Placeholder.configure({ placeholder: options.placeholder }),
    CharacterCount.configure({ limit: maxChars }),
  ];
}
