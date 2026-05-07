-- =========================================================================
-- Security hardening — Verisure Equipment Manager
-- =========================================================================
-- Date: 2026-05-06
-- Adjusted to the real schema of project jjoofcdjnbxnmbdfonqj.
--
-- Apply order:
--   1. Read this file end to end before running. Run as a single transaction.
--   2. Apply via Supabase Dashboard → SQL Editor (paste, Run).
--   3. After success, run scripts/verify-dossier.sh and the seed.
--
-- Idempotency: every block uses IF EXISTS / CREATE OR REPLACE / DROP IF EXISTS
-- so re-running the migration on top of partial state is safe.
-- =========================================================================

BEGIN;

-- =========================================================================
-- SECTION 1 — profiles: WITH CHECK + pin sensitive columns for non-admins
-- =========================================================================
-- Real schema: PK is `profiles.id` (referenced by auth.uid()), columns
-- are id, email, full_name, branch_id (integer), active, created_at, updated_at.

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Trigger pinning sensitive columns for non-admins.
-- Admins can change branch_id / email / active via the Settings page;
-- self-service profile edits cannot.
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    NEW.branch_id := OLD.branch_id;
    NEW.email     := OLD.email;
    NEW.active    := OLD.active;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_columns_trigger ON public.profiles;
CREATE TRIGGER protect_profile_columns_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_columns();

-- =========================================================================
-- SECTION 2 — equipment_transactions: pin sbc_user_id, harden UPDATE
-- =========================================================================
-- Real schema: equipment columns are `phone`, `tablet`, `demobox`, `clothing`,
-- `toolkit`, `izettle`, `sales_binder`, `id_card`, `access_pass` (no _given suffix).

CREATE OR REPLACE FUNCTION public.pin_sbc_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- For non-admin INSERTs, force sbc_user_id = auth.uid().
  -- Admins can pass any sbc_user_id (bulk imports, retroactive entries).
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    NEW.sbc_user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pin_sbc_user_id_trigger ON public.equipment_transactions;
CREATE TRIGGER pin_sbc_user_id_trigger
BEFORE INSERT ON public.equipment_transactions
FOR EACH ROW
EXECUTE FUNCTION public.pin_sbc_user_id();

-- Add WITH CHECK to existing UPDATE policy
DROP POLICY IF EXISTS "Admin can update transactions" ON public.equipment_transactions;

CREATE POLICY "Admin can update transactions"
ON public.equipment_transactions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Change person_id FK from CASCADE to RESTRICT (preserve legal history)
ALTER TABLE public.equipment_transactions
DROP CONSTRAINT IF EXISTS equipment_transactions_person_id_fkey;

ALTER TABLE public.equipment_transactions
ADD CONSTRAINT equipment_transactions_person_id_fkey
FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE RESTRICT;

-- =========================================================================
-- SECTION 3 — debt_movements: pin created_by
-- =========================================================================
-- Real schema confirmed: created_by uuid YES (nullable). Append-only triggers
-- already exist (debt_movements_no_delete / debt_movements_no_update).

CREATE OR REPLACE FUNCTION public.pin_debt_movement_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pin_debt_movement_creator_trigger ON public.debt_movements;
CREATE TRIGGER pin_debt_movement_creator_trigger
BEFORE INSERT ON public.debt_movements
FOR EACH ROW
EXECUTE FUNCTION public.pin_debt_movement_creator();

-- =========================================================================
-- SECTION 4 — audit_logs: enforce append-only at three layers
-- =========================================================================
-- Real schema: id, actor_user_id, entity_type, entity_id, action, payload, created_at.
-- Existing policies confirmed: INSERT (with_check actor_user_id = auth.uid()),
-- two SELECTs (admin all, users own).

-- Defensively drop any existing UPDATE/DELETE policies (none expected, but
-- this protects against future regressions).
DROP POLICY IF EXISTS "Admin can update audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admin can delete audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated can update audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated can delete audit_logs" ON public.audit_logs;

-- Postgres-grant-level revoke (defense in depth)
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM authenticated, anon;

-- Blocking trigger that raises on UPDATE/DELETE attempts
CREATE OR REPLACE FUNCTION public.audit_logs_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only; UPDATE and DELETE are not permitted';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_no_update ON public.audit_logs;
CREATE TRIGGER audit_logs_no_update
BEFORE UPDATE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.audit_logs_append_only();

DROP TRIGGER IF EXISTS audit_logs_no_delete ON public.audit_logs;
CREATE TRIGGER audit_logs_no_delete
BEFORE DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.audit_logs_append_only();

-- =========================================================================
-- SECTION 5 — Lookup tables: replace USING(true) with role-aware policies
-- =========================================================================
-- branches stays broadly readable (non-sensitive operational lookup).
-- equipment_prices / phone_models / tablet_models become admin/DM only.

-- branches: keep SELECT for all authenticated (existing policy is fine).
-- No change needed.

-- equipment_prices
DROP POLICY IF EXISTS "Prices viewable by authenticated" ON public.equipment_prices;

CREATE POLICY "Prices viewable by admin/DM"
ON public.equipment_prices
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'data_manager'::public.app_role)
);

-- phone_models
DROP POLICY IF EXISTS "Phone models viewable by authenticated" ON public.phone_models;

CREATE POLICY "Phone models viewable by admin/DM"
ON public.phone_models
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'data_manager'::public.app_role)
);

-- tablet_models
DROP POLICY IF EXISTS "Tablet models viewable by authenticated" ON public.tablet_models;

CREATE POLICY "Tablet models viewable by admin/DM"
ON public.tablet_models
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'data_manager'::public.app_role)
);

