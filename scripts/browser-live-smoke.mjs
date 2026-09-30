#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import {
  localizeBrowserObservation,
  summarizeBrowserObservationProbes,
} from "./lib/browser-observation-localization.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
}
const extensionRepo = path.resolve(option("--extension-repo", "../mori-browser-extension"));
const extensionRoot = path.join(extensionRepo, "dist/chrome/mori-browser-extension-0.1.0");
const extensionPackage = path.join(extensionRepo, "dist/chrome/mori-browser-extension-0.1.0.zip");
const moriExe = path.resolve(option("--mori-exe", "src-tauri/target/release/mori.exe"));
const nativeHostPath = path.resolve(
  option("--host-exe", "src-tauri/target/release/mori-browser-native-host.exe"),
);
const count = Number(option("--observations", "60"));
const historyMode = args.includes("--history");
const spaMode = args.includes("--spa");
const coreMode = args.includes("--core");
const probeMode = option("--probe", null);
const probeCycles = Number(option("--probe-cycles", probeMode === "steady-state" ? "100" : "20"));
const probeObservations = Number(option("--probe-observations", "25"));
const leaveCaptureOff = args.includes("--leave-capture-off");
const runId = option("--run-id", `browser-live-${process.pid}-${Date.now()}`);
const matrix = option("--matrix", "canonical");
assert.ok(
  Number.isInteger(count) && count >= 20 && count <= (historyMode ? 400 : 80),
  "invalid observation count",
);
const probeModes = new Set([
  "steady-state",
  "mv3-restart",
  "mori-restart",
  "chrome-restart",
  "post-mv3-soak",
]);
assert.ok(!probeMode || probeModes.has(probeMode), "invalid reliability probe");
assert.ok(
  Number.isInteger(probeCycles) && probeCycles > 0 && probeCycles <= 100,
  "invalid probe cycle count",
);
assert.ok(
  Number.isInteger(probeObservations) && probeObservations > 0 && probeObservations <= 100,
  "invalid probe observation count",
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
const profile = path.resolve(option("--chrome-profile", path.join(output, "chrome")));
const webviewProfile = path.resolve(option("--webview-profile", path.join(output, "webview")));
const homeRoot = path.resolve(option("--home", path.join(output, "home")));
mkdirSync(profile, { recursive: true });
const relayName = `mori-browser-live-${process.pid}-${Date.now()}`;
const runStarted = Date.now();
const result = {
  runId,
  matrix,
  mode: probeMode ? "probe" : coreMode ? "core" : "full",
  probe: probeMode
    ? {
        name: probeMode,
        cycles: probeCycles,
        observationsPerCycle: probeMode === "post-mv3-soak" ? probeObservations : 1,
      }
    : null,
  output,
  startedAt: new Date(runStarted).toISOString(),
  scenarios: {},
  failures: [],
  observationsRequested: count,
  artifacts: {
    mori: { path: moriExe, sha256: fileHash(moriExe) },
    nativeHost: { path: nativeHostPath, sha256: fileHash(nativeHostPath) },
    extension: {
      path: existsSync(extensionPackage)
        ? extensionPackage
        : path.join(extensionRoot, "manifest.json"),
      sha256: fileHash(
        existsSync(extensionPackage) ? extensionPackage : path.join(extensionRoot, "manifest.json"),
      ),
    },
  },
  profiles: {
    chrome: { path: profile, fresh: !args.includes("--chrome-profile") },
    webview: { path: webviewProfile, fresh: !args.includes("--webview-profile") },
    home: { path: homeRoot, fresh: !args.includes("--home") },
  },
  ports: { webview: [], chromeCdp: [] },
  processIds: { mori: [], chrome: [] },
  firstObservations: {
    contextSnapshot: { pass: false, acknowledgement: false, durableRow: null },
    navigationCommitted: { pass: false, acknowledgement: false, durableRow: false },
    tabActivated: { pass: false, acknowledgement: false, durableRow: false },
    historyStateUpdated: { pass: false, acknowledgement: false, durableRow: false },
  },
  timeline: {},
};
let currentStage = "run_started";
mark(currentStage);
let desktopExe = moriExe;
let testPort = args.includes("--webview-port") ? Number(option("--webview-port")) : undefined;
let chrome;
let desktop;
let desktopCdp;
let desktopSession;
let popup;
let extensionId;
let desktopStarts = 0;
class CoreRunComplete extends Error {}
const site = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<!doctype html><title>Private test title</title><p>Browser live source test</p>");
});
await new Promise((resolve) => site.listen(0, "127.0.0.1", resolve));
const siteOrigin = `http://127.0.0.1:${site.address().port}`;
const registry = new NativeHostRegistry("chrome");
const initialRegistry = registry.read();
const initialNativeHostPids = windowsProcessIds("mori-browser-native-host");
const env = { MORI_BROWSER_RELAY_NAME: relayName };
const log = (message) => console.error(`[browser-live] ${message}`);
const history = createBrowserHistorySmoke({
  run: (expression) => evaluate(desktopCdp, desktopSession, expression, { awaitPromise: true }),
  waitFor,
  capture: (name) => capture(desktopCdp, desktopSession, name),
});

