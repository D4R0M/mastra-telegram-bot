export type ParseReminderTimesResult =
  | { success: true; times: string[] }
  | { success: false; error: string };

function formatTwoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}

function normalizeTimeToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(":");

  if (parts.length === 1) {
    if (!/^\d+$/.test(parts[0])) {
      return null;
    }
    const hours = Number(parts[0]);
    if (!Number.isInteger(hours) || hours < 0 || hours > 23) {
      return null;
    }
    return `${formatTwoDigits(hours)}:00`;
  }

  if (parts.length === 2) {
    const [hoursPart, minutesPart] = parts;
    if (!/^\d+$/.test(hoursPart) || !/^\d+$/.test(minutesPart)) {
      return null;
    }

    const hours = Number(hoursPart);
    const minutes = Number(minutesPart);

    if (
      !Number.isInteger(hours) ||
      hours < 0 ||
      hours > 23 ||
      !Number.isInteger(minutes) ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }

    return `${formatTwoDigits(hours)}:${formatTwoDigits(minutes)}`;
  }

  return null;
}

export function parseReminderTimesInput(rawInput: string): ParseReminderTimesResult {
  const tokens = rawInput
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return {
      success: false,
      error: "Please provide at least one reminder hour (e.g., 9, 13:30).",
    };
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const token of tokens) {
    const normalizedToken = normalizeTimeToken(token);
    if (!normalizedToken) {
      return {
        success: false,
        error: `Invalid time entry: ${token}. Use HH or HH:MM format between 0-23 hours.`,
      };
    }

    if (!seen.has(normalizedToken)) {
      seen.add(normalizedToken);
      normalized.push(normalizedToken);
    }
  }

  return {
    success: true,
    times: normalized,
  };
}
