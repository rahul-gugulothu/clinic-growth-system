-- V3.1.14-A: Founder Knowledge Base Foundation
-- Creates knowledge_documents and knowledge_chunks tables

-- knowledge_documents table
CREATE TABLE knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('uploading', 'processing', 'ready', 'failed', 'archived')) DEFAULT 'uploading',
    file_size BIGINT NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ NULL
);

-- Indexes for knowledge_documents
CREATE INDEX idx_knowledge_documents_organization_id ON knowledge_documents(organization_id);
CREATE INDEX idx_knowledge_documents_created_by ON knowledge_documents(created_by);
CREATE INDEX idx_knowledge_documents_status ON knowledge_documents(status);

-- knowledge_chunks table
CREATE TABLE knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for knowledge_chunks
CREATE INDEX idx_knowledge_chunks_organization_id ON knowledge_chunks(organization_id);
CREATE INDEX idx_knowledge_chunks_document_id ON knowledge_chunks(document_id);
CREATE INDEX idx_knowledge_chunks_document_chunk_index ON knowledge_chunks(document_id, chunk_index);

-- ============================================================================
-- TRIGGERS

-- Updated_at trigger for knowledge_documents
CREATE TRIGGER update_knowledge_documents_updated_at
    BEFORE UPDATE ON knowledge_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();