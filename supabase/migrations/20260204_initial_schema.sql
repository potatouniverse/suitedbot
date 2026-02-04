-- SuitedBot Initial Schema
-- A bidirectional marketplace where humans and bots work together

-- ═══════════════════════════════════════════════════════════════
-- Users Table (both humans and bots)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id), -- Only for humans with auth
  user_type VARCHAR(10) NOT NULL, -- 'human' or 'bot'
  display_name VARCHAR(100) NOT NULL,
  email TEXT,
  avatar_url TEXT,
  bio TEXT,
  
  -- Wallet & Economy
  salt_balance INTEGER DEFAULT 100,
  usdc_balance NUMERIC(20, 6) DEFAULT 0,
  
  -- Reputation
  reputation INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  tasks_posted INTEGER DEFAULT 0,
  
  -- Bot-specific
  bot_api_key TEXT, -- API key for bot authentication
  bot_tags TEXT[], -- Skills/tags for matching
  
  -- Human-specific  
  has_wallet_linked BOOLEAN DEFAULT false,
  wallet_address TEXT,
  wallet_last_verified_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_type ON users(user_type);
CREATE INDEX idx_users_auth ON users(auth_user_id);
CREATE INDEX idx_users_reputation ON users(reputation DESC);
CREATE INDEX idx_users_bot_api_key ON users(bot_api_key) WHERE bot_api_key IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- Tasks/Listings Table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_id UUID NOT NULL REFERENCES users(id),
  
  -- Task details
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category VARCHAR(50) DEFAULT 'general',
  -- Categories: general, code, writing, data, research, real-world, creative, review, other
  
  -- Type & Target
  task_type VARCHAR(20) DEFAULT 'task', -- 'task', 'service', 'trade'
  target_type VARCHAR(10) DEFAULT 'any', -- 'human', 'bot', 'any'
  
  -- Pricing
  currency VARCHAR(10) DEFAULT 'salt', -- 'salt' or 'usdc'
  budget_salt INTEGER,
  budget_usdc NUMERIC(20, 6),
  
  -- Status & Lifecycle
  status VARCHAR(20) DEFAULT 'active',
  -- active, claimed, in_progress, submitted, completed, cancelled
  claimed_by UUID REFERENCES users(id),
  claimed_at TIMESTAMPTZ,
  
  -- Requirements
  required_tags TEXT[], -- Skills needed
  deadline TIMESTAMPTZ,
  
  -- Metadata
  offer_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_poster ON tasks(poster_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_target_type ON tasks(target_type);
CREATE INDEX idx_tasks_claimed_by ON tasks(claimed_by);
CREATE INDEX idx_tasks_category ON tasks(category);
CREATE INDEX idx_tasks_created ON tasks(created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- Offers Table (bids/proposals on tasks)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  offerer_id UUID NOT NULL REFERENCES users(id),
  
  -- Offer details
  offer_text TEXT NOT NULL,
  price_salt INTEGER,
  price_usdc NUMERIC(20, 6),
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending',
  -- pending, accepted, rejected, countered
  
  -- Thread support
  parent_offer_id UUID REFERENCES offers(id),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_offers_task ON offers(task_id);
CREATE INDEX idx_offers_offerer ON offers(offerer_id);
CREATE INDEX idx_offers_status ON offers(status);

-- ═══════════════════════════════════════════════════════════════
-- Submissions Table (work delivered)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  submitter_id UUID NOT NULL REFERENCES users(id),
  
  -- Submission content
  content TEXT NOT NULL,
  attachment_url TEXT,
  
  -- Review status
  status VARCHAR(20) DEFAULT 'pending',
  -- pending, approved, rejected, revision_requested
  reviewer_notes TEXT,
  
  -- AI verification (optional)
  ai_score INTEGER, -- 0-100
  ai_reasoning TEXT,
  ai_status VARCHAR(20), -- ai_approved, ai_flagged
  ai_issues TEXT, -- JSON array
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_submissions_task ON submissions(task_id);
CREATE INDEX idx_submissions_submitter ON submissions(submitter_id);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_submissions_ai_status ON submissions(ai_status);

-- ═══════════════════════════════════════════════════════════════
-- Transactions Table (completed deals)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id),
  poster_id UUID NOT NULL REFERENCES users(id),
  completer_id UUID NOT NULL REFERENCES users(id),
  offer_id UUID REFERENCES offers(id),
  submission_id UUID REFERENCES submissions(id),
  
  -- Payment
  currency VARCHAR(10) NOT NULL,
  amount_salt INTEGER,
  amount_usdc NUMERIC(20, 6),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_task ON transactions(task_id);
CREATE INDEX idx_transactions_poster ON transactions(poster_id);
CREATE INDEX idx_transactions_completer ON transactions(completer_id);

-- ═══════════════════════════════════════════════════════════════
-- Reviews Table (ratings after completion)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id),
  transaction_id UUID REFERENCES transactions(id),
  reviewer_id UUID NOT NULL REFERENCES users(id),
  reviewed_id UUID NOT NULL REFERENCES users(id),
  
  -- Review content
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  content TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_reviewed ON reviews(reviewed_id);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);
CREATE INDEX idx_reviews_task ON reviews(task_id);

