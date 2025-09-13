import type { IMastraLogger } from "@mastra/core/logger";
import { buildToolExecCtx } from './context.js';
import { addCardTool, listCardsTool, editCardTool, deleteCardTool } from './tools/vocabularyTools.js';
import { getDueCardsTool, startReviewTool, submitReviewTool } from './tools/reviewTools.js';
import { getReminderSettingsTool, updateReminderSettingsTool, checkReminderTimeTool, recordReminderSentTool } from './tools/reminderTools.js';
import { importCSVTool, exportCSVTool, previewCSVTool } from './tools/importExportTools.js';
import { getUserSettingsTool, updateSessionSettingsTool, updateAlgorithmSettingsTool, updateReminderSettingsAdvancedTool, resetSettingsTool } from './tools/settingsTools.js';
import { getDueCardsStatsTool, getRetentionStatsTool, getStreakStatsTool, getEaseHistogramTool, getComprehensiveStatsTool } from './tools/statisticsTools.js';

// ===============================
// Types and Interfaces
// ===============================

export interface ConversationState {
  mode?: 'add_card_guided' | 'edit_card' | 'review_session' | 'import_csv' | 'settings_menu' | 'filter_cards';
  step?: number;
  data?: any;
  lastMessageTime?: number;
}

export interface CommandResponse {
  response: string;
  conversationState?: ConversationState;
  inline_keyboard?: any;
  parse_mode?: 'HTML' | 'Markdown';
  edit_message_id?: string;  // For editing previous message
  remove_keyboard?: boolean;  // To remove keyboard after selection
}

export interface ParsedCommand {
  command: string;
  params: string[];
  rawParams?: string;
}

// ===============================
// Helper Functions
// ===============================

function parseCommand(message: string): ParsedCommand | null {
  const trimmed = message.trim();
  
  // Check if it's a command (starts with /)
  if (!trimmed.startsWith('/')) {
    return null;
  }
  
  // Split command and parameters
  const parts = trimmed.split(/\s+/);
  const command = parts[0].toLowerCase();
  const params = parts.slice(1);
  const rawParams = trimmed.substring(command.length).trim();
  
  return {
    command,
    params,
    rawParams
  };
}

function formatCard(card: any, showId: boolean = false): string {
  let result = `<b>${card.front}</b> → ${card.back}`;
  if (showId) {
    result = `[${card.id}] ${result}`;
  }
  if (card.tags && card.tags.length > 0) {
    result += `\n<i>Tags: ${card.tags.join(', ')}</i>`;
  }
  if (card.example) {
    result += `\n<i>Example: ${card.example}</i>`;
  }
  return result;
}

function formatStatistics(stats: any): string {
  const lines = [
    '📊 <b>Your Learning Statistics</b>\n',
    `Total Cards: ${stats.total_cards}`,
    `Cards Due Today: ${stats.cards_due_today}`,
    `New Cards: ${stats.new_cards}`,
    `Average Ease: ${stats.average_ease?.toFixed(2) || 'N/A'}`,
    `Retention Rate: ${stats.retention_rate ? (stats.retention_rate * 100).toFixed(1) + '%' : 'N/A'}`,
    `Current Streak: ${stats.current_streak || 0} days`,
    `Longest Streak: ${stats.longest_streak || 0} days`
  ];
  
  return lines.join('\n');
}

// ===============================
// Command Handlers
// ===============================

async function handleAddCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  
  // Check if params contain quick-add syntax with | or ::
  if (rawParams && (rawParams.includes('|') || rawParams.includes('::'))) {
    let input = rawParams;
    
    // Convert :: to | for consistency
    if (rawParams.includes('::')) {
      input = rawParams.replace('::', '|');
    }
    
    logger?.info('🔧 [CommandParser] Quick add detected:', { input });
    
    try {
      const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, { requestId: userId });
      const result = await addCardTool.execute({
        context: {
          owner_id: userId,
          input: input,
          lang_front: 'sv',
          lang_back: 'en'
        },
        runtimeContext,
        tracingContext,
        mastra
      });
      
      if (result.success && result.card) {
        return {
          response: `✅ Card added successfully!\n\n${formatCard(result.card)}\n\nUse /list to see all your cards.`,
          parse_mode: 'HTML'
        };
      } else {
        return {
          response: `❌ ${result.message}`,
          parse_mode: 'HTML'
        };
      }
    } catch (error) {
      logger?.error('❌ [CommandParser] Error adding card:', error);
      return {
        response: '❌ Error adding card. Please try again.',
        parse_mode: 'HTML'
      };
    }
  }
  
  // Start guided flow if no params
  if (params.length === 0) {
    return {
      response: '📝 <b>Adding a new card</b>\n\nPlease enter the <b>front side</b> of your card (the word or phrase to remember):',
      conversationState: {
        mode: 'add_card_guided',
        step: 1,
        data: {}
      },
      parse_mode: 'HTML'
    };
  }
  
  // If params provided but not in quick-add format
  return {
    response: '❓ To add a card, use one of these formats:\n\n• <code>/add word | translation</code>\n• <code>/add word :: translation</code>\n• <code>/add</code> (for guided mode)\n\nOptionally add tags and examples:\n<code>/add word | translation | tag1,tag2 | example sentence</code>',
    parse_mode: 'HTML'
  };
}

