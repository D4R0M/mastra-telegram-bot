import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/client.ts', () => ({
  getPool: () => ({ query: vi.fn() }),
}));

const { mockAdd, mockAddAlias, mockHelp } = vi.hoisted(() => ({
  mockAdd: vi.fn(async () => ({ response: 'add' })),
  mockAddAlias: vi.fn(async () => ({ response: 'add-alias' })),
  mockHelp: vi.fn(async () => ({ response: 'help' })),
}));

vi.mock('../src/mastra/commands/index.ts', () => ({
  commandRegistry: {
    '/add': mockAdd,
    '/a': mockAddAlias,
    '/help': mockHelp,
  }
}));

import { parseCommand, processCommand } from '../src/mastra/commandParser.ts';

beforeEach(() => {
  mockAdd.mockClear();
  mockAddAlias.mockClear();
  mockHelp.mockClear();
});

describe('parseCommand', () => {
  it('parses a command with parameters', () => {
    const result = parseCommand('/add word1 word2');
    expect(result).toEqual({
      command: '/add',
      params: ['word1', 'word2'],
      rawParams: 'word1 word2'
    });
  });

  it('returns null for non-command messages', () => {
    expect(parseCommand('hello world')).toBeNull();
  });
});

describe('processCommand', () => {
  it('routes quick add messages with pipe to /add handler', async () => {
    const result = await processCommand('bok | book', 'user', 'chat');
    expect(result.response).toBe('add');
    expect(mockAdd).toHaveBeenCalledWith([], 'bok | book', 'user', undefined, undefined);
  });

  it('routes quick add messages with double colon to /add handler', async () => {
    const result = await processCommand('katt :: cat', 'user', 'chat');
    expect(result.response).toBe('add');
    expect(mockAdd).toHaveBeenCalledWith([], 'katt :: cat', 'user', undefined, undefined);
  });

  it('supports /a alias for add command', async () => {
    const result = await processCommand('/a hund | dog', 'user', 'chat');
    expect(result.response).toBe('add-alias');
    expect(mockAddAlias).toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('returns help text for explicit /help command', async () => {
    const result = await processCommand('/help', 'user', 'chat');
    expect(result.response).toBe('help');
    expect(mockHelp).toHaveBeenCalled();
  });

  it('returns fallback message for non-command text', async () => {
    const result = await processCommand('hello there', 'user', 'chat');
    expect(result.response).toContain("❓ I didn't understand that");
  });

  it('returns unknown command message for unrecognized commands', async () => {
    const result = await processCommand('/unknown', 'user', 'chat');
    expect(result.response).toContain('Unknown command');
  });
});
