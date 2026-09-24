import { logger } from '../utils/logger.js';
import {
  SUPPORTED_MIME_TYPES,
  isSupportedMimeType,
  MAX_FILE_SIZE,
} from '../types/founderKnowledge.js';

export interface ParseResult {
  text: string;
  success: boolean;
  error?: string;
}

export class DocumentParseError extends Error {
  readonly mimeType: string;

  constructor(message: string, mimeType: string) {
    super(message);
    this.name = 'DocumentParseError';
    this.mimeType = mimeType;
  }
}

async function parsePdf(buffer: Uint8Array): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = await import('pdf-parse') as any;
    const data = await (pdfParse.default ?? pdfParse)(buffer);
    return data.text;
  } catch (err) {
    logger.error({ err, mimeType: 'application/pdf' }, 'PDF parsing failed');
    throw new DocumentParseError('Failed to parse PDF document', 'application/pdf');
  }
}

async function parseDocx(buffer: Uint8Array): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return result.value;
  } catch (err) {
    logger.error({ err, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, 'DOCX parsing failed');
    throw new DocumentParseError('Failed to parse DOCX document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }
}

function parseText(buffer: Uint8Array): string {
  try {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(buffer);
  } catch (err) {
    logger.error({ err, mimeType: 'text/plain' }, 'Text decoding failed');
    throw new DocumentParseError('Failed to decode text file', 'text/plain');
  }
}

function parseMarkdown(buffer: Uint8Array): string {
  return parseText(buffer);
}

export async function parseDocument(
  buffer: Uint8Array,
  mimeType: string
): Promise<ParseResult> {
  if (!isSupportedMimeType(mimeType)) {
    return {
      text: '',
      success: false,
      error: `Unsupported MIME type: ${mimeType}. Supported types: ${SUPPORTED_MIME_TYPES.join(', ')}`,
    };
  }

  if (buffer.length > MAX_FILE_SIZE) {
    return {
      text: '',
      success: false,
      error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`,
    };
  }

  try {
    let text: string;

    switch (mimeType) {
      case 'application/pdf':
        text = await parsePdf(buffer);
        break;
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        text = await parseDocx(buffer);
        break;
      case 'text/plain':
        text = parseText(buffer);
        break;
      case 'text/markdown':
        text = parseMarkdown(buffer);
        break;
      default:
        return {
          text: '',
          success: false,
          error: `Unsupported MIME type: ${mimeType}`,
        };
    }

    if (!text || text.trim().length === 0) {
      return {
        text: '',
        success: false,
        error: 'Document contains no extractable text',
      };
    }

    return {
      text: text.trim(),
      success: true,
    };
  } catch (err) {
    if (err instanceof DocumentParseError) {
      return {
        text: '',
        success: false,
        error: err.message,
      };
    }
    logger.error({ err, mimeType }, 'Unexpected document parsing error');
    return {
      text: '',
      success: false,
      error: 'Unknown parsing error occurred',
    };
  }
}

export function validateDocument(
  buffer: Uint8Array,
  mimeType: string
): { valid: boolean; error?: string } {
  if (!isSupportedMimeType(mimeType)) {
    return {
      valid: false,
      error: `Unsupported MIME type: ${mimeType}. Supported types: ${SUPPORTED_MIME_TYPES.join(', ')}`,
    };
  }

  if (buffer.length === 0) {
    return { valid: false, error: 'File is empty' };
  }

  if (buffer.length > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)} MB`,
    };
  }

  return { valid: true };
}