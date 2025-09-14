import type { CommandResponse, ConversationState } from "../commandParser.js";

/**
 * Fetch basic pull request review statistics for the configured GitHub user.
 * Only a single user is supported so we read the username (and optional token)
 * from environment variables and query GitHub's search API for the total number
 * of PRs they've reviewed.
 */
async function fetchGithubReviewStats(): Promise<string> {
  const username = process.env.GITHUB_USERNAME;
  const token = process.env.GITHUB_TOKEN;
  if (!username)
    return "GitHub username not configured. Set GITHUB_USERNAME to enable review stats.";

  const headers: Record<string, string> = { "User-Agent": "mastra-bot" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const q = `type:pr+reviewed-by:${username}`;
  const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
  const data = await res.json();
  const total = data?.total_count ?? 0;
  return `You have reviewed ${total} pull request${total === 1 ? "" : "s"} on GitHub.`;
}

export default async function handleCheckReviewsCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  try {
    const message = await fetchGithubReviewStats();
    return { response: message, parse_mode: "Markdown" };
  } catch (err) {
    logger?.error("check_reviews_error", err);
    return { response: "Couldn't load review stats", parse_mode: "Markdown" };
  }
}
