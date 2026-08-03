//! Streaming variant of the native LLM bridge.
//!
//! `llm_http_request` buffers a whole response and returns it as a `String`,
//! which is right for Quick Pass (one JSON object, parsed once) and wrong for
//! the Language Loop, where the point is to show text as it is generated. It
//! also cannot be cancelled: the renderer stops waiting, the native request runs
//! to completion, and a superseded generation keeps burning the model.
//!
//! This command pushes chunks to the webview over a Tauri channel and can be
//! stopped for real.
//!
//! **The security boundary is identical and is not re-derived here.** The same
//! `validate_request` decides the origin allowlist, the http(s) scheme, the
//! GET/POST restriction and where an `Authorization` header may travel, and
//! redirects are still never followed. A second transport must not become a
//! second, weaker policy.
//!
//! Cancellation is cooperative but real: `cancel_llm_stream` flips a flag, the
//! read loop stops, and dropping the response closes the connection, which is
//! what actually makes the model stop generating.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

use crate::llm_endpoints::{carries_authorization, validate_request, LlmEndpointState};
use crate::llm_http::LlmHttpRequest;

/// Live streams, keyed by the id the renderer generated. An entry exists only
/// while a request is in flight; both the normal end and a cancel remove it, so
/// the map cannot grow across a session.
#[derive(Default)]
pub struct LlmStreamState(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

/// One event in a streamed response.
///
/// Tagged rather than a bare string so the renderer can tell "the model said
/// this" from "the request finished" from "it failed", instead of inferring
/// from an empty chunk.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LlmStreamEvent {
    /// Headers are in. Carries the status so a non-2xx can be surfaced before
    /// any body arrives.
    #[serde(rename_all = "camelCase")]
    Open { status: u16, ok: bool },
    /// A raw slice of the response body, exactly as received. Parsing NDJSON or
    /// SSE is the renderer's job: this bridge stays protocol-agnostic so one
    /// command serves both Ollama and OpenAI-compatible servers.
    #[serde(rename_all = "camelCase")]
    Chunk { text: String },
    /// The body ended normally.
    #[serde(rename_all = "camelCase")]
    Done { status: u16, ok: bool },
    /// The stream stopped because the renderer cancelled it. Distinct from
    /// `Error` so a superseded request is not reported as a failure.
    #[serde(rename_all = "camelCase")]
    Cancelled,
    #[serde(rename_all = "camelCase")]
    Error { message: String },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmStreamRequest {
    /// Renderer-generated id, used only to cancel this stream.
    pub request_id: String,
    #[serde(flatten)]
    pub request: LlmHttpRequest,
}

/// Default ceiling for a streamed request. Longer than the one-shot default
/// because a long generation is the expected case here, and the renderer
/// cancels rather than waiting for a timeout.
const DEFAULT_STREAM_TIMEOUT_MS: u64 = 300_000;

/// Register a stream and hand back its cancellation flag.
fn register(state: &LlmStreamState, request_id: &str) -> Result<Arc<AtomicBool>, String> {
    let flag = Arc::new(AtomicBool::new(false));
    let mut live = state
        .0
        .lock()
        .map_err(|_| "stream registry lock poisoned".to_string())?;
    // Replacing an id already in flight cancels the old one rather than leaking
    // it: the renderer reusing an id means it considers the previous run dead.
    if let Some(previous) = live.insert(request_id.to_string(), Arc::clone(&flag)) {
        previous.store(true, Ordering::Relaxed);
    }
    Ok(flag)
}

fn unregister(state: &LlmStreamState, request_id: &str) {
    if let Ok(mut live) = state.0.lock() {
        live.remove(request_id);
    }
}

/// Stream a response body to the renderer in chunks.
#[tauri::command]
pub async fn llm_http_stream(
    endpoints: tauri::State<'_, LlmEndpointState>,
    streams: tauri::State<'_, LlmStreamState>,
    request: LlmStreamRequest,
    on_event: Channel<LlmStreamEvent>,
) -> Result<(), String> {
    let LlmStreamRequest {
        request_id,
        request,
    } = request;

    // Exactly the same gate as the one-shot command.
    let url = {
        let allowlist = endpoints
            .0
            .lock()
            .map_err(|_| "endpoint allowlist lock poisoned".to_string())?;
        validate_request(
            &request.url,
            carries_authorization(&request.headers),
            &allowlist,
        )?
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

    let cancelled = register(&streams, &request_id)?;

    // The timeout bounds the whole request, not each chunk: a generation that
    // is producing tokens is working, and cutting it off mid-answer would be
    // worse than letting the renderer cancel.
    let timeout = Duration::from_millis(request.timeout_ms.unwrap_or(DEFAULT_STREAM_TIMEOUT_MS));
    let client = reqwest::Client::builder()
        .timeout(timeout)
        // Same rule as the one-shot path: an allowlisted endpoint answering 3xx
        // must not carry the request, or its Authorization header, off-origin.
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

    let response = match builder.send().await {
        Ok(response) => response,
        Err(error) => {
            unregister(&streams, &request_id);
            let message = crate::llm_http::describe_send_error(&error);
            let _ = on_event.send(LlmStreamEvent::Error {
                message: message.clone(),
            });
            return Err(message);
        }
    };

    let status = response.status();
    let ok = status.is_success();
    let _ = on_event.send(LlmStreamEvent::Open {
        status: status.as_u16(),
        ok,
    });

    let mut stream = response.bytes_stream();
    // A chunk can split a multi-byte character, so bytes are decoded across
    // chunk boundaries rather than per chunk; decoding each one alone would
    // corrupt Korean text at every boundary.
    let mut decoder = Utf8Decoder::default();

    while let Some(next) = stream.next().await {
        if cancelled.load(Ordering::Relaxed) {
            // Returning here drops `stream`, which closes the connection. That
            // is what actually stops the model, rather than just stopping us
            // from listening to it.
            unregister(&streams, &request_id);
            let _ = on_event.send(LlmStreamEvent::Cancelled);
            return Ok(());
        }

        match next {
            Ok(bytes) => {
                let text = decoder.push(&bytes);
                if !text.is_empty() {
                    let _ = on_event.send(LlmStreamEvent::Chunk { text });
                }
            }
            Err(error) => {
                unregister(&streams, &request_id);
                let message = format!("Could not read the response body: {error}");
                let _ = on_event.send(LlmStreamEvent::Error {
                    message: message.clone(),
                });
                return Err(message);
            }
        }
    }

    unregister(&streams, &request_id);
    let _ = on_event.send(LlmStreamEvent::Done {
        status: status.as_u16(),
        ok,
    });
    Ok(())
}

/// Flip a stream's cancellation flag. Safe for an id that already finished:
/// the renderer routinely cancels a request that has just completed.
fn cancel(state: &LlmStreamState, request_id: &str) -> bool {
    let Ok(live) = state.0.lock() else {
        return false;
    };
    match live.get(request_id) {
        Some(flag) => {
            flag.store(true, Ordering::Relaxed);
            true
        }
        None => false,
    }
}

/// Stop a stream. Safe to call for an id that already finished.
#[tauri::command]
pub fn cancel_llm_stream(streams: tauri::State<'_, LlmStreamState>, request_id: String) {
    cancel(&streams, &request_id);
}

/// Incremental UTF-8 decoder.
///
/// Network chunks split wherever the socket happens to break, which lands mid
/// character for any non-ASCII text. Holding the incomplete tail until the next
/// chunk is what keeps Korean and emoji intact.
#[derive(Default)]
struct Utf8Decoder {
    pending: Vec<u8>,
}

impl Utf8Decoder {
    fn push(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        match std::str::from_utf8(&self.pending) {
            Ok(text) => {
                let out = text.to_string();
                self.pending.clear();
                out
            }
            Err(error) => {
                let valid = error.valid_up_to();
                // Anything after `valid_up_to` is either an incomplete tail
                // (keep it) or genuinely invalid. `error_len() == None` means
                // incomplete, which is the case worth waiting for.
                let out = String::from_utf8_lossy(&self.pending[..valid]).to_string();
                let tail = self.pending[valid..].to_vec();
                self.pending = if error.error_len().is_some() {
                    // Malformed rather than truncated: drop one byte so a
                    // corrupt stream cannot wedge the decoder forever.
                    tail.into_iter().skip(1).collect()
                } else {
                    tail
                };
                out
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decoder_joins_a_character_split_across_chunks() {
        // "한" is E1 95 9C in UTF-8; split it down the middle.
        let full = "한글".as_bytes().to_vec();
        let mut decoder = Utf8Decoder::default();
        let first = decoder.push(&full[..2]);
        let second = decoder.push(&full[2..]);
        assert_eq!(format!("{first}{second}"), "한글");
    }

    #[test]
    fn decoder_emits_the_complete_prefix_immediately() {
        let bytes = "ab한".as_bytes().to_vec();
        let mut decoder = Utf8Decoder::default();
        // Everything before the truncated character is usable now: holding it
        // back would stall the stream on every multi-byte boundary.
        assert_eq!(decoder.push(&bytes[..3]), "ab");
        assert_eq!(decoder.push(&bytes[3..]), "한");
    }

    #[test]
    fn decoder_passes_ascii_straight_through() {
        let mut decoder = Utf8Decoder::default();
        assert_eq!(decoder.push(b"hello"), "hello");
        assert_eq!(decoder.push(b" world"), " world");
    }

    #[test]
    fn decoder_does_not_wedge_on_a_malformed_byte() {
        let mut decoder = Utf8Decoder::default();
        // A lone continuation byte is invalid, not incomplete. It must be
        // dropped rather than held forever waiting for a completion that a
        // corrupt stream will never send.
        let _ = decoder.push(&[0x80]);
        assert_eq!(decoder.push(b"ok"), "ok");
    }

    #[test]
    fn registering_the_same_id_twice_cancels_the_first() {
        let state = LlmStreamState::default();
        let first = register(&state, "run-1").unwrap();
        let second = register(&state, "run-1").unwrap();
        assert!(
            first.load(Ordering::Relaxed),
            "the superseded run should have been cancelled",
        );
        assert!(!second.load(Ordering::Relaxed));
    }

    #[test]
    fn unregister_removes_the_entry_so_the_map_cannot_grow() {
        let state = LlmStreamState::default();
        register(&state, "run-1").unwrap();
        assert_eq!(state.0.lock().unwrap().len(), 1);
        unregister(&state, "run-1");
        assert!(state.0.lock().unwrap().is_empty());
    }

    #[test]
    fn cancel_sets_the_flag_the_read_loop_checks() {
        let state = LlmStreamState::default();
        let flag = register(&state, "run-1").unwrap();
        assert!(cancel(&state, "run-1"));
        assert!(flag.load(Ordering::Relaxed));
    }

    #[test]
    fn cancelling_an_unknown_id_is_harmless() {
        // The renderer routinely cancels a request that has just finished.
        let state = LlmStreamState::default();
        assert!(!cancel(&state, "never-existed"));
    }

    #[test]
    fn cancelling_after_completion_is_harmless() {
        let state = LlmStreamState::default();
        register(&state, "run-1").unwrap();
        unregister(&state, "run-1");
        assert!(!cancel(&state, "run-1"));
    }

    #[test]
    fn events_serialize_with_a_discriminating_tag() {
        let json = serde_json::to_string(&LlmStreamEvent::Chunk {
            text: "안녕".into(),
        })
        .unwrap();
        assert!(json.contains("\"kind\":\"chunk\""));
        let cancelled = serde_json::to_string(&LlmStreamEvent::Cancelled).unwrap();
        assert!(cancelled.contains("\"kind\":\"cancelled\""));
    }
}
