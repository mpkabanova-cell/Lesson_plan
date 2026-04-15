"use client";

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
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

const MAX_DEFAULT = 100_000;

function toolbarBtn(
  active: boolean,
  onClick: () => void,
  label: string,
  title: string,
) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-medium transition ${
        active
          ? "bg-teal-700 text-white"
          : "bg-slate-100 text-slate-800 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

export type PlanEditorProps = {
  content: string;
  contentKey: number;
  onHtmlChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function PlanEditor({
  content,
  contentKey,
  onHtmlChange,
  placeholder = "Здесь появится план урока. Можно редактировать текст, таблицы и вставлять изображения.",
  disabled = false,
}: PlanEditorProps) {
  const maxChars = Number(process.env.NEXT_PUBLIC_PLAN_CONTENT_MAX_CHARS) || MAX_DEFAULT;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Underline,
      Subscript,
      Superscript,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
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
      Placeholder.configure({ placeholder }),
      CharacterCount.configure({ limit: maxChars }),
    ],
    content,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "max-w-none focus:outline-none min-h-[280px] px-3 py-2 text-sm text-slate-900",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onHtmlChange(ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current !== content) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [editor, content, contentKey]);

  if (!editor) {
    return (
      <div className="min-h-[280px] animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
    );
  }

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Адрес ссылки", prev || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const addImage = () => {
    const url = window.prompt("URL изображения", "https://");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  };

  const findReplace = () => {
    const q = window.prompt("Найти");
    if (!q) return;
    const repl = window.prompt("Заменить на", "");
    if (repl === null) return;
    const html = editor.getHTML();
    if (!html.includes(q)) {
      window.alert("Текст не найден");
      return;
    }
    const next = html.split(q).join(repl);
    editor.commands.setContent(next, { emitUpdate: true });
  };

  const cc = editor.storage.characterCount as { characters?: () => number } | undefined;
  const chars = typeof cc?.characters === "function" ? cc.characters() : editor.getText().length;

  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        {toolbarBtn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "Ж", "Жирный")}
        {toolbarBtn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "К", "Курсив")}
        {toolbarBtn(
          editor.isActive("underline"),
          () => editor.chain().focus().toggleUnderline().run(),
          "Ч",
          "Подчёркнутый",
        )}
        {toolbarBtn(
          editor.isActive("strike"),
          () => editor.chain().focus().toggleStrike().run(),
          "Зч",
          "Зачёркнутый",
        )}
        {toolbarBtn(
          editor.isActive("subscript"),
          () => editor.chain().focus().toggleSubscript().run(),
          "x₂",
          "Подстрочный",
        )}
        {toolbarBtn(
          editor.isActive("superscript"),
          () => editor.chain().focus().toggleSuperscript().run(),
          "x²",
          "Надстрочный",
        )}
        <span className="mx-1 w-px self-stretch bg-slate-200" />
        {toolbarBtn(
          editor.isActive("heading", { level: 2 }),
          () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
          "H2",
          "Заголовок",
        )}
        {toolbarBtn(
          editor.isActive("heading", { level: 3 }),
          () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
          "H3",
          "Подзаголовок",
        )}
        {toolbarBtn(
          editor.isActive("blockquote"),
          () => editor.chain().focus().toggleBlockquote().run(),
          "„",
          "Цитата",
        )}
        {toolbarBtn(
          editor.isActive("codeBlock"),
          () => editor.chain().focus().toggleCodeBlock().run(),
          "</>",
          "Код",
        )}
        <span className="mx-1 w-px self-stretch bg-slate-200" />
        {toolbarBtn(
          editor.isActive("bulletList"),
          () => editor.chain().focus().toggleBulletList().run(),
          "•",
          "Маркированный список",
        )}
        {toolbarBtn(
          editor.isActive("orderedList"),
          () => editor.chain().focus().toggleOrderedList().run(),
          "1.",
          "Нумерованный список",
        )}
        {toolbarBtn(false, () => editor.chain().focus().liftListItem("listItem").run(), "←", "Уменьшить отступ")}
        {toolbarBtn(false, () => editor.chain().focus().sinkListItem("listItem").run(), "→", "Увеличить отступ")}
        <span className="mx-1 w-px self-stretch bg-slate-200" />
        {toolbarBtn(false, () => editor.chain().focus().setTextAlign("left").run(), "◧", "Влево")}
        {toolbarBtn(false, () => editor.chain().focus().setTextAlign("center").run(), "▣", "Центр")}
        {toolbarBtn(false, () => editor.chain().focus().setTextAlign("right").run(), "◨", "Вправо")}
        {toolbarBtn(false, () => editor.chain().focus().setTextAlign("justify").run(), "≋", "По ширине")}
        <span className="mx-1 w-px self-stretch bg-slate-200" />
        {toolbarBtn(false, setLink, "🔗", "Ссылка")}
        {toolbarBtn(false, addImage, "🖼", "Изображение по URL")}
        {toolbarBtn(
          false,
          () =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run(),
          "⊞",
          "Таблица 3×3",
        )}
        {toolbarBtn(false, () => editor.chain().focus().addColumnBefore().run(), "+⌜", "Колонка слева")}
        {toolbarBtn(false, () => editor.chain().focus().addColumnAfter().run(), "+⌝", "Колонка справа")}
        {toolbarBtn(false, () => editor.chain().focus().deleteColumn().run(), "−⌞", "Удалить колонку")}
        {toolbarBtn(false, () => editor.chain().focus().addRowBefore().run(), "+⌟", "Строка сверху")}
        {toolbarBtn(false, () => editor.chain().focus().addRowAfter().run(), "↓+", "Строка снизу")}
        {toolbarBtn(false, () => editor.chain().focus().deleteRow().run(), "−⌟", "Удалить строку")}
        {toolbarBtn(false, () => editor.chain().focus().mergeCells().run(), "⧉", "Объединить ячейки")}
        {toolbarBtn(false, () => editor.chain().focus().splitCell().run(), "⧇", "Разделить ячейку")}
        <span className="mx-1 w-px self-stretch bg-slate-200" />
        {toolbarBtn(false, () => editor.chain().focus().undo().run(), "↺", "Отменить")}
        {toolbarBtn(false, () => editor.chain().focus().redo().run(), "↻", "Повторить")}
        {toolbarBtn(false, findReplace, "Н→З", "Найти и заменить")}
      </div>
      <EditorContent editor={editor} />
      <div className="flex justify-end border-t border-slate-100 px-2 py-1 text-[11px] text-slate-500">
        Символов: {chars}
        {maxChars ? ` / ${maxChars}` : ""}
      </div>
    </div>
  );
}
