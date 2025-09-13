import { describe, expect, it } from 'vitest';
import { parseCommand } from '../src/mastra/commandParser.ts';

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
