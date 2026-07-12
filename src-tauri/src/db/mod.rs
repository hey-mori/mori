pub mod accepted_memory;
pub mod backup;
pub mod connection;
pub mod migrations;
pub mod records;
pub mod repository;
pub mod session_imports;

pub use accepted_memory::{
    append_memory_review_actions, list_accepted_memories, list_memory_review_actions,
    save_accepted_memories, AcceptedMemoryRow, AcceptedMemoryWriteResult, MemoryReviewActionRow,
    MemoryReviewActionWriteResult,
};
pub use session_imports::{
    list_all_session_imports, list_session_imports, save_session_imports, SessionImportRow,
    SessionImportWriteResult,
};
pub use connection::{database_path, open_database};
pub use migrations::{apply_migrations, applied_migrations, MIGRATIONS, MIGRATION_TABLE_NAME};
pub use records::{ClearAllDataResult, DatabaseStatus};
pub use repository::{clear_all_data, list_sessions, load_session_snapshot, save_session_snapshot};

#[cfg(test)]
pub use connection::open_in_memory;