async function handleListCommand(
  params: string[],
  userId: string,
  mastra?: any
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  
  try {
    // Parse limit from params
    const limit = params.length > 0 ? parseInt(params[0]) : 20;
    
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, { requestId: userId });
    const result = await listCardsTool.execute({
      context: {
        owner_id: userId,
        limit: isNaN(limit) ? 20 : limit,
        offset: 0,
        active_only: true
      },
      runtimeContext,
      tracingContext,
      mastra
    });
    
    if (result.success && result.cards && result.cards.length > 0) {
      const cardsList = result.cards.map((card: any, index: number) => 
        `${index + 1}. ${formatCard(card, true)}`
      ).join('\n\n');
      
      return {
        response: `📚 <b>Your Vocabulary Cards (${result.total_found} total)</b>\n\n${cardsList}\n\n<i>Use /edit [id] to edit a card\nUse /delete [id] to remove a card</i>`,
        parse_mode: 'HTML'
      };
    } else if (result.cards && result.cards.length === 0) {
      return {
        response: '📭 You don\'t have any cards yet.\n\nUse <code>/add</code> to create your first card!',
        parse_mode: 'HTML'
      };
    } else {
      return {
        response: `❌ ${result.message}`,
        parse_mode: 'HTML'
      };
    }
  } catch (error) {
    logger?.error('❌ [CommandParser] Error listing cards:', error);
    return {
      response: '❌ Error listing cards. Please try again.',
      parse_mode: 'HTML'
    };
  }
}

async function handlePracticeCommand(
  params: string[],
  userId: string,
  state?: ConversationState,
  mastra?: any
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  
  try {
    // Get due cards
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, { requestId: userId });
    const dueResult = await getDueCardsTool.execute({
      context: {
        owner_id: userId,
        limit: 10,
        include_new: true
      },
      runtimeContext,
      tracingContext,
      mastra
    });
    
    if (!dueResult.success || !dueResult.cards || dueResult.cards.length === 0) {
      return {
        response: '🎉 No cards are due for review right now!\n\nYour vocabulary is all up to date. Come back later or add new cards with <code>/add</code>.',
        parse_mode: 'HTML'
      };
    }
    
    // Start review session
    const { runtimeContext: startRuntimeContext, tracingContext: startTracingContext } = buildToolExecCtx(mastra, { requestId: userId });
    const startResult = await startReviewTool.execute({
      context: {
        owner_id: userId,
        card_id: dueResult.cards[0].card_id,  // Start with first due card
        session_id: `session_${userId}_${Date.now()}`
      },
      runtimeContext: startRuntimeContext,
      tracingContext: startTracingContext,
      mastra
    });
    
    if (startResult.success && startResult.card) {
      const card = startResult.card;
      const sessionId = `session_${userId}_${Date.now()}`;
      const currentIndex = 1;
      const totalCards = dueResult.cards.length;
      return {
        response: `📚 <b>Review Session Started!</b>\nCards in session: ${totalCards}\n\n<b>Card ${currentIndex}/${totalCards}</b>\n\n❓ <b>${card.front}</b>\n\n<i>Try to recall the answer, then type your response or type "show" to reveal.</i>`,
        conversationState: {
          mode: 'review_session',
          step: 1,
          data: {
            session_id: sessionId,
            current_card: card,
            current_index: currentIndex,
            total_cards: totalCards,
            all_cards: dueResult.cards,
            start_time: startResult.start_time
          }
        },
        parse_mode: 'HTML'
      };
    } else {
      return {
        response: `❌ ${startResult.message || 'Could not start review session'}`,
        parse_mode: 'HTML'
      };
    }
  } catch (error) {
    logger?.error('❌ [CommandParser] Error starting practice:', error);
    return {
      response: '❌ Error starting practice session. Please try again.',
      parse_mode: 'HTML'
    };
  }
}

async function handleStatsCommand(
  params: string[],
  userId: string,
  mastra?: any
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  
  try {
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, { requestId: userId });
    const result = await getComprehensiveStatsTool.execute({
      context: {
        owner_id: userId,
        timezone: 'Europe/Stockholm',
        success_threshold: 3
      },
      runtimeContext,
      tracingContext,
      mastra
    });
    
    if (result.success && result.stats) {
      const stats = result.stats;
      return {
        response: formatStatistics(stats),
        parse_mode: 'HTML'
      };
    } else {
      return {
        response: `❌ ${result.message || 'Could not fetch statistics'}`,
        parse_mode: 'HTML'
      };
    }
  } catch (error) {
    logger?.error('❌ [CommandParser] Error fetching stats:', error);
    return {
      response: '❌ Error fetching statistics. Please try again.',
      parse_mode: 'HTML'
    };
  }
}

