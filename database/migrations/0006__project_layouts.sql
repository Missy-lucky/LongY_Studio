-- A project owns its canvas layout. The graph still derives from SQLite facts;
-- this JSON only stores deterministic presentation coordinates.
ALTER TABLE projects ADD COLUMN layout_json TEXT;
