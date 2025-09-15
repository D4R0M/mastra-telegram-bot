CREATE TABLE IF NOT EXISTS user_whitelist(
    user_id BIGINT PRIMARY KEY,
    username TEXT,
    role TEXT DEFAULT 'user',
    added_at TIMESTAMPTZ DEFAULT now(),
    added_by BIGINT,
    note TEXT
);
