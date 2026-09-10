use std::io::{self, Read, Write};

use serde_json::Value;

use crate::browser_relay_protocol::{
    relay_name_from_env, send_observation_to_mori, BrowserRelayAck,
};

pub const NATIVE_MESSAGING_HEADER_BYTES: usize = 4;
pub const MAX_NATIVE_MESSAGE_BYTES: u32 = 1024 * 1024;

pub fn run_browser_native_host() -> io::Result<()> {
    let relay_name = relay_name_from_env();
    let stdin = io::stdin();
    let stdout = io::stdout();
    relay_native_messages(stdin.lock(), stdout.lock(), &relay_name)
}

pub fn relay_native_messages<R: Read, W: Write>(
    mut input: R,
    mut output: W,
    relay_name: &str,
) -> io::Result<()> {
    while let Some(frame) = read_native_message(&mut input)? {
        let acknowledgement = match serde_json::from_slice::<Value>(&frame) {
            Ok(observation) => match send_observation_to_mori(relay_name, observation) {
                Ok(ack) => ack,
                Err(error) => BrowserRelayAck::error("mori_unavailable", error),
            },
            Err(error) => BrowserRelayAck::error("invalid_json", format!("Invalid JSON: {error}")),
        };
        write_native_message(&mut output, &acknowledgement)?;
    }
    Ok(())
}

pub fn read_native_message<R: Read>(input: &mut R) -> io::Result<Option<Vec<u8>>> {
    let mut header = [0u8; NATIVE_MESSAGING_HEADER_BYTES];
    let mut read = 0usize;
    while read < NATIVE_MESSAGING_HEADER_BYTES {
        let count = input.read(&mut header[read..])?;
        if count == 0 {
            if read == 0 {
                return Ok(None);
            }
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "native message ended inside the frame header",
            ));
        }
        read += count;
    }

    let length = u32::from_ne_bytes(header);
    if length == 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "native message frame length must be greater than zero",
        ));
    }
    if length > MAX_NATIVE_MESSAGE_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!(
                "native message frame is too large ({length} bytes > {MAX_NATIVE_MESSAGE_BYTES} byte cap)"
            ),
        ));
    }

    let mut body = vec![0u8; length as usize];
    input.read_exact(&mut body)?;
    Ok(Some(body))
}

pub fn write_native_message<W: Write, T: serde::Serialize>(
    output: &mut W,
    message: &T,
) -> io::Result<()> {
    let body = serde_json::to_vec(message).map_err(io::Error::other)?;
    if body.len() > MAX_NATIVE_MESSAGE_BYTES as usize {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "native message response exceeded the size cap",
        ));
    }
    output.write_all(&(body.len() as u32).to_ne_bytes())?;
    output.write_all(&body)?;
    output.flush()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_frame_round_trips_json_bytes() {
        let mut bytes = Vec::new();
        write_native_message(&mut bytes, &serde_json::json!({ "ok": true })).unwrap();

        let decoded = read_native_message(&mut bytes.as_slice()).unwrap().unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&decoded).unwrap()["ok"],
            true
        );
    }

    #[test]
    fn rejects_oversized_native_frames() {
        let mut bytes = (MAX_NATIVE_MESSAGE_BYTES + 1).to_ne_bytes().to_vec();
        bytes.extend_from_slice(b"{}");

        let error = read_native_message(&mut bytes.as_slice()).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
    }
}
