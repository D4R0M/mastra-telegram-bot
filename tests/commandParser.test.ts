import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/client.ts', () => ({
  getPool: () => ({ query: vi.fn() }),
}));

vi.mock('../src/mastra/authorization.ts', () => ({
  isAdmin: vi.fn().mockResolvedValue(false),
}));

const { mockAdd, mockAddAlias, mockHelp, mockStart, mockCheckMlLog } = vi.hoisted(() => ({
  mockAdd: vi.fn(async () => ({ response: 'add' })),
  mockAddAlias: vi.fn(async () => ({ response: 'add-alias' })),
  mockHelp: vi.fn(async () => ({ response: 'help' })),
  mockStart: vi.fn(async () => ({ response: 'start' })),
  mockCheckMlLog: vi.fn(async () => ({ response: 'check-ml-log' })),
}));

vi.mock('../src/mastra/commands/index.ts', () => ({
  commandRegistry: {
    '/add': mockAdd,
    '/a': mockAddAlias,
    '/help': mockHelp,
    '/start': mockStart,
    '/check_ml_log': mockCheckMlLog,
  }
}));

import { parseCommand, processCommand } from '../src/mastra/commandParser.ts';
import { isAdmin } from '../src/mastra/authorization.ts';

const isAdminMock = vi.mocked(isAdmin);

beforeEach(() => {
  mockAdd.mockClear();
  mockAddAlias.mockClear();
  mockHelp.mockClear();
  mockStart.mockClear();
  mockCheckMlLog.mockClear();
  isAdminMock.mockReset();
  isAdminMock.mockResolvedValue(false);
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

  it('routes /check_ml_log without requiring admin privileges in the parser', async () => {
    const result = await processCommand('/check_ml_log', 'user', 'chat');

    expect(result.response).toBe('check-ml-log');
    expect(mockCheckMlLog).toHaveBeenCalledWith([], '', 'user', undefined, undefined);
  });

  it('processes slash commands even with active conversation state', async () => {
    const result = await processCommand('/start', 'user', 'chat', { mode: 'add_card_guided', step: 1 });
    expect(result.response).toBe('start');
    expect(mockStart).toHaveBeenCalled();
  });
});
