import { getClient } from '../db/index.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import { logger } from '../utils/logger.js';
import type {
  KnowledgeDocumentRecord,
  KnowledgeChunkRecord,
  KnowledgeDocumentListResponse,
  KnowledgeDocumentUploadResponse,
  KnowledgeDocumentDetailResponse,
  KnowledgeDocumentStatus,
} from '../types/founderKnowledge.js';
import { parseDocument } from './documentParser.js';
import { createChunks } from './chunking.js';

export interface CreateDocumentParams {
  organizationId: string;
  userId: string;
  name: string;
  mimeType: string;
  fileSize: number;
  content: string;
}

export interface ListDocumentsParams {
  organizationId: string;
  limit?: number;
  offset?: number;
  status?: KnowledgeDocumentStatus;
}

export interface GetDocumentParams {
  organizationId: string;
  documentId: string;
}

export interface ArchiveDocumentParams {
  organizationId: string;
  documentId: string;
}

const DOCUMENT_FIELDS = `
  id, organization_id, name, mime_type, status,
  file_size, chunk_count, created_by, created_at, updated_at, archived_at
`;

const CHUNK_FIELDS = `
  id, document_id, organization_id, chunk_index, content, token_count, created_at
`;

function mapDocumentRow(row: Record<string, unknown>): KnowledgeDocumentRecord {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    name: row.name as string,
    mime_type: row.mime_type as string,
    status: row.status as KnowledgeDocumentStatus,
    file_size: Number(row.file_size),
    chunk_count: Number(row.chunk_count),
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    archived_at: row.archived_at as string | null,
  };
}

function mapChunkRow(row: Record<string, unknown>): KnowledgeChunkRecord {
  return {
    id: row.id as string,
    document_id: row.document_id as string,
    organization_id: row.organization_id as string,
    chunk_index: Number(row.chunk_index),
    content: row.content as string,
    token_count: Number(row.token_count),
    created_at: row.created_at as string,
  };
}

export async function createDocument(
  params: CreateDocumentParams
): Promise<KnowledgeDocumentUploadResponse> {
  const { organizationId, userId, name, mimeType, fileSize, content } = params;

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const docResult = await client.query<{ id: string }>(
      `INSERT INTO knowledge_documents
         (organization_id, name, mime_type, status, file_size, created_by)
       VALUES ($1, $2, $3, 'uploading', $4, $5)
       RETURNING id`,
      [organizationId, name, mimeType, fileSize, userId]
    );

    const documentId = docResult.rows[0].id;

    const chunks = createChunks(content);

    if (chunks.length === 0) {
      await client.query(
        `UPDATE knowledge_documents SET status = 'failed', updated_at = NOW() WHERE id = $1`,
        [documentId]
      );
      await client.query('COMMIT');
      throw new BadRequestError('Document contains no extractable text');
    }

    for (const chunk of chunks) {
      await client.query(
        `INSERT INTO knowledge_chunks
           (document_id, organization_id, chunk_index, content, token_count)
         VALUES ($1, $2, $3, $4, $5)`,
        [documentId, organizationId, chunk.chunkIndex, chunk.content, chunk.tokenCount]
      );
    }

    await client.query(
      `UPDATE knowledge_documents
         SET status = 'ready', chunk_count = $1, updated_at = NOW()
       WHERE id = $2`,
      [chunks.length, documentId]
    );

    await client.query('COMMIT');

    logger.info(
      { documentId, organizationId, chunkCount: chunks.length },
      'Knowledge document created and chunked'
    );

    return {
      document_id: documentId,
      status: 'ready',
      chunk_count: chunks.length,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err, organizationId, name }, 'Failed to create knowledge document');
    if (err instanceof BadRequestError) throw err;
    throw new BadRequestError('Failed to create knowledge document');
  } finally {
    client.release();
  }
}

export async function listDocuments(
  params: ListDocumentsParams
): Promise<KnowledgeDocumentListResponse> {
  const { organizationId, limit = 20, offset = 0, status } = params;

  const client = await getClient();

  try {
    let whereClause = 'WHERE organization_id = $1 AND status != \'archived\'';
    const values: unknown[] = [organizationId];
    let paramIndex = 2;

    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    const countResult = await client.query(
      `SELECT COUNT(*)::INTEGER as total FROM knowledge_documents ${whereClause}`,
      values
    );
    const total = countResult.rows[0]?.total ?? 0;

    const dataResult = await client.query<Record<string, unknown>>(
      `SELECT ${DOCUMENT_FIELDS}
       FROM knowledge_documents
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );

    const documents = dataResult.rows.map(mapDocumentRow);

    return {
      documents,
      pagination: {
        page: Math.floor(offset / limit) + 1,
        limit,
        total,
        hasMore: offset + documents.length < total,
      },
    };
  } finally {
    client.release();
  }
}

export async function getDocument(
  params: GetDocumentParams
): Promise<KnowledgeDocumentDetailResponse | null> {
  const { organizationId, documentId } = params;

  const client = await getClient();

  try {
    const docResult = await client.query<Record<string, unknown>>(
      `SELECT ${DOCUMENT_FIELDS} FROM knowledge_documents WHERE id = $1 AND organization_id = $2`,
      [documentId, organizationId]
    );

    if (docResult.rowCount === 0) {
      return null;
    }

    const document = mapDocumentRow(docResult.rows[0]);

    const chunksResult = await client.query<Record<string, unknown>>(
      `SELECT ${CHUNK_FIELDS} FROM knowledge_chunks WHERE document_id = $1 ORDER BY chunk_index ASC`,
      [documentId]
    );

    const chunks = chunksResult.rows.map(mapChunkRow);

    return {
      document: {
        ...document,
        chunks,
      },
    };
  } finally {
    client.release();
  }
}

export async function archiveDocument(
  params: ArchiveDocumentParams
): Promise<KnowledgeDocumentRecord> {
  const { organizationId, documentId } = params;

  const client = await getClient();

  try {
    const result = await client.query<Record<string, unknown>>(
      `UPDATE knowledge_documents
         SET status = 'archived', archived_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status != 'archived'
       RETURNING ${DOCUMENT_FIELDS}`,
      [documentId, organizationId]
    );

    if (result.rowCount === 0) {
      const checkResult = await client.query<Record<string, unknown>>(
        `SELECT ${DOCUMENT_FIELDS} FROM knowledge_documents WHERE id = $1`,
        [documentId]
      );
      if (checkResult.rowCount === 0) {
        throw new NotFoundError('Document not found');
      }
      if (checkResult.rows[0].organization_id !== organizationId) {
        throw new BadRequestError('Access denied to this document');
      }
      throw new BadRequestError('Document is already archived');
    }

    logger.info({ documentId, organizationId }, 'Knowledge document archived');

    return mapDocumentRow(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function processDocumentUpload(
  organizationId: string,
  userId: string,
  file: { buffer: Uint8Array; originalname: string; mimetype: string; size: number }
): Promise<KnowledgeDocumentUploadResponse> {
  const parseResult = await parseDocument(file.buffer, file.mimetype);

  if (!parseResult.success) {
    throw new BadRequestError(parseResult.error ?? 'Failed to parse document');
  }

  return createDocument({
    organizationId,
    userId,
    name: file.originalname,
    mimeType: file.mimetype,
    fileSize: file.size,
    content: parseResult.text,
  });
}