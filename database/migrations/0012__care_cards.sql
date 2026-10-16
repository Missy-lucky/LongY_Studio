CREATE TABLE IF NOT EXISTS care_cards (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
    brand TEXT NOT NULL DEFAULT '',
    product_name TEXT NOT NULL DEFAULT '',
    data_json TEXT NOT NULL,
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_care_cards_project
    ON care_cards(project_id, updated_at DESC);
