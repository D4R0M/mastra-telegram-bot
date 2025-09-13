import { createTool } from "@mastra/core/tools";
import type { IMastraLogger } from "@mastra/core/logger";
import { z } from "zod";
import { createCard, getCardsByOwner } from "../../db/cards.js";
import type { CreateCardData } from "../../db/cards.js";

// Interface for CSV import/export data
interface CSVCard {
  front: string;
  back: string;
  tags?: string[];
  example?: string;
  lang_front?: string;
  lang_back?: string;
}

// Helper function to parse CSV data
function parseCSV(csvData: string): string[][] {
  const lines = csvData.trim().split('\n');
  const result: string[][] = [];
  
  for (const line of lines) {
    // Simple CSV parsing - handles quoted fields with commas
    const fields: string[] = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"' && (i === 0 || line[i - 1] === ',')) {
        inQuotes = true;
      } else if (char === '"' && inQuotes && (i + 1 === line.length || line[i + 1] === ',')) {
        inQuotes = false;
      } else if (char === ',' && !inQuotes) {
        fields.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    
    // Add the last field
    fields.push(currentField.trim());
    result.push(fields);
  }
  
  return result;
}

// Helper function to detect CSV headers
function detectHeaders(rows: string[][]): { [key: string]: number } {
  if (rows.length === 0) return {};
  
  const headerRow = rows[0];
  const headerMapping: { [key: string]: number } = {};
  
  // Common header variations for vocabulary cards
  const headerPatterns = {
    front: ['front', 'word', 'term', 'question', 'native', 'source'],
    back: ['back', 'translation', 'definition', 'answer', 'target', 'meaning'],
    tags: ['tags', 'categories', 'labels', 'groups'],
    example: ['example', 'sentence', 'usage', 'context'],
    lang_front: ['lang_front', 'source_lang', 'from_lang', 'language_front'],
    lang_back: ['lang_back', 'target_lang', 'to_lang', 'language_back'],
  };
  
  // Try to match headers to fields
  for (let i = 0; i < headerRow.length; i++) {
    const header = headerRow[i].toLowerCase().trim();
    
    for (const [field, patterns] of Object.entries(headerPatterns)) {
      if (patterns.some(pattern => header.includes(pattern))) {
        headerMapping[field] = i;
        break;
      }
    }
  }
  
  // If no matches found, assume order: front, back, tags, example, lang_front, lang_back
  if (Object.keys(headerMapping).length === 0 && headerRow.length >= 2) {
    headerMapping.front = 0;
    headerMapping.back = 1;
    if (headerRow.length > 2) headerMapping.tags = 2;
    if (headerRow.length > 3) headerMapping.example = 3;
    if (headerRow.length > 4) headerMapping.lang_front = 4;
    if (headerRow.length > 5) headerMapping.lang_back = 5;
  }
  
  return headerMapping;
}

// Helper function to convert CSV rows to card data
function convertCSVToCards(rows: string[][], headerMapping: { [key: string]: number | undefined }): CSVCard[] {
  const cards: CSVCard[] = [];
  
  // Skip header row if it exists
  const dataRows = rows.slice(1);
  
  for (const row of dataRows) {
    // Skip empty rows
    if (row.every(cell => !cell.trim())) continue;
    
    const card: CSVCard = {
      front: (headerMapping.front !== undefined && row[headerMapping.front]) ? row[headerMapping.front].trim() : '',
      back: (headerMapping.back !== undefined && row[headerMapping.back]) ? row[headerMapping.back].trim() : '',
    };
    
    // Add optional fields if they exist
    if (headerMapping.tags !== undefined && row[headerMapping.tags]) {
      const tagsStr = row[headerMapping.tags].trim();
      card.tags = tagsStr ? tagsStr.split(/[,;|]/).map(tag => tag.trim()).filter(tag => tag) : [];
    }
    
    if (headerMapping.example !== undefined && row[headerMapping.example]) {
      card.example = row[headerMapping.example].trim();
    }
    
    if (headerMapping.lang_front !== undefined && row[headerMapping.lang_front]) {
      card.lang_front = row[headerMapping.lang_front].trim();
    }
    
    if (headerMapping.lang_back !== undefined && row[headerMapping.lang_back]) {
      card.lang_back = row[headerMapping.lang_back].trim();
    }
    
    // Only add cards with both front and back
    if (card.front && card.back) {
      cards.push(card);
    }
  }
  
  return cards;
}

