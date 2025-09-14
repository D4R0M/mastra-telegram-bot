-- Reviews table for detailed review logging
CREATE TABLE IF NOT EXISTS reviews (
    review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    ts_shown TIMESTAMPTZ NOT NULL,
    ts_answered TIMESTAMPTZ NOT NULL,
    grade SMALLINT NOT NULL CHECK (grade BETWEEN 0 AND 5),
    scheduled_at TIMESTAMPTZ NOT NULL,
    prev_review_at TIMESTAMPTZ,
    prev_interval_days INTEGER,
    due_interval_days INTEGER,
    was_overdue BOOLEAN,
    ease_factor REAL,
    repetition INTEGER,
    lapses INTEGER,
    is_new BOOLEAN,
    answer_latency_ms INTEGER,
    session_id TEXT,
    position_in_session INTEGER,
    time_of_day_bucket TEXT,
    weekday INTEGER
);

CREATE INDEX IF NOT EXISTS idx_reviews_card_id ON reviews(card_id);
CREATE INDEX IF NOT EXISTS idx_reviews_ts_answered ON reviews(ts_answered);
