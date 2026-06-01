import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type BaseChecklistOption<T extends string> = {
  id: T;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type BaseChecklistSelectProps<T extends string> = {
  label: string;
  valueLabel: string;
  options: BaseChecklistOption<T>[];
  selectedIds: ReadonlySet<T>;
  onToggle: (id: T) => void;
  icon?: LucideIcon;
  className?: string;
};

export function BaseChecklistSelect<T extends string>({
  label,
  valueLabel,
  options,
  selectedIds,
  onToggle,
  icon: Icon,
  className = "",
}: BaseChecklistSelectProps<T>) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 240 });

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ left: rect.left, top: rect.bottom + 4, width: rect.width });
    setOpen(true);
  }

  function closeMenu({ restoreFocus = true } = {}) {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu();
    }
  }

  useLayoutEffect(() => {
    if (!open || typeof window === "undefined") return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, 260);
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    setPosition({ left, top: rect.bottom + 4, width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      closeMenu({ restoreFocus: false });
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
      if (event.key === "Tab") closeMenu({ restoreFocus: false });
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => {
      listRef.current?.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]:not(:disabled)')?.focus();
    }, 0);
  }, [open]);

  const popover = open && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={listRef}
          className="base-checklist-popover"
          role="menu"
          aria-label={label}
          style={{ left: `${position.left}px`, top: `${position.top}px`, width: `${position.width}px` }}
          onKeyDown={(event) => {
            const buttons = Array.from(
              listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]:not(:disabled)') ?? [],
            );
            const nextIndex = checklistFocusIndex(event.key, buttons.indexOf(document.activeElement as HTMLButtonElement), buttons.length);
            if (nextIndex === null) return;
            event.preventDefault();
            buttons[nextIndex]?.focus();
          }}
        >
          {options.map((option) => {
            const selected = selectedIds.has(option.id);
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={selected}
                className={`base-checklist-option ${selected ? "is-selected" : ""}`}
                disabled={option.disabled}
                onClick={() => onToggle(option.id)}
              >
                <span className="base-checklist-check" aria-hidden="true">
                  {selected ? <Check size={13} /> : null}
                </span>
                <span>
                  <strong>{option.label}</strong>
                  {option.description ? <small>{option.description}</small> : null}
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`base-checklist-trigger ${className}`.trim()}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) closeMenu();
          else openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        {Icon ? <Icon size={14} aria-hidden="true" /> : null}
        <span>{valueLabel}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {popover}
    </>
  );
}

function checklistFocusIndex(key: string, index: number, length: number): number | null {
  if (length <= 0) return null;
  if (key === "ArrowDown") return (index + 1) % length;
  if (key === "ArrowUp") return (index - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return null;
}
