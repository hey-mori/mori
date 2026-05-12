export function createImportId(prefix: string, value: string, timestamp: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);
  const suffix = timestamp.replace(/[^0-9]/g, "").slice(0, 14);
  return `${prefix}-${slug || "import"}-${suffix}`;
}
