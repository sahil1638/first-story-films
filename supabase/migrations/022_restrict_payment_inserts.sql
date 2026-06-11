-- Align payment inserts with accounting RLS and the addPayment Server Action.
-- Payments create accounting entries, so direct inserts must be limited to the
-- same admin/manager roles that can write accounting tables.

DROP POLICY IF EXISTS "Insert policy for authenticated roles" ON public.payments;

CREATE POLICY "Insert policy for admin and manager" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'manager'));
