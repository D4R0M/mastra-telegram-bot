-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Cards table for vocabulary storage
CREATE TABLE IF NOT EXISTS cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id TEXT NOT NULL,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    example TEXT,
    lang_front TEXT DEFAULT 'sv',
    lang_back TEXT DEFAULT 'en',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Review state for SM-2 algorithm
CREATE TABLE IF NOT EXISTS review_state (
    card_id UUID PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
    interval_days INTEGER DEFAULT 0,
    repetitions INTEGER DEFAULT 0,
    ease_factor REAL DEFAULT 2.5,
    due_date DATE DEFAULT current_date,
    last_reviewed_at TIMESTAMPTZ,
    last_grade SMALLINT,
    lapses INTEGER DEFAULT 0,
    queue TEXT CHECK (queue IN ('new', 'learning', 'review')) DEFAULT 'new',
    direction_mode TEXT DEFAULT 'front_to_back'
);

-- Review log for tracking learning history
CREATE TABLE IF NOT EXISTS review_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    reviewed_at TIMESTAMPTZ DEFAULT now(),
    grade SMALLINT NOT NULL CHECK (grade BETWEEN 0 AND 5),
    prev_ease REAL,
    new_ease REAL,
    prev_interval INTEGER,
    new_interval INTEGER,
    prev_repetitions INTEGER,
    new_repetitions INTEGER,
    prev_due DATE,
    new_due DATE,
    latency_ms INTEGER,
    session_id TEXT,
    direction TEXT DEFAULT 'front_to_back'
);

-- User preferences table
CREATE TABLE IF NOT EXISTS prefs (
    user_id TEXT PRIMARY KEY,
    chat_id TEXT UNIQUE NOT NULL,
    timezone TEXT DEFAULT 'Europe/Stockholm',
    dnd_start TIME DEFAULT '21:00',
    dnd_end TIME DEFAULT '08:00',
    daily_new_limit INTEGER DEFAULT 20,
    daily_review_limit INTEGER DEFAULT 200,
    session_size INTEGER DEFAULT 10,
    reminders_enabled BOOLEAN DEFAULT true,
    reminder_times TIME[] DEFAULT '{}',
    algorithm TEXT DEFAULT 'sm2',
    locale TEXT DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cards_owner_id ON cards(owner_id);
CREATE INDEX IF NOT EXISTS idx_cards_active ON cards(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_cards_tags_gin ON cards USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_review_state_due_date ON review_state(due_date);
CREATE INDEX IF NOT EXISTS idx_review_state_due_queue ON review_state(due_date, queue);

CREATE INDEX IF NOT EXISTS idx_review_log_card_id ON review_log(card_id);
CREATE INDEX IF NOT EXISTS idx_review_log_reviewed_at ON review_log(reviewed_at);
CREATE INDEX IF NOT EXISTS idx_review_log_session_id ON review_log(session_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
-- Drop existing triggers first to handle re-running migrations
DROP TRIGGER IF EXISTS update_cards_updated_at ON cards;
DROP TRIGGER IF EXISTS update_prefs_updated_at ON prefs;

CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prefs_updated_at BEFORE UPDATE ON prefs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();