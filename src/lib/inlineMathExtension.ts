import { Node, mergeAttributes } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import katex from "katex";

type MathNodeViewProps = {
  node: PMNode;
  editor: Editor;
  getPos: () => number | undefined;
};

function renderKatex(el: HTMLElement, latex: string, displayMode: boolean) {
  el.replaceChildren();
  const src = latex.trim() || "\\, ";
  try {
    katex.render(src, el, { throwOnError: false, displayMode });
  } catch {
    el.textContent = latex;
  }
}

export const InlineMath = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-latex") ?? "",
        renderHTML: (attrs) => {
          const latex = attrs.latex as string;
          if (!latex) return {};
          return { "data-latex": latex, "data-math-inline": "" };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'span[data-latex][data-math-inline]' },
      { tag: 'span[data-latex]' },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const latex = node.attrs.latex as string;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-latex": latex,
        "data-math-inline": "",
        class: "katex-math-inline",
      }),
    ];
  },

  addNodeView() {
    return (props: MathNodeViewProps) => {
      const { node, editor, getPos } = props;
      const dom = document.createElement("span");
      dom.className = "katex-math-node";
      dom.setAttribute("contenteditable", "false");
      dom.setAttribute("spellcheck", "false");
      dom.title = "Двойной щелчок — изменить формулу (LaTeX)";

      const apply = (n: PMNode) => {
        const latex = (n.attrs.latex as string) || "";
        dom.setAttribute("data-latex", latex);
        renderKatex(dom, latex, false);
      };
      apply(node);

      dom.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pos = getPos();
        if (typeof pos !== "number") return;
        const cur = (editor.state.doc.nodeAt(pos)?.attrs.latex as string) || "";
        const next = window.prompt(
          "Правка формулы (LaTeX). Подставьте свои значения вместо букв в шаблоне или измените выражение целиком:",
          cur,
        );
        if (next === null) return;
        editor
          .chain()
          .focus()
          .command(({ tr, state }) => {
            const n = state.doc.nodeAt(pos);
            if (!n || n.type.name !== "inlineMath") return false;
            tr.setNodeMarkup(pos, undefined, { ...n.attrs, latex: next });
            return true;
          })
          .run();
      });

      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== "inlineMath") return false;
          apply(updated);
          return true;
        },
      };
    };
  },

});
