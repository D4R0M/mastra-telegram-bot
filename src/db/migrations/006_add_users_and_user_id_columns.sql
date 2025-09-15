-- Create users table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT PRIMARY KEY,
    role TEXT DEFAULT 'user',
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    lang_code TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add nullable user_id columns for backfill in later migrations
ALTER TABLE review_events ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE review_log ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE review_state ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_id BIGINT;
