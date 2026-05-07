-- Performance indexes on people
CREATE UNIQUE INDEX IF NOT EXISTS idx_people_pers_id ON public.people (pers_id);
CREATE INDEX IF NOT EXISTS idx_people_branch_id ON public.people (branch_id);
CREATE INDEX IF NOT EXISTS idx_people_exit_date ON public.people (exit_date);

-- Performance indexes on equipment_transactions
CREATE INDEX IF NOT EXISTS idx_eq_tx_person_id ON public.equipment_transactions (person_id);
CREATE INDEX IF NOT EXISTS idx_eq_tx_type ON public.equipment_transactions (transaction_type);
CREATE INDEX IF NOT EXISTS idx_eq_tx_person_date ON public.equipment_transactions (person_id, transaction_date);

-- Audit logs table
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin can read all logs
CREATE POLICY "Admin can read all audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Users can read own actions
CREATE POLICY "Users can read own audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (actor_user_id = auth.uid());

-- Authenticated users can insert audit logs
CREATE POLICY "Authenticated can insert audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (actor_user_id = auth.uid());