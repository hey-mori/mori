import { Search, X } from "lucide-react";

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
  placeholder = "검색",
  ariaLabel,
  className = "",
  clearLabel = "검색 지우기",
  autoFocus = false,
}: SearchFieldProps) {
  return (
    <label className={`mori-search-field ${className}`.trim()}>
      <Search size={14} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoFocus={autoFocus}
      />
      {value ? (
        <button
          type="button"
          className="mori-search-clear"
          onClick={() => onChange("")}
          aria-label={clearLabel}
          title={clearLabel}
        >
          <X size={12} aria-hidden="true" />
        </button>
      ) : null}
    </label>
  );
}
