#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  statSync,
  existsSync,
} from "node:fs";
import { createServer } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createBrowserHistorySmoke } from "./lib/browser-history-smoke.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
}
const extensionRepo = path.resolve(option("--extension-repo", "../mori-browser-extension"));
const extensionRoot = path.join(extensionRepo, "dist/chrome/mori-browser-extension-0.1.0");
const moriExe = path.resolve(option("--mori-exe", "src-tauri/target/release/mori.exe"));
const nativeHostPath = path.resolve(
  option("--host-exe", "src-tauri/target/release/mori-browser-native-host.exe"),
);
const count = Number(option("--observations", "60"));
const historyMode = args.includes("--history");
const spaMode = args.includes("--spa");
assert.ok(
  Number.isInteger(count) && count >= 20 && count <= (historyMode ? 400 : 80),
  "invalid observation count",
);
for (const file of [moriExe, nativeHostPath, path.join(extensionRoot, "manifest.json")])
  assert.ok(existsSync(file), `Missing ${file}`);
const {
  launchChrome,
  CdpConnection,
  NativeHostRegistry,
  loadExtension,
  openExtensionPopup,
  setCaptureFromPopup,
  evaluate,
  waitFor,
} = await import(pathToFileURL(path.join(extensionRepo, "scripts/chrome-native-smoke.mjs")));
const { discoverChromePath } = await import(
  pathToFileURL(path.join(extensionRepo, "scripts/lib/chromeNativeSmokeSupport.mjs"))
);

