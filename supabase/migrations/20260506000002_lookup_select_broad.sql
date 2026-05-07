-- =========================================================================
-- Correctiva: re-abrir SELECT de catálogos a todos los authenticated
-- =========================================================================
-- phone_models, equipment_prices, tablet_models contienen catálogos
-- operacionales (nombres de modelos, precios de items, especificaciones).
-- No son datos sensibles. SBC necesita leerlos para rellenar formularios.
-- Mutación (INSERT/UPDATE/DELETE) sigue siendo admin only.
-- =========================================================================

BEGIN;

-- equipment_prices
DROP POLICY IF EXISTS "Prices viewable by admin/DM" ON public.equipment_prices;

CREATE POLICY "Prices viewable by authenticated"
ON public.equipment_prices
FOR SELECT
TO authenticated
USING (true);

-- phone_models
DROP POLICY IF EXISTS "Phone models viewable by admin/DM" ON public.phone_models;

CREATE POLICY "Phone models viewable by authenticated"
ON public.phone_models
FOR SELECT
TO authenticated
USING (true);

-- tablet_models
DROP POLICY IF EXISTS "Tablet models viewable by admin/DM" ON public.tablet_models;

CREATE POLICY "Tablet models viewable by authenticated"
ON public.tablet_models
FOR SELECT
TO authenticated
USING (true);

-- Mutation policies remain admin-only (already in place from initial schema):
--   "Admin can manage prices"        ON equipment_prices
--   "Admin can manage phone models"  ON phone_models
--   "Admin can manage tablet models" ON tablet_models

COMMIT;