async function handleEditCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  
  if (params.length === 0) {
    return {
      response: '❓ Please specify the card ID to edit:\n<code>/edit [card_id]</code>\n\nUse <code>/list</code> to see card IDs.',
      parse_mode: 'HTML'
    };
  }
  
  const cardId = params[0];
  
  // If only card ID provided, start edit flow
  if (params.length === 1) {
    return {
      response: `📝 <b>Editing card ${cardId}</b>\n\nWhat would you like to edit?\n1. Front side\n2. Back side\n3. Tags\n4. Example\n\nReply with the number or type the new value directly:\n<code>front: new text</code>\n<code>back: new text</code>\n<code>tags: tag1, tag2</code>\n<code>example: new example</code>`,
      conversationState: {
        mode: 'edit_card',
        step: 1,
        data: { card_id: cardId }
      },
      parse_mode: 'HTML'
    };
  }
  
  return {
    response: '❓ To edit a card:\n<code>/edit [card_id]</code> - start edit flow\n<code>/edit [card_id] front: new text</code>\n<code>/edit [card_id] back: new text</code>',
    parse_mode: 'HTML'
  };
}

async function handleDeleteCommand(
  params: string[],
  userId: string,
  mastra?: any
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  
  if (params.length === 0) {
    return {
      response: '❓ Please specify the card ID to delete:\n<code>/delete [card_id]</code>\n\nUse <code>/list</code> to see card IDs.',
      parse_mode: 'HTML'
    };
  }
  
  const cardId = params[0];
  
  try {
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, { requestId: userId });
    const result = await deleteCardTool.execute({
      context: {
        owner_id: userId,
        card_id: cardId,
        confirm: true
      },
      runtimeContext,
      tracingContext,
      mastra
    });
    
    if (result.success) {
      return {
        response: `✅ ${result.message}`,
        parse_mode: 'HTML'
      };
    } else {
      return {
        response: `❌ ${result.message}`,
        parse_mode: 'HTML'
      };
    }
  } catch (error) {
    logger?.error('❌ [CommandParser] Error deleting card:', error);
    return {
      response: '❌ Error deleting card. Please try again.',
      parse_mode: 'HTML'
    };
  }
}

async function handleSettingsCommand(
  params: string[],
  userId: string,
  state?: ConversationState,
  mastra?: any
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  
  try {
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, { requestId: userId });
    const result = await getUserSettingsTool.execute({
      context: {
        user_id: userId
      },
      runtimeContext,
      tracingContext,
      mastra
    });
    
    if (result.success && result.settings) {
      const settings = result.settings;
      const settingsText = [
        '⚙️ <b>Your Settings</b>\n',
        `📍 Timezone: ${settings.timezone}`,
        `🔕 Do Not Disturb: ${settings.dnd_start} - ${settings.dnd_end}`,
        `📚 Daily New Cards: ${settings.daily_new_limit}`,
        `🔄 Daily Reviews: ${settings.daily_review_limit}`,
        `📖 Session Size: ${settings.session_size} cards`,
        `🔔 Reminders: ${settings.reminders_enabled ? 'Enabled' : 'Disabled'}`,
        `⏰ Reminder Times: ${settings.reminder_times.join(', ')}`,
        `🧮 Algorithm: ${settings.algorithm.toUpperCase()}`,
        `🌐 Language: ${settings.locale}`,
        '\n<i>Use specific commands to update settings:</i>',
        '<code>/settings session [size]</code>',
        '<code>/settings reminders on/off</code>',
        '<code>/settings timezone [tz]</code>'
      ];
      
      return {
        response: settingsText.join('\n'),
        parse_mode: 'HTML'
      };
    } else {
      return {
        response: `❌ ${result.message || 'Could not fetch settings'}`,
        parse_mode: 'HTML'
      };
    }
  } catch (error) {
    logger?.error('❌ [CommandParser] Error fetching settings:', error);
    return {
      response: '❌ Error fetching settings. Please try again.',
      parse_mode: 'HTML'
    };
  }
}

async function handleExportCommand(
  params: string[],
  userId: string,
  mastra?: any
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  
  try {
    const format = params[0]?.toLowerCase() || 'csv';
    
    if (format !== 'csv') {
      return {
        response: '❓ Currently only CSV export is supported:\n<code>/export csv</code>',
        parse_mode: 'HTML'
      };
    }
    
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, { requestId: userId });
    const result = await exportCSVTool.execute({
      context: {
        owner_id: userId,
        include_inactive: false,
        limit: 1000
      },
      runtimeContext,
      tracingContext,
      mastra
    });
    
    if (result.success && result.csv_data) {
      // In a real implementation, you would send this as a file
      // For now, we'll return a truncated preview
      const lines = result.csv_data.split('\n');
      const preview = lines.slice(0, 5).join('\n');
      
      return {
        response: `📄 <b>CSV Export Ready</b>\n\nTotal cards: ${result.card_count}\n\n<b>Preview:</b>\n<code>${preview}</code>\n\n<i>Full CSV data has ${lines.length} lines.</i>`,
        parse_mode: 'HTML'
      };
    } else {
      return {
        response: `❌ ${result.message || 'Could not export cards'}`,
        parse_mode: 'HTML'
      };
    }
  } catch (error) {
    logger?.error('❌ [CommandParser] Error exporting cards:', error);
    return {
      response: '❌ Error exporting cards. Please try again.',
      parse_mode: 'HTML'
    };
  }
}

async function handleImportCommand(
  params: string[],
  rawParams: string,
  userId: string,
  state?: ConversationState,
  mastra?: any
): Promise<CommandResponse> {
  return {
    response: '📥 <b>Import Cards</b>\n\nTo import cards, send me a CSV file with the following format:\n\n<code>front,back,tags,example</code>\n\nExample:\n<code>hund,dog,"animals,pets","Min hund är snäll"</code>\n\nOr paste CSV data directly after the command:\n<code>/import csv\nfront,back\nhund,dog\nkatt,cat</code>',
    conversationState: {
      mode: 'import_csv',
      step: 1,
      data: {}
    },
    parse_mode: 'HTML'
  };
}

