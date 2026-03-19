-- Migration 008: Add researcher_id and researcher_name to research_questions
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS researcher_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS researcher_name VARCHAR(255);
