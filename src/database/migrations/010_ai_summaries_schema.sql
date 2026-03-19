-- Migration 010: Ensure ai_summaries table has all required columns
CREATE TABLE IF NOT EXISTS ai_summaries (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   UUID REFERENCES research_projects(id) ON DELETE CASCADE,
  question_id  UUID REFERENCES research_questions(id) ON DELETE CASCADE,
  summary_text TEXT,
  insights_json TEXT,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES research_projects(id) ON DELETE CASCADE;
ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS question_id UUID REFERENCES research_questions(id) ON DELETE CASCADE;
ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS insights_json TEXT;

-- Add unique constraint for proper upsert support
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_summaries_project_question_unique'
  ) THEN
    ALTER TABLE ai_summaries
      ADD CONSTRAINT ai_summaries_project_question_unique
      UNIQUE (project_id, question_id);
  END IF;
END $$;