async function handleStreakCommand(
  params: string[],
  userId: string,
  mastra?: any
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  
  try {
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, { requestId: userId });
    const result = await getStreakStatsTool.execute({
      context: {
        owner_id: userId,
        timezone: 'Europe/Stockholm'
      },
      runtimeContext,
      tracingContext,
      mastra
    });
    
    if (result.success && result.stats) {
      const stats = result.stats;
      const streakText = [
        '🔥 <b>Your Study Streak</b>\n',
        `Current Streak: ${stats.current_streak} days`,
        `Longest Streak: ${stats.longest_streak} days`,
        `Total Study Days: ${stats.total_study_days}`,
        `Reviews Today: ${stats.reviews_today}`,
        `Average Daily Reviews: ${stats.average_daily_reviews.toFixed(1)}`,
      ];
      
      if (stats.last_review_date) {
        streakText.push(`Last Review: ${stats.last_review_date}`);
      }
      
      if (stats.current_streak > 0) {
        if (stats.current_streak >= 30) {
          streakText.push('\n🏆 Amazing! You\'ve maintained your streak for over a month!');
        } else if (stats.current_streak >= 7) {
          streakText.push('\n⭐ Great job! You\'re on a weekly streak!');
        } else if (stats.current_streak >= 3) {
          streakText.push('\n👍 Good work! Keep it up!');
        }
      }
      
      return {
        response: streakText.join('\n'),
        parse_mode: 'HTML'
      };
    } else {
      return {
        response: `❌ ${result.message || 'Could not fetch streak data'}`,
        parse_mode: 'HTML'
      };
    }
  } catch (error) {
    logger?.error('❌ [CommandParser] Error fetching streak:', error);
    return {
      response: '❌ Error fetching streak data. Please try again.',
      parse_mode: 'HTML'
    };
  }
}

async function handleDueCommand(
  params: string[],
  userId: string,
  mastra?: any
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  
  try {
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, { requestId: userId });
    const result = await getDueCardsStatsTool.execute({
      context: {
        owner_id: userId,
        timezone: 'Europe/Stockholm'
      },
      runtimeContext,
      tracingContext,
      mastra
    });
    
    if (result.success && result.stats) {
      const stats = result.stats;
      const dueText = [
        '📋 <b>Cards Due for Review</b>\n',
        `Total Cards: ${stats.total_cards}`,
        `Due Today: ${stats.cards_due_today}`,
        `Due Tomorrow: ${stats.cards_due_tomorrow}`,
        `New Cards: ${stats.new_cards}`,
        `Learning Cards: ${stats.learning_cards}`,
        `Review Cards: ${stats.review_cards}`,
        `Overdue Cards: ${stats.overdue_cards}`,
      ];
      
      if (stats.cards_due_today > 0) {
        dueText.push('\n💡 <i>Start your review session with</i> <code>/practice</code>');
      } else {
        dueText.push('\n✨ <i>All caught up! No cards due today.</i>');
      }
      
      return {
        response: dueText.join('\n'),
        parse_mode: 'HTML'
      };
    } else {
      return {
        response: `❌ ${result.message || 'Could not fetch due cards'}`,
        parse_mode: 'HTML'
      };
    }
  } catch (error) {
    logger?.error('❌ [CommandParser] Error fetching due cards:', error);
    return {
      response: '❌ Error fetching due cards. Please try again.',
      parse_mode: 'HTML'
    };
  }
}

function handleHelpCommand(): CommandResponse {
  const helpText = [
    '📚 <b>Vocabulary Learning Bot Commands</b>\n',
    '<b>Core Commands:</b>',
    '/add - Add a new vocabulary card',
    '/practice - Start a review session',
    '/list - Show all your cards',
    '/due - Check cards due for review',
    '/stats - View your learning statistics',
    '/streak - Check your study streak',
    '',
    '<b>Card Management:</b>',
    '/edit [id] - Edit a card',
    '/delete [id] - Delete a card',
    '/export csv - Export cards to CSV',
    '/import - Import cards from CSV',
    '',
    '<b>Settings:</b>',
    '/settings - View your settings',
    '/reset - Reset settings to defaults',
    '',
    '<b>Quick Add Formats:</b>',
    '/add word | translation',
    '/add word :: translation',
    '/add word | translation | tags | example',
    '',
    '<i>During reviews, grade yourself 0-5:</i>',
    '0 = Complete failure',
    '1 = Incorrect, saw answer',
    '2 = Incorrect, but easy',
    '3 = Correct, difficult',
    '4 = Correct, hesitated',
    '5 = Perfect recall'
  ];
  
  return {
    response: helpText.join('\n'),
    parse_mode: 'HTML'
  };
}

// ===============================
// Conversation State Handlers
// ===============================

