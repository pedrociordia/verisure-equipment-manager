
-- Create a safe view excluding signature columns
CREATE VIEW public.equipment_transactions_safe AS
SELECT id, person_id, transaction_type, transaction_date, sbc_user_id, sbc_name,
       phone, phone_details, tablet, tablet_details, demobox, demobox_details,
       clothing, clothing_details, toolkit, toolkit_details, izettle, izettle_details,
       sales_binder, id_card, access_pass, created_at, source_system, import_batch_id, imported_at
FROM public.equipment_transactions;

-- Views inherit RLS from base table, but we need to grant access
GRANT SELECT ON public.equipment_transactions_safe TO authenticated;
