-- ============================================================
-- Fix missing columns + Seed 3 Research Projects
-- ============================================================

-- Add missing columns to research_questions
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS title_sw VARCHAR(255);
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS question_text_sw TEXT;
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(30) DEFAULT 'text';
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE research_questions ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

-- Add title alias to research_projects so USSD/Voice queries work
ALTER TABLE research_projects ADD COLUMN IF NOT EXISTS title VARCHAR(255);
UPDATE research_projects SET title = project_name WHERE title IS NULL;

DO $$
DECLARE
  admin_id UUID;
  proj1_id UUID;
  proj2_id UUID;
  proj3_id UUID;
BEGIN

  SELECT id INTO admin_id FROM users WHERE username = 'testuser' LIMIT 1;

  -- ── Project 1: Healthcare Access ─────────────────────────────────────────
  INSERT INTO research_projects (id, project_code, project_name, title, description, researcher_id, is_active)
  VALUES (
    uuid_generate_v4(), 'HLTH-001',
    'Healthcare Access in Rural Tanzania',
    'Healthcare Access in Rural Tanzania',
    'A study on barriers to healthcare access among rural communities in Tanzania.',
    admin_id, true
  ) RETURNING id INTO proj1_id;

  INSERT INTO research_questions (id, project_id, title, question_text, title_sw, question_text_sw, question_type, is_active, order_index)
  VALUES
    (uuid_generate_v4(), proj1_id,
     'Distance to Health Facility',
     'How far is the nearest health facility from your home?',
     'Umbali wa Kituo cha Afya',
     'Kituo cha afya kilicho karibu nawe kiko umbali gani kutoka nyumbani kwako?',
     'text', true, 1),
    (uuid_generate_v4(), proj1_id,
     'Healthcare Cost',
     'Can you afford the cost of healthcare services in your area?',
     'Gharama za Huduma za Afya',
     'Je, unaweza kumudu gharama za huduma za afya katika eneo lako?',
     'text', true, 2),
    (uuid_generate_v4(), proj1_id,
     'Health Challenges',
     'What is the biggest health challenge you face in your community?',
     'Changamoto za Kiafya',
     'Ni changamoto gani kubwa ya kiafya unayoikabili katika jamii yako?',
     'text', true, 3);

  -- ── Project 2: Agricultural Practices ────────────────────────────────────
  INSERT INTO research_projects (id, project_code, project_name, title, description, researcher_id, is_active)
  VALUES (
    uuid_generate_v4(), 'AGRI-001',
    'Smallholder Farmer Practices in East Africa',
    'Smallholder Farmer Practices in East Africa',
    'Research on farming techniques, crop yields, and climate adaptation strategies.',
    admin_id, true
  ) RETURNING id INTO proj2_id;

  INSERT INTO research_questions (id, project_id, title, question_text, title_sw, question_text_sw, question_type, is_active, order_index)
  VALUES
    (uuid_generate_v4(), proj2_id,
     'Main Crops Grown',
     'What are the main crops you grow on your farm?',
     'Mazao Makuu',
     'Ni mazao gani makuu unayolima shambani mwako?',
     'text', true, 1),
    (uuid_generate_v4(), proj2_id,
     'Climate Impact',
     'How has changing weather affected your crop yields in the last 3 years?',
     'Athari za Hali ya Hewa',
     'Mabadiliko ya hali ya hewa yameathiri vipi mavuno yako katika miaka 3 iliyopita?',
     'text', true, 2),
    (uuid_generate_v4(), proj2_id,
     'Support Needed',
     'What kind of support would most improve your farming productivity?',
     'Msaada Unaohitajika',
     'Ni aina gani ya msaada itakayoboresha zaidi tija yako ya kilimo?',
     'text', true, 3);

  -- ── Project 3: Youth Employment ───────────────────────────────────────────
  INSERT INTO research_projects (id, project_code, project_name, title, description, researcher_id, is_active)
  VALUES (
    uuid_generate_v4(), 'EMPL-001',
    'Youth Employment and Skills Gap Study',
    'Youth Employment and Skills Gap Study',
    'Investigating unemployment challenges among youth aged 18-35 and digital economy opportunities.',
    admin_id, true
  ) RETURNING id INTO proj3_id;

  INSERT INTO research_questions (id, project_id, title, question_text, title_sw, question_text_sw, question_type, is_active, order_index)
  VALUES
    (uuid_generate_v4(), proj3_id,
     'Current Employment Status',
     'Are you currently employed, self-employed, or looking for work?',
     'Hali ya Ajira Sasa',
     'Je, kwa sasa una ajira, unajitegemea, au unatafuta kazi?',
     'text', true, 1),
    (uuid_generate_v4(), proj3_id,
     'Skills and Training',
     'What skills or training do you have relevant to the job market?',
     'Ujuzi na Mafunzo',
     'Una ujuzi au mafunzo gani yanayohusiana na soko la ajira?',
     'text', true, 2),
    (uuid_generate_v4(), proj3_id,
     'Biggest Employment Barrier',
     'What is the biggest barrier preventing you from finding or keeping a job?',
     'Kikwazo Kikubwa cha Ajira',
     'Ni kikwazo gani kikubwa kinachokuzuia kupata au kudumisha kazi?',
     'text', true, 3);

END $$;
