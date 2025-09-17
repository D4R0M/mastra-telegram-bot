CREATE OR REPLACE VIEW review_events_last_7d AS
SELECT
  date_trunc('day', ts) AS day,
  mode,
  COUNT(*) AS events,
  COUNT(DISTINCT user_hash) AS unique_users,
  AVG(
    CASE 
      WHEN action = 'graded' THEN 
        CASE WHEN is_correct THEN 1 ELSE 0 END 
    END
  )::DOUBLE PRECISION AS accuracy
FROM review_events
WHERE ts >= now() - INTERVAL '7 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;
