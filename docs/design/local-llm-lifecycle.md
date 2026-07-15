# Local LLM lifecycle · detection, memory, start/stop, security

Status: **proposal, 2026-07-15.** Design for how Mori manages a local
LLM server (Ollama first, LM Studio and other OpenAI-compatible local
servers later) running on the same machine: honest state detection,
model memory control, server start/stop with strict ownership rules,
and the security rails around the native HTTP bridge. Written by the
planning session; implementation slices belong to implementing
sessions.

Companion: [`../quick-pass-analysis.md`](../quick-pass-analysis.md)
(engine seam), `src/lib/analysis/endpointLocality.ts` (locality badge
doctrine), `src-tauri/src/llm_http.rs` (the native bridge this doc
hardens), [`workflow-first-direction.md`](workflow-first-direction.md)
§9 (expansion shelf).

## 1. The job

The user runs Ollama on this machine for several tools, Mori among
them. Today Mori can probe reachability and run a capability check
(`LocalAiCard`), but it cannot answer or act on:

- 지금 모델이 메모리에 올라가 있나, VRAM을 얼마나 쓰나
- 분석이 끝났는데 모델이 메모리를 계속 잡고 있다, 내려줘
- 서버가 꺼져 있다, Mori에서 켤 수 있나, 켰으면 꺼도 되나
- 이 설정이 안전한가 (버전, 노출 범위)

## 2. Researched facts (checked 2026-07-15)

