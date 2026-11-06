-- Grant usage on schemas
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'app') THEN
        GRANT USAGE ON SCHEMA app TO postgres, anon, authenticated, service_role;
        GRANT ALL ON ALL TABLES IN SCHEMA app TO postgres, anon, authenticated, service_role;
        GRANT ALL ON ALL ROUTINES IN SCHEMA app TO postgres, anon, authenticated, service_role;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA app TO postgres, anon, authenticated, service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;
    END IF;
END $$;

-- Ensure public tables and functions have full execution access
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- Update reserve_booking_transaction to SECURITY DEFINER and explicit search_path
ALTER FUNCTION public.reserve_booking_transaction(
    UUID, UUID, VARCHAR, VARCHAR, UUID, TIMESTAMPTZ, TIMESTAMPTZ, VARCHAR, VARCHAR, TEXT, INT, VARCHAR
) SECURITY DEFINER SET search_path = public, app, pg_temp;