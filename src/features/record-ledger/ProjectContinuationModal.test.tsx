import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectContinuationModal } from "./ProjectContinuationModal";
import type { ProjectContinuationPack } from "../../lib/continuation/projectContinuation";

const markdown = "# 프로젝트 이어가기 · infra\n\n## 최근 세션\n- 세션 (mori:session/auto-claude-abc)\n- 제목 (mori:session/not-issued)\n";
const pack = {
  markdown,
  sessions: [{ ref: "mori:session/auto-claude-abc", title: "세션" }],
  decisions: [],
  openTasks: [],
  notes: [],
} as unknown as ProjectContinuationPack;

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');

function previewOf(html: string): string {
  const match = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
  return match ? match[1]! : "";
}

describe("이어가기 preview", () => {
  it("shows exactly the copied text, with the pack's own refs openable", () => {
    const html = renderToStaticMarkup(<ProjectContinuationModal pack={pack} onClose={() => {}} onOpenRef={() => {}} />);
    const preview = previewOf(html);
    expect(textOf(preview)).toBe(markdown);
    expect(preview.match(/class="continuation-ref"/g)?.length).toBe(1);
    expect(preview).toContain(">mori:session/auto-claude-abc</button>");
  });

  it("leaves every ref as text when nothing can open it", () => {
    const html = renderToStaticMarkup(<ProjectContinuationModal pack={pack} onClose={() => {}} />);
    expect(previewOf(html)).not.toContain("<button");
    expect(textOf(previewOf(html))).toBe(markdown);
  });
});
