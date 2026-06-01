import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type BaseSelectOption<T extends string> = {
  id: T;
  label: string;
  description?: string;
  icon?: LucideIcon;
  disabled?: boolean;
};

export type BaseSelectProps<T extends string> = {
  value: T;
  options: BaseSelectOption<T>[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
};

export function BaseSelect<T extends string>({
  value,
  options,
  onChange,
  label,
  className = "",
}: BaseSelectProps<T>) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 220 });
  const selected = options.find((option) => option.id === value) ?? options[0];
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === value));
  const enabledOptions = useMemo(() => options.filter((option) => !option.disabled), [options]);

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

  function selectOption(nextValue: T) {
    const next = options.find((option) => option.id === nextValue);
    if (!next || next.disabled) return;
    onChange(nextValue);
    closeMenu();
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
    const width = Math.max(rect.width, 220);
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
      const buttons = Array.from(
        listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? [],
      );
      const current = buttons.find((button) => button.dataset.value === value) ?? buttons[0];
      current?.focus();
    }, 0);
  }, [open, value]);

  const Icon = selected?.icon;
  const listbox = open && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={listRef}
          className="base-select-popover"
          role="listbox"
          aria-label={label}
          style={{ left: `${position.left}px`, top: `${position.top}px`, width: `${position.width}px` }}
          onKeyDown={(event) => {
            const buttons = Array.from(
              listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? [],
            );
            if (buttons.length === 0) return;
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const nextIndex = selectFocusIndex(event.key, index, buttons.length);
            if (nextIndex === null) return;
            event.preventDefault();
            buttons[nextIndex]?.focus();
          }}
        >
          {options.map((option, index) => {
            const OptionIcon = option.icon;
            const isSelected = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-value={option.id}
                className={`base-select-option ${isSelected ? "is-selected" : ""}`}
                disabled={option.disabled}
                tabIndex={index === selectedIndex ? 0 : -1}
                onClick={() => selectOption(option.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectOption(option.id);
                  }
                }}
              >
                {OptionIcon ? <OptionIcon size={14} aria-hidden="true" /> : <span aria-hidden="true" />}
                <span>
                  <strong>{option.label}</strong>
                  {option.description ? <small>{option.description}</small> : null}
                </span>
                {isSelected ? <Check size={14} aria-hidden="true" /> : null}
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
        className={`base-select-trigger ${className}`.trim()}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (open) closeMenu();
          else openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        {Icon ? <Icon size={14} aria-hidden="true" /> : null}
        <span>{selected?.label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {enabledOptions.length > 0 ? listbox : null}
    </>
  );
}

function selectFocusIndex(key: string, index: number, length: number): number | null {
  if (key === "ArrowDown") return (index + 1) % length;
  if (key === "ArrowUp") return (index - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return null;
}
