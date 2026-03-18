-- Patch: ensure remaining columns and indexes from migration 002 are applied

ALTER TABLE research_responses ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES research_projects(id) ON DELETE SET NULL;
ALTER TABLE research_responses ADD COLUMN IF NOT EXISTS participant_id UUID REFERENCES participants(id) ON DELETE SET NULL;
ALTER TABLE research_responses ADD COLUMN IF NOT EXISTS audio_url TEXT;

CREATE INDEX IF NOT EXISTS idx_responses_project     ON research_responses(project_id);
CREATE INDEX IF NOT EXISTS idx_responses_participant ON research_responses(participant_id);

-- idx_projects_active was missing from first run
CREATE INDEX IF NOT EXISTS idx_projects_active ON research_projects(is_active);