async function handleConversationState(
  message: string,
  userId: string,
  chatId: string,
  state: ConversationState,
  mastra?: any
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  
  // Handle different conversation modes
  switch (state.mode) {
    case 'add_card_guided':
      return handleAddCardGuidedFlow(message, userId, state, mastra);
    
    case 'review_session':
      return handleReviewSessionFlow(message, userId, state, mastra);
    
    case 'edit_card':
      return handleEditCardFlow(message, userId, state, mastra);
    
    case 'import_csv':
      return handleImportCSVFlow(message, userId, state, mastra);
    
    default:
      // Clear unknown state
      return {
        response: 'Session expired. Please start over with a command.',
        conversationState: undefined,
        parse_mode: 'HTML'
      };
  }
}

async function handleAddCardGuidedFlow(
  message: string,
  userId: string,
  state: ConversationState,
  mastra?: any
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  
  if (!state.data) {
    state.data = {};
  }
  
  switch (state.step) {
    case 1: // Waiting for front side
      state.data.front = message.trim();
      return {
        response: `📝 Front: <b>${state.data.front}</b>\n\nNow enter the <b>back side</b> (translation/definition):`,
        conversationState: {
          mode: 'add_card_guided',
          step: 2,
          data: state.data
        },
        parse_mode: 'HTML'
      };
    
    case 2: // Waiting for back side
      state.data.back = message.trim();
      return {
        response: `📝 Front: <b>${state.data.front}</b>\n📝 Back: <b>${state.data.back}</b>\n\nWould you like to add tags? (comma-separated, or type "skip"):`,
        conversationState: {
          mode: 'add_card_guided',
          step: 3,
          data: state.data
        },
        parse_mode: 'HTML'
      };
    
    case 3: // Waiting for tags
      if (message.toLowerCase() !== 'skip') {
        state.data.tags = message.trim();
      }
      return {
        response: `📝 Front: <b>${state.data.front}</b>\n📝 Back: <b>${state.data.back}</b>\n${state.data.tags ? `📝 Tags: <b>${state.data.tags}</b>` : ''}\n\nWould you like to add an example sentence? (or type "skip"):`,
        conversationState: {
          mode: 'add_card_guided',
          step: 4,
          data: state.data
        },
        parse_mode: 'HTML'
      };
    
    case 4: // Waiting for example
      if (message.toLowerCase() !== 'skip') {
        state.data.example = message.trim();
      }
      
      // Now create the card
      try {
        const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, { requestId: userId });
        const result = await addCardTool.execute({
          context: {
            owner_id: userId,
            front: state.data.front,
            back: state.data.back,
            tags: state.data.tags || '',
            example: state.data.example || undefined,
            lang_front: 'sv',
            lang_back: 'en'
          },
          runtimeContext,
          tracingContext,
          mastra
        });
        
        if (result.success && result.card) {
          return {
            response: `✅ Card added successfully!\n\n${formatCard(result.card)}\n\nAdd another with /add or start practicing with /practice`,
            conversationState: undefined,
            parse_mode: 'HTML'
          };
        } else {
          return {
            response: `❌ ${result.message}`,
            conversationState: undefined,
            parse_mode: 'HTML'
          };
        }
      } catch (error) {
        logger?.error('❌ [CommandParser] Error in guided add:', error);
        return {
          response: '❌ Error adding card. Please try again with /add',
          conversationState: undefined,
          parse_mode: 'HTML'
        };
      }
    
    default:
      return {
        response: 'Session expired. Please start over with /add',
        conversationState: undefined,
        parse_mode: 'HTML'
      };
  }
}

