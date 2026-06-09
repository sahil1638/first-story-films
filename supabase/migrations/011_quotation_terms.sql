-- Migration 011: Per-quotation terms and conditions
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;
