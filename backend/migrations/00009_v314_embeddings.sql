-- V3.1.14-B: Founder Knowledge Base Embedding Pipeline
-- Creates knowledge_chunk_embeddings table

CREATE TABLE knowledge_chunk_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    chunk_id UUID NOT NULL REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    embedding JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'ready', 'failed')) DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_knowledge_chunk_embeddings_chunk_id UNIQUE (chunk_id)
);

-- Indexes for knowledge_chunk_embeddings
CREATE INDEX idx_knowledge_chunk_embeddings_organization_id ON knowledge_chunk_embeddings(organization_id);
CREATE INDEX idx_knowledge_chunk_embeddings_chunk_id ON knowledge_chunk_embeddings(chunk_id);
CREATE INDEX idx_knowledge_chunk_embeddings_status ON knowledge_chunk_embeddings(status);

-- ============================================================================
-- TRIGGERS

-- Updated_at trigger for knowledge_chunk_embeddings
CREATE TRIGGER update_knowledge_chunk_embeddings_updated_at
    BEFORE UPDATE ON knowledge_chunk_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
