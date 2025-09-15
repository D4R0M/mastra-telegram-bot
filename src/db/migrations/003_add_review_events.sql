-- Table for hashed review events logging
CREATE TABLE IF NOT EXISTS review_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_hash TEXT NOT NULL,
    session_id TEXT,
    card_id UUID REFERENCES cards(id) ON DELETE CASCADE,
    grade SMALLINT,
    latency_ms INTEGER,
    was_overdue BOOLEAN,
    prev_ease REAL,
    new_ease REAL,
    prev_interval_days INTEGER,
    new_interval_days INTEGER,
    prev_repetitions INTEGER,
    new_repetitions INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_events_user_hash_created_at ON review_events(user_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_review_events_session_id ON review_events(session_id);
