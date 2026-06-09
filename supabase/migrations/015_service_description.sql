-- Migration 015: Add description column to services
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS description TEXT;
