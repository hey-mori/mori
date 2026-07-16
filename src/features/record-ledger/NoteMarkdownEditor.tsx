/**
 * NoteMarkdownEditor · the 기록 writing surface, on CodeMirror 6 (the editor
 * engine Obsidian itself uses — local, MIT, no cloud).
 *
 * A markdown-aware live surface: the first line renders as the note's title
 * (Bear model — the data model already derives the title from line 1),
 * headings/bold/italic/code/quote style as you type, undo history and Korean
 * IME handling come from the engine. Uncontrolled with a prop-sync seam: an
 * external body change (note switch adoption, undo/revert) is applied only
 * while the editor is not focused, so it never fights the user's typing.
 */
import { useEffect, useRef } from "react";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/** Line 1 is the note's title: decorate it so it reads large without any
 *  markdown syntax, matching deriveNoteTitle's first-line rule. */
const firstLineTitle = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = build(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const first = view.state.doc.line(1);
  builder.add(first.from, first.from, Decoration.line({ class: "cm-note-title" }));
  return builder.finish();
}

/** Markdown token styling through the app's CSS variables so both themes work
 *  without a per-mode style. Calm: structure is visible, never loud. */
const noteHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.3em", fontWeight: "750" },
  { tag: tags.heading2, fontSize: "1.15em", fontWeight: "700" },
  { tag: tags.heading3, fontWeight: "700" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.monospace, fontFamily: "ui-monospace, SFMono-Regular, Menlo, 'Apple SD Gothic Neo', monospace", fontSize: "0.9em" },
  { tag: tags.link, color: "var(--purple)" },
  { tag: tags.url, color: "var(--purple)" },
  { tag: tags.quote, color: "var(--muted)" },
  { tag: tags.processingInstruction, color: "var(--muted-2)" },
  { tag: tags.meta, color: "var(--muted-2)" },
  { tag: tags.contentSeparator, color: "var(--muted-2)" },
]);

const baseTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", fontSize: "16px" },
  ".cm-content": {
    padding: "0 0 48px",
    lineHeight: "1.8",
    caretColor: "var(--purple)",
    fontFamily: "inherit",
  },
  ".cm-line": { padding: "0" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", overflow: "visible" },
  ".cm-placeholder": { color: "var(--muted-2)" },
  ".cm-note-title": {
    fontSize: "24px",
    fontWeight: "750",
    lineHeight: "1.4",
    letterSpacing: "-0.015em",
    paddingBottom: "6px",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--purple) 18%, transparent)",
  },
  ".cm-cursor": { borderLeftColor: "var(--purple)" },
});

export function NoteMarkdownEditor({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(noteHighlight),
          firstLineTitle,
          baseTheme,
          EditorView.lineWrapping,
          cmPlaceholder(placeholder ?? ""),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    if (autoFocus) {
      view.focus();
      view.dispatch({ selection: { anchor: view.state.doc.length } });
    }
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor mounts once; external value changes sync via the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prop-sync seam: adopt an external body (note switch, undo) only while the
  // user is not typing here, so the engine never fights the keyboard.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current && !view.hasFocus) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={hostRef} className="note-md-editor" />;
}
