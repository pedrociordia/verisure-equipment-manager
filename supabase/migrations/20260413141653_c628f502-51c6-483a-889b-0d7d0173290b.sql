
ALTER TABLE public.phone_models ADD COLUMN price_confirmed boolean NOT NULL DEFAULT true;
ALTER TABLE public.tablet_models ADD COLUMN price_confirmed boolean NOT NULL DEFAULT true;

UPDATE public.phone_models SET price_confirmed = false WHERE name IN ('Samsung A35 5G', 'Samsung A36');
UPDATE public.tablet_models SET price_confirmed = false WHERE name = 'Dell Latitude 5440';
