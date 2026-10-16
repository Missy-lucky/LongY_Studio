-- User-confirmed garment structure facts constrain prompts and human QC.
ALTER TABLE items ADD COLUMN structure_json TEXT NOT NULL DEFAULT '{}';
