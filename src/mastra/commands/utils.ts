export function formatCard(card: any, showId: boolean = false): string {
  let result = `<b>${card.front}</b> → ${card.back}`;
  if (showId) {
    result = `[${card.id}] ${result}`;
  }
  if (card.tags && card.tags.length > 0) {
    result += `\n<i>Tags: ${card.tags.join(", ")}</i>`;
  }
  if (card.example) {
    result += `\n<i>Example: ${card.example}</i>`;
  }
  return result;
}

function safeNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function formatStatistics(stats: any): string {
  const due = stats?.due_cards ?? {};
  const retention = stats?.retention ?? {};
  const streaks = stats?.streaks ?? {};

  const totalCards = safeNum(due.total_cards);
  const cardsDueToday = safeNum(due.cards_due_today);
  const newCards = safeNum(due.new_cards);
  const avgEase =
    due.average_ease != null && Number.isFinite(Number(due.average_ease))
      ? Number(due.average_ease)
      : null;

  const retentionRate =
    retention.retention_rate != null &&
    Number.isFinite(Number(retention.retention_rate))
      ? Number(retention.retention_rate)
      : null;
  const retentionDisplay =
    retentionRate !== null
      ? `${Math.round(Math.max(0, Math.min(100, retentionRate)))}%`
      : "N/A";

  const currentStreak = safeNum(streaks.current_streak);
  const longestStreak = safeNum(streaks.longest_streak);

  const lines = [
    "📊 <b>Your Learning Statistics</b>\n",
    `Total Cards: ${totalCards}`,
    `Cards Due Today: ${cardsDueToday}`,
    `New Cards: ${newCards}`,
    `Average Ease: ${avgEase !== null ? avgEase.toFixed(2) : "N/A"}`,
    `Retention Rate: ${retentionDisplay}`,
    `Current Streak: ${currentStreak} days`,
    `Longest Streak: ${longestStreak} days`,
  ];

  return lines.join("\n");
}
