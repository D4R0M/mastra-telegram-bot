import type {
  HintPayload,
  NextCardResponse,
  SubmitPayload,
  SubmitResponse,
} from "./types";
import { getInitData } from "./telegram";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  window.location.origin;

function buildUrl(path: string, params?: Record<string, string | undefined>) {
  const url = new URL(path, API_BASE);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }
  }
  return url.toString();
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Request failed");
  }
  return (await response.json()) as T;
}

export async function fetchNextCard(
  sessionId?: string | null,
): Promise<NextCardResponse> {
  const initData = getInitData();
  if (!initData) {
    throw new Error("Missing Telegram init data");
  }

  const url = buildUrl("/api/practice/next", {
    sessionId: sessionId || undefined,
  });

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Telegram-Init-Data": initData,
    },
  });

  return handleResponse<NextCardResponse>(response);
}

export async function submitReview(
  payload: SubmitPayload,
): Promise<SubmitResponse> {
  const initData = getInitData();
  if (!initData) {
    throw new Error("Missing Telegram init data");
  }

  const response = await fetch(buildUrl("/api/practice/submit"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<SubmitResponse>(response);
}

export async function sendPracticeHint(payload: HintPayload): Promise<void> {
  const initData = getInitData();
  if (!initData) {
    throw new Error("Missing Telegram init data");
  }

  const response = await fetch(buildUrl("/api/practice/hint"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Hint failed");
  }
}