async function handleReviewSessionFlow(
  message: string,
  userId: string,
  state: ConversationState,
  mastra?: any
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  
  if (!state.data || !state.data.current_card) {
    return {
      response: 'Review session expired. Start a new session with /practice',
      conversationState: undefined,
      parse_mode: 'HTML'
    };
  }
  
  const normalized = message.toLowerCase().trim();
  
  // Check for exit commands
  if (normalized === 'exit' || normalized === 'quit' || normalized === 'stop') {
    return {
      response: '👋 Review session ended. Great work! Use /stats to see your progress.',
      conversationState: undefined,
      parse_mode: 'HTML'
    };
  }
  
  switch (state.step) {
    case 1: // Waiting for user attempt or "show"
      if (normalized === 'show' || normalized === 'reveal' || normalized === 's') {
        // Show the answer with inline keyboard buttons
        const card = state.data.current_card;
        const inline_keyboard = {
          inline_keyboard: [
            [
              { text: '❌ 0 Forgot', callback_data: `grade:0:${card.card_id || card.id}` },
              { text: '😔 1 Wrong', callback_data: `grade:1:${card.card_id || card.id}` }
            ],
            [
              { text: '😕 2 Hard', callback_data: `grade:2:${card.card_id || card.id}` },
              { text: '🤔 3 Difficult', callback_data: `grade:3:${card.card_id || card.id}` }
            ],
            [
              { text: '😊 4 Good', callback_data: `grade:4:${card.card_id || card.id}` },
              { text: '😎 5 Easy', callback_data: `grade:5:${card.card_id || card.id}` }
            ]
          ]
        };
        
        return {
          response: `💡 <b>Answer:</b> ${card.back}\n\n${card.example ? `<i>Example: ${card.example}</i>\n\n` : ''}How well did you recall this?`,
          conversationState: {
            mode: 'review_session',
            step: 2,
            data: state.data
          },
          inline_keyboard,
          parse_mode: 'HTML'
        };
      } else {
        // User attempted an answer, show the correct answer
        const card = state.data.current_card;
        const userAnswer = message.trim();
        const cardBack = card.back || '';
        const isCorrect = userAnswer.toLowerCase() === cardBack.toLowerCase();
        
        const inline_keyboard = {
          inline_keyboard: [
            [
              { text: '❌ 0 Forgot', callback_data: `grade:0:${card.card_id || card.id}` },
              { text: '😔 1 Wrong', callback_data: `grade:1:${card.card_id || card.id}` }
            ],
            [
              { text: '😕 2 Hard', callback_data: `grade:2:${card.card_id || card.id}` },
              { text: '🤔 3 Difficult', callback_data: `grade:3:${card.card_id || card.id}` }
            ],
            [
              { text: '😊 4 Good', callback_data: `grade:4:${card.card_id || card.id}` },
              { text: '😎 5 Easy', callback_data: `grade:5:${card.card_id || card.id}` }
            ]
          ]
        };
        
        return {
          response: `Your answer: <b>${userAnswer}</b>\nCorrect answer: <b>${cardBack}</b>\n\n${isCorrect ? '✅ Correct!' : '❌ Not quite.'}\n\n${card.example ? `<i>Example: ${card.example}</i>\n\n` : ''}Rate your recall:`,
          conversationState: {
            mode: 'review_session',
            step: 2,
            data: state.data
          },
          inline_keyboard,
          parse_mode: 'HTML'
        };
      }
    
    case 2: // Waiting for grade
      const grade = parseInt(message.trim());
      
      if (isNaN(grade) || grade < 0 || grade > 5) {
        return {
          response: '❓ Please enter a grade between 0 and 5',
          conversationState: state,
          parse_mode: 'HTML'
        };
      }
      
      // Submit the review
      try {
        const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, { requestId: userId });
        const result = await submitReviewTool.execute({
          context: {
            owner_id: userId,
            card_id: state.data.current_card.card_id || state.data.current_card.id,
            start_time: state.data.start_time || Date.now() - 10000,
            grade: grade,
            session_id: state.data.session_id
          },
          runtimeContext,
          tracingContext,
          mastra
        });
        
        if (result.success) {
          // Check if there are more cards in the session
          const nextIndex = (state.data.current_index || 1) + 1;
          const hasMoreCards = state.data.all_cards && nextIndex <= state.data.all_cards.length;
          
          if (hasMoreCards) {
            const nextCard = state.data.all_cards[nextIndex - 1];
            return {
              response: `${grade >= 3 ? '✅' : '📝'} Recorded (Grade: ${grade})\n\n<b>Card ${nextIndex}/${state.data.total_cards}</b>\n\n❓ <b>${nextCard.front}</b>\n\n<i>Try to recall the answer, then type your response or type "show" to reveal.</i>`,
              conversationState: {
                mode: 'review_session',
                step: 1,
                data: {
                  session_id: state.data.session_id,
                  current_card: nextCard,
                  current_index: nextIndex,
                  total_cards: state.data.total_cards,
                  all_cards: state.data.all_cards,
                  start_time: state.data.start_time
                }
              },
              parse_mode: 'HTML'
            };
          } else {
            // Session complete
            return {
              response: `🎉 <b>Session Complete!</b>\n\n${result.message}\n\nGreat work! Come back tomorrow for more practice.\n\nUse /stats to see your progress.`,
              conversationState: undefined,
              parse_mode: 'HTML'
            };
          }
        } else {
          return {
            response: `❌ ${result.message}`,
            conversationState: undefined,
            parse_mode: 'HTML'
          };
        }
      } catch (error) {
        logger?.error('❌ [CommandParser] Error submitting review:', error);
        return {
          response: '❌ Error submitting review. Session ended.',
          conversationState: undefined,
          parse_mode: 'HTML'
        };
      }
    
    default:
      return {
        response: 'Review session error. Please start over with /practice',
        conversationState: undefined,
        parse_mode: 'HTML'
      };
  }
}

