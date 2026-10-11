-- Keep original images used to fulfill shot requirements in export archives.
CREATE TABLE IF NOT EXISTS export_asset_files (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES export_batches(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    shot_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_export_asset_files_batch
    ON export_asset_files(batch_id, created_at);
