-- Tighten people table RLS: replace permissive USING (true) policy with role-aware policies.
-- Matches the same pattern used for equipment_transactions in migration 20260414103944.

DROP POLICY IF EXISTS "People viewable by authenticated" ON public.people;

CREATE POLICY "Admin/DM can view people" ON public.people
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'data_manager')
  );

CREATE POLICY "SBC can view people" ON public.people
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'sbc'));
