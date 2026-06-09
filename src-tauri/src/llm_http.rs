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
//! Scoped to exactly what the analysis providers need: one method, a header
//! map, an optional string body, an optional timeout. Returns the status code
//! and the raw body text; the renderer parses JSON itself, as it already does
//! for the `fetch` path. This is a user-triggered call to a user-configured
//! endpoint, so there is no ambient authority to abuse.

use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};

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
pub async fn llm_http_request(request: LlmHttpRequest) -> Result<LlmHttpResponse, String> {
    let timeout = Duration::from_millis(request.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS));
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|error| format!("HTTP client could not be created: {error}"))?;

    let method = reqwest::Method::from_bytes(request.method.to_uppercase().as_bytes())
        .map_err(|error| format!("Invalid HTTP method '{}': {error}", request.method))?;

    let mut builder = client.request(method, &request.url);
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
fn describe_send_error(error: &reqwest::Error) -> String {
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
