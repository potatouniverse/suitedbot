-- Add auto_approve_at column to submissions table
-- This column stores the deadline for automatic approval if poster doesn't review

ALTER TABLE submissions 
ADD COLUMN auto_approve_at TIMESTAMPTZ;

-- Add index for efficient cron job queries
CREATE INDEX idx_submissions_auto_approve ON submissions(auto_approve_at) 
WHERE status = 'pending' AND auto_approve_at IS NOT NULL;

-- Add comment
COMMENT ON COLUMN submissions.auto_approve_at IS 'Deadline for automatic approval if poster does not review submission (e.g., 48 hours after submission)';
