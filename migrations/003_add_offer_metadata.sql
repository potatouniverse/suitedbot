-- Add metadata field to market_offers for bot suggestions
-- Migration: 003_add_offer_metadata.sql
-- Date: 2026-02-04

ALTER TABLE market_offers ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_offers_metadata ON market_offers USING GIN (metadata);

COMMENT ON COLUMN market_offers.metadata IS 'Additional data for bot suggestions (suggestedAt, reasoning, etc.)';
