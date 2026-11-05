-- 1. Ensure vehicles table exists
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL,
    registration_number VARCHAR(32) NOT NULL UNIQUE,
    make_model VARCHAR(64) NOT NULL,
    category VARCHAR(20) NOT NULL CHECK (category IN ('SEDAN_4', 'MPV_6', 'BUS_42', 'BUS_52')),
    total_capacity INT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' 
      CHECK (status IN ('AVAILABLE', 'ON_TRIP', 'MAINTENANCE', 'DECOMMISSIONED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add foreign key to vehicles if not already present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_bookings_allotted_vehicle'
    ) THEN
        ALTER TABLE public.bookings
        ADD CONSTRAINT fk_bookings_allotted_vehicle
        FOREIGN KEY (allotted_vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Passenger Manifest Table
CREATE TABLE IF NOT EXISTS public.booking_passengers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    employee_id VARCHAR(32) NOT NULL,
    employee_name VARCHAR(64) NOT NULL,
    department VARCHAR(64) NOT NULL,
    contact_number VARCHAR(20) NOT NULL,
    pickup_point VARCHAR(128) NOT NULL,
    drop_point VARCHAR(128) NOT NULL,
    seat_number INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Overlap Index on allotted_vehicle_id and scheduled timestamps
CREATE INDEX IF NOT EXISTS idx_bookings_active_overlap 
ON public.bookings(allotted_vehicle_id, scheduled_start_time, scheduled_end_time) 
WHERE status IN ('PENDING', 'APPROVED', 'DISPATCHED');

-- 5. Atomic Reservation Procedure
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
AS $$
DECLARE
    v_booking_id UUID;
    v_vehicle_capacity INT;
    v_allocated_seats INT;
    v_ref VARCHAR;
BEGIN
    -- Generate booking reference if not provided
    v_ref := COALESCE(p_booking_ref, 'BK-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6));

    -- Acquire exclusive row lock if specific vehicle is requested
    IF p_vehicle_id IS NOT NULL THEN
        SELECT total_capacity INTO v_vehicle_capacity
        FROM public.vehicles
        WHERE id = p_vehicle_id AND is_active = TRUE
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Vehicle % not found or not active.', p_vehicle_id;
        END IF;

        -- Check mode: cast enum to text for flexibility
        IF upper(p_booking_type) IN ('PRIVATE', 'DEDICATED') THEN
            IF EXISTS (
                SELECT 1 FROM public.bookings
                WHERE allotted_vehicle_id = p_vehicle_id
                  AND status IN ('PENDING', 'APPROVED', 'DISPATCHED')
                  AND (scheduled_start_time, scheduled_end_time) OVERLAPS (p_start_time, p_end_time)
            ) THEN
                RAISE EXCEPTION 'Vehicle % is already reserved during this timespan.', p_vehicle_id;
            END IF;
        ELSE
            -- Shared transport capacity calculation
            SELECT COALESCE(SUM(passenger_count), 0) INTO v_allocated_seats
            FROM public.bookings
            WHERE allotted_vehicle_id = p_vehicle_id
              AND status IN ('PENDING', 'APPROVED', 'DISPATCHED')
              AND (scheduled_start_time, scheduled_end_time) OVERLAPS (p_start_time, p_end_time);

            IF (v_allocated_seats + p_passenger_count) > v_vehicle_capacity THEN
                RAISE EXCEPTION 'Insufficient capacity. Only % seats remaining, requested %.',
                    (v_vehicle_capacity - v_allocated_seats), p_passenger_count;
            END IF;
        END IF;
    END IF;

    -- Insert into bookings table using existing schema
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