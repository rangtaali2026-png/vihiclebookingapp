-- 1. Ensure foreign key constraint name is canonical
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'bookings_allotted_vehicle_id_fkey'
  ) THEN
    ALTER TABLE public.bookings 
    ADD CONSTRAINT bookings_allotted_vehicle_id_fkey 
    FOREIGN KEY (allotted_vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Update reserve_booking_transaction using actual vehicle columns: seat_capacity and status
CREATE OR REPLACE FUNCTION public.reserve_booking_transaction(
    p_site_id UUID,
    p_requester_id UUID,
    p_booking_type VARCHAR,
    p_target_category VARCHAR,
    p_vehicle_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_origin VARCHAR,
    p_destination VARCHAR,
    p_purpose TEXT,
    p_passenger_count INT,
    p_booking_ref VARCHAR DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
    v_booking_id UUID;
    v_vehicle_capacity INT;
    v_allocated_seats INT;
    v_ref VARCHAR;
BEGIN
    v_ref := COALESCE(p_booking_ref, 'BK-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6));

    IF p_vehicle_id IS NOT NULL THEN
        -- Query using actual column: seat_capacity
        SELECT seat_capacity INTO v_vehicle_capacity
        FROM public.vehicles
        WHERE id = p_vehicle_id
          AND status::text NOT IN ('MAINTENANCE', 'DECOMMISSIONED')
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Vehicle % not found or not in active status.', p_vehicle_id;
        END IF;

        IF upper(p_booking_type) IN ('PRIVATE', 'DEDICATED') THEN
            IF EXISTS (
                SELECT 1 FROM public.bookings
                WHERE allotted_vehicle_id = p_vehicle_id
                  AND status::text IN ('PENDING', 'APPROVED', 'DISPATCHED')
                  AND (scheduled_start_time, scheduled_end_time) OVERLAPS (p_start_time, p_end_time)
            ) THEN
                RAISE EXCEPTION 'Vehicle % is already reserved during this timespan.', p_vehicle_id;
            END IF;
        ELSE
            SELECT COALESCE(SUM(passenger_count), 0) INTO v_allocated_seats
            FROM public.bookings
            WHERE allotted_vehicle_id = p_vehicle_id
              AND status::text IN ('PENDING', 'APPROVED', 'DISPATCHED')
              AND (scheduled_start_time, scheduled_end_time) OVERLAPS (p_start_time, p_end_time);

            IF (v_allocated_seats + p_passenger_count) > v_vehicle_capacity THEN
                RAISE EXCEPTION 'Insufficient capacity. Only % seats remaining, requested %.',
                    (v_vehicle_capacity - v_allocated_seats), p_passenger_count;
            END IF;
        END IF;
    END IF;

    INSERT INTO public.bookings (
        site_id,
        booking_reference,
        requester_id,
        booking_type,
        target_category,
        origin_location,
        destination_location,
        scheduled_start_time,
        scheduled_end_time,
        status,
        allotted_vehicle_id,
        passenger_count,
        purpose
    )
    VALUES (
        p_site_id,
        v_ref,
        p_requester_id,
        p_booking_type::public.booking_type,
        p_target_category::public.vehicle_category,
        p_origin,
        p_destination,
        p_start_time,
        p_end_time,
        'PENDING'::public.booking_status,
        p_vehicle_id,
        p_passenger_count,
        p_purpose
    )
    RETURNING id INTO v_booking_id;

    RETURN v_booking_id;
END;
$$;