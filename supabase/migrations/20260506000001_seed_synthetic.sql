-- =========================================================================
-- Synthetic seed data — Verisure Equipment Manager
-- =========================================================================
-- Date: 2026-05-06
-- Adjusted to the real schema of project jjoofcdjnbxnmbdfonqj.
--
-- What this does:
--   1. Wipes operational tables (people, equipment_transactions, debt_*,
--      audit_logs, profiles). Keeps lookup tables (branches, equipment_prices,
--      phone_models, tablet_models, user_roles, auth.users).
--   2. Seeds 200 synthetic people across the 5 first real branches
--      (14610-14618 range).
--   3. Seeds ~700-800 synthetic equipment transactions.
--
-- Apply order:
--   1. Run AFTER the security_hardening migration.
--   2. Paste in SQL Editor → Run.
--
-- Idempotent: safe to re-run; the TRUNCATE wipes whatever was there.
-- =========================================================================

BEGIN;

-- =========================================================================
-- SECTION 0 — Wipe operational tables
-- =========================================================================
-- Order matters because of FK ON DELETE RESTRICT. Equipment transactions
-- depend on people; debt_movements depend on debt_cases.
--
-- We DO NOT touch:
--   - branches (real Verisure NL districts already loaded)
--   - equipment_prices, phone_models, tablet_models (real reference data)
--   - user_roles (would lock you out)
--   - auth.users (would delete admin accounts)

TRUNCATE TABLE
  public.audit_logs,
  public.debt_movements,
  public.debt_cases,
  public.equipment_transactions,
  public.people
RESTART IDENTITY CASCADE;

-- =========================================================================
-- SECTION 1 — Synthetic people (200 records)
-- =========================================================================
-- Distributed across branches 14610..14618 (first 9 real Verisure NL districts).
-- ~14% are exited (employees with exit_date set).

DO $$
DECLARE
  i               int;
  branch_pool     int[] := ARRAY[14610, 14611, 14615, 14616, 14617,
                                 14618, 14619, 14620, 14621];
  branch_names    text[];
  branch_id_picked     int;
  branch_name_picked   text;
  start_offset    int;
  is_exited       boolean;
  exit_offset     int;
BEGIN
  -- Pull real branch names from the branches table to keep referential
  -- integrity perfect. Build a parallel array.
  SELECT array_agg(b.name ORDER BY pos.ord)
  INTO branch_names
  FROM unnest(branch_pool) WITH ORDINALITY AS pos(branch_id, ord)
  JOIN public.branches b ON b.id = pos.branch_id;

  IF branch_names IS NULL OR array_length(branch_names, 1) IS NULL THEN
    RAISE EXCEPTION 'Could not resolve branch names for synthetic seed; verify branches 14610..14621 exist';
  END IF;

  FOR i IN 1..200 LOOP
    -- Round-robin across 9 branches
    branch_id_picked   := branch_pool[((i - 1) % 9) + 1];
    branch_name_picked := branch_names[((i - 1) % 9) + 1];

    start_offset := 60 + ((i * 11) % 720);  -- 60..780 days ago
    is_exited    := (i % 7 = 0);            -- ~14% exited
    exit_offset  := CASE
                      WHEN is_exited
                      THEN ((i * 7) % GREATEST(start_offset - 30, 30)) + 15
                      ELSE NULL
                    END;

    INSERT INTO public.people (
      id, pers_id, sales_id, sales_name, branch_id, branch_name,
      sales_channel_start, exit_date, contract_type, source
    ) VALUES (
      gen_random_uuid(),
      'TEST-' || lpad(i::text, 5, '0'),
      'SE'   || lpad(i::text, 5, '0'),
      'Test User ' || lpad(i::text, 3, '0'),
      branch_id_picked,
      branch_name_picked,
      CURRENT_DATE - (start_offset || ' days')::interval,
      CASE
        WHEN is_exited
        THEN CURRENT_DATE - (exit_offset || ' days')::interval
        ELSE NULL
      END,
      CASE i % 3
        WHEN 0 THEN 'Fixed Term'
        WHEN 1 THEN 'On Call'
        ELSE       'Fixed Term'
      END,
      'synthetic'
    );
  END LOOP;
