BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE OR REPLACE FUNCTION compute_card_content_hash(front TEXT, back TEXT, tags TEXT[])
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(
    digest(
      concat_ws(
        '||',
        btrim(lower(regexp_replace(coalesce(front, ''), '\s+', ' ', 'g'))),
        btrim(lower(regexp_replace(coalesce(back, ''), '\s+', ' ', 'g'))),
        coalesce(
          (
            SELECT array_to_string(
              array_agg(norm_tag ORDER BY norm_tag) FILTER (WHERE norm_tag <> ''),
              ','
            )
            FROM (
              SELECT btrim(lower(regexp_replace(tag_value, '\s+', ' ', 'g'))) AS norm_tag
              FROM unnest(coalesce(tags, ARRAY[]::TEXT[])) AS tag_value
            ) AS normalized
          ),
          ''
        )
      ),
      'sha256'
    ),
    'hex'
  );
$$;

UPDATE cards
SET content_hash = compute_card_content_hash(front, back, tags)
WHERE content_hash IS NULL;

ALTER TABLE cards
  ALTER COLUMN content_hash SET NOT NULL;

CREATE OR REPLACE FUNCTION cards_set_content_hash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.content_hash := compute_card_content_hash(NEW.front, NEW.back, NEW.tags);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cards_content_hash ON cards;
CREATE TRIGGER trg_cards_content_hash
BEFORE INSERT OR UPDATE ON cards
FOR EACH ROW
EXECUTE FUNCTION cards_set_content_hash();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'cards_owner_content_hash_key'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX cards_owner_content_hash_key ON cards (owner_id, content_hash)';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'cards_front_trgm_idx'
  ) THEN
    EXECUTE 'CREATE INDEX cards_front_trgm_idx ON cards USING GIN (lower(front) gin_trgm_ops)';
  END IF;
END;
$$;

COMMIT;
