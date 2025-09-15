-- Backfill user table and user_id columns from existing card ownership data
INSERT INTO users (user_id)
SELECT DISTINCT owner_id::BIGINT
FROM cards
WHERE owner_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

UPDATE review_state rs
SET user_id = c.owner_id::BIGINT
FROM cards c
WHERE rs.card_id = c.id AND rs.user_id IS NULL;

UPDATE review_log rl
SET user_id = c.owner_id::BIGINT
FROM cards c
WHERE rl.card_id = c.id AND rl.user_id IS NULL;

UPDATE reviews r
SET user_id = c.owner_id::BIGINT
FROM cards c
WHERE r.card_id = c.id AND r.user_id IS NULL;

UPDATE review_events re
SET user_id = c.owner_id::BIGINT
FROM cards c
WHERE re.card_id = c.id AND re.user_id IS NULL;

-- Enforce non-nullability now that backfill is complete
ALTER TABLE review_events ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE review_log ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE review_state ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE reviews ALTER COLUMN user_id SET NOT NULL;

-- Indexes for querying by user
CREATE INDEX IF NOT EXISTS idx_review_events_user_id_created_at ON review_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_log_user_id_reviewed_at ON review_log(user_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_state_user_id ON review_state(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);

-- Add foreign key constraints to ensure referential integrity
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_review_events_user'
          AND conrelid = 'review_events'::regclass
    ) THEN
        ALTER TABLE review_events
            ADD CONSTRAINT fk_review_events_user
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_review_log_user'
          AND conrelid = 'review_log'::regclass
    ) THEN
        ALTER TABLE review_log
            ADD CONSTRAINT fk_review_log_user
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_review_state_user'
          AND conrelid = 'review_state'::regclass
    ) THEN
        ALTER TABLE review_state
            ADD CONSTRAINT fk_review_state_user
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_reviews_user'
          AND conrelid = 'reviews'::regclass
    ) THEN
        ALTER TABLE reviews
            ADD CONSTRAINT fk_reviews_user
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
    END IF;
END $$;
