export function Toggle({ active = false, label }: { active?: boolean; label?: string }) {
  return (
    <button className={`switch ${active ? "active" : ""}`} type="button" aria-label={label ?? "Toggle"} />
  );
}
