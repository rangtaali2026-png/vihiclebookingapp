export type BookingStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DISPATCHED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED';

export type VehicleCategory = 'SEDAN_4' | 'MPV_6' | 'BUS_42' | 'BUS_52';
export type BookingType = 'PRIVATE' | 'SHARED';
export type VehicleStatus = 'AVAILABLE' | 'ON_TRIP' | 'MAINTENANCE' | 'DECOMMISSIONED';
export type DriverDutyStatus = 'AVAILABLE' | 'ON_TRIP' | 'OFF_DUTY' | 'ON_LEAVE';

export interface Vehicle {
  id: string;
  site_id: string;
  registration_number: string;
  model: string;
  category: VehicleCategory;
  seat_capacity: number;
  status: VehicleStatus;
  default_driver_id?: string | null;
  qr_code_uuid?: string | null;
  qr_code_url?: string | null;
  qr_generated_at?: string | null;
  qr_version?: number;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: string;
  site_id: string;
  name: string;
  mobile_number: string;
  license_number: string;
  license_expiry?: string;
  duty_status: DriverDutyStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BookingPassenger {
  id?: string;
  booking_id?: string;
  employee_id: string;
  employee_name: string;
  department: string;
  contact_number: string;
  pickup_point: string;
  drop_point: string;
  seat_number?: number;
  is_boarded?: boolean;
  boarded_at?: string;
  created_at?: string;
}

export interface Booking {
  id: string;
  site_id: string;
  booking_reference: string;
  requester_id: string;
  booking_type: BookingType;
  target_category: VehicleCategory;
  origin_location: string;
  destination_location: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  status: BookingStatus;
  allotted_vehicle_id?: string | null;
  allotted_driver_id?: string | null;
  passenger_count: number;
  parent_booking_id?: string | null;
  purpose?: string | null;
  cost_center?: string | null;
  rejection_reason?: string | null;
  created_by_admin_id?: string | null;
  created_at: string;
  updated_at: string;
  vehicles?: Vehicle | null;
  drivers?: Driver | null;
  booking_passengers?: BookingPassenger[];
}

export interface CreateBookingPayload {
  site_id: string;
  requester_id: string;
  booking_type: BookingType;
  target_category: VehicleCategory;
  preferred_vehicle_id?: string | null;
  scheduled_start_time: string;
  scheduled_end_time: string;
  origin_location: string;
  destination_location: string;
  purpose?: string;
  passengers: Omit<BookingPassenger, 'id' | 'booking_id' | 'created_at'>[];
}

export interface DispatchAssignPayload {
  vehicle_id: string;
  driver_id: string;
  status?: 'APPROVED' | 'DISPATCHED';
}
