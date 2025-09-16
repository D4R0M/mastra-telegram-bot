export type Quality = "again" | "hard" | "good" | "easy";

export interface PracticeCard {
  id: string;
  front: string;
  back: string;
  example?: string;
  tags: string[];
  langFront: string;
  langBack: string;
  queue: string;
  repetitions: number;
  easeFactor: number;
  lapses: number;
}

export interface NextCardResponse {
  sessionId: string;
  card?: PracticeCard;
  startTime?: number;
  dueCount?: number;
  serverTime?: number;
  done?: boolean;
  user?: {
    id: string;
    username?: string;
    firstName?: string;
  };
}

export interface SubmitReviewResult {
  grade: number;
  previous_ease: number;
  new_ease: number;
  previous_interval: number;
  new_interval: number;
  previous_repetitions: number;
  new_repetitions: number;
  due_date: string;
  latency_ms: number;
}

export interface SubmitResponse {
  remainingDue: number;
  cardId: string;
  review?: SubmitReviewResult;
}

export interface SubmitPayload {
  sessionId?: string;
  cardId: string;
  quality: Quality;
  elapsedMs: number;
  clientTs: number;
}

export interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  [key: string]: string | undefined;
}

export interface TelegramWebAppMainButton {
  setParams(params: {
    text?: string;
    color?: string;
    text_color?: string;
    is_active?: boolean;
    is_visible?: boolean;
  }): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
  show(): void;
  hide(): void;
}

export interface TelegramWebAppBackButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

export interface TelegramWebApp {
  initData: string;
  colorScheme?: string;
  themeParams?: TelegramThemeParams;
  ready(): void;
  expand(): void;
  close(): void;
  onEvent?(event: string, handler: () => void): void;
  offEvent?(event: string, handler: () => void): void;
  MainButton: TelegramWebAppMainButton;
  BackButton: TelegramWebAppBackButton;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}
