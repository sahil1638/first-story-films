-- Migration: 052_operational_alerts_and_pdf_scaling.sql
-- Adds durable operational alert storage, a private PDF cache bucket, and database-backed
-- PDF render leases for horizontally scaled deployments.

CREATE TABLE IF NOT EXISTS public.operational_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warn', 'error')),
  alert boolean NOT NULL DEFAULT false,
  message text NOT NULL,
  context jsonb
);

ALTER TABLE public.operational_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.operational_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.operational_events TO service_role;

CREATE INDEX IF NOT EXISTS idx_operational_events_created_at
  ON public.operational_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_events_alerts
  ON public.operational_events (severity, created_at DESC)
  WHERE alert = true OR severity = 'error';

CREATE TABLE IF NOT EXISTS public.pdf_render_locks (
  slot_id integer PRIMARY KEY,
  locked_by text NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pdf_render_locks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pdf_render_locks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pdf_render_locks TO service_role;

CREATE OR REPLACE FUNCTION public.try_acquire_pdf_render_slot(
  p_max_slots integer,
  p_lease_seconds integer,
  p_owner text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  acquired_slot integer;
BEGIN
  IF p_max_slots IS NULL OR p_max_slots < 1 THEN
    RAISE EXCEPTION 'max_slots must be at least 1';
  END IF;

  IF p_lease_seconds IS NULL OR p_lease_seconds < 5 THEN
    RAISE EXCEPTION 'lease_seconds must be at least 5';
  END IF;

  DELETE FROM public.pdf_render_locks
  WHERE locked_at < now() - make_interval(secs => p_lease_seconds);

  INSERT INTO public.pdf_render_locks (slot_id, locked_by)
  SELECT candidate.slot_id, p_owner
  FROM generate_series(1, p_max_slots) AS candidate(slot_id)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.pdf_render_locks locks
    WHERE locks.slot_id = candidate.slot_id
  )
  ORDER BY candidate.slot_id
  LIMIT 1
  ON CONFLICT DO NOTHING
  RETURNING slot_id INTO acquired_slot;

  RETURN acquired_slot;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_pdf_render_slot(
  p_slot_id integer,
  p_owner text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.pdf_render_locks
  WHERE pdf_render_locks.slot_id = p_slot_id
    AND pdf_render_locks.locked_by = p_owner;
END;
$$;

REVOKE ALL ON FUNCTION public.try_acquire_pdf_render_slot(integer, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_pdf_render_slot(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_pdf_render_slot(integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_pdf_render_slot(integer, text) TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pdf-cache', 'pdf-cache', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
