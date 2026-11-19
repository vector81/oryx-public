CREATE TABLE IF NOT EXISTS ai_sort (
 transaction_id TEXT PRIMARY KEY REFERENCES transactions(id),
 category_id TEXT, probability REAL NOT NULL DEFAULT 0, clarity REAL NOT NULL DEFAULT 0,
 status TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
 policy TEXT NOT NULL, run_id TEXT NOT NULL, previous_category TEXT, previous_reviewed INTEGER,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_sort_status ON ai_sort(status);
