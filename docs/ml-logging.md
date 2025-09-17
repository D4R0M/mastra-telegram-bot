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
- `client`, `app_version`, `source`: diagnostics for the client build and feature toggles.

Indexes exist on `(ts)`, `(user_hash, ts)` and `(mode, ts)` for analytics workloads.

A complementary table `ml_opt_outs` records user opt-outs and is automatically updated by the `/optout_ml` and `/optin_ml` commands as well as the web app toggle.

## Privacy

- Hashing uses `SHA-256(ML_HASH_SALT + user_id)` and never stores raw identifiers.
- `ML_HASH_SALT` **must** be configured in the environment for logging to succeed.
- Global logging can be paused by setting `ML_LOGGING_ENABLED=false` (the helper checks this flag for every event).
- Users can manage their preference via `/privacy`, `/optout_ml`, `/optin_ml`, or the toggle shown in the web app header.
- Opt-outs are respected across all clients; when logging is disabled or a user has opted out, events are silently discarded.

## Instrumentation overview

- Telegram inline practice emits the full sequence of `presented ? hint_shown ? answered ? graded` events through `logReviewEvent` in `src/lib/mlLogger.ts`.
- The web app practice endpoints (`/api/practice/next`, `/api/practice/hint`, `/api/practice/submit`) call the same helper and keep counts in sync with the client.
- `submitReviewTool` receives `mode`, `attempt`, `hint_count`, and SM-2 snapshots so the `graded` event is consistent across clients.

## Diagnostics

- `/check_ml_log` returns a JSON summary containing last-24h totals, the most recent event, the global logging flag, and opt-out counts.
- `scripts/print-ml-stats.ts` prints rollups from the last 24 hours and the `review_events_last_7d` view for ad-hoc CLI checks.

## Testing

The Vitest suite contains dedicated tests under `tests/` verifying hashing, migrations, and both practice flows. Run `npm run test` (or `npm test`) to execute the suite after applying database migrations.