function mark(stage) {
  currentStage = stage;
  result.timeline[stage] = {
    at: new Date().toISOString(),
    elapsedMs: Date.now() - runStarted,
  };
  return result.timeline[stage];
}

function fileHash(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function windowsProcessIds(name) {
  const command = `Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id`;
  const found = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    windowsHide: true,
    encoding: "utf8",
  });
  if (found.status !== 0 && found.status !== null) return [];
  return String(found.stdout || "")
    .split(/\r?\n/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function profileProcessIds(profilePath) {
  const script = [
    "$needle = $env:MORI_PROFILE_NEEDLE",
    "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |",
    "  Where-Object {",
    "    $_.Name -in @('chrome.exe', 'msedgewebview2.exe') -and",
    "    $_.CommandLine -and $_.CommandLine.Contains($needle)",
    "  } |",
    "  Select-Object -ExpandProperty ProcessId",
  ].join("\n");
  const found = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    windowsHide: true,
    encoding: "utf8",
    env: { ...process.env, MORI_PROFILE_NEEDLE: profilePath },
  });
  return String(found.stdout || "")
    .split(/\r?\n/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0 && value !== process.pid);
}

function executableProcessIds(executablePath) {
  const script = [
    "$needle = [System.IO.Path]::GetFullPath($env:MORI_EXECUTABLE_NEEDLE)",
    "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |",
    "  Where-Object {",
    "    $_.ExecutablePath -and",
    "    [System.IO.Path]::GetFullPath($_.ExecutablePath).Equals($needle, [System.StringComparison]::OrdinalIgnoreCase)",
    "  } |",
    "  Select-Object -ExpandProperty ProcessId",
  ].join("\n");
  const found = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    windowsHide: true,
    encoding: "utf8",
    env: { ...process.env, MORI_EXECUTABLE_NEEDLE: executablePath },
  });
  return String(found.stdout || "")
    .split(/\r?\n/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0 && value !== process.pid);
}

function processRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function portAvailable(port) {
  const server = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    return true;
  } catch {
    return false;
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
}

function classifyFailure(error, stage) {
  const message = String(error?.message || error);
  if (/Chrome DevToolsActivePort|Chrome process/i.test(message)) return "chrome_startup";
  if (/extension popup document/i.test(message)) return "extension_startup";
  if (
    /Mori WebView|Mori application ready|Mori exited|Mori process|CDP Runtime\.evaluate/i.test(
      message,
    )
  )
    return "mori_startup";
  if (/native host|host unavailable/i.test(message)) return "native_host";
  if (/delivery ACK|relay|mori_unavailable/i.test(message)) return "relay_delivery";
  if (/persisted|durable observation|stored|history-state evidence/i.test(message))
    return "evidence_persistence";
  if (/cleanup|registry|stopped|port/i.test(message) || stage === "cleanup") return "cleanup";
  return "unknown";
}

