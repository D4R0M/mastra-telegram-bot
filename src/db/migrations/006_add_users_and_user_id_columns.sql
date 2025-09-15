-- Create users table and user_id columns
CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT PRIMARY KEY,
    role TEXT DEFAULT 'user',
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    lang_code TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add user_id columns (nullable for backfill)
ALTER TABLE review_events ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE review_log ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE review_state ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_id BIGINT;

-- Foreign keys to users
ALTER TABLE review_events
    ADD CONSTRAINT IF NOT EXISTS fk_review_events_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
ALTER TABLE review_log
    ADD CONSTRAINT IF NOT EXISTS fk_review_log_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
ALTER TABLE review_state
    ADD CONSTRAINT IF NOT EXISTS fk_review_state_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
ALTER TABLE reviews
    ADD CONSTRAINT IF NOT EXISTS fk_reviews_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

-- Indexes for new user_id columns
CREATE INDEX IF NOT EXISTS idx_review_events_user_id_created_at ON review_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_log_user_id_reviewed_at ON review_log(user_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_state_user_id ON review_state(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);

-- Backfill user table and user_id columns from card ownership
INSERT INTO users (user_id)
SELECT DISTINCT owner_id::BIGINT FROM cards
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