- Model residency is controlled by `keep_alive` on `/api/generate` and
  `/api/chat`: `0` unloads immediately after the response, a negative
  value pins the model, default residency is 5 minutes; the API
  parameter overrides the server's `OLLAMA_KEEP_ALIVE`
  ([Ollama FAQ](https://docs.ollama.com/faq)).
- Loaded models and their memory are listed by `GET /api/ps`; `ollama
  stop <model>` (CLI) or an empty-prompt request with `keep_alive: 0`
  unloads a model
  ([unload reference](https://www.postman.com/postman-student-programs/ollama-api/request/12a3otq/unload-model)).
- On Windows, Ollama normally runs as a **tray app** that owns its own
  lifecycle and environment; on macOS a launch agent, on Linux
  systemd ([FAQ](https://ollama.readthedocs.io/en/faq/)).
- Security history: DNS rebinding against the unauthenticated localhost
  API (CVE-2024-28224, fixed 0.1.29,
  [NCC advisory](https://www.nccgroup.com/research/technical-advisory-ollama-dns-rebinding-attack-cve-2024-28224/))
  and the Probllama path-traversal RCE via `/api/pull`
  (CVE-2024-37032, fixed 0.1.34,
  [Wiz analysis](https://www.wiz.io/blog/probllama-ollama-vulnerability-cve-2024-37032)),
  plus recurring scans finding exposed `:11434` instances. The API has
  no authentication by design; locality is the security boundary.

## 3. Doctrine: the local LLM is a shared machine resource

Ollama is not Mori's subprocess; the user's other tools may depend on
it. Every capability below follows one ownership model:

| State | Mori may |
| --- | --- |
| not running | offer to start (explicit action, desktop only) |
| running, started by someone else | read status, manage **model memory** only; never stop the server; for shutdown, show guidance ("트레이에서 종료") |
| running, started by Mori (tracked child process) | stop it, and offer to stop it when Mori quits |

Consequences: the default lifecycle lever is **model-level**
(`keep_alive`), which frees VRAM without touching anyone else's server.
Server-level start/stop applies only to a process Mori spawned and
tracked. Detection must be honest: if Mori cannot tell who started the
server, it says so and treats it as external.

## 4. Capabilities, staged

### L1 · status + model memory (smallest, ships first)

Extends the existing 분석 엔진 card; no new surface.

- **Live status block**: server reachable (existing probe), server
  version (`/api/version`), loaded models from `/api/ps` with size and
  expiry, calm copy ("모델 1개 로드됨 · 4.7GB").
- **메모리 해제 action** per loaded model: an empty request with
  `keep_alive: 0`. Reversible (next analysis reloads), so it can be a
  one-tap action with no confirm.
- **Mori's own residency policy**: a setting for what `keep_alive`
  Mori sends on its analysis requests, default "서버 기본값" (omit the
  parameter). Options: 기본값 / 분석 후 바로 해제 (`0`) / 30분. Mori
  never sends a negative pin: pinning the model is the user's global
  choice on their server, not something one client should decide.
- **Version advisory**: when `/api/version` is below the known-safe
  floor for the published CVEs (0.1.34), a quiet one-line hint with a
  link, never a blocking warning. No version theater when the endpoint
  is not Ollama.

### L2 · server start/stop with ownership (desktop only)

- **켜기**: explicit button when the probe fails and the platform has
  a known launch path. Windows launches the installed Ollama app (the
  tray app owns real lifecycle there); macOS/Linux spawn `ollama
  serve` as a tracked child. The button states which of the two it
  will do; if neither is detected, it links install guidance instead.
  Starting a process on the user's machine is always click-triggered,
  never a side effect of running an analysis.
- **끄기**: only rendered for a Mori-started child (tracked PID +
  liveness check). For external servers the same slot shows the
  guidance line instead. On app quit, a Mori-started server prompts
  once (끄기 / 계속 실행) and remembers the choice.
- State is surfaced in the same status block: "Mori가 시작함" vs
  "외부에서 실행 중" vs "실행 안 됨", never guessed.

### L3 · deliberately not planned

Auto-start on analysis (a network daemon starting as a side effect
violates least surprise), scheduled unloads, managing models
(pull/delete) beyond unload: model pulls are large network fetches and
`/api/pull` has the worst security history; Mori links the user to
their own tooling instead.

## 5. Security rails (includes one hardening finding)

1. **Locality stays the boundary.** The `endpointLocality` badge
   doctrine ("로컬 · 외부 전송 없음") already classifies endpoints;
   lifecycle actions (unload, start, stop) additionally require the
   endpoint to classify local: Mori never manages a remote server's
   lifecycle.
2. **Finding: `llm_http_request` is an unrestricted proxy and should
   be origin-allowlisted at the Rust boundary.**
   `src-tauri/src/llm_http.rs` accepts any URL, method, headers, and
   body from the webview and performs the request natively (bypassing
   browser CORS). Today every caller is the analysis provider using
   the configured endpoint, but the command itself does not enforce
   that, and Mori's webview renders imported, untrusted content
   (transcripts, pasted pages). If an XSS ever lands, this command is
   an SSRF and exfiltration primitive against localhost services and
   arbitrary hosts. Hardening plan, in order of value:
   - Keep an **allowed-origins set in Rust state**, updated only by a
     dedicated command invoked from the engine-settings save path;
     `llm_http_request` rejects any URL whose origin is not in the
     set. An attacker must then visibly rewrite the user's engine
     settings before proxying anywhere.
   - Restrict schemes to `http(s)` and **disable redirect following**
     (or restrict redirects to the same origin): reqwest follows
     redirects by default, so a compromised-but-allowlisted local
     endpoint answering `302 https://evil.example` must not carry the
     request (and its Authorization header) off-box.
   - Never forward `Authorization` to an origin other than the one it
     was configured for.
   This slice is small, self-contained Rust work and worth doing
   before any MCP or content-fetch surface widens the webview's
   exposure to external content.
3. **No exposure suggestions.** Mori never advises `OLLAMA_HOST=
   0.0.0.0` or wildcard `OLLAMA_ORIGINS`; the native bridge exists
   precisely so no CORS loosening is needed. Setup guidance says the
   opposite: keep the server loopback-only.
4. **No silent pulls.** A 404 "model not found" answer becomes
   guidance ("모델이 설치되어 있지 않습니다"), never an automatic
   `/api/pull`.

## 6. Error and edge states

- Server dies mid-analysis: existing per-chunk tolerance + fallback
  notice already covers the analysis side; the status block flips to
  실행 안 됨 on next probe, with 켜기 if L2 applies.
- `/api/ps` unsupported (older server or non-Ollama endpoint): the
  status block degrades to reachability + version only, honestly.
- Two clients disagree on residency (another tool pins the model Mori
  just unloaded): expected shared-resource behavior; the block shows
  current truth on refresh, no reconciliation attempts.
- Windows tray subtleties: starting the app may not create a child
  Mori can stop (the tray owns it); L2 therefore reports Windows
  starts as external unless a trackable `ollama serve` child was used.
- LM Studio and other OpenAI-compatible local servers: same ownership
  doctrine; status via their own endpoints where available (LM Studio
  has a CLI `lms server start/stop`), staged as a later adapter, not
  special-cased in L1.

## 7. Open decisions

1. L1 scope check: is the per-request `keep_alive` setting worth its
   settings row, or should Mori always send nothing and offer only the
   manual unload? (Recommend: ship the manual unload first, add the
   policy row only if real VRAM pain shows up.)
2. Whether the version advisory names the CVEs or just says "구버전"
   with a docs link (recommend: link only, copy diet).
3. Whether L2 lands before or after the agent-context read surface;
   they are independent, but the llm_http hardening (§5.2) should land
   before either widens exposure.
