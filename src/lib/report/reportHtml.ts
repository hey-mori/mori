/**
 * HTML rendering for Mori reports.
 *
 * `buildReportMarkdown` (see `reportBuilder.ts`) emits a deliberately narrow,
 * controlled Markdown subset — headings, single-nested bullet lists, inline
 * bold / italic / code, fenced code blocks, and horizontal rules. This module
 * renders exactly that subset to a standalone HTML document, so HTML export
 * needs no Markdown-parser dependency and never has to interpret arbitrary
 * Markdown.
 *
 * It is pure and synchronous: callers pass the Markdown produced by
 * `buildReportMarkdown` and get back an HTML string.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Render the inline span subset: `` `code` ``, `**bold**`, `_italic_`.
 * The text is HTML-escaped first; unbalanced markers are left as literals
 * so user-supplied content (event titles, summaries) can never break out.
 */
export function renderReportInlineHtml(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
  return html;
}

/**
 * Render the report Markdown body to an HTML fragment (no document shell).
 * Handles headings (`#`–`###`), one level of nested `- ` lists, fenced code
 * blocks, `---` rules, and paragraphs.
 */
export function renderReportMarkdownToHtml(markdown: string): string {
  const out: string[] = [];
  let listOpen = false;
  let topLiOpen = false;
  let nestedUlOpen = false;
  let inCode = false;
  let codeLines: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      out.push(`<p>${renderReportInlineHtml(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const closeNestedUl = () => {
    if (nestedUlOpen) {
      out.push("</ul>");
      nestedUlOpen = false;
    }
  };
  const closeTopLi = () => {
    if (topLiOpen) {
      closeNestedUl();
      out.push("</li>");
      topLiOpen = false;
    }
  };
  const closeList = () => {
    if (listOpen) {
      closeTopLi();
      out.push("</ul>");
      listOpen = false;
    }
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (inCode) {
        out.push(`<pre><code>${codeLines.map(escapeHtml).join("\n")}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        flushParagraph();
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    if (trimmed === "") {
      flushParagraph();
      closeList();
      continue;
    }

    if (trimmed === "---") {
      flushParagraph();
      closeList();
      out.push("<hr />");
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${renderReportInlineHtml(heading[2])}</h${level}>`);
      continue;
    }

    // A nested bullet — two or more leading spaces before the marker.
    const nested = /^[ ]{2,}-\s+(.*)$/.exec(line);
    if (nested) {
      flushParagraph();
      if (!listOpen) {
        out.push("<ul>");
        listOpen = true;
      }
      if (!topLiOpen) {
        out.push("<li>");
        topLiOpen = true;
      }
      if (!nestedUlOpen) {
        out.push("<ul>");
        nestedUlOpen = true;
      }
      out.push(`<li>${renderReportInlineHtml(nested[1])}</li>`);
      continue;
    }

    // A top-level bullet.
    const top = /^-\s+(.*)$/.exec(trimmed);
    if (top) {
      flushParagraph();
      closeTopLi();
      if (!listOpen) {
        out.push("<ul>");
        listOpen = true;
      }
      out.push(`<li>${renderReportInlineHtml(top[1])}`);
      topLiOpen = true;
      continue;
    }

    // Anything else is paragraph text.
    closeList();
    paragraph.push(trimmed);
  }

  if (inCode) {
    out.push(`<pre><code>${codeLines.map(escapeHtml).join("\n")}</code></pre>`);
  }
  flushParagraph();
  closeList();

  return out.join("\n");
}

const REPORT_HTML_STYLE = `
  :root { color-scheme: light; }
  body {
    margin: 0;
    background: #f4f5f8;
    color: #1c2230;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.6;
  }
  main {
    max-width: 760px;
    margin: 0 auto;
    padding: 48px 32px 72px;
  }
  h1 { font-size: 26px; margin: 0 0 20px; }
  h2 { font-size: 19px; margin: 32px 0 10px; border-bottom: 1px solid #d9dce4; padding-bottom: 6px; }
  h3 { font-size: 15px; margin: 20px 0 8px; }
  p { margin: 10px 0; }
  ul { margin: 8px 0; padding-left: 22px; }
  li { margin: 3px 0; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.88em;
    background: #e7e9f0;
    padding: 1px 5px;
    border-radius: 4px;
  }
  pre {
    background: #1c2230;
    color: #e8eaf2;
    padding: 14px 16px;
    border-radius: 8px;
    overflow-x: auto;
  }
  pre code { background: none; padding: 0; color: inherit; font-size: 0.85em; }
  hr { border: 0; border-top: 1px solid #d9dce4; margin: 28px 0; }
  @media print {
    body { background: #fff; }
    main { padding: 0; }
  }
`;

/**
 * Wrap report Markdown in a self-contained, printable HTML document. The
 * stylesheet is inlined so the file works offline and can be printed to PDF
 * straight from the browser.
 */
export function buildReportHtmlDocument(input: {
  markdown: string;
  title: string;
}): string {
  const body = renderReportMarkdownToHtml(input.markdown);
  const safeTitle = escapeHtml(input.title);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
<style>${REPORT_HTML_STYLE}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}
