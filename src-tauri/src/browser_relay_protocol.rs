use std::{
    collections::hash_map::DefaultHasher,
    env,
    hash::{Hash, Hasher},
    io::{self, BufRead, BufReader, Read, Write},
    path::PathBuf,
};

use interprocess::local_socket::{
    prelude::*, GenericFilePath, GenericNamespaced, ListenerOptions, Name, Stream,
};
use serde::{Deserialize, Serialize};
#[cfg(test)]
use serde_json::json;
use serde_json::Value;

pub const RELAY_PROTOCOL_VERSION: u8 = 1;
pub const DEFAULT_RELAY_NAME_PREFIX: &str = "mori-browser-observation-v1";
pub const RELAY_NAME_ENV: &str = "MORI_BROWSER_RELAY_NAME";
pub const MAX_RELAY_MESSAGE_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrowserRelayRequest {
    pub version: u8,
    pub observation: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrowserRelayAck {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub errors: Option<Value>,
}

impl BrowserRelayAck {
    pub fn error(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            ok: false,
            code: Some(code.into()),
            kind: None,
            route: None,
            message: Some(message.into()),
            errors: None,
        }
    }
}

pub fn relay_name_from_env() -> String {
    env::var(RELAY_NAME_ENV)
        .ok()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(default_relay_name)
}

pub fn default_relay_name() -> String {
    let user_scope = env::var("USERPROFILE")
        .or_else(|_| env::var("HOME"))
        .or_else(|_| env::var("USERNAME"))
        .or_else(|_| env::var("USER"))
        .unwrap_or_else(|_| "unknown-user".to_string());
    let mut hasher = DefaultHasher::new();
    user_scope.hash(&mut hasher);
    format!("{DEFAULT_RELAY_NAME_PREFIX}-{:016x}", hasher.finish())
}

#[allow(dead_code)]
pub fn send_observation_to_mori(
    relay_name: &str,
    observation: Value,
) -> Result<BrowserRelayAck, String> {
    let name = local_socket_name(relay_name).map_err(|error| error.to_string())?;
    let mut conn = BufReader::new(
        Stream::connect(name).map_err(|error| format!("Mori unavailable: {error}"))?,
    );
    let request = BrowserRelayRequest {
        version: RELAY_PROTOCOL_VERSION,
        observation,
    };
    write_json_line(conn.get_mut(), &request).map_err(|error| error.to_string())?;
    let line = read_limited_line(&mut conn).map_err(|error| error.to_string())?;
    serde_json::from_str::<BrowserRelayAck>(&line)
        .map_err(|error| format!("Invalid relay acknowledgement: {error}"))
}

#[allow(dead_code)]
pub fn serve_browser_relay_once<F>(relay_name: &str, handler: F) -> io::Result<()>
where
    F: FnOnce(Value) -> BrowserRelayAck,
{
    let name = local_socket_name(relay_name)?;
    let listener = ListenerOptions::new().name(name).create_sync()?;
    let conn = listener.accept()?;
    handle_browser_relay_connection(conn, handler)
}

#[allow(dead_code)]
pub fn handle_browser_relay_connection<F>(conn: Stream, handler: F) -> io::Result<()>
where
    F: FnOnce(Value) -> BrowserRelayAck,
{
    let mut conn = BufReader::new(conn);
    let line = read_limited_line(&mut conn)?;
    let ack = match serde_json::from_str::<BrowserRelayRequest>(&line) {
        Ok(request) if request.version == RELAY_PROTOCOL_VERSION => handler(request.observation),
        Ok(_) => BrowserRelayAck::error("unsupported_relay_version", "Unsupported relay version."),
        Err(error) => {
            BrowserRelayAck::error("invalid_relay_json", format!("Invalid relay JSON: {error}"))
        }
    };
    write_json_line(conn.get_mut(), &ack)
}

pub fn local_socket_name(relay_name: &str) -> io::Result<Name<'static>> {
    if GenericNamespaced::is_supported() {
        relay_name.to_string().to_ns_name::<GenericNamespaced>()
    } else {
        relay_socket_path(relay_name)
            .to_string_lossy()
            .to_string()
            .to_fs_name::<GenericFilePath>()
    }
}

fn relay_socket_path(relay_name: &str) -> PathBuf {
    env::temp_dir().join(format!("{relay_name}.sock"))
}

fn read_limited_line<R: BufRead>(reader: &mut R) -> io::Result<String> {
    let mut bytes = Vec::new();
    let read = (&mut *reader)
        .take((MAX_RELAY_MESSAGE_BYTES + 1) as u64)
        .read_until(b'\n', &mut bytes)?;
    if read == 0 {
        return Err(io::Error::new(
            io::ErrorKind::UnexpectedEof,
            "relay connection closed before a request",
        ));
    }
    if bytes.len() > MAX_RELAY_MESSAGE_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "relay message exceeded the size cap",
        ));
    }
    if !bytes.ends_with(b"\n") {
        return Err(io::Error::new(
            io::ErrorKind::UnexpectedEof,
            "relay message was not newline terminated",
        ));
    }
    String::from_utf8(bytes)
        .map(|line| line.trim_end_matches(['\r', '\n']).to_string())
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

fn write_json_line<W: Write, T: Serialize>(writer: &mut W, value: &T) -> io::Result<()> {
    let mut bytes = serde_json::to_vec(value).map_err(io::Error::other)?;
    bytes.push(b'\n');
    writer.write_all(&bytes)?;
    writer.flush()
}

#[cfg(test)]
mod tests {
    use std::{sync::mpsc, thread};

    use super::*;

    #[test]
    fn default_relay_name_is_versioned_and_user_scoped() {
        let name = default_relay_name();
        assert!(name.starts_with(DEFAULT_RELAY_NAME_PREFIX));
        assert!(name.len() > DEFAULT_RELAY_NAME_PREFIX.len());
    }

    #[test]
    fn relays_one_observation_over_a_local_socket() {
        let relay_name = format!("mori-browser-test-{}", std::process::id());
        let (ready_tx, ready_rx) = mpsc::channel();
        let server_name = relay_name.clone();
        let handle = thread::spawn(move || {
            let name = local_socket_name(&server_name).unwrap();
            let listener = ListenerOptions::new().name(name).create_sync().unwrap();
            ready_tx.send(()).unwrap();
            let conn = listener.accept().unwrap();
            handle_browser_relay_connection(conn, |observation| BrowserRelayAck {
                ok: true,
                code: None,
                kind: observation
                    .get("kind")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                route: Some("trace".to_string()),
                message: None,
                errors: None,
            })
            .unwrap();
        });

        ready_rx.recv().unwrap();
        let ack = send_observation_to_mori(
            &relay_name,
            json!({
                "version": 1,
                "source": "browser",
                "kind": "tab_activated",
                "observedAt": "2026-09-09T00:01:00.000Z",
                "payload": {}
            }),
        )
        .unwrap();
        handle.join().unwrap();

        assert!(ack.ok);
        assert_eq!(ack.kind.as_deref(), Some("tab_activated"));
        assert_eq!(ack.route.as_deref(), Some("trace"));
    }
}
