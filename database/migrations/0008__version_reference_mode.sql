ALTER TABLE task_versions ADD COLUMN reference_mode TEXT NOT NULL DEFAULT 'original';
ALTER TABLE task_versions ADD COLUMN base_version_id TEXT REFERENCES task_versions(id) ON DELETE SET NULL;
UPDATE task_versions
SET reference_mode = 'original'
WHERE reference_mode = '';
