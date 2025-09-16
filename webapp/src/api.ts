import type { NextCardResponse, SubmitPayload, SubmitResponse } from "./types";

export async function api(path: string, init: RequestInit = {}) {
  const tg = window.Telegram?.WebApp;
  const headers = new Headers(init.headers || {});
  if (tg?.initData) {
    headers.set("X-Telegram-Init-Data", tg.initData);
  }

  return fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: "omit",
  });
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
  const params = new URLSearchParams();
  if (sessionId) {
    params.set("sessionId", sessionId);
  }

  const response = await api(
    `/practice/next${params.size ? `?${params.toString()}` : ""}`,
  );

  return handleResponse<NextCardResponse>(response);
}

export async function submitReview(
  payload: SubmitPayload,
): Promise<SubmitResponse> {
  const response = await api("/practice/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<SubmitResponse>(response);
}