END $$;

-- =========================================================================
-- SECTION 2 — Synthetic equipment transactions (~700-800 records)
-- =========================================================================
-- Each person:
--   - 1 Uitgifte (initial handout) shortly after sales_channel_start
--   - ~70% chance of follow-up Uitgifte
--   - ~50% chance of Ingeleverd (return) for actives
--   - 100% chance of Ingeleverd (return) for exited people

DO $$
DECLARE
  person_record   RECORD;
  txn_date        date;
  start_window    int;
  has_phone       boolean;
  has_tablet      boolean;
  has_demobox     boolean;
  has_clothing    boolean;
  has_toolkit     boolean;
  has_izettle     boolean;
  has_sales_bind  boolean;
  has_id_card     boolean;
  has_access      boolean;
  follow_up_date  date;
  return_date     date;
BEGIN
  FOR person_record IN
    SELECT id, pers_id, sales_channel_start, exit_date
    FROM public.people
    WHERE pers_id LIKE 'TEST-%'
    ORDER BY pers_id
  LOOP
    start_window := GREATEST(
      1,
      (CURRENT_DATE - person_record.sales_channel_start)::int
    );

    -- ===== Initial Uitgifte =====
    txn_date       := person_record.sales_channel_start
                      + ((random() * 14)::int || ' days')::interval;
    has_phone      := random() > 0.10;
    has_tablet     := random() > 0.55;
    has_demobox    := random() > 0.40;
    has_clothing   := true;
    has_toolkit    := random() > 0.35;
    has_izettle    := random() > 0.75;
    has_sales_bind := true;
    has_id_card    := true;
    has_access     := random() > 0.45;

    INSERT INTO public.equipment_transactions (
      id, person_id, transaction_type, transaction_date,
      phone, tablet, demobox, clothing,
      toolkit, izettle, sales_binder, id_card, access_pass,
      sbc_user_id, sbc_name, source_system, created_at
    ) VALUES (
      gen_random_uuid(), person_record.id, 'Uitgifte', txn_date,
      has_phone, has_tablet, has_demobox, has_clothing,
      has_toolkit, has_izettle, has_sales_bind, has_id_card, has_access,
      NULL, 'Synthetic Seed Bot', 'synthetic_seed', txn_date::timestamptz
    );

    -- ===== Follow-up Uitgifte =====
    IF random() > 0.30 AND start_window > 60 THEN
      follow_up_date := txn_date + ((30 + random() * 180)::int || ' days')::interval;
      IF person_record.exit_date IS NOT NULL THEN
        follow_up_date := LEAST(follow_up_date, person_record.exit_date - INTERVAL '7 days');
      END IF;
      follow_up_date := LEAST(follow_up_date, CURRENT_DATE);

      IF follow_up_date > txn_date THEN
        INSERT INTO public.equipment_transactions (
          id, person_id, transaction_type, transaction_date,
          phone, tablet, demobox, clothing,
          toolkit, izettle, sales_binder, id_card, access_pass,
          sbc_user_id, sbc_name, source_system, created_at
        ) VALUES (
          gen_random_uuid(), person_record.id, 'Uitgifte', follow_up_date,
          random() > 0.85, random() > 0.85, random() > 0.80, random() > 0.50,
          random() > 0.85, random() > 0.95, random() > 0.85,
          random() > 0.95, random() > 0.85,
          NULL, 'Synthetic Seed Bot', 'synthetic_seed',
          follow_up_date::timestamptz
        );
      END IF;
    END IF;

    -- ===== Return Ingeleverd =====
    IF person_record.exit_date IS NOT NULL THEN
      -- Exited person always has a return near exit_date
      return_date := person_record.exit_date - ((random() * 5)::int || ' days')::interval;
      INSERT INTO public.equipment_transactions (
        id, person_id, transaction_type, transaction_date,
        phone, tablet, demobox, clothing,
        toolkit, izettle, sales_binder, id_card, access_pass,
        sbc_user_id, sbc_name, source_system, created_at
      ) VALUES (
        gen_random_uuid(), person_record.id, 'Ingeleverd', return_date,
        has_phone, has_tablet, has_demobox, random() > 0.30,
        has_toolkit, has_izettle, has_sales_bind, has_id_card, has_access,
        NULL, 'Synthetic Seed Bot', 'synthetic_seed',
        return_date::timestamptz
      );
    ELSIF random() > 0.50 THEN
      -- Active person, partial return ~50% of time
      return_date := txn_date + ((90 + random() * 365)::int || ' days')::interval;
      return_date := LEAST(return_date, CURRENT_DATE);
      IF return_date > txn_date THEN
        INSERT INTO public.equipment_transactions (
          id, person_id, transaction_type, transaction_date,
          phone, tablet, demobox, clothing,
          toolkit, izettle, sales_binder, id_card, access_pass,
          sbc_user_id, sbc_name, source_system, created_at
        ) VALUES (
          gen_random_uuid(), person_record.id, 'Ingeleverd', return_date,
          random() > 0.60, random() > 0.70, random() > 0.50, random() > 0.40,
          random() > 0.55, random() > 0.80, random() > 0.50,
          random() > 0.90, random() > 0.60,
          NULL, 'Synthetic Seed Bot', 'synthetic_seed',
          return_date::timestamptz
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- =========================================================================
-- SECTION 3 — Verification (raises if anything is off)
-- =========================================================================

DO $$
DECLARE
  people_total      int;
  people_active     int;
  people_exited     int;
  txn_total         int;
  txn_uitgifte      int;
  txn_ingeleverd    int;
  audit_total       int;
  real_data_count   int;
  branches_count    int;
BEGIN
  SELECT count(*) INTO people_total      FROM public.people;
  SELECT count(*) INTO people_active     FROM public.people WHERE exit_date IS NULL;
  SELECT count(*) INTO people_exited     FROM public.people WHERE exit_date IS NOT NULL;
  SELECT count(*) INTO txn_total         FROM public.equipment_transactions;
  SELECT count(*) INTO txn_uitgifte      FROM public.equipment_transactions WHERE transaction_type = 'Uitgifte';
  SELECT count(*) INTO txn_ingeleverd    FROM public.equipment_transactions WHERE transaction_type = 'Ingeleverd';
  SELECT count(*) INTO audit_total       FROM public.audit_logs;
  SELECT count(*) INTO real_data_count   FROM public.people WHERE pers_id NOT LIKE 'TEST-%';
  SELECT count(*) INTO branches_count    FROM public.branches;

  RAISE NOTICE '======================================================================';
  RAISE NOTICE '  Synthetic seed applied successfully';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE '  branches (untouched):           % rows', branches_count;
  RAISE NOTICE '  people total:                   % rows', people_total;
  RAISE NOTICE '    active:                       % rows', people_active;
  RAISE NOTICE '    exited:                       % rows', people_exited;
  RAISE NOTICE '  equipment_transactions total:   % rows', txn_total;
  RAISE NOTICE '    Uitgifte (handouts):          % rows', txn_uitgifte;
  RAISE NOTICE '    Ingeleverd (returns):         % rows', txn_ingeleverd;
  RAISE NOTICE '  audit_logs (should be 0):       % rows', audit_total;
  RAISE NOTICE '  real-data check (must be 0):    % rows', real_data_count;
  RAISE NOTICE '======================================================================';

  IF real_data_count > 0 THEN
    RAISE EXCEPTION 'Real-data check failed: % rows in people without TEST- prefix', real_data_count;
  END IF;

  IF people_total <> 200 THEN
    RAISE EXCEPTION 'Expected 200 synthetic people, got %', people_total;
  END IF;

  IF txn_total < 400 OR txn_total > 1000 THEN
    RAISE WARNING 'Transaction count % is outside expected range 400-1000', txn_total;
  END IF;
END $$;

COMMIT;
