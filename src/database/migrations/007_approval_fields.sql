-- Migration 007: Add approval tracking fields to users table
-- and Swahili translation fields to research_questions

-- User approval tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Swahili translation fields for research questions
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS title_sw TEXT;
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS question_text_sw TEXT;