function kindCounts(items) {
  return items.reduce((counts, item) => {
    const kind = typeof item?.kind === "string" ? item.kind : "unknown";
    counts[kind] = (counts[kind] ?? 0) + 1;
    return counts;
  }, {});
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForProfileRelease(profilePath, label) {
  const startedAt = Date.now();
  await waitFor(() => (profileProcessIds(profilePath).length === 0 ? true : null), label, {
    timeoutMs: 30000,
    intervalMs: 250,
  });
  return Date.now() - startedAt;
}
async function startDesktop(retry = true) {
  const startIndex = desktopStarts++;
  mark(startIndex === 0 ? "mori_spawn_started" : `mori_restart_${startIndex}_started`);
  const port = testPort ?? (await freePort());
  result.ports.webview.push(port);
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
        HOME: homeRoot,
        USERPROFILE: homeRoot,
        APPDATA: path.join(homeRoot, "AppData/Roaming"),
        LOCALAPPDATA: path.join(homeRoot, "AppData/Local"),
        WEBVIEW2_USER_DATA_FOLDER: webviewProfile,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --enable-logging --log-file=${path.join(output, "webview-debug.log")}`,
      },
    },
  );
  assert.equal(launched.status, 0, launched.stderr);
  desktop = { pid: Number(launched.stdout.trim()) };
  assert.ok(Number.isInteger(desktop.pid) && desktop.pid > 0, "Mori process id");
  result.processIds.mori.push(desktop.pid);
  mark(startIndex === 0 ? "mori_process_spawned" : `mori_restart_${startIndex}_spawned`);
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
  mark(startIndex === 0 ? "mori_webview_ready" : `mori_restart_${startIndex}_ready`);
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
  return processRunning(desktop?.pid);
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
  const db = path.join(homeRoot, "Mori/Records/mori.sqlite");
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
async function waitDelivered(kind, { allowRecoveryContext = false } = {}) {
  return waitFor(
    async () => {
      const current = await state();
      const acknowledgement = current.transport.lastAcknowledgement;
      const exactKind = !kind || acknowledgement?.kind === kind;
      const recoveryProvesPriorAcknowledgement =
        allowRecoveryContext &&
        current.lastSnapshot?.reason === "recovery" &&
        acknowledgement?.kind === "context_snapshot";
      return current.transport.pending === 0 &&
        acknowledgement?.ok &&
        (exactKind || recoveryProvesPriorAcknowledgement)
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

async function pollForValue(callback, timeoutMs, intervalMs = 100) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await callback();
      if (value) return value;
    } catch {
      // A runtime may disappear while a passive diagnostic snapshot is being taken.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

async function extensionRuntimeInventory() {
  const targetInfos = (await chrome.cdp.send("Target.getTargets")).targetInfos.filter((target) =>
    target.url.startsWith(`chrome-extension://${extensionId}/`),
  );
  const workers = targetInfos.filter((target) => target.type === "service_worker");
  return {
    targetInfos,
    workers,
    report: {
      targetCount: targetInfos.length,
      types: kindCounts(targetInfos.map((target) => ({ kind: target.type }))),
      serviceWorkerPresent: workers.length > 0,
    },
  };
}

async function readExtensionStatePassive() {
  const inventory = await extensionRuntimeInventory();
  const worker = inventory.workers[0];
  if (!worker) {
    return {
      runtimeAvailable: false,
      stateAvailable: false,
      inventory: inventory.report,
      state: null,
    };
  }

  let workerSession;
  try {
    ({ sessionId: workerSession } = await chrome.cdp.send("Target.attachToTarget", {
      targetId: worker.targetId,
      flatten: true,
    }));
    const state = await evaluate(
      chrome.cdp,
      workerSession,
      `(async () => {
        const captureKey = "mori.browserTrace.captureEnabled";
        const recentKey = "mori.browserTrace.recentEvents";
        const transportKey = "mori.browserTrace.nativeMessaging";
        const snapshotKey = "mori.browserTrace.lastSnapshot";
        const [local, session] = await Promise.all([
          chrome.storage.local.get(captureKey),
          chrome.storage.session.get([recentKey, transportKey, snapshotKey]),
        ]);
        const transport = session[transportKey] || null;
        const acknowledgement = transport?.lastAcknowledgement || null;
        const error = transport?.lastError || null;
        const snapshot = session[snapshotKey] || null;
        return {
          captureEnabled: local[captureKey]?.captureEnabled === true,
          recentEvents: (session[recentKey] || []).map(event => ({
            kind: event?.kind || null,
            observedAt: event?.observedAt || null,
          })),
          transport: transport ? {
            state: transport.state || null,
            pending: Number.isInteger(transport.pending) ? transport.pending : null,
            updatedAt: transport.updatedAt || null,
            lastError: error ? { code: error.code || null } : null,
            lastAcknowledgement: acknowledgement ? {
              ok: acknowledgement.ok === true,
              kind: acknowledgement.kind || null,
              code: acknowledgement.code || null,
            } : null,
          } : null,
          lastSnapshot: snapshot ? {
            kind: snapshot.kind || null,
            observedAt: snapshot.observedAt || null,
            reason: snapshot.reason || null,
          } : null,
        };
      })()`,
      { awaitPromise: true },
    );
    return {
      runtimeAvailable: true,
      stateAvailable: true,
      inventory: inventory.report,
      state,
    };
  } catch {
    return {
      runtimeAvailable: true,
      stateAvailable: false,
      inventory: inventory.report,
      state: null,
      diagnosticError: "worker_state_unavailable",
    };
  } finally {
    if (workerSession) {
      await chrome.cdp
        .send("Target.detachFromTarget", { sessionId: workerSession })
        .catch(() => undefined);
    }
  }
}

