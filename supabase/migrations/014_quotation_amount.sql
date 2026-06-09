-- Migration 014: Add amount column to quotations
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS amount DECIMAL(12, 2) NOT NULL DEFAULT 0;
