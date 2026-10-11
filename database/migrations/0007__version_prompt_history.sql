ALTER TABLE task_versions ADD COLUMN prompt TEXT NOT NULL DEFAULT '';
ALTER TABLE task_versions ADD COLUMN negative_prompt TEXT NOT NULL DEFAULT '';
UPDATE task_versions
SET prompt = tasks.prompt,
    negative_prompt = tasks.negative_prompt
FROM tasks
WHERE task_versions.task_id = tasks.id
  AND task_versions.id = tasks.current_version_id
  AND task_versions.prompt = '';
