-- Add Swahili title/description to research_projects
ALTER TABLE research_projects ADD COLUMN IF NOT EXISTS title_sw VARCHAR(255);
ALTER TABLE research_projects ADD COLUMN IF NOT EXISTS description_sw TEXT;

-- Seed Swahili titles for existing projects
UPDATE research_projects SET
  title_sw = 'Upatikanaji wa Huduma za Afya Vijijini Tanzania',
  description_sw = 'Utafiti wa vikwazo vya upatikanaji wa huduma za afya katika jamii za vijijini Tanzania.'
WHERE project_code = 'HLTH-001';

UPDATE research_projects SET
  title_sw = 'Mazoea ya Wakulima Wadogo Mashariki mwa Afrika',
  description_sw = 'Utafiti wa mbinu za kilimo, mavuno, na mikakati ya kukabiliana na mabadiliko ya hali ya hewa.'
WHERE project_code = 'AGRI-001';

UPDATE research_projects SET
  title_sw = 'Utafiti wa Ajira ya Vijana na Pengo la Ujuzi',
  description_sw = 'Uchunguzi wa changamoto za ukosefu wa ajira kwa vijana wenye umri wa miaka 18-35.'
WHERE project_code = 'EMPL-001';
