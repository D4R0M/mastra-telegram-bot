export type ReviewMode = 'telegram_inline' | 'webapp_practice';
export type ReviewAction = 'presented' | 'answered' | 'graded' | 'hint_shown';

export interface Sm2Snapshot {
  interval: number;
  ease: number;
  reps: number;
  due_at?: string | null;
}

export interface ReviewEvent {
  ts?: Date;
  mode: ReviewMode;
  action: ReviewAction;
  session_id: string;
  attempt?: number | null;
  hint_count?: number | null;
  latency_ms?: number | null;
  user_hash: string;
  card_id: string;
  deck_id?: string | null;
  grade?: number | null;
  is_correct?: boolean | null;
  answer_text?: string | null;
  sm2_before?: Sm2Snapshot | null;
  sm2_after?: Sm2Snapshot | null;
  ease_before?: number | null;
  ease_after?: number | null;
  reps_before?: number | null;
  reps_after?: number | null;
  interval_before?: number | null;
  interval_after?: number | null;
  client?: string | null;
  app_version?: string | null;
  source?: string | null;
}

export interface MlDailyAggregate {
  day: string;
  mode: ReviewMode;
  events: number;
  unique_users: number;
  accuracy: number | null;
}

export interface Ml24hTotals {
  mode: ReviewMode;
  events: number;
  graded: number;
  accuracy: number | null;
}
