BEGIN;

ALTER TABLE public.debt_cases
  ADD COLUMN IF NOT EXISTS payroll_date_origin DATE;

UPDATE public.debt_cases dc
SET payroll_date_origin = pc.payroll_date
FROM public.payroll_cycles pc
WHERE dc.payroll_cycle_id = pc.id
  AND dc.payroll_date_origin IS NULL;

-- For any case missing a cycle (shouldn't happen, defensive), fall back to exit_date
UPDATE public.debt_cases
SET payroll_date_origin = exit_date
WHERE payroll_date_origin IS NULL AND exit_date IS NOT NULL;

ALTER TABLE public.debt_cases
  ALTER COLUMN payroll_date_origin SET NOT NULL;

ALTER TABLE public.debt_cases
  DROP COLUMN IF EXISTS payroll_cycle_id;

DROP TABLE IF EXISTS public.payroll_cycles CASCADE;

CREATE INDEX IF NOT EXISTS idx_debt_cases_payroll_origin
  ON public.debt_cases(payroll_date_origin DESC);

COMMIT;