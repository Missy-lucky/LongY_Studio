-- Preserve per-shot prompt choice before the first generation request.
ALTER TABLE project_shot_selections
ADD COLUMN prompt_mode TEXT NOT NULL DEFAULT 'default'
CHECK (prompt_mode IN ('default','custom'));

ALTER TABLE project_shot_selections
ADD COLUMN custom_prompt TEXT NOT NULL DEFAULT '';
