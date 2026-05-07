
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
