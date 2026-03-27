-- Migration 011: Fix participants table + airtime rewards tracking

-- Ensure participants.name column exists (may be missing in some prod instances)
ALTER TABLE participants ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Track airtime rewards sent to participants
CREATE TABLE IF NOT EXISTS airtime_rewards (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  project_id     UUID REFERENCES research_projects(id) ON DELETE CASCADE,
  phone_number   VARCHAR(20) NOT NULL,
  amount         NUMERIC(10,2) NOT NULL DEFAULT 50,
  currency       VARCHAR(5) NOT NULL DEFAULT 'TZS',
  status         VARCHAR(20) NOT NULL DEFAULT 'sent',
  at_response    TEXT,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (participant_id, project_id)
);
