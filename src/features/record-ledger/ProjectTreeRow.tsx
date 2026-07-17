/**
 * ProjectTreeRow · one project in the 프로젝트 rail (기록 v8 §4).
 *
 * The convention set is deliberately the one every tool already ships, because
 * hands know it: a disclosure caret when there are children, indentation by
 * depth, and row management behind a hover `⋯` that a right-click also opens
 * (Notion's sidebar, Bear's tag list, Finder). The hover pencil that swapped the
 * row into a form was invented here and matches nothing; nobody ships it.
 *
 * Rename edits the name in place once chosen from the menu. 이동 is a submenu of
 * legal targets only, pre-filtered by `canReparent`, so the control cannot offer
 * a move the write would refuse. Neither raises an undo toast, deliberately: a
 * renamed or moved project stays visible in this tree and can be edited again,
 * so the door back is always open, unlike a discard that hides its record.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ChevronRight, FolderGit2, FolderPlus } from "lucide-react";
import {
  BaseContextMenu,
  BaseOverflowMenu,
  useContextMenuPosition,
  type BaseMenuItemSpec,
} from "../../components/ui/BaseActionMenu";
import type { KernelContext } from "../../lib/record-kernel/kernelTypes";
import { canReparent, contextPath } from "./contextTree";

export type ProjectTreeNode = {
  context: KernelContext;
  depth: number;
  /** Roll-up: this project's own records/sessions plus its descendants'. */
  count: number;
  hasChildren: boolean;
};

export function ProjectTreeRow({
  node,
  contexts,
  active,
  expanded,
  onSelect,
  onToggleExpand,
  onRename,
  onReparent,
  onCreateChild,
  onArchive,
}: {
  node: ProjectTreeNode;
  contexts: KernelContext[];
  active: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
  onRename: (contextId: string, name: string) => Promise<string | null>;
  onReparent: (
    contextId: string,
    parentId: string | undefined,
  ) => Promise<{ parentId: string | undefined } | null>;
  onCreateChild: (parentId: string) => void;
  onArchive: (contextId: string) => void;
}) {
  const { context, depth, count, hasChildren } = node;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(context.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const menu = useContextMenuPosition();

  useEffect(() => {
    if (renaming) setDraft(context.name);
  }, [renaming, context.name]);

  const moveTargets = useMemo(
    () =>
      contexts
        .filter(
          (candidate) =>
            candidate.type === "project" &&
            candidate.id !== context.id &&
            candidate.id !== context.parentId &&
            canReparent(context.id, candidate.id, contexts),
        )
        .map((candidate) => ({ id: candidate.id, path: contextPath(candidate.id, contexts) }))
        .sort((a, b) => a.path.localeCompare(b.path, "ko")),
    [context.id, context.parentId, contexts],
  );

  const items = useMemo<BaseMenuItemSpec[]>(() => {
    const out: BaseMenuItemSpec[] = [
      { id: "rename", label: "이름 변경", onSelect: () => setRenaming(true) },
      {
        id: "child",
        label: "하위 프로젝트",
        icon: FolderPlus,
        onSelect: () => onCreateChild(context.id),
      },
    ];
    if (context.parentId || moveTargets.length > 0) {
      out.push({ type: "separator", id: "sep-move" });
      // Flattened rather than a submenu: a nested menu for a handful of targets
      // is a second interaction to reach a one-click move.
      if (context.parentId) {
        out.push({
          id: "move-root",
          label: "최상위로 이동",
          onSelect: () => void onReparent(context.id, undefined),
        });
      }
      for (const target of moveTargets) {
        out.push({
          id: `move-${target.id}`,
          label: `${target.path}(으)로 이동`,
          onSelect: () => void onReparent(context.id, target.id),
        });
      }
    }
    out.push({ type: "separator", id: "sep-archive" });
    out.push({
      // The label carries the consequence rather than a modal asking about it:
      // archiving a parent takes its subtree out of the list with it.
      id: "archive",
      label: hasChildren ? "보관 (하위 포함)" : "보관",
      icon: Archive,
      onSelect: () => onArchive(context.id),
    });
    return out;
  }, [context.id, context.parentId, hasChildren, moveTargets, onArchive, onCreateChild, onReparent]);

  const commitRename = () => {
    const trimmed = draft.trim();
    setRenaming(false);
    if (trimmed && trimmed !== context.name) void onRename(context.id, trimmed);
  };

  if (renaming) {
    return (
      <div className="ctx-tree-row is-renaming" style={indent(depth)}>
        <input
          ref={inputRef}
          autoFocus
          className="ctx-tree-rename"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitRename();
            if (event.key === "Escape") setRenaming(false);
          }}
          aria-label="프로젝트 이름"
        />
      </div>
    );
  }

  return (
    <div
      className={`ctx-tree-row${active ? " is-active" : ""}`}
      onContextMenu={menu.onContextMenu}
    >
      <button
        type="button"
        className="ctx-tree-main"
        style={indent(depth)}
        onClick={onSelect}
        onKeyDown={menu.onKeyDown}
      >
        {hasChildren ? (
          <span
            role="button"
            tabIndex={-1}
            className={`ctx-tree-caret${expanded ? " is-open" : ""}`}
            aria-label={expanded ? "접기" : "펼치기"}
            onClick={(event) => {
              // The caret toggles without selecting: expanding to look inside a
              // project is not the same act as opening it.
              event.stopPropagation();
              onToggleExpand();
            }}
          >
            <ChevronRight size={12} aria-hidden="true" />
          </span>
        ) : (
          <span className="ctx-tree-caret is-empty" aria-hidden="true" />
        )}
        <FolderGit2 size={13} aria-hidden="true" className="ctx-tree-icon" />
        <span className="ctx-tree-name">{context.name}</span>
        <span className="ctx-tree-count">{count}</span>
      </button>
      <BaseOverflowMenu items={items} label={`${context.name} 관리`} className="ctx-tree-menu" />
      <BaseContextMenu
        open={menu.open}
        position={menu.position}
        items={items}
        onClose={menu.close}
        label={`${context.name} 관리`}
      />
    </div>
  );
}

function indent(depth: number) {
  return depth > 0 ? { paddingLeft: `${8 + depth * 13}px` } : undefined;
}
