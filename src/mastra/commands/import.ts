import type { ConversationState, CommandResponse } from "../commandTypes.js";

export default async function handleImportCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  return {
    response:
      '📥 <b>Import Cards</b>\n\nTo import cards, send me a CSV file with the following format:\n\n<code>front,back,tags,example</code>\n\nExample:\n<code>hund,dog,"animals,pets","Min hund är snäll"</code>\n\nOr paste CSV data directly after the command:\n<code>/import csv\nfront,back\nhund,dog\nkatt,cat</code>',
    conversationState: {
      mode: "import_csv",
      step: 1,
      data: {},
    },
    parse_mode: "HTML",
  };
}
