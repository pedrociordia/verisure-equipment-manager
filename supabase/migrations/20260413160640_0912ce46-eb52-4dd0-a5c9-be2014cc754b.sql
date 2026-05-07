ALTER TABLE public.people DROP CONSTRAINT IF EXISTS people_contract_type_check;
ALTER TABLE public.people ADD CONSTRAINT people_contract_type_check
  CHECK (contract_type = ANY (ARRAY['Fixed Term', 'On Call', 'Unknown']));