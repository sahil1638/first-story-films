-- Migration 010: Add admin_notes column to leads, quotations, and orders
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS admin_notes TEXT;
