import { Search } from "lucide-react";

export type ToolbarSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
};

/**
 * Shared search input for toolbars and action bars.
 * Wraps the icon + input in the standard `mori-search-field` label shell.
 */
export function ToolbarSearch({
  value,
  onChange,
  placeholder = "검색",
  ariaLabel,
  className = "",
}: ToolbarSearchProps) {
  return (
    <label className={`mori-search-field ${className}`.trim()}>
      <Search size={14} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
      />
    </label>
  );
}
