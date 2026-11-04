// =============================================================================
// File: workers/api/src/services/allotment.ts
// Description: Automated Best-Fit Vehicle & Driver Allotment Heuristic Engine
// Target: Cloudflare Workers (V8 Edge Runtime)
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  VehicleCategory,
  Tables,
} from '../../../packages/shared-types/src/database.types';

export interface AllotmentCandidateRequest {
  bookingId: string;
  siteId: string;
  targetCategory: VehicleCategory;
  passengerCount: number;
  scheduledStartTime: string;
  scheduledEndTime?: string | null;
  bufferMinutes?: number; // Pre/post trip buffer (default: 30 mins)
}

export interface AllotmentResult {
  success: boolean;
  vehicle?: Tables<'vehicles'>;
  driver?: Tables<'drivers'>;
  wastedSeats?: number;
  rejectionReason?: string;
}

// Hierarchical category escalation ladder:
// If requested category has no available inventory, attempt next ascending tier
const CATEGORY_ASCENSION_LADDER: Record<VehicleCategory, VehicleCategory[]> = {
  SEDAN_4: ['SEDAN_4', 'SUV_6', 'MINIBUS_20'],
  SUV_6: ['SUV_6', 'MINIBUS_20', 'BUS_42'],
  MINIBUS_20: ['MINIBUS_20', 'BUS_42', 'BUS_52'],
  BUS_42: ['BUS_42', 'BUS_52'],
  BUS_52: ['BUS_52'],
};

/**
 * Core Best-Fit Vehicle & Driver Allotment Engine
 * 
 * Heuristic Steps:
 * 1. Calculate operational trip conflict window with buffer (Start - 30m to End + 30m).
 * 2. Fetch all ACTIVE vehicles for the designated plant matching capacity >= passengerCount.
 * 3. Filter out vehicles currently booked, dispatched, or scheduled in the conflict window.
 * 4. Score available vehicles:
 *    - Score = (Seat Capacity - 1 - Passenger Count) [Wasted Seats Penalty]
 *    - Category match priority bonus (-1000 points if matching exact target category).
 * 5. Resolve an available driver:
 *    - Prefer the vehicle's default assigned driver if not in a conflicting trip and duty_status = 'AVAILABLE'.
 *    - Fallback: Select first unallocated active site driver not on leave/trip.
 * 6. Return candidate pair for atomic assignment.
 */
