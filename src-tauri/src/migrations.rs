// Mori uses Rust-native runtime migrations for the desktop app.
//
// Strategy:
// - Keep migration SQL files in src-tauri/migrations with Flyway-style names.
// - Do not use Flyway at app runtime; avoid Java/JDBC in the desktop bundle.
// - The future rusqlite runner should open SQLite, ensure _mori_migrations,
//   verify checksums, apply pending migrations in order, and continue boot.
//
// Cargo is unavailable in the current execution environment, so this file is a
// lightweight manifest until the rusqlite dependency can be added and checked.

pub struct MigrationManifestEntry {
    pub version: &'static str,
    pub filename: &'static str,
    pub name: &'static str,
}

pub const MIGRATION_TABLE_NAME: &str = "_mori_migrations";

pub const MIGRATIONS: &[MigrationManifestEntry] = &[MigrationManifestEntry {
    version: "001",
    filename: "V001__initial_schema.sql",
    name: "initial_schema",
}];
