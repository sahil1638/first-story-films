CREATE TABLE IF NOT EXISTS public.order_deliverables (
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  deliverable_id UUID NOT NULL REFERENCES public.deliverables(id) ON DELETE CASCADE,
  PRIMARY KEY (order_id, deliverable_id)
);

ALTER TABLE public.order_deliverables ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_deliverables'
      AND policyname = 'Authenticated full access'
  ) THEN
    CREATE POLICY "Authenticated full access"
    ON public.order_deliverables
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;
