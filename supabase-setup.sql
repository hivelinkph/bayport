-- =============================================================
-- Bayport West — Supabase Setup Script
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- =============================================================

-- IMPORTANT BEFORE RUNNING:
-- 1. Go to Authentication → Settings → Email Auth
--    Uncheck "Confirm email" (tenants use synthetic emails, no inbox)
-- 2. After running this script, go to Authentication → Users
--    and create the admin user manually:
--    Email: admin@bayportwest.com
--    Password: (choose a strong password)
-- 3. Go to Storage and make sure the "unit-photos" bucket is created
--    (this script creates it, but Storage UI shows it immediately)
-- =============================================================


-- ── Tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
  id         uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  mobile     text    UNIQUE NOT NULL,
  unit_id    integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Auto-populated when a tenant creates their account (via trigger)
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  mobile     text UNIQUE NOT NULL,
  unit_id    integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS unit_details (
  unit_id    integer PRIMARY KEY,
  owner      text,
  rent_price integer,
  unit_type  text,
  photos     jsonb    DEFAULT '[]'::jsonb,
  video      text,
  updated_at timestamptz DEFAULT now()
);


-- ── Trigger: create profile on first sign-up ─────────────────

CREATE OR REPLACE FUNCTION public.handle_new_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Only create a profile for tenant accounts (they carry unit_id in metadata).
  -- Admin and other non-tenant users have no unit_id, so skip them.
  IF new.raw_user_meta_data->>'unit_id' IS NOT NULL THEN
    INSERT INTO public.profiles (id, mobile, unit_id)
    VALUES (
      new.id,
      new.raw_user_meta_data->>'mobile',
      (new.raw_user_meta_data->>'unit_id')::integer
    );
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_tenant();


-- ── Helper: extract unit_id from JWT ─────────────────────────
-- Note: must live in public schema (auth schema is not writable)

CREATE OR REPLACE FUNCTION public.tenant_unit_id()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt()->'user_metadata'->>'unit_id')::integer,
    (auth.jwt()->'raw_user_meta_data'->>'unit_id')::integer
  );
$$;


-- ── Row Level Security ────────────────────────────────────────

ALTER TABLE tenants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_details ENABLE ROW LEVEL SECURITY;

-- tenants: public read (needed to verify mobile on login)
DROP POLICY IF EXISTS "tenants_public_read"  ON tenants;
DROP POLICY IF EXISTS "tenants_admin_write"  ON tenants;
CREATE POLICY "tenants_public_read" ON tenants
  FOR SELECT USING (true);
CREATE POLICY "tenants_admin_write" ON tenants
  FOR ALL
  USING  (auth.email() = 'admin@bayportwest.com')
  WITH CHECK (auth.email() = 'admin@bayportwest.com');

-- profiles: public read (login flow needs to check if account exists)
DROP POLICY IF EXISTS "profiles_public_read" ON profiles;
DROP POLICY IF EXISTS "profiles_own"         ON profiles;
CREATE POLICY "profiles_public_read" ON profiles
  FOR SELECT USING (true);
CREATE POLICY "profiles_own" ON profiles
  FOR ALL USING (auth.uid() = id);

-- unit_details: public read, tenant writes own, admin writes any
DROP POLICY IF EXISTS "ud_public_read"    ON unit_details;
DROP POLICY IF EXISTS "ud_tenant_write"   ON unit_details;
DROP POLICY IF EXISTS "ud_admin_write"    ON unit_details;
CREATE POLICY "ud_public_read" ON unit_details
  FOR SELECT USING (true);
CREATE POLICY "ud_tenant_write" ON unit_details
  FOR ALL
  USING  (unit_id = public.tenant_unit_id())
  WITH CHECK (unit_id = public.tenant_unit_id());
CREATE POLICY "ud_admin_write" ON unit_details
  FOR ALL
  USING  (auth.email() = 'admin@bayportwest.com')
  WITH CHECK (auth.email() = 'admin@bayportwest.com');


-- ── Storage ──────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('unit-photos', 'unit-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "photos_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "tenant_upload"       ON storage.objects;
DROP POLICY IF EXISTS "tenant_delete"       ON storage.objects;
DROP POLICY IF EXISTS "admin_upload"        ON storage.objects;

CREATE POLICY "photos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'unit-photos');

-- Tenant can upload to their own unit_id folder
CREATE POLICY "tenant_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'unit-photos' AND
    (storage.foldername(name))[1] = (public.tenant_unit_id()::text)
  );

-- Tenant can delete their own photos
CREATE POLICY "tenant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'unit-photos' AND
    (storage.foldername(name))[1] = (public.tenant_unit_id()::text)
  );

-- Admin can upload/delete any photo
CREATE POLICY "admin_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'unit-photos' AND
    auth.email() = 'admin@bayportwest.com'
  );

CREATE POLICY "admin_delete_any" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'unit-photos' AND
    auth.email() = 'admin@bayportwest.com'
  );
