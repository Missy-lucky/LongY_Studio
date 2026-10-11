-- Persist perceptual QC on every generated version.
ALTER TABLE task_versions ADD COLUMN qc_score REAL;
ALTER TABLE task_versions ADD COLUMN qc_passed INTEGER;
ALTER TABLE task_versions ADD COLUMN qc_report_path TEXT;
CREATE INDEX IF NOT EXISTS idx_task_versions_qc ON task_versions(qc_passed, created_at);
