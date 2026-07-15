//! Allowed-origin registry for the native LLM HTTP bridge.
//!
//! `llm_http_request` performs webview-requested HTTP natively (no browser
//! CORS), so it must not be an open proxy: a compromised page could otherwise
//! use it to reach arbitrary hosts (SSRF, data exfiltration). This module
//! holds the set of origins the user's engine settings actually configured.
//! The renderer registers them through `set_llm_allowed_endpoints` from the
//! settings save/hydrate path; `llm_http_request` rejects every other origin.
//! See `docs/design/local-llm-lifecycle.md` §5.2 for the threat model.
//!
//! Per-origin, the registry also records whether an `Authorization` header
//! may travel there: only the OpenAI-compatible endpoint is configured with
//! an API key, so a request must not be able to replay that key against any
//! other allowlisted origin.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Deserialize;

/// Managed Tauri state: origin (ASCII serialization) -> may carry Authorization.
#[derive(Default)]
pub struct LlmEndpointState(pub Mutex<HashMap<String, bool>>);

/// One endpoint registration from the renderer's engine settings.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmEndpointEntry {
    /// The configured endpoint URL (base URL or full endpoint; only its
    /// origin is registered).
    pub url: String,
    /// Whether requests to this origin may include an `Authorization` header.
    #[serde(default)]
    pub allows_authorization: bool,
}

/// Replace the allowlist with the origins of the given endpoints. Invalid or
/// non-http(s) entries are skipped rather than failing the whole call, so one
/// half-typed settings field cannot lock out the other engine. Returns how
/// many origins were registered.
#[tauri::command]
pub fn set_llm_allowed_endpoints(
    state: tauri::State<'_, LlmEndpointState>,
    entries: Vec<LlmEndpointEntry>,
) -> Result<usize, String> {
    let next = build_allowlist(&entries);
    let count = next.len();
    let mut guard = state
        .0
        .lock()
        .map_err(|_| "endpoint allowlist lock poisoned".to_string())?;
    *guard = next;
    Ok(count)
}

/// Pure core of the registration command, testable without Tauri state.
pub fn build_allowlist(entries: &[LlmEndpointEntry]) -> HashMap<String, bool> {
    let mut map: HashMap<String, bool> = HashMap::new();
    for entry in entries {
        if let Some(origin) = origin_of(&entry.url) {
            // If the same origin is registered twice, authorization
            // permission is the OR of the entries.
            let allows = map.get(&origin).copied().unwrap_or(false) || entry.allows_authorization;
            map.insert(origin, allows);
        }
    }
    map
}

/// The canonical origin (scheme://host:port, default ports normalized) of an
/// http(s) URL, or `None` when the URL is unparseable or another scheme.
pub fn origin_of(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    // Accept endpoints written without a scheme (localhost:11434), matching
    // the renderer's own endpoint-locality parser.
    let with_scheme = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };
    let url = reqwest::Url::parse(&with_scheme).ok()?;
    match url.scheme() {
        "http" | "https" => {}
        _ => return None,
    }
    url.host_str()?;
    Some(url.origin().ascii_serialization())
}

/// Validate one outbound bridge request against the allowlist. Returns the
/// parsed URL on success so the caller does not parse twice.
pub fn validate_request(
    raw_url: &str,
    has_authorization: bool,
    allowlist: &HashMap<String, bool>,
) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(raw_url)
        .map_err(|error| format!("잘못된 엔드포인트 URL입니다 ({error})"))?;
    match url.scheme() {
        "http" | "https" => {}
        other => {
            return Err(format!(
                "허용되지 않는 URL 스킴입니다 ({other}). http/https만 사용할 수 있습니다."
            ));
        }
    }
    if allowlist.is_empty() {
        return Err(
            "등록된 분석 엔진 엔드포인트가 없습니다. 설정 > 분석 엔진을 저장한 뒤 다시 시도하세요."
                .to_string(),
        );
    }
    let origin = url.origin().ascii_serialization();
    match allowlist.get(&origin) {
        None => Err(format!(
            "설정에 등록되지 않은 주소입니다 ({origin}). 설정 > 분석 엔진의 엔드포인트만 호출할 수 있습니다."
        )),
        Some(false) if has_authorization => Err(format!(
            "이 주소({origin})로는 Authorization 헤더를 보낼 수 없습니다."
        )),
        Some(_) => Ok(url),
    }
}

