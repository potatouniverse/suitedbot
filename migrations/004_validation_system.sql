-- SuitedBot Validation & Trust System Migration
-- Time-lock auto-approval, proof attachments, bidirectional reviews

-- ═══════════════════════════════════════════════════════════════
-- Submissions Table Additions
-- ═══════════════════════════════════════════════════════════════

-- Time-lock auto-approval: auto-approve if poster doesn't review within 24h
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS auto_approve_at TIMESTAMPTZ;

-- Proof attachment system: workers can attach evidence
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS proof_url TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS proof_metadata JSONB;
-- proof_metadata example: { "hash": "sha256...", "file_type": "image/png", "file_size": 12345, "original_name": "screenshot.png" }

-- Index for auto-approval cron job (find pending submissions past deadline)
CREATE INDEX IF NOT EXISTS idx_submissions_auto_approve 
  ON submissions(auto_approve_at) 
  WHERE status = 'pending' AND auto_approve_at IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- Task Reviews Table (Bidirectional Reviews)
-- Workers can review posters - separate from existing reviews table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS task_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id),  -- worker who reviews
  reviewed_id UUID NOT NULL REFERENCES users(id),  -- poster being reviewed
  
  -- Review content
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  would_work_again BOOLEAN DEFAULT true,
  
  -- Categories (optional, for filtering)
  clarity_rating INTEGER CHECK (clarity_rating >= 1 AND clarity_rating <= 5),
  communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
  payment_speed_rating INTEGER CHECK (payment_speed_rating >= 1 AND payment_speed_rating <= 5),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One review per task per reviewer
  CONSTRAINT unique_task_review UNIQUE (task_id, reviewer_id)
);

CREATE INDEX idx_task_reviews_reviewed ON task_reviews(reviewed_id);
CREATE INDEX idx_task_reviews_reviewer ON task_reviews(reviewer_id);
CREATE INDEX idx_task_reviews_task ON task_reviews(task_id);
CREATE INDEX idx_task_reviews_rating ON task_reviews(rating);

-- Enable RLS
ALTER TABLE task_reviews ENABLE ROW LEVEL SECURITY;

-- Task reviews are viewable by everyone (public reputation)
CREATE POLICY "Task reviews are viewable by everyone" ON task_reviews
  FOR SELECT USING (true);

-- Workers can create reviews for tasks they completed
CREATE POLICY "Workers can review completed tasks" ON task_reviews
  FOR INSERT WITH CHECK (
    auth.uid() = (SELECT auth_user_id FROM users WHERE id = reviewer_id)
  );

-- ═══════════════════════════════════════════════════════════════
-- Users Table: Add poster reputation fields
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS poster_reputation INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS poster_reviews_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avg_poster_rating NUMERIC(3, 2) DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════
-- Functions
-- ═══════════════════════════════════════════════════════════════

-- Function to update poster reputation when they receive a review
CREATE OR REPLACE FUNCTION update_poster_reputation()
RETURNS TRIGGER AS $$
DECLARE
  avg_rating NUMERIC;
  review_count INTEGER;
BEGIN
  -- Calculate new average rating and count for the reviewed poster
  SELECT 
    AVG(rating)::NUMERIC(3,2),
    COUNT(*)::INTEGER
  INTO avg_rating, review_count
  FROM task_reviews
  WHERE reviewed_id = NEW.reviewed_id;
  
  -- Update user's poster reputation fields
  UPDATE users
  SET 
    avg_poster_rating = avg_rating,
    poster_reviews_count = review_count,
    poster_reputation = ROUND(avg_rating * 20)::INTEGER  -- Scale 1-5 to 0-100
  WHERE id = NEW.reviewed_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_poster_reputation
  AFTER INSERT ON task_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_poster_reputation();

-- ═══════════════════════════════════════════════════════════════

SELECT 'Validation system migration completed ✅' AS status;
