export function Toggle({ active = false, label, onClick }: { active?: boolean; label?: string; onClick?: () => void }) {
  return (
    <button
      className={`switch ${active ? "active" : ""}`}
      type="button"
      aria-label={label ?? "Toggle"}
      aria-pressed={active}
      onClick={onClick}
    />
  );
}
