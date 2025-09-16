import { describe, expect, it, vi } from 'vitest';

const TEST_USER_ID = "12345";

vi.mock('../src/db/cards.ts', () => ({
  createCard: vi.fn(async (data) => ({ id: '1', ...data, created_at: new Date() })),
  getCardsByOwner: vi.fn(),
  getCardById: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
}));

import { addCardTool } from '../src/mastra/tools/vocabularyTools.ts';

describe('addCardTool', () => {
  it('creates a card from quick-add syntax', async () => {
    const result = await addCardTool.execute({
      context: { owner_id: TEST_USER_ID, input: 'hund|dog|animal|Example sentence' },
      mastra: undefined,
    });

    expect(result.success).toBe(true);
    expect(result.card?.front).toBe('hund');
    expect(result.card?.back).toBe('dog');
    expect(result.card?.tags).toEqual(['animal']);
  });

  it('fails when required fields are missing in guided mode', async () => {
    const result = await addCardTool.execute({
      context: { owner_id: TEST_USER_ID, front: 'cat' },
      mastra: undefined,
    });

    expect(result.success).toBe(false);
  });
});
