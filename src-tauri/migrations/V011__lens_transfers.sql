-- Track imported Lens connector transfers.
--
-- Each row records one Lens learning item that has been imported into
-- kernel_records. The transfer_id is the UUID Lens generated when it
-- wrote the file; it is the idempotency key that prevents duplicate
-- imports when the user sends the same item twice.

CREATE TABLE IF NOT EXISTS lens_transfers (
  transfer_id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
