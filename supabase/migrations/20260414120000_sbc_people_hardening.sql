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
