pub mod accepted_memory;
pub mod backup;
pub mod connection;
pub mod documents;
pub mod intake;
pub mod kernel;
pub mod migrations;
pub mod records;
pub mod repository;
pub mod session_imports;

pub use accepted_memory::{
    append_memory_review_actions, list_accepted_memories, list_all_accepted_memories,
    list_memory_review_actions, save_accepted_memories, AcceptedMemoryRow,
    AcceptedMemoryWriteResult, MemoryReviewActionRow, MemoryReviewActionWriteResult,
};
pub use kernel::{
    append_kernel_revisions, delete_kernel_object, delete_kernel_record, get_kernel_record,
    list_kernel_objects, list_kernel_records, list_kernel_revisions, save_kernel_objects,
    save_kernel_records, search_kernel_records, KernelObjectRow, KernelRecordRow,
    KernelRevisionRow, KernelWriteResult,
};
pub use session_imports::{
    list_all_session_imports, list_session_imports, save_session_imports, SessionImportRow,
    SessionImportWriteResult,
};
pub use intake::{
    delete_intake_requests_for_session, list_all_intake_requests,
    list_intake_requests_for_project, list_intake_requests_for_session, save_intake_requests,
    IntakeRequestRow, IntakeWriteResult,
};
pub use documents::{
    delete_durable_document, get_durable_document, list_durable_documents,
    save_durable_documents, DurableDocumentRow, DurableDocumentWriteResult,
};
pub use connection::{database_path, open_database};
pub use migrations::{apply_migrations, applied_migrations, MIGRATIONS, MIGRATION_TABLE_NAME};
pub use records::{ClearAllDataResult, DatabaseStatus};
pub use repository::{clear_all_data, list_sessions, load_session_snapshot, save_session_snapshot};

#[cfg(test)]
pub use connection::open_in_memory;
