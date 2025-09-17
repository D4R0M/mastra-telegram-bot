# ML Review Logging

This system records anonymised review events for both the Telegram inline practice flow and the web app practice mode. Events are appended to the `review_events` table and can be queried via the `review_events_last_7d` view or the helper functions in `src/db/reviewEvents.ts`.

## Schema

`review_events` contains the following relevant columns:

- `ts`: UTC timestamp when the event was logged (default `now()`).
- `mode`: `telegram_inline` or `webapp_practice`.
- `action`: one of `presented`, `answered`, `graded`, `hint_shown`.
- `session_id`: opaque identifier for the session.
- `attempt` / `hint_count`: attempt number in the session and total hints shown.
- `latency_ms`: latency associated with the action.
- `user_hash`: SHA-256 hash of the user id salted with `ML_HASH_SALT`.
- `card_id` / `deck_id`: identifiers for the reviewed card.
- `grade`, `is_correct`, `answer_text`: grading metadata (answer text is truncated to 256 chars).
- `sm2_before` / `sm2_after`: snapshot of the SM-2 state before and after grading.
- `ease_before` / `ease_after`: numeric ease values derived from the SM-2 snapshots.
- `reps_before` / `reps_after`: repetition counts derived from the SM-2 snapshots.
- `interval_before` / `interval_after`: review intervals (in days) from SM-2 snapshots.
- `client`: `bot` or `miniapp` depending on the channel that emitted the event.
- `source`, `app_version`: diagnostics for the client build and feature toggles.

Indexes exist on `(ts)`, `(user_hash, ts)` and `(mode, ts)` for analytics workloads.

## Privacy

- Hashing uses `SHA-256(user_id + ML_HASH_SALT)` and never stores raw identifiers.
- `ML_HASH_SALT` **must** be configured in the environment for logging to succeed.
- Logging can be paused globally by setting `ML_LOGGING_ENABLED=false`; there is no per-user opt out. When disabled, events are skipped entirely.

## Instrumentation overview

- Telegram inline practice emits the full sequence of `presented ? hint_shown ? answered ? graded` events through `logReviewEvent` in `src/lib/mlLogger.ts`.
- The web app practice endpoints (`/api/practice/next`, `/api/practice/hint`, `/api/practice/submit`) call the same helper and keep counts in sync with the client.
- `submitReviewTool` receives SM-2 snapshots so the `graded` event can capture before/after metrics (`ease_*`, `reps_*`, `interval_*`).

## Diagnostics

- `/check_ml_log` returns a JSON summary containing the environment flag (`envEnabled`), the timestamp of the latest event (`lastEventTs`), and an optional `totalEventsForUser` field when `user:<id>` is supplied.
- `scripts/print-ml-stats.ts` prints rollups from the last 24 hours and the `review_events_last_7d` view for ad-hoc CLI checks.

## Testing

The Vitest suite contains dedicated tests under `tests/` verifying hashing, migrations, and both practice flows. Run `npm run test` (or `npm test`) to execute the suite after applying database migrations.
