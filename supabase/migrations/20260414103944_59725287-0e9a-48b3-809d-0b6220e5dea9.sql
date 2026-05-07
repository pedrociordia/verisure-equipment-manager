-- Drop and recreate the safe view with minimal columns (no signatures, no *_details JSONB)
DROP VIEW IF EXISTS public.equipment_transactions_safe;

CREATE VIEW public.equipment_transactions_safe WITH (security_invoker = on) AS
SELECT id, person_id, transaction_type, transaction_date, sbc_user_id, sbc_name,
       phone, tablet, demobox, clothing, toolkit, izettle,
       sales_binder, id_card, access_pass, created_at
FROM public.equipment_transactions;

GRANT SELECT ON public.equipment_transactions_safe TO authenticated;

-- Replace broad SELECT policy with role-aware policies
DROP POLICY IF EXISTS "Transactions viewable by authenticated" ON public.equipment_transactions;

CREATE POLICY "Admin/DM can view all transactions" ON public.equipment_transactions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'data_manager')
  );

CREATE POLICY "SBC can view own transactions" ON public.equipment_transactions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'sbc') AND sbc_user_id = auth.uid()
  );