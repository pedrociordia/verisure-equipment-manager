
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