-- =========================================================================
-- SECTION 6 — people: drop SBC SELECT, force RPC-only access
-- =========================================================================

DROP POLICY IF EXISTS "SBC can view people" ON public.people;

-- Recreate the admin/DM SELECT defensively (idempotent)
DROP POLICY IF EXISTS "Admin/DM can view people" ON public.people;

CREATE POLICY "Admin/DM can view people"
ON public.people
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'data_manager'::public.app_role)
);

-- people_lookup view: column-restricted, used internally for FK resolution
DROP VIEW IF EXISTS public.people_lookup CASCADE;

CREATE VIEW public.people_lookup
WITH (security_invoker = off) AS
SELECT
  id,
  pers_id,
  sales_id,
  sales_name,
  exit_date,
  branch_name
FROM public.people;

REVOKE ALL ON public.people_lookup FROM PUBLIC, anon;
GRANT SELECT ON public.people_lookup TO authenticated;

-- =========================================================================
-- SECTION 7 — equipment_transactions_safe: rebuild to embed person fields
-- and replicate RLS in the WHERE clause
-- =========================================================================

DROP VIEW IF EXISTS public.equipment_transactions_safe CASCADE;

CREATE VIEW public.equipment_transactions_safe
WITH (security_invoker = off) AS
SELECT
  et.id,
  et.person_id,
  et.transaction_type,
  et.transaction_date,
  et.phone,
  et.tablet,
  et.demobox,
  et.clothing,
  et.toolkit,
  et.izettle,
  et.sales_binder,
  et.id_card,
  et.access_pass,
  et.sbc_user_id,
  et.sbc_name,
  et.created_at,
  pl.sales_name,
  pl.pers_id,
  pl.branch_name
FROM public.equipment_transactions et
LEFT JOIN public.people pl ON pl.id = et.person_id
WHERE
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'data_manager'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'sbc'::public.app_role)
    AND et.sbc_user_id = auth.uid()
  );

REVOKE ALL ON public.equipment_transactions_safe FROM PUBLIC, anon;
GRANT SELECT ON public.equipment_transactions_safe TO authenticated;

-- =========================================================================
-- SECTION 8 — Restrict data_manager from signature columns on base table
-- =========================================================================
-- Strategy: data_manager loses direct base-table SELECT. They read
-- `equipment_transactions_for_reports` (Section 9) which exposes JSONB
-- device-detail columns (needed for debt calc) but EXCLUDES signatures.

-- Drop the existing data_manager SELECT path on the base table
DROP POLICY IF EXISTS "Admin/DM can view all transactions" ON public.equipment_transactions;

-- Admin keeps full SELECT
CREATE POLICY "Admin can view all transactions"
ON public.equipment_transactions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- SBC own-records SELECT already exists (do not touch):
-- "SBC can view own transactions": qual has_role(sbc) AND (sbc_user_id = auth.uid())

-- =========================================================================
-- SECTION 9 — equipment_transactions_for_reports view (admin/DM, no signatures)
-- =========================================================================

DROP VIEW IF EXISTS public.equipment_transactions_for_reports CASCADE;

CREATE VIEW public.equipment_transactions_for_reports
WITH (security_invoker = off) AS
SELECT
  et.id,
  et.person_id,
  et.transaction_type,
  et.transaction_date,
  et.phone,
  et.phone_details,
  et.tablet,
  et.tablet_details,
  et.demobox,
  et.demobox_details,
  et.clothing,
  et.clothing_details,
  et.toolkit,
  et.toolkit_details,
  et.izettle,
  et.izettle_details,
  et.sales_binder,
  et.id_card,
  et.access_pass,
  et.sbc_user_id,
  et.sbc_name,
  et.created_at,
  -- Explicitly NO signature columns:
  -- et.sbc_signature       -- excluded
  -- et.employee_signature  -- excluded
  pl.sales_name,
  pl.pers_id,
  pl.sales_id,
  pl.branch_name,
  pl.exit_date
FROM public.equipment_transactions et
LEFT JOIN public.people pl ON pl.id = et.person_id
WHERE
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'data_manager'::public.app_role);

REVOKE ALL ON public.equipment_transactions_for_reports FROM PUBLIC, anon;
GRANT SELECT ON public.equipment_transactions_for_reports TO authenticated;

-- =========================================================================
-- SECTION 10 — Index hygiene
-- =========================================================================

-- Ensure pers_id is uniquely indexed (NULLS allowed)
DROP INDEX IF EXISTS public.idx_people_pers_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_people_pers_id_unique
ON public.people(pers_id);

-- FK indexes (avoid sequential scans on cascade/restrict checks)
CREATE INDEX IF NOT EXISTS idx_equipment_transactions_person_id
ON public.equipment_transactions(person_id);

CREATE INDEX IF NOT EXISTS idx_equipment_transactions_sbc_user_id
ON public.equipment_transactions(sbc_user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id
ON public.audit_logs(actor_user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
ON public.audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
ON public.user_roles(user_id);

CREATE INDEX IF NOT EXISTS idx_debt_movements_debt_case_id
ON public.debt_movements(debt_case_id);

CREATE INDEX IF NOT EXISTS idx_debt_movements_created_by
ON public.debt_movements(created_by);

-- =========================================================================
-- SECTION 11 — has_role: confirm tightening (already STABLE SECURITY DEFINER)
-- =========================================================================
-- Real state confirmed: SECURITY DEFINER, STABLE, SET search_path TO 'public'.
-- We keep search_path = 'public' (rather than '') because the function body
-- references `public.user_roles` qualified — current setting is safe.
-- No change needed.

COMMIT;
