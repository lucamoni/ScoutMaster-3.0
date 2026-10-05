-- Apply only when the annual API deployment is ready for production.
REVOKE INSERT, UPDATE, DELETE ON public.ragazzi FROM anon, authenticated;
DROP TRIGGER IF EXISTS sync_census_payment_ledger_trigger ON public.ragazzi;
DROP TRIGGER IF EXISTS on_ragazzo_created ON public.ragazzi;
