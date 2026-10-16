-- Project-owned custom models and role-labelled generation references.
ALTER TABLE models ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE models ADD COLUMN source TEXT NOT NULL DEFAULT 'builtin';
ALTER TABLE models ADD COLUMN reference_hash TEXT;
ALTER TABLE models ADD COLUMN created_at TEXT;
ALTER TABLE projects ADD COLUMN selected_model_id TEXT REFERENCES models(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_models_project ON models(project_id, enabled);

CREATE TABLE IF NOT EXISTS project_references (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('pose','style','detail')),
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    hash TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(project_id, role, hash)
);
CREATE INDEX IF NOT EXISTS idx_project_references_role
    ON project_references(project_id, role, created_at);
