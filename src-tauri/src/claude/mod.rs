//! Claude Connections — discovery and read of local Claude artefacts.
//!
//! Mori never logs the user into Anthropic and never talks to the network
//! here. The only thing this module does is read files the user already has
//! on disk from either:
//!
//!   - The Claude Desktop App (a SQLite database under `%APPDATA%\Claude`
//!     on Windows, `~/Library/Application Support/Claude` on macOS, or
//!     `~/.config/Claude` on Linux). The schema is product-internal and
//!     can change between Claude releases, so `discover_claude_desktop`
//!     returns the raw schema so we can fall back gracefully.
//!   - The Claude Code CLI (one `.jsonl` file per session under
//!     `~/.claude/projects/<encoded-project>/<session>.jsonl`).
//!
//! Everything is read-only and bounded. We never write back to either
//! store, never recurse into arbitrary paths the user did not name, and
//! never expose contents the user did not explicitly ask for.

pub mod code;
pub mod desktop;
pub mod installations;

/// Format a UNIX timestamp (seconds) as `YYYY-MM-DDTHH:MM:SS`. Shared by
/// every claude submodule so file timestamps line up with the rest of the
/// app without pulling in `chrono`.
/// Unix seconds as an ISO-8601 UTC timestamp with an explicit `Z`.
pub(crate) fn format_unix_seconds(secs: u64) -> String {
    const SECONDS_PER_DAY: u64 = 86_400;
    let total_days = secs / SECONDS_PER_DAY;
    let secs_in_day = secs % SECONDS_PER_DAY;
    let hour = secs_in_day / 3600;
    let minute = (secs_in_day % 3600) / 60;
    let second = secs_in_day % 60;

    let mut year = 1970_i64;
    let mut day_of_year = total_days as i64;
    loop {
        let days_in_year = if is_leap(year) { 366 } else { 365 };
        if day_of_year < days_in_year {
            break;
        }
        day_of_year -= days_in_year;
        year += 1;
    }
    let (month, day) = month_day(day_of_year as u32, is_leap(year));
    // The fields are UTC, so the zone is written: an ISO date-time without one
    // is read as LOCAL time by JavaScript (`Date.parse`), which put every such
    // value nine hours off in KST.
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, minute, second
    )
}

fn is_leap(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn month_day(day_of_year: u32, leap: bool) -> (u32, u32) {
    let days = if leap {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut remaining = day_of_year;
    for (index, length) in days.iter().enumerate() {
        if remaining < *length {
            return ((index as u32) + 1, remaining + 1);
        }
        remaining -= length;
    }
    (12, 31)
}

#[cfg(test)]
mod format_tests {
    use super::format_unix_seconds;

    #[test]
    fn writes_utc_with_an_explicit_zone() {
        assert_eq!(format_unix_seconds(0), "1970-01-01T00:00:00Z");
        // 2026-09-30T04:22:13Z, a real file mtime from the NUC trial.
        assert_eq!(format_unix_seconds(1_790_742_133), "2026-09-30T04:22:13Z");
        // Leap day.
        assert_eq!(format_unix_seconds(1_709_164_800), "2024-02-29T00:00:00Z");
    }
}
