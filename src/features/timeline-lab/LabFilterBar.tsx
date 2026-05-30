import { useEffect, useRef, useState, type RefObject } from "react";
import { Filter } from "lucide-react";
import type { NarrativeMomentKind } from "../../lib/timeline-lab/narrative";
import { isLabFilterActive, type LabFilter } from "../../lib/timeline-lab/labFilter";
import { SearchField } from "../../components/ui/SearchField";

const KIND_CHIPS: { kind: NarrativeMomentKind; label: string; tone: string }[] = [
  { kind: "conversation", label: "대화", tone: "purple" },
  { kind: "decision", label: "결정", tone: "blue" },
  { kind: "issue", label: "이슈", tone: "red" },
  { kind: "code", label: "구현", tone: "cyan" },
  { kind: "research", label: "조사", tone: "cyan" },
  { kind: "note", label: "기록", tone: "gray" },
];

/**
 * The cross-lens filter control. It narrows the reconstructed session once,
 * upstream of whichever lens is showing, so search and kind toggles act on
 * 서사 / 국면 / 인과 / 맥동 identically. It follows the 흐름 toolbar conventions:
 * the shared `SearchField` (no placeholder, per house style) and a single
 * filter popover for the kinds, rather than a row of always-visible chips.
 */
export function LabFilterBar({
  filter,
  onFilterChange,
  matched,
  total,
  kindCounts,
}: {
  filter: LabFilter;
  onFilterChange: (next: LabFilter) => void;
  matched: number;
  total: number;
  kindCounts: Partial<Record<NarrativeMomentKind, number>>;
}) {
  const active = isLabFilterActive(filter);
  const [filterOpen, setFilterOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  useClickOutside(popRef, filterOpen, () => setFilterOpen(false));

  const toggleKind = (kind: NarrativeMomentKind) => {
    const kinds = filter.kinds.includes(kind)
      ? filter.kinds.filter((k) => k !== kind)
      : [...filter.kinds, kind];
    onFilterChange({ ...filter, kinds });
  };

  return (
    <div className="lab-filter">
      <SearchField
        value={filter.query}
        onChange={(query) => onFilterChange({ ...filter, query })}
        ariaLabel="순간 검색"
      />

      <div className="toolbar-pop-wrap" ref={popRef}>
        <button
          type="button"
          className={`toolbar-toggle${filter.kinds.length ? " is-active" : ""}`}
          onClick={() => setFilterOpen((open) => !open)}
          aria-expanded={filterOpen}
          aria-controls="lab-kind-filter-popover"
          title="종류 필터"
        >
          <Filter size={14} aria-hidden="true" />
          {filter.kinds.length ? `필터 · ${filter.kinds.length}` : "필터"}
        </button>
        {filterOpen ? (
          <div
            className="filter-popover"
            id="lab-kind-filter-popover"
            role="dialog"
            aria-label="종류 필터"
          >
            <header>
              <span>종류 필터</span>
              <button
                type="button"
                className="filter-popover-clear"
                onClick={() => onFilterChange({ ...filter, kinds: [] })}
                disabled={filter.kinds.length === 0}
              >
                지우기
              </button>
            </header>
            <ul>
              {KIND_CHIPS.map((chip) => {
                const on = filter.kinds.includes(chip.kind);
                const count = kindCounts[chip.kind] ?? 0;
                return (
                  <li key={chip.kind}>
                    <button
                      type="button"
                      className={`filter-pop-item${on ? " active" : ""}`}
                      aria-pressed={on}
                      onClick={() => toggleKind(chip.kind)}
                    >
                      <span className={`legend-dot tone-${chip.tone}`} aria-hidden="true" />
                      <span className="filter-pop-label">{chip.label}</span>
                      <span className={`filter-pop-count${count === 0 ? " is-zero" : ""}`}>
                        {count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      {active ? (
        <span className="lab-filter-count" aria-live="polite">
          {matched}/{total}
        </span>
      ) : null}
    </div>
  );
}

function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ref, open, onClose]);
}
