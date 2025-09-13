// Test file for command parser
// Run with: npx tsx src/mastra/testCommandParser.ts

import { processCommand } from './commandParser';
import type { ConversationState } from './commandParser';

// Mock mastra object with logger
const mockMastra = {
  getLogger: () => ({
    info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ''),
    error: (msg: string, data?: any) => console.error(`[ERROR] ${msg}`, data || ''),
    warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data || ''),
    debug: (msg: string, data?: any) => console.debug(`[DEBUG] ${msg}`, data || ''),
  })
};

async function runTest(
  name: string, 
  message: string, 
  userId: string = 'test_user',
  state?: ConversationState
): Promise<ConversationState | undefined> {
  console.log(`\n========== TEST: ${name} ==========`);
  console.log(`Input: "${message}"`);
  if (state) {
    console.log(`State:`, state);
  }
  
  try {
    const result = await processCommand(
      message,
      userId,
      'test_chat',
      state,
      mockMastra,
      false,
    );
    console.log(`\nResponse:\n${result.response}`);
    if (result.conversationState) {
      console.log(`\nNew State:`, result.conversationState);
    }
    return result.conversationState;
  } catch (error) {
    console.error(`\nError:`, error);
    return undefined;
  }
}

async function runTests() {
  console.log('Starting Command Parser Tests...\n');
  
  // Test 1: Help command
  await runTest('Help Command', '/help');
  
  // Test 2: Unknown command
  await runTest('Unknown Command', '/unknown');
  
  // Test 3: Non-command text
  await runTest('Non-Command Text', 'hello there');
  
  // Test 4: Quick add with pipe
  await runTest('Quick Add with Pipe', '/add hund | dog');
  
  // Test 5: Quick add with double colon
  await runTest('Quick Add with Double Colon', '/add katt :: cat');
  
  // Test 6: Quick add with tags and example
  await runTest('Quick Add Full', '/add bil | car | transport,vehicle | Min bil är röd');
  
  // Test 7: Guided add flow - start
  const state1 = await runTest('Guided Add - Start', '/add');
  
  // Test 8: Guided add flow - provide front
  const state2 = await runTest('Guided Add - Front', 'träd', 'test_user', state1);
  
  // Test 9: Guided add flow - provide back
  const state3 = await runTest('Guided Add - Back', 'tree', 'test_user', state2);
  
  // Test 10: Guided add flow - skip tags
  const state4 = await runTest('Guided Add - Skip Tags', 'skip', 'test_user', state3);
  
  // Test 11: Guided add flow - add example
  const state5 = await runTest('Guided Add - Example', 'Det stora trädet växer i parken', 'test_user', state4);
  
  // Test 12: List command
  await runTest('List Command', '/list');
  
  // Test 13: List with limit
  await runTest('List with Limit', '/list 5');
  
  // Test 14: Stats command
  await runTest('Stats Command', '/stats');
  
  // Test 15: Due command
  await runTest('Due Command', '/due');
  
  // Test 16: Streak command
  await runTest('Streak Command', '/streak');
  
  // Test 17: Settings command
  await runTest('Settings Command', '/settings');
  
  // Test 18: Export command
  await runTest('Export Command', '/export csv');
  
  // Test 19: Delete command without ID
  await runTest('Delete without ID', '/delete');
  
  // Test 20: Edit command without ID
  await runTest('Edit without ID', '/edit');
  
  // Test 21: Practice command (will fail without DB but tests parsing)
  await runTest('Practice Command', '/practice');
  
  // Test 22: Reset command
  await runTest('Reset Command', '/reset');
  
  // Test 23: Reminder command
  await runTest('Reminder Command', '/remind');
  
  // Test 24: Quick add without command prefix (pipe detection)
  await runTest('Quick Add No Command', 'bok | book');
  
  // Test 25: Command aliases
  await runTest('Add Alias', '/a word | definition');
  await runTest('List Alias', '/l');
  await runTest('Practice Alias', '/p');
  await runTest('Help Alias', '/h');
  
  console.log('\n\n========== TESTS COMPLETE ==========\n');
}

// Run tests
runTests().catch(console.error);