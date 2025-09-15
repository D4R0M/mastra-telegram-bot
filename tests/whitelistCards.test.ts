import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/mastra/authorization.ts', () => ({
  isAdmin: vi.fn().mockResolvedValue(false),
  isAuthorizedTelegramUser: vi.fn().mockResolvedValue(true),
}));
import { whitelistMiddleware } from '../src/telegram/whitelistMiddleware.ts';

const TEST_TG_ID = 6776842238;

vi.mock('../src/db/cards.ts', () => ({
  getCardsByOwner: vi.fn(async (owner_id: number) => {
    if (owner_id === TEST_TG_ID) {
      return [
        {
          id: '1',
          owner_id: TEST_TG_ID,
          front: 'hej',
          back: 'hi',
          tags: [],
          example: null,
          lang_front: 'sv',
          lang_back: 'en',
          active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];
    }
    return [];
  }),
}));

import handleListCommand from '../src/mastra/commands/list.ts';
import { getCardsByOwner } from '../src/db/cards.ts';

const mockedGetCards = getCardsByOwner as any;

describe('whitelist middleware user id handling', () => {
  it('queries cards using telegram user id', async () => {
    const ctx: any = { from: { id: TEST_TG_ID }, chat: { id: 1 }, state: { user: { id: '1', user_id: TEST_TG_ID } } };
    await whitelistMiddleware(ctx, async () => {});
    const res = await handleListCommand([], '', ctx.state.tgUserId);
    expect(mockedGetCards).toHaveBeenCalledWith(TEST_TG_ID, expect.any(Object));
    expect(res.response).toContain('Your Vocabulary Cards');
  });
});
