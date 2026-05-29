import { Search, X } from "lucide-react";
import { useRef } from "react";
import { baseTooltipProps } from "./BaseTooltip";

export type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  clearLabel?: string;
  autoFocus?: boolean;
};

/**
 * Product search field with one clear affordance and Mori's compact desktop
 * sizing. `ToolbarSearch` is kept as a compatibility wrapper around this.
 */
export function SearchField({
  value,
  onChange,
  placeholder = "",
  ariaLabel,
  className = "",
  clearLabel = "검색 지우기",
  autoFocus = false,
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`base-search-field ${className}`.trim()}
      role="search"
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        inputRef.current?.focus();
      }}
    >
      <Search size={14} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? "검색"}
        autoFocus={autoFocus}
      />
      {value ? (
        <button
          type="button"
          className="base-search-clear"
          onClick={() => onChange("")}
          aria-label={clearLabel}
          {...baseTooltipProps(clearLabel, "control")}
        >
          <X size={12} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
