-- Migration 009: Create projects for orphaned questions and assign them
-- Remove failed attempt record so this re-runs cleanly
DELETE FROM schema_migrations WHERE filename = '009_assign_orphan_questions.sql';

DO $$
DECLARE
  admin_id UUID;
  proj_community UUID;
  proj_education UUID;
  proj_water UUID;
  proj_impact UUID;
BEGIN
  SELECT id INTO admin_id FROM users WHERE role = 'admin' LIMIT 1;

  -- Community Health project
  INSERT INTO research_projects (title, description, researcher_id, is_active, project_code)
  VALUES ('Community Health Study', 'Research on community health services and access', admin_id, true, 'COMM-001')
  RETURNING id INTO proj_community;

  UPDATE research_questions SET project_id = proj_community, order_index = 1
  WHERE title = 'Community Health' AND project_id IS NULL;
  UPDATE research_questions SET project_id = proj_community, order_index = 2
  WHERE title = 'Community Health Services' AND project_id IS NULL;

  -- Education & Economic project
  INSERT INTO research_projects (title, description, researcher_id, is_active, project_code)
  VALUES ('Education and Economic Opportunities', 'Study on education access and economic opportunities', admin_id, true, 'EDUC-001')
  RETURNING id INTO proj_education;

  UPDATE research_questions SET project_id = proj_education, order_index = 1
  WHERE title = 'Education Access' AND project_id IS NULL;
  UPDATE research_questions SET project_id = proj_education, order_index = 2
  WHERE title = 'Economic Opportunities' AND project_id IS NULL;

  -- Water Access project
  INSERT INTO research_projects (title, description, researcher_id, is_active, project_code)
  VALUES ('Water Access Study', 'Research on water access and availability', admin_id, true, 'WATR-001')
  RETURNING id INTO proj_water;

  UPDATE research_questions SET project_id = proj_water, order_index = 1
  WHERE title = 'Water Access Study' AND project_id IS NULL;

  -- Drug & Child Labour Impact project
  INSERT INTO research_projects (title, description, researcher_id, is_active, project_code)
  VALUES ('Drug and Child Labour Impact Study', 'Research on impact of drug abuse and child labour', admin_id, true, 'IMPT-001')
  RETURNING id INTO proj_impact;

  UPDATE research_questions SET project_id = proj_impact, order_index = 1
  WHERE title = 'The impact of drug abuse' AND project_id IS NULL;
  UPDATE research_questions SET project_id = proj_impact, order_index = 2
  WHERE title = 'The impact of child labour' AND project_id IS NULL;
  UPDATE research_questions SET project_id = proj_impact, order_index = 3
  WHERE title = 'The impact of drugs abuse' AND project_id IS NULL;

END $$;