export async function findBestFitAllotment(
  supabase: SupabaseClient<Database>,
  params: AllotmentCandidateRequest
): Promise<AllotmentResult> {
  const {
    siteId,
    targetCategory,
    passengerCount,
    scheduledStartTime,
    scheduledEndTime,
    bufferMinutes = 30,
  } = params;

  // 1. Establish Trip Operational Time Boundary
  const startWindow = new Date(new Date(scheduledStartTime).getTime() - bufferMinutes * 60 * 1000);
  
  // Default to 2 hours runtime if scheduledEndTime not provided
  const baseEnd = scheduledEndTime
    ? new Date(scheduledEndTime)
    : new Date(new Date(scheduledStartTime).getTime() + 2 * 60 * 60 * 1000);
  const endWindow = new Date(baseEnd.getTime() + bufferMinutes * 60 * 1000);

  // 2. Fetch Active Site Fleet Meeting Minimum Raw Capacity
  // (Passenger count + 1 driver seat)
  const requiredTotalSeats = passengerCount + 1;
  const allowableCategories = CATEGORY_ASCENSION_LADDER[targetCategory] || [targetCategory];

  const { data: fleet, error: fleetError } = await supabase
    .from('vehicles')
    .select('*, default_driver:drivers(*)')
    .eq('site_id', siteId)
    .eq('status', 'ACTIVE')
    .gte('seat_capacity', requiredTotalSeats)
    .in('category', allowableCategories);

  if (fleetError || !fleet || fleet.length === 0) {
    return {
      success: false,
      rejectionReason: `No active plant fleet exists meeting minimum passenger capacity of ${passengerCount} seats.`,
    };
  }

  // 3. Query Conflicting Overlapping Bookings for the Site
  // Overlap condition: (ScheduledStart < WindowEnd) AND (ScheduledEnd > WindowStart)
  const { data: conflicts, error: conflictError } = await supabase
    .from('bookings')
    .select('allotted_vehicle_id, allotted_driver_id')
    .eq('site_id', siteId)
    .in('status', ['APPROVED', 'DISPATCHED'])
    .lt('scheduled_start_time', endWindow.toISOString())
    .gt('scheduled_end_time', startWindow.toISOString());

  if (conflictError) {
    return {
      success: false,
      rejectionReason: `Failed to evaluate trip schedule collisions: ${conflictError.message}`,
    };
  }

  const busyVehicleIds = new Set(
    (conflicts || [])
      .map((b) => b.allotted_vehicle_id)
      .filter((id): id is string => Boolean(id))
  );

  const busyDriverIds = new Set(
    (conflicts || [])
      .map((b) => b.allotted_driver_id)
      .filter((id): id is string => Boolean(id))
  );

  // 4. Filter Available Vehicles and Rank by Best-Fit Heuristic
  const availableVehicles = fleet.filter((v) => !busyVehicleIds.has(v.id));

  if (availableVehicles.length === 0) {
    return {
      success: false,
      rejectionReason: `All eligible vehicles in category [${allowableCategories.join(', ')}] are engaged in overlapping trips.`,
    };
  }

  // Rank vehicles: Minimize wasted seats, prioritize exact target category match
  const rankedVehicles = availableVehicles.map((vehicle) => {
    const usablePassengerSeats = vehicle.seat_capacity - 1;
    const wastedSeats = usablePassengerSeats - passengerCount;

    let score = wastedSeats;
    // Massive bonus if it directly matches requested category
    if (vehicle.category === targetCategory) {
      score -= 1000;
    }

    return {
      vehicle,
      wastedSeats,
      score,
    };
  }).sort((a, b) => a.score - b.score);

  // 5. Select Best Vehicle and Pair with Available Driver
  for (const candidate of rankedVehicles) {
    const selectedVehicle = candidate.vehicle;
    let selectedDriver: Tables<'drivers'> | undefined;

    // A. Check if the vehicle's default assigned driver is free
    if (
      selectedVehicle.default_driver_id &&
      !busyDriverIds.has(selectedVehicle.default_driver_id)
    ) {
      const { data: defaultDriver } = await supabase
        .from('drivers')
        .select('*')
        .eq('id', selectedVehicle.default_driver_id)
        .eq('site_id', siteId)
        .eq('is_active', true)
        .eq('duty_status', 'AVAILABLE')
        .maybeSingle();

      if (defaultDriver) {
        selectedDriver = defaultDriver;
      }
    }

    // B. Fallback: Query pool of available active drivers for this site
    if (!selectedDriver) {
      const { data: driverPool } = await supabase
        .from('drivers')
        .select('*')
        .eq('site_id', siteId)
        .eq('is_active', true)
        .eq('duty_status', 'AVAILABLE')
        .limit(10);

      const viableDriver = (driverPool || []).find((d) => !busyDriverIds.has(d.id));
      if (viableDriver) {
        selectedDriver = viableDriver;
      }
    }

    // If both vehicle and driver are secured, return matching
    if (selectedDriver) {
      return {
        success: true,
        vehicle: selectedVehicle,
        driver: selectedDriver,
        wastedSeats: candidate.wastedSeats,
      };
    }
  }

  return {
    success: false,
    rejectionReason: 'Vehicle available, but no licensed drivers are currently available for this plant schedule window.',
  };
}

/**
 * Atomic Allotment Dispatcher:
 * Executes allotment evaluation, binds records in Supabase, and drops event into Queue
 */
export async function executeAutoAllotment(
  supabase: SupabaseClient<Database>,
  queue: Queue,
  bookingId: string,
  siteId: string
): Promise<AllotmentResult> {
  // Fetch booking details
  const { data: booking, error: bError } = await supabase
    .from('bookings')
    .select('*, requester:users(name, phone, email)')
    .eq('id', bookingId)
    .eq('site_id', siteId)
    .single();

  if (bError || !booking) {
    return { success: false, rejectionReason: 'Booking record not found' };
  }

  const allotment = await findBestFitAllotment(supabase, {
    bookingId: booking.id,
    siteId: booking.site_id,
    targetCategory: booking.target_category,
    passengerCount: booking.passenger_count,
    scheduledStartTime: booking.scheduled_start_time,
    scheduledEndTime: booking.scheduled_end_time,
  });

  if (!allotment.success || !allotment.vehicle || !allotment.driver) {
    return allotment;
  }

  // Atomic state mutation in Supabase
  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'APPROVED',
      allotted_vehicle_id: allotment.vehicle.id,
      allotted_driver_id: allotment.driver.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.id)
    .eq('site_id', siteId);

  if (updateError) {
    return { success: false, rejectionReason: updateError.message };
  }

  // Push notification payload to Cloudflare Queue (Firewall-safe async egress)
  await queue.send({
    eventType: 'BOOKING_DISPATCHED',
    siteId: booking.site_id,
    bookingId: booking.id,
    recipientPhone: (booking.requester as any)?.phone,
    recipientEmail: (booking.requester as any)?.email,
    payload: {
      requesterName: (booking.requester as any)?.name || 'Employee',
      vehiclePlate: allotment.vehicle.registration_number,
      vehicleModel: allotment.vehicle.model,
      driverName: allotment.driver.name,
      driverPhone: allotment.driver.mobile_number,
      pickupTime: booking.scheduled_start_time,
      origin: booking.origin_location,
      destination: booking.destination_location,
    },
  });

  return allotment;
}