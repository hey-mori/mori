import {
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { focusFirstElement } from "./focusTrap";
import { baseTooltipProps } from "./BaseTooltip";

export type BaseMenuPosition = {
  x: number;
  y: number;
};

export type BaseMenuItemSpec =
  | {
      type?: "item";
      id: string;
      label: string;
      icon?: LucideIcon;
      onSelect: () => void;
      disabled?: boolean;
      destructive?: boolean;
      title?: string;
    }
  | {
      type: "separator";
      id: string;
    };

export function useContextMenuPosition() {
  const [position, setPosition] = useState<BaseMenuPosition | null>(null);
  const openAt = (next: BaseMenuPosition) => setPosition(next);
  const close = () => setPosition(null);

  const onContextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    openAt({ x: event.clientX, y: event.clientY });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    openAt({ x: rect.left + 16, y: rect.top + Math.min(rect.height, 32) });
  };

  return {
    open: position !== null,
    position,
    openAt,
    close,
    onContextMenu,
    onKeyDown,
  };
}

export function BaseContextMenu({
  open,
  position,
  items,
  onClose,
  label,
}: {
  open: boolean;
  position: BaseMenuPosition | null;
  items: BaseMenuItemSpec[];
  onClose: () => void;
  label: string;
}) {
  if (!open || !position) return null;
  return (
    <BaseMenuLayer
      position={position}
      items={items}
      onClose={onClose}
      label={label}
    />
  );
}

export function BaseOverflowMenu({
  items,
  label,
  className = "",
}: {
  items: BaseMenuItemSpec[];
  label: string;
  className?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [position, setPosition] = useState<BaseMenuPosition | null>(null);
  const open = position !== null;

  function closeMenu() {
    setPosition(null);
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  }

  function openFromButton() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ x: rect.right, y: rect.bottom + 4 });
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`base-overflow-menu-trigger ${className}`.trim()}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (open) closeMenu();
          else openFromButton();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openFromButton();
          }
        }}
      >
        <MoreHorizontal size={14} aria-hidden="true" />
      </button>
      {open ? (
        <BaseMenuLayer
          position={position}
          items={items}
          onClose={closeMenu}
          label={label}
          align="end"
        />
      ) : null}
    </>
  );
}

function BaseMenuLayer({
  position,
  items,
  onClose,
  label,
  align = "start",
}: {
  position: BaseMenuPosition;
  items: BaseMenuItemSpec[];
  onClose: () => void;
  label: string;
  align?: "start" | "end";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [placed, setPlaced] = useState(position);
  const actionableItems = useMemo(
    () => items.filter((item) => item.type !== "separator" && !item.disabled),
    [items],
  );

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof window === "undefined") return;
    const margin = 8;
    const rect = node.getBoundingClientRect();
    const initialX = align === "end" ? position.x - rect.width : position.x;
    const x = Math.min(
      Math.max(margin, initialX),
      Math.max(margin, window.innerWidth - rect.width - margin),
    );
    const y = Math.min(
      Math.max(margin, position.y),
      Math.max(margin, window.innerHeight - rect.height - margin),
    );
    setPlaced({ x, y });
  }, [align, position]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        onClose();
        return;
      }
      if (
        event.key !== "ArrowDown" &&
        event.key !== "ArrowUp" &&
        event.key !== "Home" &&
        event.key !== "End"
      ) return;
      event.preventDefault();
      const buttons = Array.from(
        ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
      );
      if (buttons.length === 0) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = menuFocusIndex(event.key, index, buttons.length);
      buttons[next]?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (actionableItems.length === 0) return;
    window.setTimeout(() => {
      focusFirstElement(ref.current);
    }, 0);
  }, [actionableItems.length]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      className="base-action-menu"
      role="menu"
      aria-label={label}
      style={{ left: `${placed.x}px`, top: `${placed.y}px` }}
    >
      {items.map((item) => {
        if (item.type === "separator") {
          return <div key={item.id} className="base-menu-separator" role="separator" />;
        }
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={[
              "base-menu-item",
              item.destructive ? "is-destructive" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={item.disabled}
            {...baseTooltipProps(item.title, "control")}
            onClick={(event) => {
              event.stopPropagation();
              if (item.disabled) return;
              item.onSelect();
              onClose();
            }}
          >
            {Icon ? <Icon size={14} aria-hidden="true" /> : <span aria-hidden="true" />}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

function menuFocusIndex(key: string, index: number, length: number): number {
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowDown") return (index + 1) % length;
  return (index - 1 + length) % length;
}
