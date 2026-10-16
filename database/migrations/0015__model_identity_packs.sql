-- Explicit authorization and multi-angle identity references for project-owned models.
ALTER TABLE models ADD COLUMN rights_basis TEXT;
ALTER TABLE models ADD COLUMN rights_note TEXT NOT NULL DEFAULT '';
ALTER TABLE models ADD COLUMN rights_confirmed_at TEXT;

CREATE TABLE IF NOT EXISTS model_references (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    angle TEXT NOT NULL CHECK (angle IN (
        'front','three-quarter-left','three-quarter-right','profile-left','profile-right','back','face-detail'
    )),
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    hash TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(model_id, angle),
    UNIQUE(model_id, hash)
);
CREATE INDEX IF NOT EXISTS idx_model_references_model
    ON model_references(model_id, is_primary DESC, created_at, id);
