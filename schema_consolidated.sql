
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'data_manager', 'sbc');

-- BRANCHES TABLE
CREATE TABLE public.branches (
  id INTEGER PRIMARY KEY,
  district_code TEXT NOT NULL,
  name TEXT NOT NULL
);
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Branches viewable by authenticated" ON public.branches FOR SELECT TO authenticated USING (true);

-- PROFILES TABLE
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  branch_id INTEGER REFERENCES public.branches(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER_ROLES TABLE
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER FUNCTION
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- PROFILES RLS
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- USER_ROLES RLS
CREATE POLICY "View own or admin views all roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- PEOPLE TABLE
CREATE TABLE public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pers_id INTEGER UNIQUE NOT NULL,
  sales_id TEXT NOT NULL,
  sales_name TEXT NOT NULL,
  branch_id INTEGER REFERENCES public.branches(id),
  branch_name TEXT,
  exit_date DATE,
  sales_channel_start DATE,
  contract_type TEXT NOT NULL CHECK (contract_type IN ('Fixed Term', 'On Call')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "People viewable by authenticated" ON public.people FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/DM can insert people" ON public.people FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'data_manager'));
CREATE POLICY "Admin/DM can update people" ON public.people FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'data_manager'));
CREATE POLICY "Admin can delete people" ON public.people FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- EQUIPMENT_TRANSACTIONS TABLE
CREATE TABLE public.equipment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Uitgifte', 'Ingeleverd')),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sbc_user_id UUID REFERENCES auth.users(id),
  sbc_name TEXT,
  sbc_signature TEXT,
  employee_signature TEXT,
  phone BOOLEAN NOT NULL DEFAULT false,
  phone_details JSONB,
  tablet BOOLEAN NOT NULL DEFAULT false,
  tablet_details JSONB,
  demobox BOOLEAN NOT NULL DEFAULT false,
  demobox_details JSONB,
  clothing BOOLEAN NOT NULL DEFAULT false,
  clothing_details JSONB,
  toolkit BOOLEAN NOT NULL DEFAULT false,
  toolkit_details JSONB,
  izettle BOOLEAN NOT NULL DEFAULT false,
  izettle_details JSONB,
  sales_binder BOOLEAN NOT NULL DEFAULT false,
  id_card BOOLEAN NOT NULL DEFAULT false,
  access_pass BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.equipment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Transactions viewable by authenticated" ON public.equipment_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "SBC/Admin can insert transactions" ON public.equipment_transactions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sbc'));
CREATE POLICY "Admin can update transactions" ON public.equipment_transactions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete transactions" ON public.equipment_transactions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- EQUIPMENT_PRICES TABLE
CREATE TABLE public.equipment_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  item_name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE public.equipment_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Prices viewable by authenticated" ON public.equipment_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage prices" ON public.equipment_prices FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- PHONE_MODELS TABLE
CREATE TABLE public.phone_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE public.phone_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Phone models viewable by authenticated" ON public.phone_models FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage phone models" ON public.phone_models FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_people_updated_at BEFORE UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEED: BRANCHES
INSERT INTO public.branches (id, district_code, name) VALUES
  (14610, 'District 100', 'Best'),
  (14611, 'District 110', 'Roosendaal'),
  (14615, 'District 105', 'Elsloo'),
  (14616, 'District 115', 'Haaksbergen'),
  (14617, 'District 120', 'Duiven'),
  (14618, 'District 125', 'Weert'),
  (14619, 'District 130', 'Venlo'),
  (14620, 'District 200', 'Naarden'),
  (14621, 'District 210', 'Alkmaar'),
  (14622, 'District 215', 'Lelystad'),
  (14623, 'District 220', 'Haarlem'),
  (14625, 'District 205', 'Amstelveen'),
  (14626, 'District 225', 'Meppel'),
  (14627, 'District 230', 'Wormer'),
  (14628, 'District 235', 'Ermelo'),
  (14630, 'District 300', 'Giessen'),
  (14631, 'District 310', 'Ridderkerk'),
  (14632, 'District 315', 'Schiedam'),
  (14633, 'District 320', 'Gouda'),
  (14635, 'District 305', 'Zoetermeer'),
  (14636, 'District 330', 'Alphen aan den Rijn'),
  (14640, 'District 400', 'De Meern'),
  (14650, 'District 500', 'Field Trainers');

