pub mod connection;
pub mod migrations;
pub mod records;
pub mod repository;

pub use connection::{database_path, open_database};
pub use migrations::{apply_migrations, applied_migrations, MIGRATIONS, MIGRATION_TABLE_NAME};
pub use records::DatabaseStatus;
pub use repository::{list_sessions, load_session_snapshot, save_session_snapshot};

#[cfg(test)]
pub use connection::open_in_memory;