async function seedProbeCaptureState() {
  const { targetId } = await chrome.cdp.send("Target.createTarget", {
    url: `chrome-extension://${extensionId}/src/popup.html?probe-setup`,
  });
  const { sessionId } = await chrome.cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await chrome.cdp.send("Runtime.enable", {}, sessionId);
  try {
    await waitFor(
      () => evaluate(chrome.cdp, sessionId, "typeof chrome?.runtime?.sendMessage === 'function'"),
      "Extension command page runtime",
      { timeoutMs: 5000 },
    );
    const response = await evaluate(
      chrome.cdp,
      sessionId,
      `chrome.runtime.sendMessage({
        type: "mori.browser.set_capture_enabled",
        enabled: true,
      })`,
      { awaitPromise: true },
    );
    assert.equal(response?.ok, true, "probe capture command accepted");
    assert.equal(response?.state?.captureEnabled, true, "probe capture enabled");
  } finally {
    await chrome.cdp.send("Target.closeTarget", { targetId }).catch(() => undefined);
  }
  const state = await readExtensionStatePassive();
  result.probe.setup = {
    captureState: "enabled_by_existing_command",
    extension: state.inventory,
    popupRequired: false,
  };
}

async function relaySnapshot() {
  try {
    const pending = await evaluate(
      desktopCdp,
      desktopSession,
      `window.__TAURI_INTERNALS__.invoke('claim_browser_observation_relay_requests')
        .then(requests => requests.map(request => ({
          requestId: request.requestId,
          kind: request.observation?.kind || null,
        })))`,
      { awaitPromise: true },
    );
    return { available: true, pending };
  } catch {
    return { available: false, pending: [] };
  }
}

function isFresh(timestamp, startedAt) {
  const value = Date.parse(timestamp || "");
  return Number.isFinite(value) && value >= startedAt;
}

function hasFreshNavigationAcknowledgement(extension, startedAt) {
  const acknowledgement = extension.state?.transport?.lastAcknowledgement;
  const recoverySnapshot = extension.state?.lastSnapshot;
  const recoveryProvesPriorAcknowledgement =
    acknowledgement?.ok === true &&
    acknowledgement?.kind === "context_snapshot" &&
    recoverySnapshot?.reason === "recovery" &&
    isFresh(recoverySnapshot.observedAt, startedAt);
  return Boolean(
    isFresh(extension.state?.transport?.updatedAt, startedAt) &&
    (acknowledgement?.kind === "navigation_committed" ||
      acknowledgement?.ok === false ||
      recoveryProvesPriorAcknowledgement),
  );
}

async function createProbeTarget() {
  const { targetId } = await chrome.cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await chrome.cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await chrome.cdp.send("Page.enable", {}, sessionId);
  await chrome.cdp.send("Target.activateTarget", { targetId });
  await waitFor(
    () => evaluate(chrome.cdp, sessionId, "document.readyState === 'complete'"),
    "reliability probe target",
  );
  return { targetId, sessionId };
}

async function forceWorkerRestart(sessionId) {
  const before = await extensionRuntimeInventory();
  const previousTargetIds = new Set(before.workers.map((target) => target.targetId));
  await chrome.cdp.send("ServiceWorker.enable", {}, sessionId);
  await chrome.cdp.send("ServiceWorker.stopAllWorkers", {}, sessionId);
  const after = await pollForValue(async () => {
    const current = await extensionRuntimeInventory();
    return current.workers.every((target) => !previousTargetIds.has(target.targetId))
      ? current
      : null;
  }, 3000);
  const finalInventory = after ?? (await extensionRuntimeInventory());
  return {
    requested: true,
    observed: finalInventory.workers.every((target) => !previousTargetIds.has(target.targetId)),
    before: before.report,
    after: finalInventory.report,
  };
}

