-- A template shot is a requirement, not an unconditional AI generation order.
CREATE TABLE IF NOT EXISTS project_shot_selections (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    shot_id TEXT NOT NULL,
    shot_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('flat','detail','partial','model')),
    priority TEXT NOT NULL CHECK (priority IN ('P0','P1','P2')),
    required INTEGER NOT NULL DEFAULT 1,
    is_custom INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'selected' CHECK (status IN ('selected','fulfilled','waived')),
    source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai','asset','manual')),
    asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
    reason TEXT NOT NULL DEFAULT '',
    prompt_hints TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, item_id, shot_id)
);
CREATE INDEX IF NOT EXISTS idx_shot_selections_project
    ON project_shot_selections(project_id, status, priority);
