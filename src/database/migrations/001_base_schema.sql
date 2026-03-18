-- ============================================================
-- Migration 001: Base Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- users
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255),
  role          VARCHAR(50) DEFAULT 'researcher',
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- research_questions
CREATE TABLE IF NOT EXISTS research_questions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         VARCHAR(255) NOT NULL,
  question_text TEXT NOT NULL,
  order_index   INTEGER DEFAULT 0,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- research_responses
CREATE TABLE IF NOT EXISTS research_responses (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id   UUID REFERENCES research_questions(id) ON DELETE SET NULL,
  phone_number  VARCHAR(30),
  response_text TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_responses_question ON research_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_responses_phone    ON research_responses(phone_number);

-- sms_logs
CREATE TABLE IF NOT EXISTS sms_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(30),
  message      TEXT,
  direction    VARCHAR(10) DEFAULT 'outbound',
  status       VARCHAR(50),
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