async function probeNavigation(sessionId, label) {
  const clean = `${siteOrigin}/probe/${label}`;
  const beforeRows = await rows();
  const beforeSequence = Math.max(0, ...beforeRows.map((row) => row.sequence ?? 0));
  const startedAt = Date.now();
  let actionCommandSucceeded = false;
  let routeReached = false;
  let actionError = null;
  try {
    const navigation = await chrome.cdp.send(
      "Page.navigate",
      { url: `${clean}?token=synthetic#private` },
      sessionId,
    );
    actionCommandSucceeded = navigation.errorText === undefined;
    if (!actionCommandSucceeded) actionError = "navigation_rejected";
    routeReached = Boolean(
      await pollForValue(
        () =>
          evaluate(
            chrome.cdp,
            sessionId,
            `location.pathname === ${JSON.stringify(`/probe/${label}`)} && document.readyState === 'complete'`,
          ),
        5000,
      ),
    );
  } catch {
    actionError = "navigation_command_failed";
  }

  const findDurable = async () =>
    (await rows()).find(
      (row) =>
        row.sequence > beforeSequence &&
        row.kind === "navigation_committed" &&
        row.data.url === clean,
    );
  const durable = await pollForValue(findDurable, 15000);

  // Target inventory is the first post-action diagnostic so absence is not hidden by a wake-up.
  let extension = await readExtensionStatePassive();
  const initialExtensionInventory = extension.inventory;
  if (durable && !hasFreshNavigationAcknowledgement(extension, startedAt)) {
    extension =
      (await pollForValue(async () => {
        const refreshed = await readExtensionStatePassive();
        return hasFreshNavigationAcknowledgement(refreshed, startedAt) ? refreshed : null;
      }, 2000)) ?? extension;
  }
  const relay = await relaySnapshot();
  let late = null;
  let lateAfterMs = null;
  if (!durable) {
    late = await pollForValue(findDurable, 5000);
    if (late) lateAfterMs = Date.now() - startedAt;
    if (!late) {
      late = await pollForValue(findDurable, 10000);
      if (late) lateAfterMs = Date.now() - startedAt;
    }
  }

  const recentEventFound = Boolean(
    extension.state?.recentEvents?.some(
      (event) => event.kind === "navigation_committed" && isFresh(event.observedAt, startedAt),
    ),
  );
  const acknowledgement = extension.state?.transport?.lastAcknowledgement;
  const acknowledgementFresh = hasFreshNavigationAcknowledgement(extension, startedAt);
  const relayPending = relay.pending.some((request) => request.kind === "navigation_committed");
  const localization = localizeBrowserObservation({
    actionCommandSucceeded,
    routeReached,
    extensionRuntimeAvailable: extension.runtimeAvailable,
    extensionStateAvailable: extension.stateAvailable,
    recentEventFound,
    acknowledgementFresh,
    acknowledgementOk: acknowledgement?.ok === true,
    acknowledgementCode: acknowledgement?.code ?? extension.state?.transport?.lastError?.code,
    relayPending,
    durableWithinTimeout: Boolean(durable),
    durableLate: Boolean(late),
  });

  return {
    label,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    action: { commandSucceeded: actionCommandSucceeded, routeReached, error: actionError },
    extension: {
      initialInventory: initialExtensionInventory,
      inventory: extension.inventory,
      stateAvailable: extension.stateAvailable,
      diagnosticError: extension.diagnosticError ?? null,
      captureEnabled: extension.state?.captureEnabled ?? null,
      recentEventFound,
      recentEventKinds: extension.state?.recentEvents?.map((event) => event.kind) ?? [],
      transport: extension.state?.transport ?? null,
      lastSnapshot: extension.state?.lastSnapshot ?? null,
    },
    relay,
    nativeHostProcessIds: windowsProcessIds("mori-browser-native-host"),
    evidence: {
      beforeSequence,
      withinTimeout: Boolean(durable),
      lateAfterMs,
      sequence: durable?.sequence ?? late?.sequence ?? null,
    },
    localization,
  };
}

async function runReliabilityProbe() {
  if (popup) {
    await chrome.cdp.send("Target.closeTarget", { targetId: popup.targetId });
    popup = null;
  }
  const records = [];
  result.probe.records = records;
  let target = await createProbeTarget();

  const observe = async (label, lifecycle = null) => {
    const record = await probeNavigation(target.sessionId, label);
    if (lifecycle) record.lifecycle = lifecycle;
    records.push(record);
    result.probe.summary = summarizeBrowserObservationProbes(records);
    if (records.length % 10 === 0 || !record.localization.evidenceDelivered) {
      log(`Probe progress ${records.length}: ${record.localization.category}`);
    }
    if (record.localization.blocking) {
      throw new Error(`Reliability probe stopped at ${label}: ${record.localization.category}`);
    }
  };

  if (probeMode === "steady-state") {
    for (let cycle = 0; cycle < probeCycles; cycle++) await observe(`steady-${cycle}`);
  } else if (probeMode === "mv3-restart") {
    for (let cycle = 0; cycle < probeCycles; cycle++) {
      await observe(`mv3-${cycle}`, await forceWorkerRestart(target.sessionId));
    }
  } else if (probeMode === "mori-restart") {
    for (let cycle = 0; cycle < probeCycles; cycle++) {
      await stopDesktop();
      await startDesktop(false);
      await observe(`mori-${cycle}`, { moriRestarted: true });
    }
  } else if (probeMode === "chrome-restart") {
    for (let cycle = 0; cycle < probeCycles; cycle++) {
      await chrome.close();
      const profileReleaseMs = await waitForProfileRelease(
        profile,
        "Chrome profile process cleanup",
      );
      chrome = await launchChrome({ chromePath: discoverChromePath(), profileDir: profile, env });
      result.processIds.chrome.push(chrome.pid);
      extensionId = await loadExtension(chrome.cdp, extensionRoot);
      result.extensionId = extensionId;
      registry.install({
        extensionId,
        manifestPath: path.join(output, "host.json"),
        paths: { moriWorktree: root, nativeHostPath },
      });
      const startup = await readExtensionStatePassive();
      target = await createProbeTarget();
      await observe(`chrome-${cycle}`, {
        chromeRestarted: true,
        profileReleaseMs,
        startupExtension: {
          inventory: startup.inventory,
          stateAvailable: startup.stateAvailable,
          captureEnabled: startup.state?.captureEnabled ?? null,
          contextSnapshotObserved: startup.state?.lastSnapshot?.reason === "startup",
        },
      });
    }
  } else if (probeMode === "post-mv3-soak") {
    for (let cycle = 0; cycle < probeCycles; cycle++) {
      const restart = await forceWorkerRestart(target.sessionId);
      for (let observation = 0; observation < probeObservations; observation++) {
        await observe(`post-mv3-${cycle}-${observation}`, observation === 0 ? restart : null);
      }
    }
  }

  result.probe.records = records;
  result.probe.summary = summarizeBrowserObservationProbes(records);
  result.scenarios.reliabilityProbe =
    result.probe.summary.delivered === records.length && result.probe.summary.blocking === 0;
  assert.equal(result.probe.summary.delivered, records.length, "every probe observation persisted");
  assert.equal(result.probe.summary.blocking, 0, "no acknowledgement contract violation");
}

