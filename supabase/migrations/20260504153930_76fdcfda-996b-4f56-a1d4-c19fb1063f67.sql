
-- Enums
CREATE TYPE public.payroll_cycle_status AS ENUM ('open', 'closed');
CREATE TYPE public.debt_source AS ENUM ('app', 'historical_import');
CREATE TYPE public.debt_movement_type AS ENUM ('payroll_deduction', 'refund', 'adjustment');

-- payroll_cycles
CREATE TABLE public.payroll_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_date date NOT NULL UNIQUE,
  status public.payroll_cycle_status NOT NULL DEFAULT 'open',
  source public.debt_source NOT NULL DEFAULT 'app',
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX idx_payroll_cycles_payroll_date ON public.payroll_cycles (payroll_date DESC);

ALTER TABLE public.payroll_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/DM can view payroll_cycles"
  ON public.payroll_cycles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'data_manager'));
CREATE POLICY "Admin can insert payroll_cycles"
  ON public.payroll_cycles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin can update payroll_cycles"
  ON public.payroll_cycles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- debt_cases
CREATE TABLE public.debt_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  payroll_cycle_id uuid NOT NULL REFERENCES public.payroll_cycles(id) ON DELETE RESTRICT,
  initial_debt numeric(10,2) NOT NULL CHECK (initial_debt >= 0),
  initial_debt_breakdown jsonb,
  exit_date date,
  manually_settled boolean NOT NULL DEFAULT false,
  settled_reason text,
  settled_at timestamptz,
  settled_by uuid,
  source public.debt_source NOT NULL DEFAULT 'app',
  source_file text,
  source_row_hash text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (person_id, payroll_cycle_id)
);
CREATE INDEX idx_debt_cases_person ON public.debt_cases (person_id);
CREATE INDEX idx_debt_cases_cycle ON public.debt_cases (payroll_cycle_id);

ALTER TABLE public.debt_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/DM can view debt_cases"
  ON public.debt_cases FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'data_manager'));
CREATE POLICY "Admin can insert debt_cases"
  ON public.debt_cases FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin can update debt_cases"
  ON public.debt_cases FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER update_debt_cases_updated_at
  BEFORE UPDATE ON public.debt_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- debt_movements (append-only)
CREATE TABLE public.debt_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_case_id uuid NOT NULL REFERENCES public.debt_cases(id) ON DELETE RESTRICT,
  movement_type public.debt_movement_type NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  occurred_on date NOT NULL,
  reason text,
  note text,
  source public.debt_source NOT NULL DEFAULT 'app',
  source_row_hash text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX idx_debt_movements_case ON public.debt_movements (debt_case_id);

ALTER TABLE public.debt_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/DM can view debt_movements"
  ON public.debt_movements FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'data_manager'));

-- Insert: deduction/refund = admin OR data_manager; adjustment = admin only
CREATE POLICY "Insert deduction/refund by admin or DM"
  ON public.debt_movements FOR INSERT TO authenticated
  WITH CHECK (
    movement_type IN ('payroll_deduction','refund')
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'data_manager'))
  );
CREATE POLICY "Insert adjustment by admin only"
  ON public.debt_movements FOR INSERT TO authenticated
  WITH CHECK (
    movement_type = 'adjustment'
    AND public.has_role(auth.uid(),'admin')
  );

-- Append-only trigger: block UPDATE and DELETE
CREATE OR REPLACE FUNCTION public.debt_movements_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'debt_movements is append-only: % not allowed', TG_OP;
END;
$$;

CREATE TRIGGER debt_movements_no_update
  BEFORE UPDATE ON public.debt_movements
  FOR EACH ROW EXECUTE FUNCTION public.debt_movements_append_only();
CREATE TRIGGER debt_movements_no_delete
  BEFORE DELETE ON public.debt_movements
  FOR EACH ROW EXECUTE FUNCTION public.debt_movements_append_only();
