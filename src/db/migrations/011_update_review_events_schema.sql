BEGIN;

ALTER TABLE review_events
  ADD COLUMN IF NOT EXISTS ease_before NUMERIC,
  ADD COLUMN IF NOT EXISTS ease_after NUMERIC,
  ADD COLUMN IF NOT EXISTS reps_before INTEGER,
  ADD COLUMN IF NOT EXISTS reps_after INTEGER,
  ADD COLUMN IF NOT EXISTS interval_before INTEGER,
  ADD COLUMN IF NOT EXISTS interval_after INTEGER,
  ADD COLUMN IF NOT EXISTS client TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE review_events
  ALTER COLUMN client SET DEFAULT 'bot';

ALTER TABLE review_events
  ALTER COLUMN created_at SET DEFAULT now();

UPDATE review_events
SET
  ease_before = COALESCE(ease_before, NULLIF(sm2_before->>'ease', '')::NUMERIC),
  ease_after = COALESCE(ease_after, NULLIF(sm2_after->>'ease', '')::NUMERIC),
  reps_before = COALESCE(reps_before, NULLIF(sm2_before->>'reps', '')::INTEGER),
  reps_after = COALESCE(reps_after, NULLIF(sm2_after->>'reps', '')::INTEGER),
  interval_before = COALESCE(interval_before, NULLIF(sm2_before->>'interval', '')::INTEGER),
  interval_after = COALESCE(interval_after, NULLIF(sm2_after->>'interval', '')::INTEGER);

UPDATE review_events
SET client = 'miniapp'
WHERE client IN ('web','webapp','miniapp');

UPDATE review_events
SET client = 'bot'
WHERE client IS NULL OR client NOT IN ('miniapp','bot');

UPDATE review_events
SET created_at = COALESCE(created_at, ts, now())
WHERE created_at IS NULL;

DO $$
DECLARE
  target_schema TEXT := current_schema();
  table_exists BOOLEAN;
  column_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'review_events'
      AND n.nspname = target_schema
      AND c.relkind = 'r'
  ) INTO table_exists;

  IF NOT table_exists THEN
    RAISE NOTICE '[011_review_events] Skipping index creation: %.review_events not found (search_path=%)',
      target_schema,
      current_setting('search_path');
    RETURN;
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = target_schema
      AND table_name = 'review_events'
      AND column_name = 'created_at'
  ) INTO column_exists;

  IF NOT column_exists THEN
    RAISE NOTICE '[011_review_events] Skipping index creation: column created_at missing in %.review_events',
      target_schema;
    RETURN;
  END IF;

  RAISE NOTICE '[011_review_events] Creating indexes on %.review_events (search_path=%)',
    target_schema,
    current_setting('search_path');

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_review_events_user_hash_created_at ON %I.review_events (user_hash, created_at)', target_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_review_events_session_id ON %I.review_events (session_id)', target_schema);
END $$;

ALTER TABLE review_events
  DROP CONSTRAINT IF EXISTS review_events_client_check,
  ADD CONSTRAINT review_events_client_check CHECK (client IN ('bot', 'miniapp'));

DROP TABLE IF EXISTS ml_opt_outs CASCADE;

COMMIT;







