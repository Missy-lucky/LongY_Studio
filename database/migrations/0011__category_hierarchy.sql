-- Persist the first-level group and stable parent identifier for every leaf category.
ALTER TABLE categories ADD COLUMN group_name TEXT NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN parent_category_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_categories_hierarchy
    ON categories(parent_category_id, layer_order, name);
