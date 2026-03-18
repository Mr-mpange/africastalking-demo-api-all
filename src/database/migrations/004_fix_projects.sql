-- Ensure research_projects has all required columns
ALTER TABLE research_projects ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE research_projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE research_projects ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Ensure research_questions has all required columns  
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS question_text TEXT;
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
