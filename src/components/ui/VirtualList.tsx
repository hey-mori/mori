import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { buildOffsets, computeVirtualRange } from "../../lib/virtual/virtualWindow";

export type VirtualListProps<T> = {
  items: readonly T[];
  /** Height guess for an unmeasured row, in px. Real heights are measured after
   *  first render and refine the offsets, so this only needs to be roughly right. */
  estimateHeight: number;
  /** Extra rows rendered above / below the viewport so a fast scroll never flashes blank. */
  overscan?: number;
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  ariaLabel?: string;
  /** Keep the view pinned to the newest row when items append (live logs). */
  stickToBottom?: boolean;
};

/**
 * A measured-height virtual list: renders only the rows near the viewport plus
 * an overscan margin, with top / bottom spacers holding the scrollbar honest.
 * Heights are estimated first, then measured from the real DOM and cached, so
 * variable-height rows scroll correctly without the caller declaring a fixed
 * height. The index math lives in `lib/virtual/virtualWindow` (unit-tested);
 * this component owns only the DOM, measurement, and scroll wiring.
 *
 * Built dependency-free on purpose. It is used by the Live Follow Lab, where a
 * single request column can accumulate hundreds of rows during a long session;
 * the shared timeline lists have variable rows with inline expansion and are a
 * separate, careful migration.
 */
export function VirtualList<T>({
  items,
  estimateHeight,
  overscan = 6,
  getKey,
  renderItem,
  className = "",
  ariaLabel,
  stickToBottom = false,
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const heightsRef = useRef<Map<string, number>>(new Map());
  const pinnedRef = useRef(true);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  // Bumped when a measured height changes, to recompute offsets.
  const [measureTick, setMeasureTick] = useState(0);

  const heights = useMemo(
    () => items.map((item, index) => heightsRef.current.get(getKey(item, index)) ?? estimateHeight),
    // measureTick invalidates the cache read after a real measurement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, estimateHeight, getKey, measureTick],
  );
  const offsets = useMemo(() => buildOffsets(heights), [heights]);

  const range = useMemo(
    () =>
      computeVirtualRange({
        scrollTop,
        // Before the container is measured, assume a screenful so the first
        // paint renders a usable chunk rather than a single row.
        viewportHeight: viewportHeight || estimateHeight * 12,
        offsets,
        overscan,
      }),
    [scrollTop, viewportHeight, offsets, overscan, estimateHeight],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const measure = useCallback((key: string, el: HTMLElement | null) => {
    if (!el) return;
    const height = el.offsetHeight;
    if (height > 0 && heightsRef.current.get(key) !== height) {
      heightsRef.current.set(key, height);
      setMeasureTick((tick) => tick + 1);
    }
  }, []);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      setScrollTop(el.scrollTop);
      // Pinned when within a row of the bottom, so live appends keep following.
      pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= estimateHeight;
    },
    [estimateHeight],
  );

  // Follow the tail when new rows arrive and the user was at the bottom.
  useLayoutEffect(() => {
    if (!stickToBottom) return;
    const el = scrollRef.current;
    if (el && pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, stickToBottom, offsets]);

  const rows: ReactNode[] = [];
  for (let index = range.startIndex; index <= range.endIndex; index += 1) {
    const item = items[index];
    if (item === undefined) continue;
    const key = getKey(item, index);
    rows.push(
      <div key={key} className="vlist-row" ref={(el) => measure(key, el)}>
        {renderItem(item, index)}
      </div>,
    );
  }

  return (
    <div
      ref={scrollRef}
      className={`vlist ${className}`.trim()}
      onScroll={handleScroll}
      role="list"
      aria-label={ariaLabel}
    >
      <div className="vlist-spacer" style={{ height: range.paddingTop }} aria-hidden="true" />
      {rows}
      <div className="vlist-spacer" style={{ height: range.paddingBottom }} aria-hidden="true" />
    </div>
  );
}
