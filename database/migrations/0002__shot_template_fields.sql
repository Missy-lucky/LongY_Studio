-- Shot-template planning needs item attributes and per-task shot provenance.
ALTER TABLE items ADD COLUMN attributes_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN shot_id TEXT;
ALTER TABLE tasks ADD COLUMN shot_name TEXT;
ALTER TABLE tasks ADD COLUMN priority TEXT;
CREATE INDEX idx_tasks_project_shot ON tasks(project_id, item_id, shot_id);
