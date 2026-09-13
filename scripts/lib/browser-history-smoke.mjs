import assert from "node:assert/strict";

/** Exercises the shipped settings UI and Tauri read API, never direct SQL. */
export function createBrowserHistorySmoke({ run, waitFor, capture }) {
  const page = (cursor = null) =>
    run(
      `window.__TAURI_INTERNALS__.invoke('list_browser_evidence_page', ${JSON.stringify({ limit: 50, cursor })})`,
    );
  const uiRows = () =>
    run(`Array.from(document.querySelectorAll('.browser-history-row')).map(row => ({
    observedAt: row.querySelector('summary time').dateTime,
    receivedAt: row.querySelectorAll('dl time')[1].dateTime,
    kind: row.querySelector('summary strong').textContent,
    url: row.querySelector('.browser-history-fact > span').textContent
  }))`);
  const expected = (items) =>
    items.map((row) => ({
      observedAt: row.observedAt,
      receivedAt: row.receivedAt,
      kind: row.kind === "navigation_committed" ? "페이지 이동" : "탭 전환",
      url: row.data.url ?? "탭 활성화",
    }));
  const click = (label) =>
    run(
      `[...document.querySelectorAll('.browser-history button')].find(b => (b.getAttribute('aria-label') || b.textContent.trim()) === ${JSON.stringify(label)}).click()`,
    );
  const settled = () =>
    waitFor(
      () =>
        run(
          `document.querySelector('.browser-history-list')?.getAttribute('aria-busy') === 'false'`,
        ),
      "history page settled",
    );
  async function open() {
    await run("document.querySelector('.browser-source-history-entry').click()");
    await settled();
  }
  async function readAll(first = null) {
    const latencies = [];
    let cursor = null;
    const items = [];
    do {
      const started = performance.now();
      const batch = first ?? (await page(cursor));
      first = null;
      latencies.push(performance.now() - started);
      items.push(...batch.items);
      cursor = batch.nextCursor;
    } while (cursor);
    assert.equal(new Set(items.map((row) => row.sequence)).size, items.length);
    assert.deepEqual(
      items,
      [...items].sort(
        (a, b) => b.observedAt.localeCompare(a.observedAt) || b.sequence - a.sequence,
      ),
    );
    return { items, latencies };
  }
  async function traverse(items) {
    let pages = 1;
    while (
      await run(
        `!![...document.querySelectorAll('.browser-history button')].find(b=>b.textContent.trim()==='이전 활동 더 보기')`,
      )
    ) {
      await click("이전 활동 더 보기");
      await settled();
      pages++;
      assert.ok(pages <= 30, "bounded test traversal");
    }
    assert.deepEqual(await uiRows(), expected(items.slice(-500)));
    assert.ok(
      await run(
        `document.querySelector('.browser-history-foot').textContent.includes('마지막 활동까지 확인했습니다')`,
      ),
    );
    return pages;
  }
  return {
    async empty() {
      await open();
      assert.ok(
        await run(
          `document.querySelector('.browser-history-foot')?.textContent.includes('저장된 브라우저 활동이 없습니다')`,
        ),
      );
      await click("연동으로 돌아가기");
      await waitFor(
        () => run(`document.activeElement?.classList.contains('browser-source-history-entry')`),
        "history back focus",
      );
    },
    async verify(addObservation) {
      await open();
      const first = await page();
      assert.equal(first.items.length, 50);
      assert.deepEqual(await uiRows(), expected(first.items));
      await capture("browser-history-first.png");
      await addObservation();
      const frozen = await readAll(first);
      assert.ok(frozen.items.every((row) => row.sequence <= first.nextCursor.snapshotSequence));
      await click("이전 활동 더 보기");
      await settled();
      const pages = 1 + (await traverse(frozen.items));
      await click("활동 새로고침");
      await settled();
      const refreshed = await readAll();
      assert.ok(refreshed.items.length > frozen.items.length);
      assert.deepEqual(await uiRows(), expected(refreshed.items.slice(0, 50)));
      const refreshedPages = await traverse(refreshed.items);
      await run("document.querySelector('.browser-history-row details').open = true");
      await run("document.querySelector('.browser-history-list').scrollTop = 0");
      await capture("browser-history-details.png");
      const layout = await run(`(() => {
        const surface = document.querySelector('.browser-history');
        const rows = [...surface.querySelectorAll('summary')];
        return { width: innerWidth, height: innerHeight, rows: rows.length,
          overflow: surface.scrollWidth > surface.clientWidth,
          rowOverflow: rows.some(row => row.scrollWidth > row.clientWidth),
          footerBottom: surface.querySelector('footer').getBoundingClientRect().bottom,
          emptyButtonLabels: [...surface.querySelectorAll('button')].some(b => !(b.getAttribute('aria-label') || b.textContent.trim())) };
      })()`);
      assert.equal(layout.overflow, false);
      assert.equal(layout.rowOverflow, false);
      assert.equal(layout.emptyButtonLabels, false);
      assert.ok(layout.footerBottom <= layout.height);
      return {
        rows: frozen.items.length,
        pages,
        refreshedRows: refreshed.items.length,
        refreshedPages,
        pageReadMs: refreshed.latencies,
        layout,
      };
    },
    async reopenAndOff(expectedRows) {
      await open();
      const current = await readAll();
      assert.deepEqual(current.items, expectedRows);
      const pages = await traverse(current.items);
      await capture("browser-history-reopened-off.png");
      return { rows: current.items.length, pages };
    },
  };
}
