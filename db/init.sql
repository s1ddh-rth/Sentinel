-- SENTINEL — PostgreSQL schema
-- Applied automatically on first container start (mounted to /docker-entrypoint-initdb.d).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Auth
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'case_officer'
        CHECK (role IN ('admin', 'analyst', 'case_officer')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ---------------------------------------------------------------------------
-- Feature store
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS features (
    offender_id VARCHAR(64) PRIMARY KEY,
    features JSONB NOT NULL,
    graph_features JSONB,
    census_features JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Predictions (every prediction is logged here)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offender_id VARCHAR(64) NOT NULL,
    risk_score FLOAT NOT NULL,
    risk_band VARCHAR(10) NOT NULL,
    confidence_lower FLOAT,
    confidence_upper FLOAT,
    model_version VARCHAR(64) NOT NULL,
    shap_values JSONB,
    input_features JSONB NOT NULL,
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_predictions_offender ON predictions(offender_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Human overrides (every override is logged here)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id UUID REFERENCES predictions(id),
    offender_id VARCHAR(64) NOT NULL,
    original_band VARCHAR(10) NOT NULL,
    new_band VARCHAR(10) NOT NULL,
    reason_code VARCHAR(64) NOT NULL,
    reason_text TEXT,
    user_id UUID REFERENCES users(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_overrides_offender ON overrides(offender_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Agent conversation memory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(64) NOT NULL,
    offender_id VARCHAR(64),
    role VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    citations JSONB,
    tool_calls JSONB,
    retrieval_path VARCHAR(16),
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id, created_at);

-- ---------------------------------------------------------------------------
-- Long-term per-offender case memory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offender_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(32) NOT NULL
        CHECK (event_type IN ('prediction', 'override', 'query', 'feedback')),
    summary TEXT NOT NULL,
    metadata JSONB,
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_case_memory_offender ON case_memory(offender_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Documents for BM25 hybrid retrieval
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(256) NOT NULL,
    page INT,
    chunk_text TEXT NOT NULL,
    chunk_index INT,
    metadata JSONB,
    tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED
);
CREATE INDEX IF NOT EXISTS idx_documents_tsv ON documents USING GIN(tsv);
