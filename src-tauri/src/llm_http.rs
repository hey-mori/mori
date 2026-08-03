//! Native HTTP proxy for local-LLM providers.
//!
//! The renderer calls Ollama / OpenAI-compatible endpoints through this command
//! instead of the webview's `fetch`. A `Content-Type: application/json` POST
//! from the Tauri webview origin (`http://tauri.localhost`) triggers a CORS
//! preflight that Ollama (and some OpenAI-compatible servers) reject, which the
//! browser surfaces as an opaque "Failed to fetch" with the request never
//! reaching the model. A native request has no browser CORS, so a local LLM is
//! reachable out of the box with no `OLLAMA_ORIGINS` configuration.
//!
//! Scoped to exactly what the analysis providers need: GET/POST, a header
//! map, an optional string body, an optional timeout. Returns the status code
//! and the raw body text; the renderer parses JSON itself, as it already does
//! for the `fetch` path.
//!
//! Because a native request bypasses browser CORS, this command must not be
//! an open proxy. It is constrained at this boundary (not merely by caller
//! convention): the target origin must be registered through
//! `set_llm_allowed_endpoints` (the engine-settings save path), the scheme
//! must be http(s), the method GET or POST, redirects are never followed (an
//! allowlisted endpoint answering `302 elsewhere` must not carry the request
//! or its `Authorization` header off-origin), and `Authorization` may only
//! travel to the origin it was configured for. Threat model:
//! `docs/design/local-llm-lifecycle.md` §5.2.

use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::llm_endpoints::{carries_authorization, validate_request, LlmEndpointState};

/// One outbound request, mirroring the subset of `fetch` the providers use.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmHttpRequest {
    /// Absolute endpoint URL (e.g. `http://localhost:11434/api/generate`).
    pub url: String,
    /// HTTP method, case-insensitive (`"GET"` / `"POST"`).
    pub method: String,
    /// Request headers (e.g. `Content-Type`, `Authorization`).
    #[serde(default)]
    pub headers: HashMap<String, String>,
    /// Raw request body, already serialized by the caller.
    #[serde(default)]
    pub body: Option<String>,
    /// Per-request timeout; falls back to [`DEFAULT_TIMEOUT_MS`] when absent.
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

/// The response surfaced back to the renderer's `fetch` adapter.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmHttpResponse {
    /// HTTP status code.
    pub status: u16,
    /// Whether `status` is in the 2xx success range.
    pub ok: bool,
    /// Raw response body text.
    pub body: String,
}

/// Default request ceiling when the caller does not supply one. Local models
/// can be slow, so this is generous; the renderer also enforces its own
/// `AbortController` timeout from the engine settings.
const DEFAULT_TIMEOUT_MS: u64 = 120_000;

#[tauri::command]
pub async fn llm_http_request(
    state: tauri::State<'_, LlmEndpointState>,
    request: LlmHttpRequest,
) -> Result<LlmHttpResponse, String> {
    let url = {
        let allowlist = state
            .0
            .lock()
            .map_err(|_| "endpoint allowlist lock poisoned".to_string())?;
        validate_request(&request.url, carries_authorization(&request.headers), &allowlist)?
    };

    let method = match request.method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        other => {
            return Err(format!(
                "허용되지 않는 HTTP 메서드입니다 ({other}). GET/POST만 사용할 수 있습니다."
            ));
        }
    };

    let timeout = Duration::from_millis(request.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS));
    let client = reqwest::Client::builder()
        .timeout(timeout)
        // Never follow redirects: an allowlisted local endpoint answering
        // 3xx must not be able to route the request (and any Authorization
        // header) to an unlisted origin. The renderer sees the 3xx status.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| format!("HTTP client could not be created: {error}"))?;

    let mut builder = client.request(method, url);
    for (key, value) in &request.headers {
        builder = builder.header(key, value);
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }

    let response = builder
        .send()
        .await
        .map_err(|error| describe_send_error(&error))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Could not read the response body: {error}"))?;

    Ok(LlmHttpResponse {
        status: status.as_u16(),
        ok: status.is_success(),
        body,
    })
}

/// Turn a transport-level failure into an actionable message. The renderer used
/// to see only "Failed to fetch"; a native error names the real cause
/// (connection refused = server not running, timeout, DNS), which the analysis
/// fallback notice surfaces to the user.
pub(crate) fn describe_send_error(error: &reqwest::Error) -> String {
    if error.is_connect() {
        return format!(
            "연결할 수 없습니다 ({error}). 로컬 LLM 서버(예: Ollama)가 실행 중인지, 엔드포인트 주소가 맞는지 확인하세요."
        );
    }
    if error.is_timeout() {
        return format!("요청 시간이 초과되었습니다 ({error}). 더 작은 모델이나 더 긴 타임아웃을 시도하세요.");
    }
    format!("{error}")
}
