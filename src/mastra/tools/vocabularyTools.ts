import { createTool } from "@mastra/core/tools";
import type { IMastraLogger } from "@mastra/core/logger";
import { z } from "zod";
import { createCard, getCardsByOwner, getCardById, updateCard, deleteCard } from "../../db/cards.js";
import type { CreateCardData, UpdateCardData } from "../../db/cards.js";

// Add card tool with guided flow
export const addCardTool = createTool({
  id: "add-card-tool",
  description: `Add a new vocabulary card to the collection. Supports both guided interactive flow and quick-add syntax parsing.`,
  inputSchema: z.object({
    owner_id: z.coerce.number().describe("User ID who owns the card"),
    input: z.string().optional().describe("Either individual field or quick-add syntax like 'front|back|tag1,tag2|example'"),
    front: z.string().optional().describe("Front side of the card (e.g., Swedish word)"),
    back: z.string().optional().describe("Back side of the card (e.g., English translation)"),
    tags: z.string().optional().describe("Comma-separated tags for the card"),
    example: z.string().optional().describe("Example sentence using the vocabulary"),
    lang_front: z.string().default("sv").describe("Language code for front side"),
    lang_back: z.string().default("en").describe("Language code for back side"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    card_id: z.string().optional(),
    message: z.string(),
    card: z.object({
      id: z.string(),
      front: z.string(),
      back: z.string(),
      tags: z.array(z.string()),
      example: z.string().optional(),
      lang_front: z.string(),
      lang_back: z.string(),
    }).optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [AddCard] Starting card creation with params:', context);

    try {
      // Check if input contains quick-add syntax (pipe-separated)
      if (context.input && context.input.includes('|')) {
        logger?.info('📝 [AddCard] Parsing quick-add syntax:', { input: context.input });
        
        const parts = context.input.split('|').map(p => p.trim());
        if (parts.length < 2) {
          return {
            success: false,
            message: "Quick-add format should be: front|back[|tags][|example]. Example: 'hund|dog|animals|Hunden springer snabbt'"
          };
        }

        const [front, back, tagsStr, example] = parts;
        const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0) : [];

        const cardData: CreateCardData = {
          owner_id: context.owner_id,
          front,
          back,
          tags,
          example: example || undefined,
          lang_front: context.lang_front,
          lang_back: context.lang_back,
        };

        logger?.info('📝 [AddCard] Creating card with parsed data:', cardData);
        const card = await createCard(cardData);

        logger?.info('✅ [AddCard] Card created successfully:', { id: card.id, front: card.front, back: card.back });
        return {
          success: true,
          card_id: card.id,
          message: `Card created successfully! ${card.front} → ${card.back}${card.tags.length > 0 ? ` [${card.tags.join(', ')}]` : ''}`,
          card: {
            id: card.id,
            front: card.front,
            back: card.back,
            tags: card.tags,
            example: card.example,
            lang_front: card.lang_front,
            lang_back: card.lang_back,
          }
        };
      }

      // Guided flow - use individual fields
      if (!context.front || !context.back) {
        return {
          success: false,
          message: "Both 'front' and 'back' fields are required. You can also use quick-add syntax: 'front|back|tags|example'"
        };
      }

      const tags = context.tags ? context.tags.split(',').map(t => t.trim()).filter(t => t.length > 0) : [];

      const cardData: CreateCardData = {
        owner_id: context.owner_id,
        front: context.front,
        back: context.back,
        tags,
        example: context.example,
        lang_front: context.lang_front,
        lang_back: context.lang_back,
      };

      logger?.info('📝 [AddCard] Creating card with guided data:', cardData);
      const card = await createCard(cardData);

      logger?.info('✅ [AddCard] Card created successfully:', { id: card.id, front: card.front, back: card.back });
      return {
        success: true,
        card_id: card.id,
        message: `Card created successfully! ${card.front} → ${card.back}${card.tags.length > 0 ? ` [${card.tags.join(', ')}]` : ''}`,
        card: {
          id: card.id,
          front: card.front,
          back: card.back,
          tags: card.tags,
          example: card.example,
          lang_front: card.lang_front,
          lang_back: card.lang_back,
        }
      };

    } catch (error) {
      logger?.error('❌ [AddCard] Error creating card:', error);
      return {
        success: false,
        message: `Error creating card: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});

// List cards tool with filtering
export const listCardsTool = createTool({
  id: "list-cards-tool",
  description: `List vocabulary cards with optional filtering by tags, search terms, and pagination support.`,
  inputSchema: z.object({
    owner_id: z.coerce.number().describe("User ID who owns the cards"),
    limit: z.number().default(10).describe("Maximum number of cards to return"),
    offset: z.number().default(0).describe("Number of cards to skip for pagination"),
    tags: z.string().optional().describe("Comma-separated tags to filter by"),
    search: z.string().optional().describe("Search term to filter cards by front/back content"),
    active_only: z.boolean().default(true).describe("Whether to show only active cards"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    cards: z.array(z.object({
      id: z.string(),
      front: z.string(),
      back: z.string(),
      tags: z.array(z.string()),
      example: z.string().optional(),
      lang_front: z.string(),
      lang_back: z.string(),
      created_at: z.string(),
    })),
    total_found: z.number(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [ListCards] Starting card listing with params:', context);

    try {
      const tagsArray = context.tags ? context.tags.split(',').map(t => t.trim()).filter(t => t.length > 0) : undefined;

      const options = {
        limit: context.limit,
        offset: context.offset,
        tags: tagsArray,
        active: context.active_only,
      };

      logger?.info('📝 [ListCards] Fetching cards with options:', options);
      const cards = await getCardsByOwner(context.owner_id, options);

      // Apply search filter if provided (simple text matching)
      let filteredCards = cards;
      if (context.search) {
        const searchTerm = context.search.toLowerCase();
        filteredCards = cards.filter(card => 
          card.front.toLowerCase().includes(searchTerm) ||
          card.back.toLowerCase().includes(searchTerm) ||
          (card.example && card.example.toLowerCase().includes(searchTerm))
        );
        logger?.info('📝 [ListCards] Applied search filter:', { searchTerm, originalCount: cards.length, filteredCount: filteredCards.length });
      }

      const formattedCards = filteredCards.map(card => ({
        id: card.id,
        front: card.front,
        back: card.back,
        tags: card.tags,
        example: card.example,
        lang_front: card.lang_front,
        lang_back: card.lang_back,
        created_at: card.created_at.toISOString(),
      }));

      const message = filteredCards.length === 0 
        ? "No cards found matching your criteria."
        : `Found ${filteredCards.length} card${filteredCards.length === 1 ? '' : 's'}${context.tags ? ` with tags [${context.tags}]` : ''}${context.search ? ` matching "${context.search}"` : ''}.`;

      logger?.info('✅ [ListCards] Successfully retrieved cards:', { count: filteredCards.length });
      return {
        success: true,
        cards: formattedCards,
        total_found: filteredCards.length,
        message,
      };

    } catch (error) {
      logger?.error('❌ [ListCards] Error listing cards:', error);
      return {
        success: false,
        cards: [],
        total_found: 0,
        message: `Error listing cards: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});

// Edit card tool
export const editCardTool = createTool({
  id: "edit-card-tool",
  description: `Edit an existing vocabulary card by updating its front, back, tags, or example content.`,
  inputSchema: z.object({
    owner_id: z.coerce.number().describe("User ID who owns the card"),
    card_id: z.string().describe("ID of the card to edit"),
    front: z.string().optional().describe("New front side content"),
    back: z.string().optional().describe("New back side content"),
    tags: z.string().optional().describe("New comma-separated tags"),
    example: z.string().optional().describe("New example sentence"),
    lang_front: z.string().optional().describe("New front language code"),
    lang_back: z.string().optional().describe("New back language code"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    card: z.object({
      id: z.string(),
      front: z.string(),
      back: z.string(),
      tags: z.array(z.string()),
      example: z.string().optional(),
      lang_front: z.string(),
      lang_back: z.string(),
    }).optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [EditCard] Starting card edit with params:', context);

    try {
      // First, verify the card exists and belongs to the user
      const existingCard = await getCardById(context.card_id, context.owner_id);
      if (!existingCard) {
        return {
          success: false,
          message: "Card not found or you don't have permission to edit it."
        };
      }

      // Prepare update data
      const updateData: UpdateCardData = {};
      
      if (context.front !== undefined) updateData.front = context.front;
      if (context.back !== undefined) updateData.back = context.back;
      if (context.tags !== undefined) {
        updateData.tags = context.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
      }
      if (context.example !== undefined) updateData.example = context.example;
      if (context.lang_front !== undefined) updateData.lang_front = context.lang_front;
      if (context.lang_back !== undefined) updateData.lang_back = context.lang_back;

      // Check if any changes were provided
      if (Object.keys(updateData).length === 0) {
        return {
          success: false,
          message: "No changes provided. Please specify at least one field to update."
        };
      }

      logger?.info('📝 [EditCard] Updating card with data:', { card_id: context.card_id, updateData });
      const updatedCard = await updateCard(context.card_id, context.owner_id, updateData);

      if (!updatedCard) {
        return {
          success: false,
          message: "Failed to update card. Please try again."
        };
      }

      logger?.info('✅ [EditCard] Card updated successfully:', { id: updatedCard.id, front: updatedCard.front, back: updatedCard.back });
      return {
        success: true,
        message: `Card updated successfully! ${updatedCard.front} → ${updatedCard.back}`,
        card: {
          id: updatedCard.id,
          front: updatedCard.front,
          back: updatedCard.back,
          tags: updatedCard.tags,
          example: updatedCard.example,
          lang_front: updatedCard.lang_front,
          lang_back: updatedCard.lang_back,
        }
      };

    } catch (error) {
      logger?.error('❌ [EditCard] Error editing card:', error);
      return {
        success: false,
        message: `Error editing card: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});

// Delete card tool
export const deleteCardTool = createTool({
  id: "delete-card-tool",
  description: `Delete a vocabulary card from the collection. This marks the card as inactive rather than permanently removing it.`,
  inputSchema: z.object({
    owner_id: z.coerce.number().describe("User ID who owns the card"),
    card_id: z.string().describe("ID of the card to delete"),
    confirm: z.boolean().default(false).describe("Confirmation that the user wants to delete the card"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    deleted_card: z.object({
      id: z.string(),
      front: z.string(),
      back: z.string(),
    }).optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [DeleteCard] Starting card deletion with params:', context);

    try {
      // Safety check for confirmation
      if (!context.confirm) {
        return {
          success: false,
          message: "Deletion not confirmed. Please confirm that you want to delete this card."
        };
      }

      // First, get the card to show what's being deleted
      const existingCard = await getCardById(context.card_id, context.owner_id);
      if (!existingCard) {
        return {
          success: false,
          message: "Card not found or you don't have permission to delete it."
        };
      }

      logger?.info('📝 [DeleteCard] Deleting card:', { id: context.card_id, front: existingCard.front, back: existingCard.back });
      const success = await deleteCard(context.card_id, context.owner_id);

      if (!success) {
        return {
          success: false,
          message: "Failed to delete card. Please try again."
        };
      }

      logger?.info('✅ [DeleteCard] Card deleted successfully:', { id: context.card_id });
      return {
        success: true,
        message: `Card deleted successfully: "${existingCard.front}" → "${existingCard.back}"`,
        deleted_card: {
          id: existingCard.id,
          front: existingCard.front,
          back: existingCard.back,
        }
      };

    } catch (error) {
      logger?.error('❌ [DeleteCard] Error deleting card:', error);
      return {
        success: false,
        message: `Error deleting card: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});