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
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { prepareLessonPlanHtmlForEditor } from "@/lib/prepareEditorHtml";
import { useEffect, useRef, useState, type ReactNode } from "react";

const MAX_DEFAULT = 100_000;

function ToolbarDivider() {
  return <span className="mx-1 h-6 w-px shrink-0 self-center bg-slate-300" aria-hidden />;
}

function IconBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-8 min-w-[2rem] shrink-0 items-center justify-center rounded-md text-sm transition ${
        active
          ? "bg-slate-200 text-slate-900 shadow-inner"
          : "text-slate-800 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function currentBlock(editor: Editor): string {
  if (editor.isActive("heading", { level: 1 })) return "h1";
  if (editor.isActive("heading", { level: 2 })) return "h2";
  if (editor.isActive("heading", { level: 3 })) return "h3";
  if (editor.isActive("heading", { level: 4 })) return "h4";
  if (editor.isActive("blockquote")) return "blockquote";
  return "paragraph";
}

function currentAlign(editor: Editor): "left" | "center" | "right" | "justify" {
  if (editor.isActive({ textAlign: "center" })) return "center";
  if (editor.isActive({ textAlign: "right" })) return "right";
  if (editor.isActive({ textAlign: "justify" })) return "justify";
  return "left";
}

function applyBlock(editor: Editor, value: string) {
  const chain = editor.chain().focus();
  switch (value) {
    case "paragraph":
      chain.setParagraph().run();
      break;
    case "h1":
      chain.setHeading({ level: 1 }).run();
      break;
    case "h2":
      chain.setHeading({ level: 2 }).run();
      break;
    case "h3":
      chain.setHeading({ level: 3 }).run();
      break;
    case "h4":
      chain.setHeading({ level: 4 }).run();
      break;
    case "blockquote":
      chain.toggleBlockquote().run();
      break;
    default:
      chain.setParagraph().run();
  }
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
  const [, setToolbarTick] = useState(0);
  /** Не пробрасывать в родителя getHTML() сразу после программной загрузки — иначе пустой документ перезапишет ответ API. */
  const ignoreParentSyncUntil = useRef(0);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
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
    content: prepareLessonPlanHtmlForEditor(content),
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "max-w-none focus:outline-none min-h-[min(70vh,520px)] px-4 py-3 text-[15px] leading-relaxed text-slate-900",
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (Date.now() < ignoreParentSyncUntil.current) return;
      onHtmlChange(ed.getHTML());
    },
    onTransaction: () => setToolbarTick((n) => n + 1),
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const prepared = prepareLessonPlanHtmlForEditor(content);
    const current = editor.getHTML();
    if (current === prepared) return;
    ignoreParentSyncUntil.current = Date.now() + 400;
    editor.commands.setContent(prepared, false);
  }, [editor, content, contentKey]);

  if (!editor) {
    return (
      <div className="min-h-[320px] animate-pulse rounded-lg border border-slate-200/80 bg-slate-50" />
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
    editor.commands.setContent(next);
  };

  const cc = editor.storage.characterCount as { characters?: () => number } | undefined;
  const chars = typeof cc?.characters === "function" ? cc.characters() : editor.getText().length;

  const block = currentBlock(editor);
  const align = currentAlign(editor);

  const selectBase =
    "h-8 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 shadow-sm outline-none hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-300";

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 px-2 py-1.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300">
        <select
          className={`${selectBase} min-w-[7.5rem] max-w-[11rem]`}
          value={block}
          title="Стиль абзаца"
          onChange={(e) => applyBlock(editor, e.target.value)}
        >
          <option value="paragraph">Абзац</option>
          <option value="h1">Заголовок 1</option>
          <option value="h2">Заголовок 2</option>
          <option value="h3">Заголовок 3</option>
          <option value="h4">Заголовок 4</option>
          <option value="blockquote">Цитата</option>
        </select>

        <ToolbarDivider />

        <IconBtn
          active={editor.isActive("bold")}
          title="Жирный"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <span className="font-serif text-[15px] font-bold leading-none">Ж</span>
        </IconBtn>
        <IconBtn
          active={editor.isActive("italic")}
          title="Курсив"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <span className="font-serif text-[15px] italic leading-none">К</span>
        </IconBtn>
        <IconBtn
          active={editor.isActive("underline")}
          title="Подчёркнутый"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <span className="text-[13px] font-semibold underline decoration-2 underline-offset-2">Ч</span>
        </IconBtn>
        <IconBtn
          active={editor.isActive("strike")}
          title="Зачёркнутый"
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <span className="text-[13px] line-through">Зч</span>
        </IconBtn>

        <ToolbarDivider />

        <IconBtn
          active={editor.isActive("code")}
          title="Код в строке"
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <span className="font-mono text-[13px]">{"{}"}</span>
        </IconBtn>
        <IconBtn
          active={editor.isActive("codeBlock")}
          title="Блок кода"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <span className="font-mono text-[11px] leading-tight">{"</>"}</span>
        </IconBtn>

        <ToolbarDivider />

        <IconBtn
          active={editor.isActive("bulletList")}
          title="Маркированный список"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            <circle cx="2" cy="6" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="2" cy="12" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="2" cy="18" r="1.2" fill="currentColor" stroke="none" />
          </svg>
        </IconBtn>
        <IconBtn
          active={editor.isActive("orderedList")}
          title="Нумерованный список"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7 6h14M7 12h14M7 18h14M3 6h.01M3 12h.01M3 18h.01"
            />
          </svg>
        </IconBtn>
        <IconBtn
          active={false}
          title="Уменьшить отступ"
          onClick={() => editor.chain().focus().liftListItem("listItem").run()}
        >
          <span className="text-xs">←</span>
        </IconBtn>
        <IconBtn
          active={false}
          title="Увеличить отступ"
          onClick={() => editor.chain().focus().sinkListItem("listItem").run()}
        >
          <span className="text-xs">→</span>
        </IconBtn>

        <ToolbarDivider />

        <IconBtn
          active={editor.isActive("subscript")}
          title="Подстрочный"
          onClick={() => editor.chain().focus().toggleSubscript().run()}
        >
          <span className="text-[11px] font-medium leading-none">X₂</span>
        </IconBtn>
        <IconBtn
          active={editor.isActive("superscript")}
          title="Надстрочный"
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
        >
          <span className="text-[11px] font-medium leading-none">X²</span>
        </IconBtn>

        <ToolbarDivider />

        <select
          className={`${selectBase} min-w-[9rem]`}
          value={align}
          title="Выравнивание"
          onChange={(e) => {
            const v = e.target.value as "left" | "center" | "right" | "justify";
            editor.chain().focus().setTextAlign(v).run();
          }}
        >
          <option value="left">Слева</option>
          <option value="center">По центру</option>
          <option value="right">Справа</option>
          <option value="justify">По ширине</option>
        </select>

        <ToolbarDivider />

        <IconBtn active={false} title="Вставить ссылку" onClick={setLink}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        </IconBtn>
        <IconBtn active={false} title="Изображение по URL" onClick={addImage}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </IconBtn>
        <IconBtn
          active={false}
          title="Таблица 3×3"
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="3" width="18" height="18" rx="1" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </IconBtn>
        <IconBtn
          active={false}
          title="Горизонтальная линия"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M4 12h16" />
          </svg>
        </IconBtn>

        <ToolbarDivider />

        <IconBtn active={false} title="Отменить" onClick={() => editor.chain().focus().undo().run()}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </IconBtn>
        <IconBtn active={false} title="Повторить" onClick={() => editor.chain().focus().redo().run()}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
          </svg>
        </IconBtn>

        <button
          type="button"
          title="Найти и заменить"
          onClick={findReplace}
          className="ml-1 shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          Найти…
        </button>
      </div>

      <EditorContent editor={editor} className="plan-editor-content bg-white" />

      <div className="flex justify-end border-t border-slate-100 bg-slate-50/50 px-3 py-1.5 text-[11px] text-slate-500">
        Символов: {chars}
        {maxChars ? ` / ${maxChars}` : ""}
      </div>
    </div>
  );
}