async function handleEditCardFlow(
  message: string,
  userId: string,
  state: ConversationState,
  mastra?: any
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  
  if (!state.data || !state.data.card_id) {
    return {
      response: 'Edit session expired. Please start over with /edit [card_id]',
      conversationState: undefined,
      parse_mode: 'HTML'
    };
  }
  
  const normalized = message.toLowerCase().trim();
  
  // Parse edit commands
  let field = '';
  let value = '';
  
  if (normalized.startsWith('front:')) {
    field = 'front';
    value = message.substring(6).trim();
  } else if (normalized.startsWith('back:')) {
    field = 'back';
    value = message.substring(5).trim();
  } else if (normalized.startsWith('tags:')) {
    field = 'tags';
    value = message.substring(5).trim();
  } else if (normalized.startsWith('example:')) {
    field = 'example';
    value = message.substring(8).trim();
  } else if (['1', '2', '3', '4'].includes(normalized)) {
    // Number selection
    const fields = ['front', 'back', 'tags', 'example'];
    field = fields[parseInt(normalized) - 1];
    return {
      response: `Enter the new value for <b>${field}</b>:`,
      conversationState: {
        mode: 'edit_card',
        step: 2,
        data: {
          card_id: state.data.card_id,
          field: field
        }
      },
      parse_mode: 'HTML'
    };
  } else if (state.step === 2 && state.data.field) {
    // We're waiting for a value for a specific field
    field = state.data.field;
    value = message.trim();
  } else {
    return {
      response: 'Please specify what to edit:\n<code>front: new text</code>\n<code>back: new text</code>\n<code>tags: tag1, tag2</code>\n<code>example: new example</code>\n\nOr reply with 1-4 to select a field.',
      conversationState: state,
      parse_mode: 'HTML'
    };
  }
  
  // Execute the edit
  if (field && value) {
    try {
      const updateData: any = {};
      
      if (field === 'tags') {
        updateData.tags = value.split(',').map(t => t.trim()).filter(t => t);
      } else {
        updateData[field] = value;
      }
      
      const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, { requestId: userId });
      const result = await editCardTool.execute({
        context: {
          owner_id: userId,
          card_id: state.data.card_id,
          ...updateData
        },
        runtimeContext,
        tracingContext,
        mastra
      });
      
      if (result.success && result.card) {
        return {
          response: `✅ Card updated successfully!\n\n${formatCard(result.card)}\n\nUse /list to see all cards.`,
          conversationState: undefined,
          parse_mode: 'HTML'
        };
      } else {
        return {
          response: `❌ ${result.message}`,
          conversationState: undefined,
          parse_mode: 'HTML'
        };
      }
    } catch (error) {
      logger?.error('❌ [CommandParser] Error editing card:', error);
      return {
        response: '❌ Error editing card. Please try again.',
        conversationState: undefined,
        parse_mode: 'HTML'
      };
    }
  }
  
  return {
    response: 'Edit cancelled. Use /edit [card_id] to try again.',
    conversationState: undefined,
    parse_mode: 'HTML'
  };
}

async function handleImportCSVFlow(
  message: string,
  userId: string,
  state: ConversationState,
  mastra?: any
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  
  // Check if message contains CSV data
  if (!message.includes(',') && !message.includes('\n')) {
    return {
      response: 'Please paste your CSV data or send a CSV file. Format:\n<code>front,back,tags,example</code>',
      conversationState: state,
      parse_mode: 'HTML'
    };
  }
  
  try {
    // First preview the CSV
    const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, { requestId: userId });
    const previewResult = await previewCSVTool.execute({
      context: {
        csv_data: message.trim(),
        has_headers: true,
        sample_size: 5
      },
      runtimeContext,
      tracingContext,
      mastra
    });
    
    if (!previewResult.success) {
      return {
        response: `❌ Invalid CSV format: ${previewResult.message}`,
        conversationState: undefined,
        parse_mode: 'HTML'
      };
    }
    
    // Import the CSV
    const { runtimeContext: importRuntimeContext, tracingContext: importTracingContext } = buildToolExecCtx(mastra, { requestId: userId });
    const importResult = await importCSVTool.execute({
      context: {
        owner_id: userId,
        csv_data: message.trim(),
        has_headers: true,
        default_lang_front: 'sv',
        default_lang_back: 'en',
        skip_duplicates: true
      },
      runtimeContext: importRuntimeContext,
      tracingContext: importTracingContext,
      mastra
    });
    
    if (importResult.success) {
      return {
        response: `✅ Import successful!\n\nImported: ${importResult.imported_count} cards\nSkipped: ${importResult.skipped_count} duplicates\n${importResult.errors && importResult.errors.length > 0 ? `\nErrors: ${importResult.errors.length}` : ''}\n\nUse /list to see your cards.`,
        conversationState: undefined,
        parse_mode: 'HTML'
      };
    } else {
      return {
        response: `❌ Import failed: ${importResult.message}`,
        conversationState: undefined,
        parse_mode: 'HTML'
      };
    }
  } catch (error) {
    logger?.error('❌ [CommandParser] Error importing CSV:', error);
    return {
      response: '❌ Error importing CSV. Please check the format and try again.',
      conversationState: undefined,
      parse_mode: 'HTML'
    };
  }
}

// ===============================
// Main Export Function
// ===============================

