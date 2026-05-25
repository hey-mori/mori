import { SearchField } from "./SearchField";

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
    <SearchField
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      className={className}
    />
  );
}