-- SEED: EQUIPMENT PRICES
INSERT INTO public.equipment_prices (category, item_name, price) VALUES
  ('demobox', 'ARLO Wire-Free Video Doorbell White', 88),
  ('demobox', 'Central Unit GW-CU2N', 83),
  ('demobox', 'Smartlock Danalock GW-SL', 80),
  ('demobox', 'ARLO Ess. XL ST CAMERA 1-PACK', 69),
  ('demobox', 'Camera One GW-MD-C1 (Orion)', 66),
  ('demobox', 'Arlo Essential Wired 1 cam', 52),
  ('demobox', 'Siren Voice Keypad GW-SVK', 47),
  ('demobox', 'Keypad GW-KP-MOK1 Mini Outdoor', 31),
  ('demobox', 'Smoke Detector GW-SD3', 24),
  ('demobox', 'Remote control Keyfob GW-KF white/grey', 14),
  ('demobox', 'Magnet Contact GW-MC2-SHOCK', 7),
  ('clothing', 'Winterjas', 75),
  ('clothing', 'Tussenjas', 75),
  ('clothing', 'Veteranen jas (persoonlijk)', 75),
  ('clothing', 'Pullover (1ste)', 30),
  ('clothing', 'Pullover (2de)', 30),
  ('clothing', 'Overhemd (1ste)', 25),
  ('clothing', 'Overhemd (2de)', 25),
  ('clothing', 'Overhemd (3de)', 25),
  ('clothing', 'Overhemd (4de)', 25),
  ('clothing', 'Polo (1ste)', 25),
  ('clothing', 'Polo (2de)', 25),
  ('clothing', 'Polo (3de)', 25),
  ('clothing', 'Polo (4de)', 25),
  ('clothing', 'Paraplu', 25),
  ('clothing', 'Bodywarmer', 20),
  ('toolkit', 'Boor/Schroefmachine', 180),
  ('toolkit', 'Trap', 140),
  ('toolkit', 'Boormachine', 135),
  ('toolkit', 'Gereedschap', 75),
  ('toolkit', 'Oplader boormachine', 65),
  ('toolkit', 'Koffer gereedschap', 40),
  ('toolkit', 'Montageset', 25),
  ('other', 'Sales Binder', 20),
  ('other', 'ID Card', 100),
  ('other', 'Toegangspas', 25);

-- SEED: PHONE MODELS
INSERT INTO public.phone_models (name, price) VALUES
  ('Huawei P8 lite', 100),
  ('Samsung A10', 150),
  ('Samsung A71', 250),
  ('Samsung A72', 260),
  ('Samsung J6+', 150),
  ('Samsung S9+', 300),
  ('Samsung S10+', 350),
  ('Samsung M52', 250),
  ('Samsung A53 5G', 300),
  ('Samsung A34 5G', 250),
  ('Samsung A35 5G', 260),
  ('Samsung A25', 200),
  ('Samsung A55', 300),
  ('Samsung A36', 250),
  ('OnePlus Nord N10', 250),
  ('OnePlus Nord 2', 300);

-- SEED: SAMPLE PEOPLE
INSERT INTO public.people (pers_id, sales_id, sales_name, branch_id, branch_name, sales_channel_start, contract_type) VALUES
  (358655, '14615DKE', 'Djan Kebi', 14615, 'District 105', '2024-03-15', 'Fixed Term'),
  (358700, '14610JVD', 'Jan van Dijk', 14610, 'District 100', '2024-01-10', 'Fixed Term'),
  (358701, '14611MDB', 'Maria de Boer', 14611, 'District 110', '2024-02-20', 'On Call'),
  (358702, '14620PJN', 'Pieter Jansen', 14620, 'District 200', '2023-11-05', 'Fixed Term'),
  (358703, '14621SBK', 'Sophie Bakker', 14621, 'District 210', '2024-04-01', 'On Call'),
  (358704, '14630WVS', 'Willem Visser', 14630, 'District 300', '2023-09-15', 'Fixed Term'),
  (358705, '14632TMS', 'Thomas Smit', 14632, 'District 315', '2024-05-10', 'On Call'),
  (358706, '14640EMR', 'Eva Mulder', 14640, 'District 400', '2023-12-01', 'Fixed Term'),
  (358707, '14623RDV', 'Rob de Vries', 14623, 'District 220', '2024-06-15', 'On Call'),
  (358708, '14625LHN', 'Lisa Hendriks', 14625, 'District 205', '2024-07-01', 'Fixed Term');

UPDATE public.people SET exit_date = '2025-03-01' WHERE pers_id = 358704;
UPDATE public.people SET exit_date = '2025-02-15' WHERE pers_id = 358702;

