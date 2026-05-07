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
