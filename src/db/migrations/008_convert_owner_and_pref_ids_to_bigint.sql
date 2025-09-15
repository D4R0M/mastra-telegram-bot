BEGIN;

-- Drop indexes that depend on the old TEXT type
DROP INDEX IF EXISTS idx_cards_owner_id;

-- Convert owner_id on cards to BIGINT
ALTER TABLE cards
    ALTER COLUMN owner_id TYPE BIGINT
    USING owner_id::BIGINT;

-- Convert user_id on prefs to BIGINT
ALTER TABLE prefs
    ALTER COLUMN user_id TYPE BIGINT
    USING user_id::BIGINT;

-- Recreate indexes with the new type
CREATE INDEX IF NOT EXISTS idx_cards_owner_id ON cards(owner_id);

COMMIT;
