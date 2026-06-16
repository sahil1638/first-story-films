-- Restrict accounting cascade RPC execution to authenticated users only.
-- The functions remain SECURITY DEFINER and continue to enforce admin/manager
-- authorization internally via public.current_user_role().

REVOKE ALL ON FUNCTION public.update_accounting_entry_cascade(uuid, numeric, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_accounting_entry_cascade(uuid, numeric, date, text) FROM anon;
REVOKE ALL ON FUNCTION public.update_accounting_entry_cascade(uuid, numeric, date, text) FROM authenticated;

REVOKE ALL ON FUNCTION public.delete_accounting_entry_cascade(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_accounting_entry_cascade(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_accounting_entry_cascade(uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.update_accounting_entry_cascade(uuid, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_accounting_entry_cascade(uuid) TO authenticated;
