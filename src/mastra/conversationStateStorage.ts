import { getPool } from "../db/client.js";
import type { ConversationState } from "./commandParser";

export interface ConversationStateResult {
  state: ConversationState | undefined;
  expired: boolean;
}

// ===============================
// Conversation State Storage
// ===============================

// Create table if it doesn't exist
async function ensureStateTable(): Promise<void> {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_states (
      user_id TEXT PRIMARY KEY,
      state_data JSONB,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// Ensure the table is created once when module loads
const stateTableReady = ensureStateTable();

// Get conversation state for a user
export async function getConversationState(
  userId: string,
): Promise<ConversationStateResult> {
  await stateTableReady;
  const pool = getPool();

  try {
    const result = await pool.query(
      "SELECT state_data FROM conversation_states WHERE user_id = $1",
      [userId],
    );

    if (result.rows.length > 0 && result.rows[0].state_data) {
      const state = result.rows[0].state_data as ConversationState;

      // Check for timeout (5 minutes)
      if (state.lastMessageTime) {
        const timeDiff = Date.now() - state.lastMessageTime;
        if (timeDiff > 5 * 60 * 1000) {
          return { state: undefined, expired: true };
        }
      }

      return { state, expired: false };
    }

    return { state: undefined, expired: false };
  } catch (error) {
    console.error("Error getting conversation state:", error);
    return { state: undefined, expired: false };
  }
}

// Save conversation state for a user
export async function saveConversationState(
  userId: string,
  state: ConversationState | undefined,
): Promise<void> {
  await stateTableReady;
  const pool = getPool();

  try {
    if (!state) {
      // Clear the state
      await clearConversationState(userId);
      return;
    }

    // Add timestamp to state
    state.lastMessageTime = Date.now();

    await pool.query(
      `INSERT INTO conversation_states (user_id, state_data, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id)
       DO UPDATE SET state_data = $2, updated_at = CURRENT_TIMESTAMP`,
      [userId, JSON.stringify(state)],
    );
  } catch (error) {
    console.error("Error saving conversation state:", error);
  }
}

// Clear conversation state for a user
export async function clearConversationState(userId: string): Promise<void> {
  await stateTableReady;
  const pool = getPool();

  try {
    await pool.query("DELETE FROM conversation_states WHERE user_id = $1", [
      userId,
    ]);
  } catch (error) {
    console.error("Error clearing conversation state:", error);
  }
}

// Clean up old states (called periodically)
export async function cleanupOldStates(): Promise<void> {
  await stateTableReady;
  const pool = getPool();

  try {
    // Delete states older than 1 hour
    await pool.query(
      `DELETE FROM conversation_states 
       WHERE updated_at < CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
    );
  } catch (error) {
    console.error("Error cleaning up old states:", error);
  }
}
