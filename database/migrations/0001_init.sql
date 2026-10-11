CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, sku TEXT NOT NULL, name TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT '', style TEXT NOT NULL DEFAULT '',
    budget REAL NOT NULL DEFAULT 0 CHECK (budget >= 0),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_sku ON projects(sku);
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, body_zone TEXT NOT NULL,
    layer_order INTEGER NOT NULL DEFAULT 20, required_views TEXT NOT NULL DEFAULT '[]',
    default_detail_tasks TEXT NOT NULL DEFAULT '[]', default_partial_tasks TEXT NOT NULL DEFAULT '[]',
    model_prompt_hints TEXT NOT NULL DEFAULT '', negative_hints TEXT NOT NULL DEFAULT '',
    is_sellable_default INTEGER NOT NULL DEFAULT 1, builtin INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reference_specs (
    id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('flat','detail','partial','model')),
    name TEXT NOT NULL, composition TEXT NOT NULL DEFAULT '', background TEXT NOT NULL DEFAULT '',
    lighting TEXT NOT NULL DEFAULT '', ratio TEXT NOT NULL DEFAULT '1:1',
    applicable_categories TEXT NOT NULL DEFAULT '["*"]', is_default INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, pose TEXT NOT NULL DEFAULT '',
    styles TEXT NOT NULL DEFAULT '[]', skin_tone TEXT NOT NULL DEFAULT '', hair TEXT NOT NULL DEFAULT '',
    reference_path TEXT, license_note TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1,
    version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL, category_id TEXT NOT NULL REFERENCES categories(id),
    color_material TEXT NOT NULL DEFAULT '', selling_points TEXT NOT NULL DEFAULT '',
    is_sellable INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_project ON items(project_id, category_id);
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    view_slot TEXT, file_path TEXT NOT NULL, hash TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0, width INTEGER NOT NULL DEFAULT 0, height INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, UNIQUE(project_id, hash)
);
CREATE INDEX IF NOT EXISTS idx_assets_item ON assets(item_id);
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
    model_id TEXT REFERENCES models(id) ON DELETE SET NULL,
    code TEXT NOT NULL, name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('flat','detail','partial','model')),
    tier TEXT NOT NULL DEFAULT 'draft' CHECK (tier IN ('draft','hd')),
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','cached','queued','generating','review','accepted','rejected','failed','locked','exported')),
    provider TEXT NOT NULL, prompt TEXT NOT NULL DEFAULT '', negative_prompt TEXT NOT NULL DEFAULT '',
    cache_key TEXT, estimated_cost REAL NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
    cache_hit INTEGER NOT NULL DEFAULT 0, idempotency_key TEXT UNIQUE,
    current_version_id TEXT, queue_index INTEGER, retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, code)
);
CREATE INDEX IF NOT EXISTS idx_tasks_queue ON tasks(project_id, status, queue_index);
CREATE TABLE IF NOT EXISTS task_versions (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    version INTEGER NOT NULL, tier TEXT NOT NULL CHECK (tier IN ('draft','hd')),
    status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating','review','accepted','rejected','locked','exported','failed')),
    reason TEXT, note TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL,
    cost REAL NOT NULL DEFAULT 0 CHECK (cost >= 0), duration_ms INTEGER, file_path TEXT,
    error_code TEXT, error_message TEXT, created_at TEXT NOT NULL, UNIQUE(task_id, version)
);
CREATE TABLE IF NOT EXISTS provider_calls (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    version_id TEXT REFERENCES task_versions(id) ON DELETE SET NULL, provider TEXT NOT NULL,
    idempotency_key TEXT NOT NULL, request_digest TEXT NOT NULL, status TEXT NOT NULL,
    cost REAL NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0,
    error_code TEXT, created_at TEXT NOT NULL, UNIQUE(provider, idempotency_key)
);
CREATE TABLE IF NOT EXISTS cache_entries (
    cache_key TEXT PRIMARY KEY, provider TEXT NOT NULL, file_path TEXT NOT NULL,
    cost REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_used_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cost_events (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL, kind TEXT NOT NULL,
    provider TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'CNY',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_events_project ON cost_events(project_id, created_at);
CREATE TABLE IF NOT EXISTS export_batches (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    target_dir TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'completed', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS export_files (
    id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES export_batches(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    source_version_id TEXT REFERENCES task_versions(id) ON DELETE SET NULL,
    file_path TEXT NOT NULL, original_name TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT NOT NULL,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, task_id TEXT,
    type TEXT NOT NULL, message TEXT NOT NULL, payload TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id, id DESC);
