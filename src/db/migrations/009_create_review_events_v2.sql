BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'review_events_legacy'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'review_events'
  ) THEN
    EXECUTE 'ALTER TABLE review_events RENAME TO review_events_legacy';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS review_events (
  id              BIGSERIAL PRIMARY KEY,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
  mode            TEXT NOT NULL CHECK (mode IN ('telegram_inline','webapp_practice')),
  action          TEXT NOT NULL CHECK (action IN ('presented','answered','graded','hint_shown')),
  session_id      TEXT NOT NULL,
  attempt         INTEGER CHECK (attempt IS NULL OR attempt >= 0),
  hint_count      INTEGER CHECK (hint_count IS NULL OR hint_count >= 0),
  latency_ms      INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  user_hash       TEXT NOT NULL,
  card_id         TEXT NOT NULL,
  deck_id         TEXT,
  grade           INTEGER CHECK (grade IS NULL OR (grade >= 0 AND grade <= 5)),
  is_correct      BOOLEAN,
  answer_text     TEXT,
  sm2_before      JSONB,
  sm2_after       JSONB,
  ease_before     NUMERIC,
  ease_after      NUMERIC,
  reps_before     INTEGER,
  reps_after      INTEGER,
  interval_before INTEGER,
  interval_after  INTEGER,
  client          TEXT DEFAULT 'bot',
  app_version     TEXT,
  source          TEXT
);

CREATE INDEX IF NOT EXISTS idx_review_events_ts ON review_events (ts);
CREATE INDEX IF NOT EXISTS idx_review_events_user_ts ON review_events (user_hash, ts DESC);
CREATE INDEX IF NOT EXISTS idx_review_events_mode_ts ON review_events (mode, ts DESC);

CREATE TABLE IF NOT EXISTS ml_opt_outs (
  user_hash    TEXT PRIMARY KEY,
  opted_out_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason       TEXT
);

COMMIT;