async function navigatePage(sessionId, index, { allowRecoveryContext = false } = {}) {
  const clean = `${siteOrigin}/activity/${index}`;
  const first = !result.timeline.first_navigation_issued;
  if (first) mark("first_navigation_issued");
  const navigation = await chrome.cdp.send(
    "Page.navigate",
    { url: `${clean}?token=synthetic#private` },
    sessionId,
  );
  assert.equal(navigation.errorText, undefined, `navigation ${index} accepted by Chrome`);
  await waitFor(
    async () => (await rows()).some((row) => row.data.url === clean),
    `persisted navigation ${index}`,
  );
  const delivery = await waitDelivered("navigation_committed", { allowRecoveryContext });
  if (first) {
    mark("first_navigation_persisted");
    result.firstObservations.navigationCommitted = {
      pass: true,
      acknowledgement: delivery.transport.lastAcknowledgement?.ok === true,
      durableRow: true,
      latencyMs:
        result.timeline.first_navigation_persisted.elapsedMs -
        result.timeline.first_navigation_issued.elapsedMs,
    };
  }
}
async function updateHistoryState(sessionId, method, relativeUrl) {
  const before = await rows();
  const beforeSequence = Math.max(0, ...before.map((row) => row.sequence));
  const expectedUrl = new URL(relativeUrl, siteOrigin);
  expectedUrl.search = "";
  expectedUrl.hash = "";
  const first = !result.timeline.first_history_state_issued;
  if (first) mark("first_history_state_issued");
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
  const delivery = await waitDelivered("history_state_updated");
  const added = (await rows()).filter((row) => row.sequence > beforeSequence);
  assert.equal(added.length, 1, `${method} emitted one durable observation`);
  assert.equal(added[0].kind, "history_state_updated");
  assert.equal(added[0].data.url, expectedUrl.href);
  if (first) {
    mark("first_history_state_persisted");
    result.firstObservations.historyStateUpdated = {
      pass: true,
      acknowledgement: delivery.transport.lastAcknowledgement?.ok === true,
      durableRow: true,
      latencyMs:
        result.timeline.first_history_state_persisted.elapsedMs -
        result.timeline.first_history_state_issued.elapsedMs,
    };
  }
  return added[0];
}