export async function processCommand(
  message: string,
  userId: string,
  chatId: string,
  conversationState?: ConversationState,
  mastra?: any
): Promise<CommandResponse> {
  const logger = mastra?.getLogger();
  logger?.info('🔧 [CommandParser] Processing message:', {
    message: message.substring(0, 100),
    userId,
    hasState: !!conversationState
  });
  
  // Handle special internal messages
  if (message === '__next_card__' && conversationState?.mode === 'review_session' && conversationState.data?.current_card) {
    const card = conversationState.data.current_card;
    const currentIndex = conversationState.data.current_index || 1;
    const totalCards = conversationState.data.all_cards?.length || 0;
    
    return {
      response: `📚 <b>Card ${currentIndex}/${totalCards}</b>\n\n<b>Front:</b> ${card.front}\n\n<i>Type your attempt, or reply "show" to reveal the answer</i>`,
      conversationState: conversationState,
      parse_mode: 'HTML'
    };
  }
  
  if (message === '__session_complete__') {
    // Get stats from the database if possible
    try {
      const { getComprehensiveStatsTool } = await import('./tools/statisticsTools.js');
      const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, { requestId: userId });
      const stats = await getComprehensiveStatsTool.execute({
        context: { 
          owner_id: userId,
          timezone: 'Europe/Stockholm',
          success_threshold: 3
        },
        runtimeContext,
        tracingContext,
        mastra
      });
      
      return {
        response: `🎉 <b>Practice session complete!</b>\n\n${stats.success && stats.stats ? `🔥 Current streak: ${stats.stats.streaks?.current_streak || 0} days` : 'Great job! Use /practice to review more cards.'}`,
        conversationState: undefined,
        parse_mode: 'HTML'
      };
    } catch (error) {
      return {
        response: '🎉 <b>Practice session complete!</b>\n\nGreat job! Use /practice to review more cards.',
        conversationState: undefined,
        parse_mode: 'HTML'
      };
    }
  }
  
  // Check if we're in the middle of a conversation flow
  if (conversationState && conversationState.mode) {
    // Check for timeout (5 minutes)
    if (conversationState.lastMessageTime) {
      const timeDiff = Date.now() - conversationState.lastMessageTime;
      if (timeDiff > 5 * 60 * 1000) {
        logger?.info('📝 [CommandParser] Conversation state expired');
        conversationState = undefined;
      }
    }
    
    // If still valid, handle the conversation state
    if (conversationState) {
      return handleConversationState(message, userId, chatId, conversationState, mastra);
    }
  }
  
  // Parse the command
  const parsed = parseCommand(message);
  
  // If not a command and no active conversation, show help
  if (!parsed) {
    // Check for common non-command inputs
    const normalized = message.toLowerCase().trim();
    
    if (normalized === 'help' || normalized === 'start' || normalized === 'hi' || normalized === 'hello') {
      return handleHelpCommand();
    }
    
    // Check for quick-add patterns even without /add command
    if (message.includes('|') || message.includes('::')) {
      return handleAddCommand([], message, userId, undefined, mastra);
    }
    
    return {
      response: '❓ I didn\'t understand that. Use /help to see available commands.\n\nTip: To add a card quickly, use:\n<code>/add word | translation</code>',
      parse_mode: 'HTML'
    };
  }
  
  // Route to appropriate handler based on command
  const command = parsed.command;
  const params = parsed.params;
  const rawParams = parsed.rawParams || '';
  
  logger?.info('📝 [CommandParser] Parsed command:', { command, params });
  
  switch (command) {
    case '/add':
    case '/a':
      return handleAddCommand(params, rawParams, userId, conversationState, mastra);
    
    case '/list':
    case '/l':
    case '/cards':
      return handleListCommand(params, userId, mastra);
    
    case '/practice':
    case '/p':
    case '/review':
    case '/study':
      return handlePracticeCommand(params, userId, conversationState, mastra);
    
    case '/stats':
    case '/statistics':
      return handleStatsCommand(params, userId, mastra);
    
    case '/edit':
    case '/e':
    case '/update':
      return handleEditCommand(params, rawParams, userId, conversationState, mastra);
    
    case '/delete':
    case '/d':
    case '/remove':
      return handleDeleteCommand(params, userId, mastra);
    
    case '/settings':
    case '/config':
    case '/preferences':
      return handleSettingsCommand(params, userId, conversationState, mastra);
    
    case '/export':
      return handleExportCommand(params, userId, mastra);
    
    case '/import':
      return handleImportCommand(params, rawParams, userId, conversationState, mastra);
    
    case '/due':
    case '/pending':
      return handleDueCommand(params, userId, mastra);
    
    case '/streak':
    case '/progress':
      return handleStreakCommand(params, userId, mastra);
    
    case '/help':
    case '/h':
    case '/start':
    case '/commands':
      return handleHelpCommand();
    
    case '/reset':
      // Reset settings
      try {
        const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, { requestId: userId });
        const result = await resetSettingsTool.execute({
          context: { 
            user_id: userId,
            preserve_reminders: false,
            preserve_session: false,
            preserve_algorithm: false
          },
          runtimeContext,
          tracingContext,
          mastra
        });
        return {
          response: result.success ? '✅ Settings reset to defaults!' : `❌ ${result.message}`,
          parse_mode: 'HTML'
        };
      } catch (error) {
        return {
          response: '❌ Error resetting settings.',
          parse_mode: 'HTML'
        };
      }
    
    case '/remind':
    case '/reminders':
      // Handle reminder settings
      try {
        const { runtimeContext, tracingContext } = buildToolExecCtx(mastra, { requestId: userId });
        const result = await getReminderSettingsTool.execute({
          context: { user_id: userId },
          runtimeContext,
          tracingContext,
          mastra
        });
        if (result.success && result.settings) {
          const s = result.settings;
          return {
            response: `🔔 <b>Reminder Settings</b>\n\nEnabled: ${s.enabled ? 'Yes' : 'No'}\nTimes: ${s.preferred_times.join(', ')}\nTimezone: ${s.timezone}\nDND: ${s.dnd_start} - ${s.dnd_end}`,
            parse_mode: 'HTML'
          };
        }
        return {
          response: `❌ ${result.message}`,
          parse_mode: 'HTML'
        };
      } catch (error) {
        return {
          response: '❌ Error fetching reminder settings.',
          parse_mode: 'HTML'
        };
      }
    
    default:
      return {
        response: `❓ Unknown command: ${command}\n\nUse /help to see available commands.`,
        parse_mode: 'HTML'
      };
  }
}