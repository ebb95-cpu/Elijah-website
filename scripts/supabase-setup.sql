-- ══════════════════════════════════════════
-- Ask Elijah — Supabase Database Setup
-- Run this in your Supabase SQL Editor
-- Dashboard > SQL Editor > New Query > Paste > Run
-- ══════════════════════════════════════════

-- 1. User Profiles (extends Supabase Auth users)
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  location_city TEXT DEFAULT '',
  location_country TEXT DEFAULT '',
  total_questions INTEGER DEFAULT 0,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Questions (chat log + escalation tracking)
CREATE TABLE IF NOT EXISTS questions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  response_text TEXT,
  sources_used TEXT DEFAULT '[]',
  confidence REAL DEFAULT 0.5,
  status TEXT DEFAULT 'answered' CHECK (status IN ('answered', 'needs_elijah', 'elijah_responded', 'human_verified')),
  elijah_raw_response TEXT,
  notify_user BOOLEAN DEFAULT FALSE,
  user_location TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Ingestion Log (knowledge base tracking)
CREATE TABLE IF NOT EXISTS ingestion_log (
  id BIGSERIAL PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_url TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  chunks_created INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Admin Password Resets
CREATE TABLE IF NOT EXISTS admin_resets (
  id INTEGER PRIMARY KEY DEFAULT 1,
  reset_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Helper function: increment question count
CREATE OR REPLACE FUNCTION increment_question_count(uid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE user_profiles
  SET total_questions = total_questions + 1,
      last_active = NOW()
  WHERE user_id = uid;

  -- If profile doesn't exist yet, create it
  IF NOT FOUND THEN
    INSERT INTO user_profiles (user_id, total_questions, first_seen, last_active)
    VALUES (uid, 1, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET total_questions = user_profiles.total_questions + 1,
        last_active = NOW();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Row Level Security (RLS)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_resets ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = user_id);

-- Users can read their own questions
CREATE POLICY "Users read own questions" ON questions
  FOR SELECT USING (auth.uid() = user_id);

-- Service role (backend) has full access via service key
-- (No additional policies needed — service role bypasses RLS)

-- 7. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_questions_user_id ON questions(user_id);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_created ON questions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_type ON ingestion_log(source_type);
CREATE INDEX IF NOT EXISTS idx_ingestion_status ON ingestion_log(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_created ON ingestion_log(created_at DESC);

-- Done! Your database is ready.
