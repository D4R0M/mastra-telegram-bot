import type { CommandResponse, ConversationState } from "../commandParser.js";

export default async function handleCheckReviewsCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const username = process.env.GITHUB_USERNAME;
  if (!username) {
    return { response: "❌ GitHub username not configured", parse_mode: "HTML" };
  }
  return {
    response: `🔍 Checking PR reviews for ${username}...`,
    parse_mode: "HTML",
  };
}
