/**
 * CodeMirror extensions that make 기록's markdown surface feel like a real note
 * editor: clickable task checkboxes, list / task auto-continuation on Enter,
 * and ⌘B / ⌘I / ⌘E wrapping. Pure editor behavior: no app state, no kernel.
 */
import { EditorSelection, RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

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

/**
 * Live preview (the move that makes CodeMirror feel like Obsidian): on any line
 * the cursor is NOT on, the raw markdown punctuation is hidden so the text reads
 * as prose: `**중요**` shows as 중요 in bold, `# 제목` drops its hashes, a
 * `[label](url)` shows just label. Put the caret on the line and the markers
 * reappear, so editing stays exact and nothing is ever actually removed.
 */
const CONCEAL_MARKS = new Set([
  "EmphasisMark",
  "StrongEmphasisMark",
  "StrikethroughMark",
  "HeaderMark",
  "LinkMark",
]);
const concealed = Decoration.replace({});

const concealMarkdown = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      // Selection moves change which line is "active", so rebuild on it too.
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const { state } = view;
      // Lines touched by any cursor / selection stay raw for precise editing.
      const activeLines = new Set<number>();
      for (const range of state.selection.ranges) {
        const first = state.doc.lineAt(range.from).number;
        const last = state.doc.lineAt(range.to).number;
        for (let n = first; n <= last; n++) activeLines.add(n);
      }
      const builder = new RangeSetBuilder<Decoration>();
      const tree = syntaxTree(state);
      for (const { from, to } of view.visibleRanges) {
        tree.iterate({
          from,
          to,
          enter: (node) => {
            const name = node.name;
            let end = node.to;
            let hide = CONCEAL_MARKS.has(name);
            if (name === "HeaderMark") {
              // Swallow the single space after the # so the text sits flush.
              if (state.doc.sliceString(end, end + 1) === " ") end += 1;
            } else if (name === "CodeMark") {
              hide = node.matchContext(["InlineCode"]); // keep fenced-code fences
            } else if (name === "URL") {
              hide = node.matchContext(["Link"]); // hide only a link's target
            }
            if (!hide || node.from >= end) return;
            if (activeLines.has(state.doc.lineAt(node.from).number)) return;
            builder.add(node.from, end, concealed);
          },
        });
      }
      return builder.finish();
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/**
 * Wiki-links: render `[[제목]]` as a link. The inner title is marked
 * `.cm-wiki-link` (clickable, carries the title in a data attribute for the
 * click handler); the `[[` and `]]` brackets are hidden on any line the caret is
 * not on, so a linked note reads as its plain name and only shows syntax while
 * you edit that line. Regex-scanned per line (the brackets are plain text to the
 * markdown parser, so this never collides with concealMarkdown's replaces).
 */
const WIKI_LINK_LINE = /\[\[([^[\]\n]+)\]\]/g;

const wikiLinks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      // selectionSet so bracket concealment flips as the caret enters the line.
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const { state } = view;
      const activeLines = new Set<number>();
      for (const range of state.selection.ranges) {
        const first = state.doc.lineAt(range.from).number;
        const last = state.doc.lineAt(range.to).number;
        for (let n = first; n <= last; n++) activeLines.add(n);
      }
      const marks: { from: number; to: number; deco: Decoration }[] = [];
      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = state.doc.lineAt(pos);
          const active = activeLines.has(line.number);
          WIKI_LINK_LINE.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = WIKI_LINK_LINE.exec(line.text))) {
            const title = match[1];
            const openFrom = line.from + match.index; // the "[["
            const innerFrom = openFrom + 2;
            const innerTo = innerFrom + title.length;
            const closeTo = innerTo + 2; // past the "]]"
            marks.push({
              from: innerFrom,
              to: innerTo,
              deco: Decoration.mark({
                class: "cm-wiki-link",
                attributes: { "data-wiki-title": title.trim() },
              }),
            });
            if (!active) {
              marks.push({ from: openFrom, to: innerFrom, deco: concealed });
              marks.push({ from: innerTo, to: closeTo, deco: concealed });
            }
          }
          pos = line.to + 1;
        }
      }
      marks.sort((a, b) => a.from - b.from || a.to - b.to);
      return Decoration.set(marks.map((m) => m.deco.range(m.from, m.to)));
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

export function noteMarkdownEditing(): Extension {
  return [
    taskCheckboxes,
    concealMarkdown,
    wikiLinks,
    keymap.of([
      { key: "Enter", run: continueList },
      { key: "Mod-b", run: (view) => wrapSelection(view, "**") },
      { key: "Mod-i", run: (view) => wrapSelection(view, "*") },
      { key: "Mod-e", run: (view) => wrapSelection(view, "`") },
    ]),
  ];
}
