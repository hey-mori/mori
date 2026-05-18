import { describe, expect, it } from "vitest";
import {
  buildReportHtmlDocument,
  renderReportInlineHtml,
  renderReportMarkdownToHtml,
} from "./reportHtml";

describe("renderReportInlineHtml", () => {
  it("renders bold, italic, and code spans", () => {
    expect(renderReportInlineHtml("a **b** _c_ `d`")).toBe(
      "a <strong>b</strong> <em>c</em> <code>d</code>",
    );
  });

  it("escapes HTML before applying spans", () => {
    expect(renderReportInlineHtml("<script> & **x**")).toBe(
      "&lt;script&gt; &amp; <strong>x</strong>",
    );
  });

  it("leaves an unbalanced marker as a literal", () => {
    expect(renderReportInlineHtml("a ** b")).toBe("a ** b");
  });
});

describe("renderReportMarkdownToHtml", () => {
  it("renders the three heading levels", () => {
    const html = renderReportMarkdownToHtml("# A\n\n## B\n\n### C");
    expect(html).toContain("<h1>A</h1>");
    expect(html).toContain("<h2>B</h2>");
    expect(html).toContain("<h3>C</h3>");
  });

  it("renders a flat bullet list", () => {
    const html = renderReportMarkdownToHtml("- one\n- two\n");
    expect(html).toBe("<ul>\n<li>one\n</li>\n<li>two\n</li>\n</ul>");
  });

  it("nests a two-space-indented bullet inside its parent item", () => {
    const html = renderReportMarkdownToHtml("- parent\n  - child\n");
    expect(html).toContain("<ul>\n<li>parent\n<ul>\n<li>child</li>\n</ul>\n</li>\n</ul>");
  });

  it("closes the list when a blank line or heading follows", () => {
    const html = renderReportMarkdownToHtml("- item\n\n## After");
    expect(html).toBe("<ul>\n<li>item\n</li>\n</ul>\n<h2>After</h2>");
  });

  it("renders a fenced code block without inline processing", () => {
    const html = renderReportMarkdownToHtml("```text\nrun **x** now\n```");
    expect(html).toBe("<pre><code>run **x** now</code></pre>");
  });

  it("escapes HTML inside a code block", () => {
    const html = renderReportMarkdownToHtml("```\n<b> & </b>\n```");
    expect(html).toBe("<pre><code>&lt;b&gt; &amp; &lt;/b&gt;</code></pre>");
  });

  it("renders a horizontal rule", () => {
    expect(renderReportMarkdownToHtml("a\n\n---\n\nb")).toContain("<hr />");
  });

  it("renders plain lines as paragraphs", () => {
    expect(renderReportMarkdownToHtml("just text")).toBe("<p>just text</p>");
  });
});

describe("buildReportHtmlDocument", () => {
  it("wraps the body in a self-contained document with an escaped title", () => {
    const doc = buildReportHtmlDocument({ markdown: "# Hello", title: "A <b> title" });
    expect(doc.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(doc).toContain("<title>A &lt;b&gt; title</title>");
    expect(doc).toContain("<style>");
    expect(doc).toContain("<h1>Hello</h1>");
    expect(doc).toContain("</html>");
  });
});