-- ═══════════════════════════════════════════════════════════════
-- RLS Policies (to be configured in Supabase)
-- ═══════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Users can read all public profiles
CREATE POLICY "Public profiles are viewable by everyone" ON users
  FOR SELECT USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = auth_user_id);

-- Tasks are viewable by everyone
CREATE POLICY "Tasks are viewable by everyone" ON tasks
  FOR SELECT USING (true);

-- Users can create tasks
CREATE POLICY "Authenticated users can create tasks" ON tasks
  FOR INSERT WITH CHECK (auth.uid() = (SELECT auth_user_id FROM users WHERE id = poster_id));

-- Task posters can update their own tasks
CREATE POLICY "Posters can update own tasks" ON tasks
  FOR UPDATE USING (auth.uid() = (SELECT auth_user_id FROM users WHERE id = poster_id));

-- Offers are viewable by task poster and offerer
CREATE POLICY "Offers viewable by involved parties" ON offers
  FOR SELECT USING (
    auth.uid() = (SELECT auth_user_id FROM users WHERE id = offerer_id) OR
    auth.uid() = (SELECT auth_user_id FROM users u JOIN tasks t ON t.poster_id = u.id WHERE t.id = task_id)
  );

-- Users can create offers
CREATE POLICY "Authenticated users can create offers" ON offers
  FOR INSERT WITH CHECK (auth.uid() = (SELECT auth_user_id FROM users WHERE id = offerer_id));

-- Submissions viewable by task poster and submitter
CREATE POLICY "Submissions viewable by involved parties" ON submissions
  FOR SELECT USING (
    auth.uid() = (SELECT auth_user_id FROM users WHERE id = submitter_id) OR
    auth.uid() = (SELECT auth_user_id FROM users u JOIN tasks t ON t.poster_id = u.id WHERE t.id = task_id)
  );

-- Users can create submissions
CREATE POLICY "Authenticated users can create submissions" ON submissions
  FOR INSERT WITH CHECK (auth.uid() = (SELECT auth_user_id FROM users WHERE id = submitter_id));

-- Transactions viewable by involved parties
CREATE POLICY "Transactions viewable by involved parties" ON transactions
  FOR SELECT USING (
    auth.uid() = (SELECT auth_user_id FROM users WHERE id = poster_id) OR
    auth.uid() = (SELECT auth_user_id FROM users WHERE id = completer_id)
  );

-- Reviews are viewable by everyone
CREATE POLICY "Reviews are viewable by everyone" ON reviews
  FOR SELECT USING (true);

-- Users can create reviews for completed transactions
CREATE POLICY "Users can review completed transactions" ON reviews
  FOR INSERT WITH CHECK (auth.uid() = (SELECT auth_user_id FROM users WHERE id = reviewer_id));

-- ═══════════════════════════════════════════════════════════════
-- Functions & Triggers
-- ═══════════════════════════════════════════════════════════════

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════

SELECT 'SuitedBot schema v1 initialized ✅' AS status;
