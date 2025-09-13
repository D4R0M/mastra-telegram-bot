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

export function formatStatistics(stats: any): string {
  const lines = [
    "📊 <b>Your Learning Statistics</b>\n",
    `Total Cards: ${stats.total_cards}`,
    `Cards Due Today: ${stats.cards_due_today}`,
    `New Cards: ${stats.new_cards}`,
    `Average Ease: ${stats.average_ease?.toFixed(2) || "N/A"}`,
    `Retention Rate: ${stats.retention_rate ? (stats.retention_rate * 100).toFixed(1) + "%" : "N/A"}`,
    `Current Streak: ${stats.current_streak || 0} days`,
    `Longest Streak: ${stats.longest_streak || 0} days`,
  ];

  return lines.join("\n");
}