// Helper function to convert cards to CSV format
function convertCardsToCSV(cards: any[]): string {
  const headers = ['Front', 'Back', 'Tags', 'Example', 'Language Front', 'Language Back'];
  const csvLines = [headers.join(',')];
  
  for (const card of cards) {
    const row = [
      `"${(card.front || '').replace(/"/g, '""')}"`,
      `"${(card.back || '').replace(/"/g, '""')}"`,
      `"${(card.tags ? card.tags.join(';') : '').replace(/"/g, '""')}"`,
      `"${(card.example || '').replace(/"/g, '""')}"`,
      `"${(card.lang_front || '').replace(/"/g, '""')}"`,
      `"${(card.lang_back || '').replace(/"/g, '""')}"`,
    ];
    csvLines.push(row.join(','));
  }
  
  return csvLines.join('\n');
}

// Import vocabulary cards from CSV data
export const importCSVTool = createTool({
  id: "import-csv-tool",
  description: `Import vocabulary cards from CSV data with automatic header detection. Supports various column arrangements and header names.`,
  inputSchema: z.object({
    owner_id: z.string().describe("User ID who will own the imported cards"),
    csv_data: z.string().describe("CSV data to import (with or without headers)"),
    has_headers: z.boolean().default(true).describe("Whether the CSV data includes header row"),
    default_lang_front: z.string().default("").describe("Default front language if not specified in CSV"),
    default_lang_back: z.string().default("").describe("Default back language if not specified in CSV"),
    skip_duplicates: z.boolean().default(true).describe("Whether to skip cards that might be duplicates"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    imported_count: z.number(),
    skipped_count: z.number(),
    errors: z.array(z.object({
      row: z.number(),
      error: z.string(),
    })),
    header_mapping: z.record(z.number()).optional(),
    sample_cards: z.array(z.object({
      front: z.string(),
      back: z.string(),
      tags: z.array(z.string()).optional(),
      example: z.string().optional(),
    })).optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [ImportCSV] Starting CSV import with params:', {
      owner_id: context.owner_id,
      has_headers: context.has_headers,
      data_length: context.csv_data.length
    });

    try {
      // Parse CSV data
      const rows = parseCSV(context.csv_data);
      if (rows.length === 0) {
        return {
          success: false,
          imported_count: 0,
          skipped_count: 0,
          errors: [],
          message: "No data found in CSV"
        };
      }

      logger?.info('📝 [ImportCSV] Parsed CSV rows:', { total_rows: rows.length });

      // Detect headers
      const rawHeaderMapping = context.has_headers ? detectHeaders(rows) : {
        front: 0,
        back: 1,
        tags: rows[0].length > 2 ? 2 : undefined,
        example: rows[0].length > 3 ? 3 : undefined,
        lang_front: rows[0].length > 4 ? 4 : undefined,
        lang_back: rows[0].length > 5 ? 5 : undefined,
      };

      // Filter out undefined values for output schema compatibility
      const headerMapping: Record<string, number> = {};
      Object.entries(rawHeaderMapping).forEach(([key, value]) => {
        if (value !== undefined) {
          headerMapping[key] = value;
        }
      });

      logger?.info('📝 [ImportCSV] Header mapping detected:', headerMapping);

      // Convert to card data
      const csvCards = convertCSVToCards(context.has_headers ? rows : [[], ...rows], rawHeaderMapping);
      logger?.info('📝 [ImportCSV] Converted to cards:', { card_count: csvCards.length });

      if (csvCards.length === 0) {
        return {
          success: false,
          imported_count: 0,
          skipped_count: 0,
          errors: [],
          header_mapping: headerMapping,
          message: "No valid cards found in CSV data"
        };
      }

      // Import cards to database
      let importedCount = 0;
      let skippedCount = 0;
      const errors: { row: number, error: string }[] = [];

      for (let i = 0; i < csvCards.length; i++) {
        const csvCard = csvCards[i];
        
        try {
          const cardData: CreateCardData = {
            owner_id: context.owner_id,
            front: csvCard.front,
            back: csvCard.back,
            tags: csvCard.tags || [],
            example: csvCard.example || '',
            lang_front: csvCard.lang_front || context.default_lang_front,
            lang_back: csvCard.lang_back || context.default_lang_back,
          };

          // Check for duplicates if requested
          if (context.skip_duplicates) {
            const existingCards = await getCardsByOwner(context.owner_id, { limit: 1000 });
            const isDuplicate = existingCards.some(card => 
              card.front.toLowerCase() === csvCard.front.toLowerCase() ||
              card.back.toLowerCase() === csvCard.back.toLowerCase()
            );
            
            if (isDuplicate) {
              skippedCount++;
              continue;
            }
          }

          await createCard(cardData);
          importedCount++;
          
        } catch (error) {
          errors.push({
            row: i + (context.has_headers ? 2 : 1), // Account for header row
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const sampleCards = csvCards.slice(0, 3).map(card => ({
        front: card.front,
        back: card.back,
        tags: card.tags,
        example: card.example,
      }));

      logger?.info('✅ [ImportCSV] Import completed:', { 
        imported: importedCount,
        skipped: skippedCount,
        errors: errors.length 
      });

      return {
        success: true,
        imported_count: importedCount,
        skipped_count: skippedCount,
        errors,
        header_mapping: headerMapping,
        sample_cards: sampleCards,
        message: `Successfully imported ${importedCount} cards${skippedCount > 0 ? `, skipped ${skippedCount} duplicates` : ''}${errors.length > 0 ? `, ${errors.length} errors` : ''}`
      };

    } catch (error) {
      logger?.error('❌ [ImportCSV] Error during import:', error);
      return {
        success: false,
        imported_count: 0,
        skipped_count: 0,
        errors: [{ row: 0, error: error instanceof Error ? error.message : 'Unknown error' }],
        message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});

// Export vocabulary cards to CSV format
export const exportCSVTool = createTool({
  id: "export-csv-tool",
  description: `Export vocabulary cards to CSV format with proper escaping and headers.`,
  inputSchema: z.object({
    owner_id: z.string().describe("User ID whose cards to export"),
    include_inactive: z.boolean().default(false).describe("Whether to include inactive/deleted cards"),
    tags_filter: z.array(z.string()).optional().describe("Only export cards with these tags"),
    limit: z.number().optional().describe("Maximum number of cards to export"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    csv_data: z.string().optional(),
    card_count: z.number(),
    filename_suggestion: z.string().optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [ExportCSV] Starting CSV export with params:', context);

    try {
      // Get cards from database
      const cards = await getCardsByOwner(context.owner_id, {
        active: !context.include_inactive,
        tags: context.tags_filter,
        limit: context.limit,
      });

      logger?.info('📝 [ExportCSV] Retrieved cards from database:', { count: cards.length });

      if (cards.length === 0) {
        return {
          success: true,
          csv_data: '',
          card_count: 0,
          message: "No cards found to export"
        };
      }

      // Convert to CSV
      const csvData = convertCardsToCSV(cards);
      const timestamp = new Date().toISOString().split('T')[0];
      const filenameSuggestion = `vocabulary_export_${timestamp}.csv`;

      logger?.info('✅ [ExportCSV] Export completed successfully:', { 
        card_count: cards.length,
        csv_size: csvData.length 
      });

      return {
        success: true,
        csv_data: csvData,
        card_count: cards.length,
        filename_suggestion: filenameSuggestion,
        message: `Successfully exported ${cards.length} cards to CSV format`
      };

    } catch (error) {
      logger?.error('❌ [ExportCSV] Error during export:', error);
      return {
        success: false,
        csv_data: '',
        card_count: 0,
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});

// Preview CSV data before importing
export const previewCSVTool = createTool({
  id: "preview-csv-tool",
  description: `Preview CSV data to check header detection and data parsing before importing.`,
  inputSchema: z.object({
    csv_data: z.string().describe("CSV data to preview"),
    has_headers: z.boolean().default(true).describe("Whether the CSV data includes header row"),
    sample_size: z.number().default(5).describe("Number of sample rows to show"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    total_rows: z.number(),
    header_mapping: z.record(z.number()),
    sample_cards: z.array(z.object({
      row_number: z.number(),
      front: z.string(),
      back: z.string(),
      tags: z.array(z.string()).optional(),
      example: z.string().optional(),
      lang_front: z.string().optional(),
      lang_back: z.string().optional(),
    })),
    detected_headers: z.array(z.string()).optional(),
    issues: z.array(z.string()),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🔧 [PreviewCSV] Starting CSV preview with params:', {
      has_headers: context.has_headers,
      sample_size: context.sample_size,
      data_length: context.csv_data.length
    });

    try {
      // Parse CSV data
      const rows = parseCSV(context.csv_data);
      if (rows.length === 0) {
        return {
          success: false,
          total_rows: 0,
          header_mapping: {},
          sample_cards: [],
          issues: ['No data found in CSV'],
          message: "No data found in CSV"
        };
      }

      // Detect headers
      const rawHeaderMapping = context.has_headers ? detectHeaders(rows) : {
        front: 0,
        back: 1,
        tags: rows[0].length > 2 ? 2 : undefined,
        example: rows[0].length > 3 ? 3 : undefined,
        lang_front: rows[0].length > 4 ? 4 : undefined,
        lang_back: rows[0].length > 5 ? 5 : undefined,
      };

      // Filter out undefined values for output schema compatibility
      const headerMapping: Record<string, number> = {};
      Object.entries(rawHeaderMapping).forEach(([key, value]) => {
        if (value !== undefined) {
          headerMapping[key] = value;
        }
      });

      const detectedHeaders = context.has_headers ? rows[0] : undefined;

      // Convert sample data  
      const csvCards = convertCSVToCards(context.has_headers ? rows : [[], ...rows], rawHeaderMapping);
      const sampleCards = csvCards.slice(0, context.sample_size).map((card, index) => ({
        row_number: index + (context.has_headers ? 2 : 1),
        front: card.front,
        back: card.back,
        tags: card.tags,
        example: card.example,
        lang_front: card.lang_front,
        lang_back: card.lang_back,
      }));

      // Check for issues
      const issues: string[] = [];
      
      if (headerMapping.front === undefined || headerMapping.back === undefined) {
        issues.push('Could not detect front and back columns - please check your CSV headers');
      }
      
      const emptyCards = csvCards.filter(card => !card.front || !card.back).length;
      if (emptyCards > 0) {
        issues.push(`${emptyCards} rows have empty front or back fields and will be skipped`);
      }

      if (csvCards.length === 0) {
        issues.push('No valid cards found in CSV data');
      }

      logger?.info('✅ [PreviewCSV] Preview completed:', { 
        total_rows: rows.length,
        valid_cards: csvCards.length,
        issues: issues.length 
      });

      return {
        success: true,
        total_rows: rows.length - (context.has_headers ? 1 : 0),
        header_mapping: headerMapping,
        sample_cards: sampleCards,
        detected_headers: detectedHeaders,
        issues,
        message: `Preview shows ${csvCards.length} valid cards from ${rows.length} rows${issues.length > 0 ? ` with ${issues.length} issues` : ''}`
      };

    } catch (error) {
      logger?.error('❌ [PreviewCSV] Error during preview:', error);
      return {
        success: false,
        total_rows: 0,
        header_mapping: {},
        sample_cards: [],
        issues: [error instanceof Error ? error.message : 'Unknown error'],
        message: `Preview failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});