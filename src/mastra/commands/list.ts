import type { CommandResponse, ConversationState } from "../commandTypes.js";
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
    const parsedLimit = params.length > 0 ? parseInt(params[0]) : NaN;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
    const stateData = state?.data ?? {};
    const offset = typeof stateData.offset === "number" && stateData.offset >= 0
      ? stateData.offset
      : 0;
    const sort = typeof stateData.sort === "string" && stateData.sort.length > 0
      ? stateData.sort
      : "date";
    const tagsFilter: string[] | undefined = Array.isArray(stateData.tags)
      ? stateData.tags.filter((tag: unknown) => typeof tag === "string" && tag.trim().length > 0)
      : undefined;
    const searchTerm = typeof stateData.search === "string" && stateData.search.trim().length > 0
      ? stateData.search.trim()
      : undefined;

    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, {
      requestId: userId,
    });
    const toolContext: Record<string, unknown> = {
      owner_id: userId,
      limit,
      offset,
      active_only: true,
    };
    if (tagsFilter && tagsFilter.length > 0) {
      toolContext.tags = tagsFilter.join(",");
    }
    if (searchTerm) {
      toolContext.search = searchTerm;
    }
    const result = await listCardsTool.execute({
      context: toolContext,
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

      const filterNotice = tagsFilter && tagsFilter.length > 0
        ? `\n🏷 <i>Filter: ${tagsFilter.join(", ")}</i>`
        : "";
      const filterPayload = tagsFilter && tagsFilter.length > 0
        ? `:tags=${encodeURIComponent(tagsFilter.join(","))}`
        : "";

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
          callback_data: `list:page:${offset - limit}:${sort}${filterPayload}`,
        });
      }
      paginationRow.push({
        text: `Page ${currentPage}/${totalPages}`,
        callback_data: "list:noop",
      });
      if (currentPage < totalPages) {
        paginationRow.push({
          text: "Next ▶",
          callback_data: `list:page:${offset + limit}:${sort}${filterPayload}`,
        });
      }
      if (paginationRow.length) {
        keyboardRows.push(paginationRow);
      }

      keyboardRows.push([
        { text: "📅 Date", callback_data: `list:sort:date:${offset}${filterPayload}` },
        {
          text: "🔠 Alphabetical",
          callback_data: `list:sort:alpha:${offset}${filterPayload}`,
        },
        {
          text: "🔥 Review Count",
          callback_data: `list:sort:review:${offset}${filterPayload}`,
        },
      ]);

      if (tagsFilter && tagsFilter.length > 0) {
        keyboardRows.push([
          {
            text: "📂 Change Tag Filter",
            callback_data: `list:filter_tag:${sort}${filterPayload}`,
          },
          { text: "🚫 Clear Filter", callback_data: `list:clear_filter:${sort}` },
        ]);
      } else {
        keyboardRows.push([
          { text: "📂 By Tag", callback_data: "list:filter_tag" },
          { text: "🔍 Search", callback_data: "list:filter_search" },
        ]);
      }

      const inline_keyboard = { inline_keyboard: keyboardRows };

      return {
        response: `📚 <b>Your Vocabulary Cards (${result.total_found} total)</b>${filterNotice}\n\n${cardsList}`,
        parse_mode: "HTML",
        inline_keyboard,
      };
    } else if (result.cards && result.cards.length === 0) {
      if (tagsFilter && tagsFilter.length > 0) {
        const inline_keyboard = {
          inline_keyboard: [
            [
              {
                text: "📂 Change Tag Filter",
                callback_data: `list:filter_tag:${sort}${filterPayload || ""}`,
              },
            ],
            [{ text: "🚫 Clear Filter", callback_data: `list:clear_filter:${sort}` }],
          ],
        };
        return {
          response: `📭 No cards found with tags <b>${tagsFilter.join(", ")}</b>.\n\nTry a different tag or clear the filter to see all cards.`,
          parse_mode: "HTML",
          inline_keyboard,
        };
      }
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