-- INDEXES
CREATE INDEX idx_people_pers_id ON public.people(pers_id);
CREATE INDEX idx_people_branch_id ON public.people(branch_id);
CREATE INDEX idx_people_exit_date ON public.people(exit_date);
CREATE INDEX idx_transactions_person_id ON public.equipment_transactions(person_id);
CREATE INDEX idx_transactions_type ON public.equipment_transactions(transaction_type);
CREATE INDEX idx_transactions_date ON public.equipment_transactions(transaction_date);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
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
CREATE TABLE public.tablet_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.tablet_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage tablet models"
  ON public.tablet_models FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tablet models viewable by authenticated"
  ON public.tablet_models FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE public.phone_models ADD COLUMN price_confirmed boolean NOT NULL DEFAULT true;
ALTER TABLE public.tablet_models ADD COLUMN price_confirmed boolean NOT NULL DEFAULT true;

UPDATE public.phone_models SET price_confirmed = false WHERE name IN ('Samsung A35 5G', 'Samsung A36');
UPDATE public.tablet_models SET price_confirmed = false WHERE name = 'Dell Latitude 5440';
ALTER TABLE public.people ALTER COLUMN pers_id TYPE text USING pers_id::text;ALTER TABLE public.people ADD CONSTRAINT people_pers_id_unique UNIQUE (pers_id);ALTER TABLE public.equipment_transactions
  ADD COLUMN IF NOT EXISTS source_system text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_row_hash text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS import_batch_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz DEFAULT NULL;ALTER TABLE public.people DROP CONSTRAINT IF EXISTS people_contract_type_check;
ALTER TABLE public.people ADD CONSTRAINT people_contract_type_check
  CHECK (contract_type = ANY (ARRAY['Fixed Term', 'On Call', 'Unknown']));ALTER TABLE public.people ADD COLUMN source text NOT NULL DEFAULT 'manual';CREATE UNIQUE INDEX IF NOT EXISTS idx_eq_tx_source_row_hash_unique 
  ON public.equipment_transactions (source_row_hash) 
  WHERE source_row_hash IS NOT NULL;DROP INDEX IF EXISTS idx_eq_tx_source_row_hash_unique;
ALTER TABLE public.equipment_transactions
  ADD CONSTRAINT uq_eq_tx_source_row_hash UNIQUE (source_row_hash);-- Restrict profiles SELECT: own profile OR admin
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admin can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Ensure handle_new_user trigger exists on auth.users
-- Drop first to be idempotent
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
-- Create a safe view excluding signature columns
CREATE VIEW public.equipment_transactions_safe AS
SELECT id, person_id, transaction_type, transaction_date, sbc_user_id, sbc_name,
       phone, phone_details, tablet, tablet_details, demobox, demobox_details,
       clothing, clothing_details, toolkit, toolkit_details, izettle, izettle_details,
       sales_binder, id_card, access_pass, created_at, source_system, import_batch_id, imported_at
FROM public.equipment_transactions;

-- Views inherit RLS from base table, but we need to grant access
GRANT SELECT ON public.equipment_transactions_safe TO authenticated;

ALTER VIEW public.equipment_transactions_safe SET (security_invoker = on);
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
  );-- Tighten people table RLS: replace permissive USING (true) policy with role-aware policies.
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
-- Hardening: eliminate broad SBC client-side people enumeration.
-- SBC Equipment Form now uses a scoped search RPC instead of SELECT * on people.
-- Dashboard stats now computed server-side via RPC.

-- 1. SBC employee lookup for Equipment Form
-- Returns only the minimum fields needed for transaction creation.
-- Requires authentication + SBC role. Minimum 2-char query. Max 50 results.
CREATE OR REPLACE FUNCTION public.search_people_for_sbc(
  query text,
  include_exited boolean DEFAULT false
)
RETURNS TABLE(id uuid, pers_id text, sales_id text, sales_name text, exit_date date, branch_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'sbc') THEN
    RAISE EXCEPTION 'Forbidden: sbc role required';
  END IF;

  IF length(trim(coalesce(query, ''))) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.id, p.pers_id, p.sales_id, p.sales_name, p.exit_date, p.branch_name
    FROM public.people p
    WHERE (
      p.sales_name ILIKE '%' || trim(query) || '%' OR
      p.pers_id ILIKE '%' || trim(query) || '%' OR
      p.sales_id ILIKE '%' || trim(query) || '%'
    )
    AND (include_exited OR p.exit_date IS NULL)
    ORDER BY p.sales_name
    LIMIT 50;
END;
$$;