/// Case-insensitive check for an Authorization header in the request map.
pub fn carries_authorization(headers: &HashMap<String, String>) -> bool {
    headers.keys().any(|key| key.eq_ignore_ascii_case("authorization"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(url: &str, allows_authorization: bool) -> LlmEndpointEntry {
        LlmEndpointEntry {
            url: url.to_string(),
            allows_authorization,
        }
    }

    #[test]
    fn origin_normalizes_default_ports_and_paths() {
        assert_eq!(
            origin_of("http://localhost:11434/api/generate"),
            Some("http://localhost:11434".to_string())
        );
        assert_eq!(
            origin_of("https://api.example.com:443/v1"),
            Some("https://api.example.com".to_string())
        );
        assert_eq!(
            origin_of("localhost:1234/v1"),
            Some("http://localhost:1234".to_string())
        );
    }

    #[test]
    fn origin_rejects_non_http_schemes_and_garbage() {
        assert_eq!(origin_of("file:///etc/passwd"), None);
        assert_eq!(origin_of("ftp://host/file"), None);
        assert_eq!(origin_of(""), None);
        assert_eq!(origin_of("   "), None);
    }

    #[test]
    fn build_allowlist_skips_invalid_and_ors_authorization() {
        let list = build_allowlist(&[
            entry("http://localhost:11434", false),
            entry("http://localhost:1234/v1", true),
            entry("file:///etc/passwd", true),
            entry("http://localhost:1234/other", false),
        ]);
        assert_eq!(list.len(), 2);
        assert_eq!(list.get("http://localhost:11434"), Some(&false));
        // Same origin twice: authorization permission is OR-ed.
        assert_eq!(list.get("http://localhost:1234"), Some(&true));
    }

    #[test]
    fn validate_rejects_unlisted_origin() {
        let list = build_allowlist(&[entry("http://localhost:11434", false)]);
        let err = validate_request("http://169.254.169.254/latest/meta-data", false, &list)
            .unwrap_err();
        assert!(err.contains("등록되지 않은 주소"));
    }

    #[test]
    fn validate_rejects_non_http_scheme_before_allowlist() {
        let list = build_allowlist(&[entry("http://localhost:11434", false)]);
        let err = validate_request("file:///etc/passwd", false, &list).unwrap_err();
        assert!(err.contains("스킴"));
    }

    #[test]
    fn validate_rejects_empty_allowlist_with_actionable_message() {
        let err = validate_request("http://localhost:11434/api/tags", false, &HashMap::new())
            .unwrap_err();
        assert!(err.contains("설정 > 분석 엔진"));
    }

    #[test]
    fn validate_rejects_authorization_to_unauthorized_origin() {
        let list = build_allowlist(&[
            entry("http://localhost:11434", false),
            entry("http://localhost:1234/v1", true),
        ]);
        let err =
            validate_request("http://localhost:11434/api/generate", true, &list).unwrap_err();
        assert!(err.contains("Authorization"));
        // The origin that was configured with a key accepts it.
        assert!(validate_request("http://localhost:1234/v1/chat/completions", true, &list).is_ok());
    }

    #[test]
    fn validate_accepts_allowlisted_request_and_returns_parsed_url() {
        let list = build_allowlist(&[entry("http://localhost:11434", false)]);
        let url = validate_request("http://localhost:11434/api/generate", false, &list).unwrap();
        assert_eq!(url.path(), "/api/generate");
    }

    #[test]
    fn carries_authorization_is_case_insensitive() {
        let mut headers = HashMap::new();
        headers.insert("AUTHORIZATION".to_string(), "Bearer x".to_string());
        assert!(carries_authorization(&headers));
        headers.clear();
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        assert!(!carries_authorization(&headers));
    }
}
