import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listHandlerMock } = vi.hoisted(() => ({
  listHandlerMock: vi.fn(async () => ({
    response: 'mock list',
    parse_mode: 'HTML' as const,
  })),
}));

vi.mock('../src/mastra/commands/index.ts', async () => {
  const actual = await vi.importActual<typeof import('../src/mastra/commands/index.ts')>(
    '../src/mastra/commands/index.ts',
  );
  return {
    ...actual,
    commandRegistry: {
      ...actual.commandRegistry,
      '/list': listHandlerMock,
    },
  };
});

import { handleListCallback } from '../src/mastra/commandParser.ts';

describe('list callback filtering', () => {
  beforeEach(() => {
    listHandlerMock.mockClear();
    listHandlerMock.mockResolvedValue({
      response: 'mock list',
      parse_mode: 'HTML',
    });
  });

  it('prompts for tag input when filter callback is triggered', async () => {
    const result = await handleListCallback('filter_tag', '', '123');
    expect(result.response).toContain('Filter by Tag');
    expect(result.conversationState?.mode).toBe('filter_cards');
    expect(result.conversationState?.data.sort).toBe('date');
  });

  it('includes current tags in the filter prompt when provided', async () => {
    const result = await handleListCallback(
      'filter_tag',
      'alpha:tags=animals%2Ctravel',
      '123',
    );
    expect(result.response).toContain('animals, travel');
    expect(result.conversationState?.data.tags).toEqual(['animals', 'travel']);
  });

  it('clears filters and reloads the list when requested', async () => {
    const result = await handleListCallback('clear_filter', 'alpha', '123');
    expect(listHandlerMock).toHaveBeenCalledTimes(1);
    const stateArg = listHandlerMock.mock.calls[0][3] as any;
    expect(stateArg.data).toEqual({ offset: 0, sort: 'alpha' });
    expect(result.response).toBe('mock list');
  });

  it('preserves tag selections during pagination callbacks', async () => {
    await handleListCallback('page', '20:alpha:tags=food%2Cdrinks', '123');
    expect(listHandlerMock).toHaveBeenCalledTimes(1);
    const stateArg = listHandlerMock.mock.calls[0][3] as any;
    expect(stateArg.data).toEqual({
      offset: 20,
      sort: 'alpha',
      tags: ['food', 'drinks'],
    });
  });
});

