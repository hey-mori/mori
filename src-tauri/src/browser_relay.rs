use std::{
    collections::HashMap,
    sync::{mpsc, Arc, Mutex},
    thread,
    time::Duration,
};

use interprocess::local_socket::{traits::ListenerExt, ListenerOptions};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Emitter;

use crate::browser_relay_protocol::{
    handle_browser_relay_connection, local_socket_name, relay_name_from_env, BrowserRelayAck,
};

const RELAY_EVENT: &str = "browser-observation-relay://request";
const ACK_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone, Default)]
pub struct BrowserRelayState {
    pending: Arc<Mutex<HashMap<String, PendingRelayRequest>>>,
}

struct PendingRelayRequest {
    observation: Value,
    sender: mpsc::Sender<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserRelayEvent {
    request_id: String,
    observation: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserRelayAckInput {
    request_id: String,
    acknowledgement: Value,
}

pub fn start_browser_observation_relay(app: tauri::AppHandle, state: BrowserRelayState) {
    let relay_name = relay_name_from_env();
    thread::spawn(move || {
        if let Err(error) = serve_browser_observation_relay(app, state, relay_name) {
            eprintln!("browser observation relay stopped: {error}");
        }
    });
}

#[tauri::command]
pub fn ack_browser_observation_relay(
    state: tauri::State<'_, BrowserRelayState>,
    input: BrowserRelayAckInput,
) -> Result<(), String> {
    state.ack(input)
}

#[tauri::command]
pub fn claim_browser_observation_relay_requests(
    state: tauri::State<'_, BrowserRelayState>,
) -> Result<Vec<BrowserRelayEvent>, String> {
    state.claim_pending_requests()
}

impl BrowserRelayState {
    fn insert_pending(
        &self,
        request_id: String,
        observation: Value,
        sender: mpsc::Sender<Value>,
    ) -> Result<(), String> {
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| "browser relay pending map is poisoned".to_string())?;
        pending.insert(
            request_id,
            PendingRelayRequest {
                observation,
                sender,
            },
        );
        Ok(())
    }

    fn claim_pending_requests(&self) -> Result<Vec<BrowserRelayEvent>, String> {
        let pending = self
            .pending
            .lock()
            .map_err(|_| "browser relay pending map is poisoned".to_string())?;
        Ok(pending
            .iter()
            .map(|(request_id, request)| BrowserRelayEvent {
                request_id: request_id.clone(),
                observation: request.observation.clone(),
            })
            .collect())
    }

    fn ack(&self, input: BrowserRelayAckInput) -> Result<(), String> {
        let sender = {
            let mut pending = self
                .pending
                .lock()
                .map_err(|_| "browser relay pending map is poisoned".to_string())?;
            pending
                .remove(&input.request_id)
                .map(|request| request.sender)
        };

        let Some(sender) = sender else {
            return Err("browser relay request is no longer pending".to_string());
        };

        sender
            .send(input.acknowledgement)
            .map_err(|_| "browser relay acknowledgement receiver is gone".to_string())
    }
}

fn serve_browser_observation_relay(
    app: tauri::AppHandle,
    state: BrowserRelayState,
    relay_name: String,
) -> Result<(), String> {
    let name = local_socket_name(&relay_name).map_err(|error| error.to_string())?;
    let listener = ListenerOptions::new()
        .name(name)
        .create_sync()
        .map_err(|error| format!("failed to bind browser relay socket {relay_name}: {error}"))?;

    for incoming in listener.incoming() {
        match incoming {
            Ok(conn) => {
                let app = app.clone();
                let state = state.clone();
                thread::spawn(move || {
                    if let Err(error) = handle_browser_relay_connection(conn, |observation| {
                        forward_to_webview(&app, &state, observation)
                    }) {
                        eprintln!("browser relay connection failed: {error}");
                    }
                });
            }
            Err(error) => eprintln!("browser relay accept failed: {error}"),
        }
    }
    Ok(())
}

fn forward_to_webview(
    app: &tauri::AppHandle,
    state: &BrowserRelayState,
    observation: Value,
) -> BrowserRelayAck {
    let request_id = next_request_id();
    let (tx, rx) = mpsc::channel();

    if let Err(error) = state.insert_pending(request_id.clone(), observation.clone(), tx) {
        return BrowserRelayAck::error("relay_state_error", error);
    }

    let event = BrowserRelayEvent {
        request_id: request_id.clone(),
        observation,
    };
    if let Err(error) = app.emit(RELAY_EVENT, event) {
        remove_pending(state, &request_id);
        return BrowserRelayAck::error(
            "webview_unavailable",
            format!("WebView event failed: {error}"),
        );
    }

    match rx.recv_timeout(ACK_TIMEOUT) {
        Ok(ack) => serde_json::from_value::<BrowserRelayAck>(ack).unwrap_or_else(|error| {
            BrowserRelayAck::error("invalid_ack", format!("Invalid Browser relay ack: {error}"))
        }),
        Err(mpsc::RecvTimeoutError::Timeout) => {
            remove_pending(state, &request_id);
            BrowserRelayAck::error(
                "mori_timeout",
                "Mori did not acknowledge the Browser observation in time.",
            )
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            remove_pending(state, &request_id);
            BrowserRelayAck::error("mori_unavailable", "Mori acknowledgement channel closed.")
        }
    }
}

fn remove_pending(state: &BrowserRelayState, request_id: &str) {
    if let Ok(mut pending) = state.pending.lock() {
        pending.remove(request_id);
    }
}

fn next_request_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("browser-relay-{nanos}-{}", std::process::id())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn pending_requests_can_be_claimed_until_acknowledged() {
        let state = BrowserRelayState::default();
        let (tx, rx) = mpsc::channel();
        state
            .insert_pending(
                "request-1".to_string(),
                json!({ "kind": "context_snapshot" }),
                tx,
            )
            .unwrap();

        let claimed = state.claim_pending_requests().unwrap();
        assert_eq!(claimed.len(), 1);
        assert_eq!(claimed[0].request_id, "request-1");
        assert_eq!(claimed[0].observation["kind"], "context_snapshot");

        state
            .ack(BrowserRelayAckInput {
                request_id: "request-1".to_string(),
                acknowledgement: json!({ "ok": true, "kind": "context_snapshot", "route": "context" }),
            })
            .unwrap();

        assert_eq!(rx.recv().unwrap()["ok"], true);
        assert!(state.claim_pending_requests().unwrap().is_empty());
    }
}
