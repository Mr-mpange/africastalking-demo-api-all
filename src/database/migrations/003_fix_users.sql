-- Fix users table to match auth controller expectations
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Backfill username from email for existing rows
UPDATE users SET username = split_part(email, '@', 1) WHERE username IS NULL;

-- response_type column needed by USSD/Voice save
ALTER TABLE research_responses ADD COLUMN IF NOT EXISTS response_type VARCHAR(20) DEFAULT 'ussd';