const output = mkdtempSync(path.join(os.tmpdir(), "mori-browser-live-"));
const profile = path.join(output, "chrome");
mkdirSync(profile);
const relayName = `mori-browser-live-${process.pid}-${Date.now()}`;
const result = { output, scenarios: {}, failures: [], observationsRequested: count };
let desktopExe = moriExe;
let testPort = args.includes("--webview-port") ? Number(option("--webview-port")) : undefined;
let chrome;
let desktop;
let desktopCdp;
let desktopSession;
let popup;
const site = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<!doctype html><title>Private test title</title><p>Browser live source test</p>");
});
await new Promise((resolve) => site.listen(0, "127.0.0.1", resolve));
const siteOrigin = `http://127.0.0.1:${site.address().port}`;
const registry = new NativeHostRegistry("chrome");
const initialRegistry = registry.read();
const env = { MORI_BROWSER_RELAY_NAME: relayName };
const log = (message) => console.error(`[browser-live] ${message}`);
const history = createBrowserHistorySmoke({
  run: (expression) => evaluate(desktopCdp, desktopSession, expression, { awaitPromise: true }),
  waitFor,
  capture: (name) => capture(desktopCdp, desktopSession, name),
});

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function startDesktop(retry = true) {
  const port = testPort ?? (await freePort());
  const desktopEnv = { ...process.env, ...env };
  delete desktopEnv.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS;
  const launched = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "(Start-Process -FilePath $env:MORI_SMOKE_EXE -WorkingDirectory $env:MORI_SMOKE_ROOT -WindowStyle Hidden -PassThru).Id",
    ],
    {
      windowsHide: true,
      encoding: "utf8",
      env: {
        ...desktopEnv,
        MORI_SMOKE_EXE: desktopExe,
        MORI_SMOKE_ROOT: root,
        HOME: path.join(output, "home"),
        USERPROFILE: path.join(output, "home"),
        APPDATA: path.join(output, "home/AppData/Roaming"),
        LOCALAPPDATA: path.join(output, "home/AppData/Local"),
        WEBVIEW2_USER_DATA_FOLDER: path.join(output, "webview"),
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --enable-logging --log-file=${path.join(output, "webview-debug.log")}`,
      },
    },
  );
  assert.equal(launched.status, 0, launched.stderr);
  desktop = { pid: Number(launched.stdout.trim()) };
  assert.ok(Number.isInteger(desktop.pid) && desktop.pid > 0, "Mori process id");
  let pages;
  try {
    pages = await waitFor(
      async () => {
        if (!desktopRunning()) throw new Error("Mori exited before WebView connection");
        const response = await fetch(`http://127.0.0.1:${port}/json/list`);
        const list = await response.json();
        return list.find((page) => page.type === "page" && !page.url.includes("language-overlay"));
      },
      "Mori WebView",
      { timeoutMs: 15000 },
    );
  } catch (error) {
    if (!retry) throw error;
    result.webviewStartupRetries = (result.webviewStartupRetries ?? 0) + 1;
    log("Retrying WebView connection with the same isolated profile");
    await stopDesktop();
    return startDesktop(false);
  }
  desktopCdp = new CdpConnection(pages.webSocketDebuggerUrl);
  await desktopCdp.connect();
  result.webviewVersion = (await desktopCdp.send("Browser.getVersion")).product;
  desktopSession = undefined;
  await waitFor(
    () =>
      evaluate(
        desktopCdp,
        desktopSession,
        "Boolean(window.__TAURI_INTERNALS__ && document.querySelector('.sidebar'))",
      ),
    "Mori application ready",
    { timeoutMs: 30000 },
  );
  await evaluate(desktopCdp, desktopSession, "document.querySelector('.first-run-close')?.click()");
}
async function stopDesktop() {
  desktopCdp?.close();
  desktopCdp = null;
  if (desktopRunning()) {
    spawnSync("taskkill", ["/PID", String(desktop.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    await waitFor(() => !desktopRunning(), "Mori stopped");
  }
  desktop = null;
}
function desktopRunning() {
  if (!desktop) return false;
  try {
    process.kill(desktop.pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function rows() {
  return evaluate(
    desktopCdp,
    desktopSession,
    historyMode
      ? `(async () => {
      const items = []; let cursor = null;
      do {
        const page = await window.__TAURI_INTERNALS__.invoke('list_browser_evidence_page', {limit:100, cursor});
        items.push(...page.items); cursor = page.nextCursor;
      } while (cursor);
      return items;
    })()`
      : "window.__TAURI_INTERNALS__.invoke('list_recent_browser_evidence', {limit:200})",
    { awaitPromise: true },
  );
}
function databaseSize() {
  const db = path.join(output, "home/Mori/Records/mori.sqlite");
  const bytes = (file) => (existsSync(file) ? statSync(file).size : 0);
  return { main: bytes(db), wal: bytes(`${db}-wal`), sharedMemory: bytes(`${db}-shm`) };
}
async function state() {
  return evaluate(
    chrome.cdp,
    popup.sessionId,
    "chrome.runtime.sendMessage({type:'mori.browser.get_state'}).then(r=>r.state)",
    { awaitPromise: true },
  );
}
async function waitDelivered() {
  return waitFor(
    async () => {
      const current = await state();
      return current.transport.pending === 0 && current.transport.lastAcknowledgement?.ok
        ? current
        : null;
    },
    "delivery ACK",
    { timeoutMs: 15000 },
  );
}
async function openHealth() {
  await evaluate(
    desktopCdp,
    desktopSession,
    "document.querySelector('[aria-label=\"닫기\"]')?.click(); document.querySelector('.sidebar-user')?.click()",
  );
  await waitFor(
    async () =>
      evaluate(
        desktopCdp,
        desktopSession,
        "Boolean([...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='연동'))",
      ),
    "Connections settings tab",
  );
  await evaluate(
    desktopCdp,
    desktopSession,
    "[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='연동').click()",
  );
  await waitFor(
    () =>
      evaluate(
        desktopCdp,
        desktopSession,
        "Boolean(document.querySelector('.browser-source-status')?.getClientRects().length)",
      ),
    "Browser source surface",
  );
}
async function capture(cdp, session, name) {
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" }, session);
  writeFileSync(path.join(output, name), Buffer.from(screenshot.data, "base64"));
}
async function navigatePage(sessionId, index) {
  const clean = `${siteOrigin}/activity/${index}`;
  await chrome.cdp.send("Page.navigate", { url: `${clean}?token=synthetic#private` }, sessionId);
  await waitFor(
    async () => (await rows()).some((row) => row.data.url === clean),
    `persisted navigation ${index}`,
  );
  await waitDelivered();
}
async function updateHistoryState(sessionId, method, relativeUrl) {
  const before = await rows();
  const beforeSequence = Math.max(0, ...before.map((row) => row.sequence));
  const expectedUrl = new URL(relativeUrl, siteOrigin);
  expectedUrl.search = "";
  expectedUrl.hash = "";
  await evaluate(
    chrome.cdp,
    sessionId,
    `history.${method}({ test: ${beforeSequence + 1} }, "", ${JSON.stringify(relativeUrl)})`,
  );
  await waitFor(
    async () =>
      (await rows()).find(
        (row) =>
          row.sequence > beforeSequence &&
          row.kind === "history_state_updated" &&
          row.data.url === expectedUrl.href,
      ),
    `${method} history-state evidence`,
  );
  await waitDelivered();
  const added = (await rows()).filter((row) => row.sequence > beforeSequence);
  assert.equal(added.length, 1, `${method} emitted one durable observation`);
  assert.equal(added[0].kind, "history_state_updated");
  assert.equal(added[0].data.url, expectedUrl.href);
  return added[0];
}

try {
  if (args.includes("--instrument-webview")) {
    testPort = await freePort();
    const config = JSON.parse(readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
    const override = path.join(output, "tauri.e2e.json");
    writeFileSync(
      override,
      JSON.stringify({
        app: {
          windows: config.app.windows.map((window) => ({
            ...window,
            devtools: true,
            additionalBrowserArgs: `--remote-debugging-port=${testPort}`,
          })),
        },
      }),
    );
    log("Building test-only WebView instrumentation (no installer)");
    const build = spawnSync(
      process.execPath,
      [
        path.join(root, "node_modules/@tauri-apps/cli/tauri.js"),
        "build",
        "--no-bundle",
        "--features",
        "tauri/devtools",
        "--config",
        override,
      ],
      { cwd: root, windowsHide: true, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    );
    writeFileSync(path.join(output, "build.log"), `${build.stdout || ""}\n${build.stderr || ""}`);
    assert.equal(build.status, 0, `Test build failed: ${build.stderr}`);
    desktopExe = path.join(output, "mori-e2e.exe");
    copyFileSync(moriExe, desktopExe);
    result.webviewInstrumentation =
      "test-only tauri/devtools and window additionalBrowserArgs; no production config or installer change";
  }
  log("Starting isolated Mori and Chrome");
  await startDesktop();
  assert.equal((await rows()).length, 0);
  if (historyMode) {
    await openHealth();
    await history.empty();
    result.scenarios.historyEmpty = true;
  }
  chrome = await launchChrome({ chromePath: discoverChromePath(), profileDir: profile, env });
  result.chromeVersion = (await chrome.cdp.send("Browser.getVersion")).product;
  const extensionId = await loadExtension(chrome.cdp, extensionRoot);
  result.extensionId = extensionId;
  registry.install({
    extensionId,
    manifestPath: path.join(output, "host.json"),
    paths: { moriWorktree: root, nativeHostPath },
  });
  popup = await openExtensionPopup(chrome.cdp, extensionId);
  assert.equal((await state()).captureEnabled, false);
  await chrome.cdp.send(
    "Emulation.setDeviceMetricsOverride",
    {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    },
    popup.sessionId,
  );
  await chrome.cdp.send(
    "Emulation.setEmulatedMedia",
    {
      features: [{ name: "prefers-color-scheme", value: "light" }],
    },
    popup.sessionId,
  );
  await capture(chrome.cdp, popup.sessionId, "popup-off.png");
  await evaluate(chrome.cdp, popup.sessionId, "document.querySelector('#capture-toggle').focus()");
  for (const type of ["keyDown", "keyUp"])
    await chrome.cdp.send(
      "Input.dispatchKeyEvent",
      {
        type,
        key: " ",
        code: "Space",
        windowsVirtualKeyCode: 32,
      },
      popup.sessionId,
    );
  await waitFor(async () => (await state()).captureEnabled === true, "keyboard capture opt-in");
  result.scenarios.keyboardOptIn = true;
  await waitDelivered();
  result.scenarios.moriFirst = true;
  const targets = [];
  for (let i = 0; i < 3; i++) {
    const { targetId } = await chrome.cdp.send("Target.createTarget", {
      url: "about:blank",
      newWindow: i === 2,
    });
    const { sessionId } = await chrome.cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    await chrome.cdp.send("Page.enable", {}, sessionId);
    await chrome.cdp.send("Target.activateTarget", { targetId });
    await waitFor(
      () => evaluate(chrome.cdp, sessionId, "document.readyState === 'complete'"),
      `test target ${i} ready`,
    );
    targets.push({ targetId, sessionId });
    await navigatePage(sessionId, i);
    if (i === 0 && spaMode) {
      const push = await updateHistoryState(
        sessionId,
        "pushState",
        "/spa/route-one?secret=alpha#private",
      );
      const replace = await updateHistoryState(
        sessionId,
        "replaceState",
        "/spa/route-two?token=beta#hidden",
      );
      const beforeFragment = await rows();
      await evaluate(chrome.cdp, sessionId, `location.hash = "private"`);
      await new Promise((resolve) => setTimeout(resolve, 750));
      assert.deepEqual(await rows(), beforeFragment);
      const queryOne = await updateHistoryState(sessionId, "pushState", "/search?q=one");
      const queryTwo = await updateHistoryState(sessionId, "pushState", "/search?q=two");
      await navigatePage(sessionId, "spa-full-after");
      result.spa = {
        pushState: push.data.url,
        replaceState: replace.data.url,
        fragmentEvidence: 0,
        queryOnly: [queryOne.data.url, queryTwo.data.url],
        observationsPerAction: { pushState: 1, replaceState: 1 },
        fullSequence: [
          "navigation_committed",
          push.kind,
          replace.kind,
          "navigation_committed",
        ],
      };
      assert.ok(!JSON.stringify(result.spa).match(/secret=|token=|#private|#hidden|q=/));
      result.scenarios.spaHistoryState = true;
      result.scenarios.fragmentStoredNothing = true;
      result.scenarios.queryOnlyEventsRetained = true;
    }
  }
  // Creating about:blank targets need not produce a capturable activation.
  // Switch between two already navigated tabs in the same normal window.
  await chrome.cdp.send("Target.activateTarget", { targetId: targets[1].targetId });
  await chrome.cdp.send("Target.activateTarget", { targetId: targets[0].targetId });
  await waitFor(
    async () => (await rows()).some((row) => row.kind === "tab_activated"),
    "persisted tab activation",
  );
  await evaluate(
    chrome.cdp,
    popup.sessionId,
    "chrome.runtime.sendMessage({type:'mori.browser.bootstrap_context'})",
    { awaitPromise: true },
  );
  await waitDelivered();
  await openHealth();
  await waitFor(
    () =>
      evaluate(
        desktopCdp,
        desktopSession,
        "Boolean(document.querySelector('[data-browser-context]'))",
      ),
    "current context state",
  );
  result.scenarios.contextUpdated = true;
  await capture(desktopCdp, desktopSession, "mori-health.png");
  await desktopCdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1180,
    height: 760,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await capture(desktopCdp, desktopSession, "mori-health-minimum.png");
  await desktopCdp.send("Emulation.clearDeviceMetricsOverride");
  await capture(chrome.cdp, popup.sessionId, "popup-on.png");
  const initialRows = await rows();
  assert.ok(initialRows.some((row) => row.kind === "tab_activated"));
  assert.ok(initialRows.some((row) => row.kind === "navigation_committed"));
  result.scenarios.activationPersisted = true;
  result.scenarios.navigationPersisted = true;

  log("Crash/restart durability and Chrome-first recovery");
  await stopDesktop();
  await chrome.cdp.send(
    "Page.navigate",
    { url: `${siteOrigin}/unavailable` },
    targets[0].sessionId,
  );
  await waitFor(
    async () => (await state()).transport.lastError?.code === "mori_unavailable",
    "Mori unavailable",
  );
  result.scenarios.moriUnavailable = true;
  await capture(chrome.cdp, popup.sessionId, "popup-unavailable.png");
  await startDesktop();
  const restored = await rows();
  assert.deepEqual(restored, initialRows);
  result.scenarios.restartDurability = true;
  await navigatePage(targets[0].sessionId, "recovered");
  await waitFor(
    async () => (await state()).lastSnapshot?.reason === "recovery",
    "recovery context snapshot",
  );
  result.scenarios.chromeFirst = true;
  result.scenarios.moriRestart = true;
  await openHealth();
  await waitFor(
    () =>
      evaluate(
        desktopCdp,
        desktopSession,
        "Boolean(document.querySelector('[data-browser-context]'))",
      ),
    "restored current context",
  );

  log("MV3 service worker restart");
  await chrome.cdp.send("ServiceWorker.enable", {}, popup.sessionId);
  await chrome.cdp.send("ServiceWorker.stopAllWorkers", {}, popup.sessionId);
  await navigatePage(targets[1].sessionId, "worker-restarted");
  assert.equal((await state()).captureEnabled, true);
  result.scenarios.workerRestart = true;

  log(`Soak: ${count} navigations and tab switches`);
  const started = Date.now();
  const beforeSequence = Math.max(...(await rows()).map((r) => r.sequence));
  const storageBefore = databaseSize();
  const memoryBefore = await desktopCdp.send("Runtime.getHeapUsage");
  for (let i = 0; i < count; i++) {
    const target = targets[i % targets.length];
    await chrome.cdp.send("Target.activateTarget", { targetId: target.targetId });
    await navigatePage(target.sessionId, `soak-${i}`);
    if (i % 20 === 0) log(`Soak progress ${i}/${count}`);
  }
  const stored = await rows();
  assert.equal(
    stored.filter((row) => row.kind === "navigation_committed" && row.data.url.includes("/soak-"))
      .length,
    count,
  );
  assert.equal(new Set(stored.map((row) => row.deliveryId)).size, stored.length);
  assert.ok(!JSON.stringify(stored).match(/token=|#private|Private test title/));
  const afterSequence = Math.max(...stored.map((r) => r.sequence));
  result.soak = {
    durationMs: Date.now() - started,
    deliveries: afterSequence - beforeSequence,
    navigations: count,
    recentActivations: stored.filter((r) => r.kind === "tab_activated").length,
    heapBefore: memoryBefore.usedSize,
    storageBefore,
    storageAfter: databaseSize(),
    heapAfter: (await desktopCdp.send("Runtime.getHeapUsage")).usedSize,
    storedJsonBytesPerRecentEvent: Buffer.byteLength(JSON.stringify(stored)) / stored.length,
    lastError: (await state()).transport.lastError,
  };
  result.scenarios.soak = true;
  if (historyMode) {
    log("History pages, concurrent arrival, refresh and minimum layout");
    await desktopCdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1180,
      height: 760,
      deviceScaleFactor: 1,
      mobile: false,
    });
    result.history = await history.verify(() =>
      navigatePage(targets[0].sessionId, "history-concurrent"),
    );
    result.scenarios.historyPagination = true;
  }

  log("Capture-off privacy");
  const beforeOff = await rows();
  const worker = (await chrome.cdp.send("Target.getTargets")).targetInfos.find(
    (target) =>
      target.type === "service_worker" &&
      target.url.startsWith(`chrome-extension://${extensionId}/`),
  );
  assert.ok(worker, "Extension worker available for in-flight privacy check");
  const { sessionId: workerSession } = await chrome.cdp.send("Target.attachToTarget", {
    targetId: worker.targetId,
    flatten: true,
  });
  await evaluate(
    chrome.cdp,
    workerSession,
    `(() => {
    const original = chrome.windows.get;
    globalThis.__moriOriginalWindowGet = original;
    globalThis.__moriLookupGates = [];
    chrome.windows.get = async (...args) => {
      const value = await original.apply(chrome.windows, args);
      await new Promise(resolve => globalThis.__moriLookupGates.push(resolve));
      return value;
    };
  })()`,
  );
  if (spaMode) {
    await evaluate(
      chrome.cdp,
      targets[0].sessionId,
      `history.pushState({}, "", "/spa/in-flight-off?private=value#hidden")`,
    );
  } else {
    await chrome.cdp.send(
      "Page.navigate",
      { url: `${siteOrigin}/in-flight-off` },
      targets[0].sessionId,
    );
  }
  await waitFor(
    () => evaluate(chrome.cdp, workerSession, "globalThis.__moriLookupGates.length > 0"),
    "in-flight window lookup",
  );
  await setCaptureFromPopup(chrome.cdp, popup.sessionId, false);
  await evaluate(
    chrome.cdp,
    workerSession,
    `(() => {
    chrome.windows.get = globalThis.__moriOriginalWindowGet;
    globalThis.__moriLookupGates.forEach(resolve => resolve());
  })()`,
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.deepEqual(await rows(), beforeOff);
  result.scenarios.inFlightOffStoredNothing = true;
  for (let i = 0; i < 10; i++) {
    if (spaMode) {
      await evaluate(
        chrome.cdp,
        targets[0].sessionId,
        `history.pushState({}, "", "/spa/after-off-${i}?private=value#hidden")`,
      );
    } else {
      await chrome.cdp.send(
        "Page.navigate",
        { url: `${siteOrigin}/after-off-${i}` },
        targets[0].sessionId,
      );
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.deepEqual(await rows(), beforeOff);
  result.scenarios.captureOffStoredNothing = true;
  if (historyMode) {
    log("History restart and capture-off read surface");
    await stopDesktop();
    await startDesktop();
    await desktopCdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1180,
      height: 760,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await openHealth();
    result.historyReopen = await history.reopenAndOff(beforeOff);
    result.scenarios.historyRestartAndOff = true;
  }

  log("Chrome restart with persisted opt-in");
  await setCaptureFromPopup(chrome.cdp, popup.sessionId, true);
  await waitDelivered();
  await chrome.close();
  chrome = await launchChrome({ chromePath: discoverChromePath(), profileDir: profile, env });
  await loadExtension(chrome.cdp, extensionRoot);
  popup = await openExtensionPopup(chrome.cdp, extensionId);
  assert.equal((await state()).captureEnabled, true);
  const { targetId } = await chrome.cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await chrome.cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await chrome.cdp.send("Page.enable", {}, sessionId);
  await chrome.cdp.send("Target.activateTarget", { targetId });
  await waitFor(
    () => evaluate(chrome.cdp, sessionId, "document.readyState === 'complete'"),
    "restarted Chrome target ready",
  );
  await navigatePage(sessionId, "chrome-restarted");
  result.scenarios.chromeRestart = true;

  log("Missing host state");
  await setCaptureFromPopup(chrome.cdp, popup.sessionId, false);
  registry.remove();
  await setCaptureFromPopup(chrome.cdp, popup.sessionId, true);
  await waitFor(
    async () => (await state()).transport.lastError?.code === "native_host_disconnected",
    "host unavailable",
  );
  await capture(chrome.cdp, popup.sessionId, "popup-host-missing.png");
  result.scenarios.hostMissing = true;
} catch (error) {
  result.failures.push(error.stack || String(error));
  process.exitCode = 1;
} finally {
  await chrome?.close().catch(() => undefined);
  await stopDesktop();
  registry.restore(initialRegistry);
  site.closeAllConnections();
  await new Promise((resolve) => site.close(resolve));
  result.storage = databaseSize();
  writeFileSync(path.join(output, "report.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
