
-- Bootstrap admin user
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
  hashed_pw text;
BEGIN
  -- Skip if email already exists
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'pedro.ciordia@verisure.nl') THEN
    RAISE NOTICE 'User already exists, skipping creation';
    RETURN;
  END IF;

  hashed_pw := crypt('12Pedro34!', gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    'pedro.ciordia@verisure.nl',
    hashed_pw,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', 'Pedro Ciordia'),
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', 'pedro.ciordia@verisure.nl', 'email_verified', true),
    'email',
    new_user_id::text,
    now(), now(), now()
  );

  -- Profile (in case trigger didn't fire)
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new_user_id, 'pedro.ciordia@verisure.nl', 'Pedro Ciordia')
  ON CONFLICT (id) DO NOTHING;

  -- Admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
