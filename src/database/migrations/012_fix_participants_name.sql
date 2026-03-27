-- Migration 012: Ensure participants.name column exists
ALTER TABLE participants ADD COLUMN IF NOT EXISTS name VARCHAR(255);
