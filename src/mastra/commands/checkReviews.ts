import type { CommandResponse, ConversationState } from "../commandTypes.js";

export default async function handleCheckReviewsCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const username = process.env.GITHUB_USERNAME;

  if (!username) {
    return {
      response: "❌ GitHub username not configured. Please set the GITHUB_USERNAME environment variable.",
      parse_mode: "HTML",
      conversationState: undefined,
    };
  }

  return {
    response: `Checking GitHub reviews for <b>${username}</b> is not yet implemented.`,
    parse_mode: "HTML",
    conversationState: undefined,
  };
}

