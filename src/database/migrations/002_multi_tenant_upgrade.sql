-- ============================================================
-- Migration 002: Multi-Tenant AI Research Platform Upgrade
-- ============================================================

-- Enable UUID extension (safe if already exists)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. research_projects ────────────────────────────────────
CREATE TABLE IF NOT EXISTS research_projects (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  researcher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_researcher ON research_projects(researcher_id);
CREATE INDEX IF NOT EXISTS idx_projects_active     ON research_projects(is_active);

-- ── 2. Extend research_questions ────────────────────────────
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES research_projects(id) ON DELETE CASCADE;
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(30) DEFAULT 'text';
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS title_sw VARCHAR(255);
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS question_text_sw TEXT;

CREATE INDEX IF NOT EXISTS idx_questions_project ON research_questions(project_id);

-- ── 3. participants ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS participants (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(30) UNIQUE NOT NULL,
  name         VARCHAR(255),
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_participants_phone ON participants(phone_number);

-- ── 4. Extend research_responses ────────────────────────────
ALTER TABLE research_responses ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES research_projects(id) ON DELETE SET NULL;
ALTER TABLE research_responses ADD COLUMN IF NOT EXISTS participant_id UUID REFERENCES participants(id) ON DELETE SET NULL;
ALTER TABLE research_responses ADD COLUMN IF NOT EXISTS audio_url TEXT;

CREATE INDEX IF NOT EXISTS idx_responses_project     ON research_responses(project_id);
CREATE INDEX IF NOT EXISTS idx_responses_participant ON research_responses(participant_id);

-- ── 5. ai_summaries ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_summaries (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  question_id   UUID REFERENCES research_questions(id) ON DELETE SET NULL,
  summary_text  TEXT NOT NULL,
  insights_json JSONB DEFAULT '{}',
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_summaries_project  ON ai_summaries(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_question ON ai_summaries(question_id);

-- ── 6. updated_at trigger helper ────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projects_updated_at ON research_projects;
CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON research_projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
