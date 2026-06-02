import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type BaseTooltipKind = "control" | "info" | "metric" | "status" | "text" | "timeline";

type Coords = { top: number; left: number; placement: "top" | "bottom" };

const MAX_W = 300;
const GAP = 8;

export function baseTooltipProps(
  content: string | null | undefined,
  kind: BaseTooltipKind = "text",
): HTMLAttributes<HTMLElement> {
  if (!content) return {};
  return {
    "data-base-tooltip": content,
    "data-base-tooltip-kind": kind,
  } as HTMLAttributes<HTMLElement>;
}

export function BaseTooltip({
  children,
  content,
  kind = "text",
  as = "span",
  className = "",
}: {
  children: ReactNode;
  content?: string | null;
  kind?: BaseTooltipKind;
  as?: "span" | "div";
  className?: string;
}) {
  const Element = as;
  return (
    <Element
      className={`base-tooltip-anchor ${className}`.trim()}
      {...baseTooltipProps(content, kind)}
    >
      {children}
    </Element>
  );
}

export function BaseTooltipProvider({ children }: { children: ReactNode }) {
  const tooltipId = useId();
  const activeRef = useRef<HTMLElement | null>(null);
  const [tooltip, setTooltip] = useState<{
    content: string;
    kind: BaseTooltipKind;
    coords: Coords;
  } | null>(null);

  const close = useCallback(() => {
    if (activeRef.current?.getAttribute("aria-describedby") === tooltipId) {
      activeRef.current.removeAttribute("aria-describedby");
    }
    activeRef.current = null;
    setTooltip(null);
  }, [tooltipId]);

  const open = useCallback(
    (target: HTMLElement) => {
      const content = target.getAttribute("data-base-tooltip")?.trim();
      if (!content) {
        close();
        return;
      }

      const rect = target.getBoundingClientRect();
      const placement: Coords["placement"] = rect.top >= 120 ? "top" : "bottom";
      const half = MAX_W / 2;
      const left = Math.min(
        Math.max(rect.left + rect.width / 2, half + GAP),
        window.innerWidth - half - GAP,
      );
      const top = placement === "top" ? rect.top - GAP : rect.bottom + GAP;
      const kind = getTooltipKind(target);

      activeRef.current?.removeAttribute("aria-describedby");
      target.setAttribute("aria-describedby", tooltipId);
      activeRef.current = target;
      setTooltip({ content, kind, coords: { top, left, placement } });
    },
    [close, tooltipId],
  );

  useEffect(() => {
    function tooltipTarget(node: EventTarget | null): HTMLElement | null {
      if (!(node instanceof Element)) return null;
      return node.closest<HTMLElement>("[data-base-tooltip]");
    }

    function onPointerOver(event: PointerEvent) {
      const target = tooltipTarget(event.target);
      if (target) open(target);
    }

    function onPointerOut(event: PointerEvent) {
      const target = tooltipTarget(event.target);
      if (!target || !activeRef.current) return;
      if (target !== activeRef.current) return;
      if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
      close();
    }

    function onMouseOver(event: MouseEvent) {
      const target = tooltipTarget(event.target);
      if (target) open(target);
    }

    function onMouseOut(event: MouseEvent) {
      const target = tooltipTarget(event.target);
      if (!target || !activeRef.current) return;
      if (target !== activeRef.current) return;
      if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
      close();
    }

    function onFocusIn(event: FocusEvent) {
      const target = tooltipTarget(event.target);
      if (target) open(target);
    }

    function onFocusOut(event: FocusEvent) {
      if (event.target === activeRef.current) close();
    }

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("mouseover", onMouseOver, true);
    document.addEventListener("mouseout", onMouseOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("mouseover", onMouseOver, true);
      document.removeEventListener("mouseout", onMouseOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [close, open]);

  return (
    <>
      {children}
      {tooltip && typeof document !== "undefined"
        ? createPortal(
            <span
              id={tooltipId}
              className={`base-tooltip-bubble is-${tooltip.coords.placement}`}
              data-base-tooltip-kind={tooltip.kind}
              role="tooltip"
              style={{ top: tooltip.coords.top, left: tooltip.coords.left }}
            >
              {tooltip.content}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

function getTooltipKind(el: HTMLElement): BaseTooltipKind {
  const kind = el.getAttribute("data-base-tooltip-kind");
  if (
    kind === "control" ||
    kind === "info" ||
    kind === "metric" ||
    kind === "status" ||
    kind === "timeline"
  ) {
    return kind;
  }
  return "text";
}
