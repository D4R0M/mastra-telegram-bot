-- Enforce NOT NULL on user_id columns after backfill
ALTER TABLE review_events ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE review_log ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE review_state ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE reviews ALTER COLUMN user_id SET NOT NULL;
