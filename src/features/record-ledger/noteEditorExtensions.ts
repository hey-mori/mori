/**
 * CodeMirror extensions that make 기록's markdown surface feel like a real note
 * editor: clickable task checkboxes, list / task auto-continuation on Enter,
 * and ⌘B / ⌘I / ⌘E wrapping. Pure editor behavior — no app state, no kernel.
 */
import { EditorSelection, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

const TASK_RE = /^(\s*[-*+]\s+)\[([ xX])\]/;
const LIST_RE = /^(\s*)([-*+]\s(?:\[[ xX]\]\s)?|\d+\.\s)/;

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly markPos: number,
  ) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.markPos === this.markPos;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-task-checkbox";
    box.checked = this.checked;
    box.setAttribute("aria-label", "할 일 완료");
    // Toggle the single char between the brackets; keep the caret out of it.
    box.addEventListener("mousedown", (event) => event.preventDefault());
    box.addEventListener("change", () => {
      view.dispatch({
        changes: { from: this.markPos, to: this.markPos + 1, insert: this.checked ? " " : "x" },
      });
    });
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

/** Render each `- [ ]` / `- [x]` marker as a live checkbox over the bracket. */
const taskCheckboxes = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const marks: { from: number; to: number; deco: Decoration }[] = [];
      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = view.state.doc.lineAt(pos);
          const match = TASK_RE.exec(line.text);
          if (match) {
            const bracketStart = line.from + match[1].length; // the "["
            const markPos = bracketStart + 1; // the space/x
            const checked = match[2].toLowerCase() === "x";
            marks.push({
              from: bracketStart,
              to: bracketStart + 3, // "[ ]"
              deco: Decoration.replace({ widget: new CheckboxWidget(checked, markPos) }),
            });
          }
          pos = line.to + 1;
        }
      }
      marks.sort((a, b) => a.from - b.from);
      return Decoration.set(marks.map((m) => m.deco.range(m.from, m.to)));
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** Wrap (or unwrap) the selection with a marker; empty selection places the
 *  caret between a fresh pair so ⌘B on nothing starts bold. */
function wrapSelection(view: EditorView, mark: string): boolean {
  const changes = view.state.changeByRange((range) => {
    const before = view.state.sliceDoc(Math.max(0, range.from - mark.length), range.from);
    const after = view.state.sliceDoc(range.to, range.to + mark.length);
    if (before === mark && after === mark && range.from !== range.to) {
      // Already wrapped → unwrap.
      return {
        changes: [
          { from: range.from - mark.length, to: range.from, insert: "" },
          { from: range.to, to: range.to + mark.length, insert: "" },
        ],
        range: EditorSelection.range(range.from - mark.length, range.to - mark.length),
      };
    }
    return {
      changes: [
        { from: range.from, insert: mark },
        { from: range.to, insert: mark },
      ],
      range: EditorSelection.range(range.from + mark.length, range.to + mark.length),
    };
  });
  view.dispatch(changes, { scrollIntoView: true, userEvent: "input.format" });
  return true;
}

/** Enter inside a list continues it (task items reset to unchecked, ordered
 *  items increment); Enter on an empty list item exits the list. */
function continueList(view: EditorView): boolean {
  const range = view.state.selection.main;
  if (!range.empty) return false;
  const line = view.state.doc.lineAt(range.head);
  const match = LIST_RE.exec(line.text);
  if (!match || range.head < line.from + match[0].length) return false;
  const marker = match[0];
  const content = line.text.slice(marker.length);
  if (content.trim().length === 0) {
    // Empty item → drop the marker and exit the list.
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: "" },
      selection: { anchor: line.from },
      userEvent: "input",
    });
    return true;
  }
  let next = marker.replace(/\[[xX]\]/, "[ ]");
  const ordered = /^(\s*)(\d+)\.\s$/.exec(marker);
  if (ordered) next = `${ordered[1]}${Number(ordered[2]) + 1}. `;
  view.dispatch({
    changes: { from: range.head, insert: `\n${next}` },
    selection: { anchor: range.head + 1 + next.length },
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
}

export function noteMarkdownEditing(): Extension {
  return [
    taskCheckboxes,
    keymap.of([
      { key: "Enter", run: continueList },
      { key: "Mod-b", run: (view) => wrapSelection(view, "**") },
      { key: "Mod-i", run: (view) => wrapSelection(view, "*") },
      { key: "Mod-e", run: (view) => wrapSelection(view, "`") },
    ]),
  ];
}
