import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/db/cards.ts', () => ({
  createCard: vi.fn(async (data) => ({ id: '1', ...data })),
  getCardsByOwner: vi.fn(),
}));
vi.mock('../src/db/reviews.ts', () => ({
  getDueCards: vi.fn(),
}));

import { createCard, getCardsByOwner } from '../src/db/cards.ts';
import { getDueCards } from '../src/db/reviews.ts';
import { importCSVTool, exportCSVTool } from '../src/mastra/tools/importExportTools.ts';

describe('import/export CSV tools', () => {
  beforeEach(() => {
    vi.mocked(getCardsByOwner).mockReset();
    vi.mocked(getDueCards).mockReset();
    vi.mocked(createCard).mockClear();
  });

  it('imports CSV with quoted commas and CRLF', async () => {
    vi.mocked(getCardsByOwner).mockResolvedValue([]);
    const csv = 'Front,Back,Tags,Example\r\n"hello","world","greeting","hi, there"\r\n';
    const result = await importCSVTool.execute({
      context: {
        owner_id: 'user1',
        csv_data: csv,
        has_headers: true,
        default_lang_front: '',
        default_lang_back: '',
        skip_duplicates: false,
      },
      mastra: undefined,
    });
    expect(result.success).toBe(true);
    expect(result.imported_count).toBe(1);
    expect(vi.mocked(createCard)).toHaveBeenCalled();
  });

  it('exports cards with proper CSV escaping', async () => {
    vi.mocked(getCardsByOwner).mockResolvedValue([
      {
        id: '1',
        owner_id: 'user1',
        front: 'hello',
        back: 'world',
        tags: ['greeting'],
        example: 'hi, there',
        lang_front: 'en',
        lang_back: 'sv',
        active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);

    const result = await exportCSVTool.execute({
      context: {
        owner_id: 'user1',
        include_inactive: false,
        limit: 1000,
      },
      mastra: undefined,
    });

    expect(result.success).toBe(true);
    expect(result.csv_data).toBeDefined();
    expect(result.csv_data?.split('\n').length).toBe(2);
    expect(result.csv_data).toContain('"hi, there"');
  });

  it('exports due cards when due_only is true', async () => {
    vi.mocked(getDueCards).mockResolvedValue([
      {
        card: {
          id: '1',
          owner_id: 'user1',
          front: 'due',
          back: 'card',
          tags: [],
          example: '',
          lang_front: 'en',
          lang_back: 'sv',
          active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
        review_state: { due_date: '2024-01-01' },
      },
    ]);

    const result = await exportCSVTool.execute({
      context: {
        owner_id: 'user1',
        include_inactive: false,
        limit: 1000,
        due_only: true,
      },
      mastra: undefined,
    });

    expect(getDueCards).toHaveBeenCalled();
    expect(getCardsByOwner).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.card_count).toBe(1);
  });
});
