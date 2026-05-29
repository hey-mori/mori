import { Search, X } from "lucide-react";
import type { NarrativeMomentKind } from "../../lib/timeline-lab/narrative";
import { isLabFilterActive, type LabFilter } from "../../lib/timeline-lab/labFilter";

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
 * 서사 / 국면 / 인과 / 맥동 identically. Kept calm: a single search field, a row
 * of toggle chips, and a live match count that only appears once a filter bites.
 */
export function LabFilterBar({
  filter,
  onFilterChange,
  matched,
  total,
}: {
  filter: LabFilter;
  onFilterChange: (next: LabFilter) => void;
  matched: number;
  total: number;
}) {
  const active = isLabFilterActive(filter);

  const toggleKind = (kind: NarrativeMomentKind) => {
    const kinds = filter.kinds.includes(kind)
      ? filter.kinds.filter((k) => k !== kind)
      : [...filter.kinds, kind];
    onFilterChange({ ...filter, kinds });
  };

  return (
    <div className="lab-filter">
      <div className="lab-filter-search">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          value={filter.query}
          placeholder="순간 검색"
          aria-label="순간 검색"
          onChange={(event) => onFilterChange({ ...filter, query: event.target.value })}
        />
      </div>

      <div className="lab-filter-kinds" role="group" aria-label="종류로 거르기">
        {KIND_CHIPS.map((chip) => {
          const on = filter.kinds.includes(chip.kind);
          return (
            <button
              key={chip.kind}
              type="button"
              className={`lab-filter-chip${on ? " is-on" : ""}`}
              data-tone={chip.tone}
              aria-pressed={on}
              onClick={() => toggleKind(chip.kind)}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {active ? (
        <div className="lab-filter-tail">
          <span className="lab-filter-count" aria-live="polite">
            {matched}/{total}
          </span>
          <button
            type="button"
            className="lab-filter-clear"
            onClick={() => onFilterChange({ query: "", kinds: [] })}
          >
            <X size={12} aria-hidden="true" />
            지우기
          </button>
        </div>
      ) : null}
    </div>
  );
}