-- 2. Dashboard stats (server-side aggregation)
-- Role-aware: SBC sees own transaction counts, admin/DM sees global.
-- Returns aggregate numbers only — no PII, no row-level data.
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  month_start date;
  month_end date;
  is_sbc boolean;
  caller_id uuid;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  is_sbc := public.has_role(caller_id, 'sbc')
             AND NOT public.has_role(caller_id, 'admin')
             AND NOT public.has_role(caller_id, 'data_manager');

  month_start := date_trunc('month', current_date)::date;
  month_end := (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date;

  IF is_sbc THEN
    SELECT json_build_object(
      'active', (SELECT count(*) FROM people WHERE exit_date IS NULL),
      'exited', (SELECT count(*) FROM people WHERE exit_date IS NOT NULL),
      'exits_this_month', (SELECT count(*) FROM people WHERE exit_date BETWEEN month_start AND month_end),
      'transactions', (SELECT count(*) FROM equipment_transactions WHERE sbc_user_id = caller_id),
      'without_forms', (
        SELECT count(*) FROM people p
        WHERE NOT EXISTS (
          SELECT 1 FROM equipment_transactions t WHERE t.person_id = p.id AND t.sbc_user_id = caller_id
        )
      ),
      'exited_no_return', (
        SELECT count(*) FROM people p
        WHERE p.exit_date BETWEEN month_start AND month_end
        AND NOT EXISTS (
          SELECT 1 FROM equipment_transactions t
          WHERE t.person_id = p.id AND t.transaction_type = 'Ingeleverd' AND t.sbc_user_id = caller_id
        )
      )
    ) INTO result;
  ELSE
    SELECT json_build_object(
      'active', (SELECT count(*) FROM people WHERE exit_date IS NULL),
      'exited', (SELECT count(*) FROM people WHERE exit_date IS NOT NULL),
      'exits_this_month', (SELECT count(*) FROM people WHERE exit_date BETWEEN month_start AND month_end),
      'transactions', (SELECT count(*) FROM equipment_transactions),
      'without_forms', (
        SELECT count(*) FROM people p
        WHERE NOT EXISTS (
          SELECT 1 FROM equipment_transactions t WHERE t.person_id = p.id
        )
      ),
      'exited_no_return', (
        SELECT count(*) FROM people p
        WHERE p.exit_date BETWEEN month_start AND month_end
        AND NOT EXISTS (
          SELECT 1 FROM equipment_transactions t
          WHERE t.person_id = p.id AND t.transaction_type = 'Ingeleverd'
        )
      )
    ) INTO result;
  END IF;

  RETURN result;
END;
$$;
-- Enforce signature size limit server-side. Client-side Zod validation already
-- caps signatures at 150 KB; this CHECK constraint mirrors that with a small
-- margin (160 KB) to cover base64 encoding variance and prevents bypass via
-- direct PostgREST/API calls.
ALTER TABLE public.equipment_transactions
  ADD CONSTRAINT equipment_transactions_signature_size_check
  CHECK (
    (sbc_signature IS NULL OR length(sbc_signature) <= 163840)
    AND (employee_signature IS NULL OR length(employee_signature) <= 163840)
  );

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

COMMIT;ALTER TABLE public.debt_cases ADD COLUMN IF NOT EXISTS frozen_engine_debt numeric(10,2) NULL;
COMMENT ON COLUMN public.debt_cases.frozen_engine_debt IS 'Snapshot of currentAssetsDebt + adjustment from legacy CSV import. NULL = app-managed case (use live engine). Non-null = historical case (immutable).';
-- Bootstrap admin user
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
  hashed_pw text;
BEGIN
  -- Skip if email already exists
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'pedro.ciordia@verisure.nl') THEN
    RAISE NOTICE 'User already exists, skipping creation';
    RETURN;
  END IF;

  -- IMPORTANT: replace the placeholder below with a strong password before
  -- applying this script in any new environment. The bootstrap admin in the
  -- live project was created with a different password that has been rotated.
  hashed_pw := crypt('<BOOTSTRAP_ADMIN_PASSWORD>', gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    'pedro.ciordia@verisure.nl',
    hashed_pw,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', 'Pedro Ciordia'),
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', 'pedro.ciordia@verisure.nl', 'email_verified', true),
    'email',
    new_user_id::text,
    now(), now(), now()
  );

  -- Profile (in case trigger didn't fire)
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new_user_id, 'pedro.ciordia@verisure.nl', 'Pedro Ciordia')
  ON CONFLICT (id) DO NOTHING;

  -- Admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
