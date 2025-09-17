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
    new_repetitions INTEGER
);

ALTER TABLE review_events
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE review_events
  ALTER COLUMN created_at SET DEFAULT now();

UPDATE review_events
SET created_at = COALESCE(created_at, now());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname = 'idx_review_events_user_hash_created_at'
  ) THEN
    EXECUTE 'CREATE INDEX idx_review_events_user_hash_created_at ON review_events(user_hash, created_at)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname = 'idx_review_events_session_id'
  ) THEN
    EXECUTE 'CREATE INDEX idx_review_events_session_id ON review_events(session_id)';
  END IF;
END $$;
