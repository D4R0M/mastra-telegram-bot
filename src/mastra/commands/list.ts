import type { CommandResponse, ConversationState } from "../commandParser.js";
import { buildToolExecCtx } from "../context.js";
import { listCardsTool } from "../tools/vocabularyTools.js";
import { formatCardListItem } from "./utils.js";

export default async function handleListCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any,
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();

  try {
    // Parse pagination and sorting
    const limit = params.length > 0 ? parseInt(params[0]) : 20;
    const offset = state?.data?.offset ?? 0;
    const sort = state?.data?.sort ?? "date";

    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
      requestId: userId,
    });
    const result = await listCardsTool.execute({
      context: {
        owner_id: userId,
        limit: isNaN(limit) ? 20 : limit,
        offset,
        active_only: true,
      },
      runtimeContext,
      tracingContext,
      mastra,
    });

    if (result.success && result.cards && result.cards.length > 0) {
      let cards = [...result.cards];
      if (sort === "alpha") {
        cards.sort((a: any, b: any) => a.front.localeCompare(b.front));
      } else if (sort === "date") {
        cards.sort(
          (a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
      }

      const cardsList = cards
        .map((card: any, index: number) =>
          formatCardListItem(card, offset + index + 1),
        )
        .join("\n\n");

      const keyboardRows: any[] = cards.map((card: any) => [
        {
          text: "Manage",
          callback_data: `list:menu:${card.card_id || card.id}`,
        },
      ]);

      const totalPages = Math.max(1, Math.ceil(result.total_found / limit));
      const currentPage = Math.floor(offset / limit) + 1;
      const paginationRow: any[] = [];
      if (currentPage > 1) {
        paginationRow.push({
          text: "◀ Prev",
          callback_data: `list:page:${offset - limit}:${sort}`,
        });
      }
      paginationRow.push({
        text: `Page ${currentPage}/${totalPages}`,
        callback_data: "list:noop",
      });
      if (currentPage < totalPages) {
        paginationRow.push({
          text: "Next ▶",
          callback_data: `list:page:${offset + limit}:${sort}`,
        });
      }
      if (paginationRow.length) {
        keyboardRows.push(paginationRow);
      }

      keyboardRows.push([
        { text: "📅 Date", callback_data: `list:sort:date:${offset}` },
        { text: "🔠 Alphabetical", callback_data: `list:sort:alpha:${offset}` },
        {
          text: "🔥 Review Count",
          callback_data: `list:sort:review:${offset}`,
        },
      ]);

      keyboardRows.push([
        { text: "📂 By Tag", callback_data: "list:filter_tag" },
        { text: "🔍 Search", callback_data: "list:filter_search" },
      ]);

      const inline_keyboard = { inline_keyboard: keyboardRows };

      return {
        response: `📚 <b>Your Vocabulary Cards (${result.total_found} total)</b>\n\n${cardsList}`,
        parse_mode: "HTML",
        inline_keyboard,
      };
    } else if (result.cards && result.cards.length === 0) {
      return {
        response:
          "📭 You don't have any cards yet.\n\nUse <code>/add</code> to create your first card!",
        parse_mode: "HTML",
      };
    } else {
      return {
        response: `❌ ${result.message}`,
        parse_mode: "HTML",
      };
    }
  } catch (error) {
    logger?.error("❌ [CommandParser] Error listing cards:", error);
    return {
      response: "❌ Error listing cards. Please try again.",
      parse_mode: "HTML",
    };
  }
}
