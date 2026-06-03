//! MCP server staging.
//!
//! The MCP capture surface ships a server template (`connectors/mcp/`). To
//! make it usable without the user hunting for the script path, Mori stages a
//! copy of the server into a stable local location
//! (`~/.mori/connectors/mcp/mori-mcp-server.py`) and hands back the absolute
//! path. The frontend builds the host config snippet from that path.
//!
//! Mori never edits a third-party app's config — staging is a local file copy
//! only, and registering the server in the host stays an explicit user paste.
//! The script content is embedded at compile time so a packaged build (where
//! the repo `connectors/` tree is absent) can still stage it.

use std::fs;
use std::path::Path;

use serde::Serialize;

/// The server template, embedded so the packaged app can write it out without
/// the repo present. Kept byte-identical to the shipped template.
const MCP_SERVER_SCRIPT: &str = include_str!("../../../connectors/mcp/mori-mcp-server.py");

const SCRIPT_FILENAME: &str = "mori-mcp-server.py";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStaged {
    /// Absolute path to the staged server script.
    pub script_path: String,
    /// True when the file was (re)written, false when it already matched.
    pub wrote: bool,
}

#[tauri::command]
pub fn stage_mcp_server() -> Result<McpServerStaged, String> {
    let inbox =
        crate::agent_paths::require(crate::agent_paths::mori_inbox_dir(), "Mori connector inbox")?;
    stage_to(&inbox)
}

/// Pure-ish core: write the embedded server into `<inbox>/mcp/` and report the
/// path. Re-writes only when the content differs, so repeated calls are idempotent
/// and never clobber a user edit needlessly. Testable against a temp inbox.
pub(crate) fn stage_to(inbox_root: &Path) -> Result<McpServerStaged, String> {
    let mcp_dir = inbox_root.join("mcp");
    fs::create_dir_all(&mcp_dir)
        .map_err(|error| format!("Failed to create {}: {error}", mcp_dir.display()))?;
    let target = mcp_dir.join(SCRIPT_FILENAME);

    let current = fs::read_to_string(&target).ok();
    let wrote = if current.as_deref() == Some(MCP_SERVER_SCRIPT) {
        false
    } else {
        fs::write(&target, MCP_SERVER_SCRIPT)
            .map_err(|error| format!("Failed to write {}: {error}", target.display()))?;
        true
    };

    Ok(McpServerStaged {
        script_path: target.to_string_lossy().to_string(),
        wrote,
    })
}

/// Resolve the absolute path the server *would* live at, without writing it.
/// Useful for showing the config snippet before the user stages.
#[tauri::command]
pub fn mcp_server_target_path() -> Result<String, String> {
    let inbox =
        crate::agent_paths::require(crate::agent_paths::mori_inbox_dir(), "Mori connector inbox")?;
    Ok(inbox
        .join("mcp")
        .join(SCRIPT_FILENAME)
        .to_string_lossy()
        .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::TempDir;

    #[test]
    fn stages_the_embedded_server_script() {
        let temp = TempDir::new().unwrap();
        let inbox = temp.path().join("connectors");
        let staged = stage_to(&inbox).unwrap();
        assert!(staged.wrote);
        let path = PathBuf::from(&staged.script_path);
        assert!(path.exists());
        assert!(
            path.ends_with("mcp/mori-mcp-server.py") || path.ends_with("mcp\\mori-mcp-server.py")
        );
        let written = std::fs::read_to_string(&path).unwrap();
        assert!(written.contains("FastMCP"));
        assert!(written.contains("capture_session"));
    }

    #[test]
    fn restaging_identical_content_does_not_rewrite() {
        let temp = TempDir::new().unwrap();
        let inbox = temp.path().join("connectors");
        let first = stage_to(&inbox).unwrap();
        assert!(first.wrote);
        let second = stage_to(&inbox).unwrap();
        assert!(!second.wrote);
        assert_eq!(first.script_path, second.script_path);
    }
}