try {
  if (args.includes("--instrument-webview")) {
    mark("webview_instrumentation_build_started");
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
    mark("webview_instrumentation_build_completed");
  }
  log("Starting isolated Mori and Chrome");
  await startDesktop();
  assert.equal((await rows()).length, 0);
  if (historyMode) {
    await openHealth();
    await history.empty();
    result.scenarios.historyEmpty = true;
  }
  mark("chrome_spawn_started");
  chrome = await launchChrome({ chromePath: discoverChromePath(), profileDir: profile, env });
  result.processIds.chrome.push(chrome.pid);
  const chromePortFile = readFileSync(path.join(profile, "DevToolsActivePort"), "utf8");
  result.ports.chromeCdp.push(Number(chromePortFile.split(/\r?\n/, 1)[0]));
  mark("chrome_cdp_ready");
  result.chromeVersion = (await chrome.cdp.send("Browser.getVersion")).product;
  extensionId = await loadExtension(chrome.cdp, extensionRoot);
  result.extensionId = extensionId;
  mark("extension_loaded");
  registry.install({
    extensionId,
    manifestPath: path.join(output, "host.json"),
    paths: { moriWorktree: root, nativeHostPath },
  });
  mark("native_host_registered");
  if (probeMode) {
    await seedProbeCaptureState();
    mark("capture_enabled");
    mark("reliability_probe_started");
    await runReliabilityProbe();
    mark("reliability_probe_completed");
    throw new CoreRunComplete();
  }
  popup = await openExtensionPopup(chrome.cdp, extensionId);
  mark("extension_popup_ready");
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
  mark("capture_enabled");
  result.scenarios.keyboardOptIn = true;
  const contextDelivery = await waitDelivered("context_snapshot");
  mark("first_context_snapshot_acknowledged");
  result.firstObservations.contextSnapshot = {
    pass: true,
    acknowledgement: contextDelivery.transport.lastAcknowledgement?.ok === true,
    durableRow: null,
    latencyMs:
      result.timeline.first_context_snapshot_acknowledged.elapsedMs -
      result.timeline.capture_enabled.elapsedMs,
  };
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
        fullSequence: ["navigation_committed", push.kind, replace.kind, "navigation_committed"],
      };
      assert.ok(!JSON.stringify(result.spa).match(/secret=|token=|#private|#hidden|q=/));
      result.scenarios.spaHistoryState = true;
      result.scenarios.fragmentStoredNothing = true;
      result.scenarios.queryOnlyEventsRetained = true;
    }
  }
  // Creating about:blank targets need not produce a capturable activation.
  // Switch between two already navigated tabs in the same normal window.
  const activationBefore = Math.max(0, ...(await rows()).map((row) => row.sequence));
  mark("first_tab_activation_issued");
  await chrome.cdp.send("Target.activateTarget", { targetId: targets[1].targetId });
  await chrome.cdp.send("Target.activateTarget", { targetId: targets[0].targetId });
  await waitFor(
    async () =>
      (await rows()).some((row) => row.sequence > activationBefore && row.kind === "tab_activated"),
    "persisted tab activation",
  );
  const activationDelivery = await waitDelivered("tab_activated");
  mark("first_tab_activation_persisted");
  result.firstObservations.tabActivated = {
    pass: true,
    acknowledgement: activationDelivery.transport.lastAcknowledgement?.ok === true,
    durableRow: true,
    latencyMs:
      result.timeline.first_tab_activation_persisted.elapsedMs -
      result.timeline.first_tab_activation_issued.elapsedMs,
  };
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
  result.firstObservations.contextSnapshot.durableRow = true;
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
  if (coreMode) {
    result.scenarios.core = true;
    throw new CoreRunComplete();
  }

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
  await navigatePage(targets[0].sessionId, "recovered", { allowRecoveryContext: true });
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
  mark("mv3_worker_restart_started");
  await chrome.cdp.send("ServiceWorker.enable", {}, popup.sessionId);
  await chrome.cdp.send("ServiceWorker.stopAllWorkers", {}, popup.sessionId);
  await navigatePage(targets[1].sessionId, "worker-restarted");
  mark("mv3_worker_restart_observed");
  assert.equal((await state()).captureEnabled, true);
  result.scenarios.workerRestart = true;

  log(`Soak: ${count} navigations and tab switches`);
  mark("soak_started");
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
  mark("soak_completed");
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
  mark("chrome_profile_release_started");
  await waitForProfileRelease(profile, "Chrome profile process cleanup");
  mark("chrome_profile_released");
  mark("chrome_restart_started");
  chrome = await launchChrome({ chromePath: discoverChromePath(), profileDir: profile, env });
  result.processIds.chrome.push(chrome.pid);
  const restartedChromePortFile = readFileSync(path.join(profile, "DevToolsActivePort"), "utf8");
  result.ports.chromeCdp.push(Number(restartedChromePortFile.split(/\r?\n/, 1)[0]));
  mark("chrome_restart_cdp_ready");
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
  if (!(error instanceof CoreRunComplete)) {
    result.failureStage = currentStage;
    result.failureCategory = classifyFailure(error, currentStage);
    result.failureCode = result.failureCategory;
    result.failures.push(error.stack || String(error));
    const browserState = await state().catch(() => null);
    const durableRows = await rows().catch(() => []);
    result.failureDiagnostics = {
      captureEnabled: browserState?.captureEnabled ?? null,
      transport: browserState
        ? {
            state: browserState.transport?.state,
            pending: browserState.transport?.pending,
            lastAcknowledgement: browserState.transport?.lastAcknowledgement
              ? {
                  ok: browserState.transport.lastAcknowledgement.ok === true,
                  kind: browserState.transport.lastAcknowledgement.kind,
                  code: browserState.transport.lastAcknowledgement.code,
                }
              : null,
            lastErrorCode: browserState.transport?.lastError?.code ?? null,
          }
        : null,
      lastSnapshotReason: browserState?.lastSnapshot?.reason ?? null,
      recentEventKinds: (browserState?.recentEvents ?? []).map((event) => event.kind),
      durableRows: {
        count: durableRows.length,
        kinds: kindCounts(durableRows),
        maxSequence: Math.max(0, ...durableRows.map((row) => row.sequence ?? 0)),
      },
    };
    process.exitCode = 1;
  }
} finally {
  mark("cleanup_started");
  const cleanupErrors = [];
  if (leaveCaptureOff && chrome && popup) {
    await setCaptureFromPopup(chrome.cdp, popup.sessionId, false).catch((error) => {
      cleanupErrors.push(`capture off: ${error.message || error}`);
    });
  }
  await chrome?.close().catch((error) => {
    cleanupErrors.push(`Chrome close: ${error.message || error}`);
  });
  await stopDesktop().catch((error) => {
    cleanupErrors.push(`Mori stop: ${error.message || error}`);
  });
  try {
    registry.restore(initialRegistry);
  } catch (error) {
    cleanupErrors.push(`registry restore: ${error.message || error}`);
  }
  site.closeAllConnections();
  await new Promise((resolve) => site.close(resolve));
  const currentNativeHostPids = await waitFor(
    () => {
      const current = windowsProcessIds("mori-browser-native-host");
      return current.every((pid) => initialNativeHostPids.includes(pid)) ? current : null;
    },
    "native host cleanup",
    { timeoutMs: 5000 },
  ).catch(() => windowsProcessIds("mori-browser-native-host"));
  const profileProcesses = {
    chrome: await waitFor(
      () => (profileProcessIds(profile).length === 0 ? true : null),
      "Chrome profile cleanup",
      { timeoutMs: 30000, intervalMs: 250 },
    )
      .then(() => [])
      .catch(() => profileProcessIds(profile)),
    webview: await waitFor(
      () => (profileProcessIds(webviewProfile).length === 0 ? true : null),
      "WebView profile cleanup",
      { timeoutMs: 30000, intervalMs: 250 },
    )
      .then(() => [])
      .catch(() => profileProcessIds(webviewProfile)),
  };
  const moriProcesses = executableProcessIds(desktopExe);
  const portsReleased = await Promise.all(
    [...new Set(result.ports.webview)].map(async (port) => {
      const releasedAt = await waitFor(
        async () => ((await portAvailable(port)) ? Date.now() : null),
        `WebView port ${port} cleanup`,
        { timeoutMs: 5000 },
      ).catch(() => null);
      return {
        port,
        available: releasedAt !== null,
        releaseLatencyMs:
          releasedAt === null
            ? null
            : releasedAt - result.timeline.cleanup_started.elapsedMs - runStarted,
      };
    }),
  );
  let currentRegistry = null;
  try {
    currentRegistry = registry.read();
  } catch (error) {
    cleanupErrors.push(`registry read-back: ${error.message || error}`);
  }
  result.cleanup = {
    pass: false,
    registryRestored:
      currentRegistry?.exists === initialRegistry.exists &&
      currentRegistry?.value === initialRegistry.value,
    noNewNativeHostProcesses: currentNativeHostPids.every((pid) =>
      initialNativeHostPids.includes(pid),
    ),
    profileProcesses,
    moriProcesses,
    portsReleased,
    chromeExited: profileProcesses.chrome.length === 0,
    moriExited: moriProcesses.length === 0,
    errors: cleanupErrors,
  };
  result.cleanup.pass =
    result.cleanup.registryRestored &&
    result.cleanup.noNewNativeHostProcesses &&
    result.cleanup.profileProcesses.chrome.length === 0 &&
    result.cleanup.profileProcesses.webview.length === 0 &&
    result.cleanup.portsReleased.every((entry) => entry.available) &&
    result.cleanup.chromeExited &&
    result.cleanup.moriExited &&
    cleanupErrors.length === 0;
  if (!result.cleanup.pass) {
    process.exitCode = 1;
    result.failureStage ??= "cleanup";
    result.failureCategory ??= "cleanup";
    result.failureCode ??= "cleanup";
  }
  mark("cleanup_completed");
  result.completedAt = new Date().toISOString();
  result.durationMs = Date.now() - runStarted;
  result.storage = databaseSize();
  writeFileSync(path.join(output, "report.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
