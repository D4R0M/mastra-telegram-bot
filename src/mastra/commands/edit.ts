import type { ConversationState, CommandResponse } from "../commandTypes.js";

export default async function handleEditCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  if (params.length === 0) {
    return {
      response:
        "❓ Please specify the card ID to edit:\n<code>/edit [card_id]</code>\n\nUse <code>/list</code> to see card IDs.",
      parse_mode: "HTML",
    };
  }

  const cardId = params[0];

  // If only card ID provided, start edit flow
  if (params.length === 1) {
    return {
      response: `📝 <b>Editing card ${cardId}</b>\n\nWhat would you like to edit?\n1. Front side\n2. Back side\n3. Tags\n4. Example\n\nReply with the number or type the new value directly:\n<code>front: new text</code>\n<code>back: new text</code>\n<code>tags: tag1, tag2</code>\n<code>example: new example</code>`,
      conversationState: {
        mode: "edit_card",
        step: 1,
        data: { card_id: cardId },
      },
      parse_mode: "HTML",
    };
  }

  return {
    response:
      "❓ To edit a card:\n<code>/edit [card_id]</code> - start edit flow\n<code>/edit [card_id] front: new text</code>\n<code>/edit [card_id] back: new text</code>",
    parse_mode: "HTML",
  };
}
