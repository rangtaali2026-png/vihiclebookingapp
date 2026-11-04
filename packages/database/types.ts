// =============================================================================
// File: packages/shared-types/src/database.types.ts
// Description: Complete TypeScript Definitions for Supabase Database Schema
// Migrations Covered: 20261101000001 through 20261101000005
// =============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type VehicleCategory =
  | 'SEDAN_4'
  | 'SUV_6'
  | 'MINIBUS_20'
  | 'BUS_42'
  | 'BUS_52';

export type VehicleStatus = 'ACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';

export type DriverDutyStatus = 'AVAILABLE' | 'ON_TRIP' | 'OFF_DUTY' | 'LEAVE';

export type BookingType = 'PRIVATE' | 'SHARED';

export type BookingStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DISPATCHED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED';

export type BoardingStatus = 'AWAITING' | 'BOARDED' | 'NO_SHOW' | 'CANCELLED';

export type CheckInMode = 'QR_SELF_SCAN' | 'DRIVER_MANUAL' | 'ADMIN_OVERRIDE';

export type UserRole = 'SUPER_ADMIN' | 'PLANT_ADMIN' | 'DRIVER' | 'REQUESTER';

export interface Database {
  public: {
    Tables: {
      sites: {
        Row: {
          id: string;
          site_code: string;
          site_name: string;
          location_city: string;
          is_active: boolean;
          auto_allotment_enabled: boolean;
          require_admin_approval: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_code: string;
          site_name: string;
          location_city: string;
          is_active?: boolean;
          auto_allotment_enabled?: boolean;
          require_admin_approval?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_code?: string;
          site_name?: string;
          location_city?: string;
          is_active?: boolean;
          auto_allotment_enabled?: boolean;
          require_admin_approval?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      site_gateways: {
        Row: {
          id: string;
          site_id: string;
          channel: 'WHATSAPP' | 'SMS' | 'EMAIL' | 'WEBHOOK';
          is_enabled: boolean;
          provider_name: string;
          api_endpoint: string | null;
          auth_credentials: Json;
          webhook_secret: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          channel: 'WHATSAPP' | 'SMS' | 'EMAIL' | 'WEBHOOK';
          is_enabled?: boolean;
          provider_name: string;
          api_endpoint?: string | null;
          auth_credentials?: Json;
          webhook_secret?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          channel?: 'WHATSAPP' | 'SMS' | 'EMAIL' | 'WEBHOOK';
          is_enabled?: boolean;
          provider_name?: string;
          api_endpoint?: string | null;
          auth_credentials?: Json;
          webhook_secret?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'site_gateways_site_id_fkey';
            columns: ['site_id'];
            referencedRelation: 'sites';
            referencedColumns: ['id'];
          }
        ];
      };

      site_users: {
        Row: {
          id: string;
          user_id: string;
          site_id: string;
          role: UserRole;
          employee_id: string;
          full_name: string;
          mobile_number: string;
          department: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          site_id: string;
          role?: UserRole;
          employee_id: string;
          full_name: string;
          mobile_number: string;
          department?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          site_id?: string;
          role?: UserRole;
          employee_id?: string;
          full_name?: string;
          mobile_number?: string;
          department?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'site_users_site_id_fkey';
            columns: ['site_id'];
            referencedRelation: 'sites';
            referencedColumns: ['id'];
          }
        ];
      };

      drivers: {
        Row: {
          id: string;
          site_id: string;
          name: string;
          mobile_number: string;
          license_number: string;
          license_expiry: string;
          duty_status: DriverDutyStatus;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          name: string;
          mobile_number: string;
          license_number: string;
          license_expiry: string;
          duty_status?: DriverDutyStatus;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          name?: string;
          mobile_number?: string;
          license_number?: string;
          license_expiry?: string;
          duty_status?: DriverDutyStatus;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'drivers_site_id_fkey';
            columns: ['site_id'];
            referencedRelation: 'sites';
            referencedColumns: ['id'];
          }
        ];
      };

      vehicles: {
        Row: {
          id: string;
          site_id: string;
          registration_number: string;
          model: string;
          category: VehicleCategory;
          seat_capacity: number;
          status: VehicleStatus;
          default_driver_id: string | null;
          qr_code_uuid: string;
          qr_code_url: string | null;
          qr_generated_at: string;
          qr_version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          registration_number: string;
          model: string;
          category: VehicleCategory;
          seat_capacity: number;
          status?: VehicleStatus;
          default_driver_id?: string | null;
          qr_code_uuid?: string;
          qr_code_url?: string | null;
          qr_generated_at?: string;
          qr_version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          registration_number?: string;
          model?: string;
          category?: VehicleCategory;
          seat_capacity?: number;
          status?: VehicleStatus;
          default_driver_id?: string | null;
          qr_code_uuid?: string;
          qr_code_url?: string | null;
          qr_generated_at?: string;
          qr_version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vehicles_site_id_fkey';
            columns: ['site_id'];
            referencedRelation: 'sites';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vehicles_default_driver_id_fkey';
            columns: ['default_driver_id'];
            referencedRelation: 'drivers';
            referencedColumns: ['id'];
          }
        ];
      };

      vehicle_maintenance_logs: {
        Row: {
          id: string;
          site_id: string;
          vehicle_id: string;
          maintenance_type: string;
          description: string | null;
          start_date: string;
          end_date: string | null;
          odometer_reading: number | null;
          cost: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          vehicle_id: string;
          maintenance_type: string;
          description?: string | null;
          start_date: string;
          end_date?: string | null;
          odometer_reading?: number | null;
          cost?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          vehicle_id?: string;
          maintenance_type?: string;
          description?: string | null;
          start_date?: string;
          end_date?: string | null;
          odometer_reading?: number | null;
          cost?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vehicle_maintenance_logs_site_id_fkey';
            columns: ['site_id'];
            referencedRelation: 'sites';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vehicle_maintenance_logs_vehicle_id_fkey';
            columns: ['vehicle_id'];
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          }
        ];
      };

      bookings: {
        Row: {
          id: string;
          site_id: string;
          booking_reference: string;
          requester_id: string;
          booking_type: BookingType;
          target_category: VehicleCategory;
          origin_location: string;
          destination_location: string;
          scheduled_start_time: string;
          scheduled_end_time: string | null;
          status: BookingStatus;
          allotted_vehicle_id: string | null;
          allotted_driver_id: string | null;
          passenger_count: number;
          parent_booking_id: string | null;
          purpose: string | null;
          cost_center: string | null;
          rejection_reason: string | null;
          created_by_admin_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          booking_reference?: string;
          requester_id: string;
          booking_type?: BookingType;
          target_category?: VehicleCategory;
          origin_location: string;
          destination_location: string;
          scheduled_start_time: string;
          scheduled_end_time?: string | null;
          status?: BookingStatus;
          allotted_vehicle_id?: string | null;
          allotted_driver_id?: string | null;
          passenger_count?: number;
          parent_booking_id?: string | null;
          purpose?: string | null;
          cost_center?: string | null;
          rejection_reason?: string | null;
          created_by_admin_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          booking_reference?: string;
          requester_id?: string;
          booking_type?: BookingType;
          target_category?: VehicleCategory;
          origin_location?: string;
          destination_location?: string;
          scheduled_start_time?: string;
          scheduled_end_time?: string | null;
          status?: BookingStatus;
          allotted_vehicle_id?: string | null;
          allotted_driver_id?: string | null;
          passenger_count?: number;
          parent_booking_id?: string | null;
          purpose?: string | null;
          cost_center?: string | null;
          rejection_reason?: string | null;
          created_by_admin_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bookings_site_id_fkey';
            columns: ['site_id'];
            referencedRelation: 'sites';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_allotted_vehicle_id_fkey';
            columns: ['allotted_vehicle_id'];
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_allotted_driver_id_fkey';
            columns: ['allotted_driver_id'];
            referencedRelation: 'drivers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_parent_booking_id_fkey';
            columns: ['parent_booking_id'];
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          }
        ];
      };

      trip_participants: {
        Row: {
          id: string;
          site_id: string;
          booking_id: string;
          employee_id: string;
          employee_name: string;
          mobile_number: string;
          department: string | null;
          check_in_status: BoardingStatus;
          check_in_time: string | null;
          check_in_mode: CheckInMode | null;
          is_unscheduled: boolean;
          feedback_rating: number | null;
          feedback_comments: string | null;
          feedback_submitted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          booking_id: string;
          employee_id: string;
          employee_name: string;
          mobile_number: string;
          department?: string | null;
          check_in_status?: BoardingStatus;
          check_in_time?: string | null;
          check_in_mode?: CheckInMode | null;
          is_unscheduled?: boolean;
          feedback_rating?: number | null;
          feedback_comments?: string | null;
          feedback_submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          booking_id?: string;
          employee_id?: string;
          employee_name?: string;
          mobile_number?: string;
          department?: string | null;
          check_in_status?: BoardingStatus;
          check_in_time?: string | null;
          check_in_mode?: CheckInMode | null;
          is_unscheduled?: boolean;
          feedback_rating?: number | null;
          feedback_comments?: string | null;
          feedback_submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'trip_participants_site_id_fkey';
            columns: ['site_id'];
            referencedRelation: 'sites';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'trip_participants_booking_id_fkey';
            columns: ['booking_id'];
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          }
        ];
      };

      vehicle_qr_scans: {
        Row: {
          id: string;
          site_id: string;
          vehicle_id: string;
          booking_id: string | null;
          scanned_employee_id: string;
          scanned_mobile_number: string;
          scan_status: string;
          is_unscheduled_walkin: boolean;
          user_agent: string | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          vehicle_id: string;
          booking_id?: string | null;
          scanned_employee_id: string;
          scanned_mobile_number: string;
          scan_status: string;
          is_unscheduled_walkin?: boolean;
          user_agent?: string | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          vehicle_id?: string;
          booking_id?: string | null;
          scanned_employee_id?: string;
          scanned_mobile_number?: string;
          scan_status?: string;
          is_unscheduled_walkin?: boolean;
          user_agent?: string | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vehicle_qr_scans_site_id_fkey';
            columns: ['site_id'];
            referencedRelation: 'sites';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vehicle_qr_scans_vehicle_id_fkey';
            columns: ['vehicle_id'];
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vehicle_qr_scans_booking_id_fkey';
            columns: ['booking_id'];
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          }
        ];
      };

      audit_logs: {
        Row: {
          id: number;
          site_id: string | null;
          actor_id: string | null;
          actor_role: string | null;
          action: string;
          entity_table: string;
          entity_id: string | null;
          old_data: Json | null;
          new_data: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          site_id?: string | null;
          actor_id?: string | null;
          actor_role?: string | null;
          action: string;
          entity_table: string;
          entity_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          site_id?: string | null;
          actor_id?: string | null;
          actor_role?: string | null;
          action?: string;
          entity_table?: string;
          entity_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_site_id_fkey';
            columns: ['site_id'];
            referencedRelation: 'sites';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      fn_get_live_booking_occupancy: {
        Args: { p_booking_id: string };
        Returns: number;
      };
      fn_create_fast_rebook: {
        Args: {
          p_source_booking_id: string;
          p_new_start_time: string;
          p_new_end_time?: string | null;
        };
        Returns: string;
      };
      fn_process_qr_attendance: {
        Args: {
          p_vehicle_id: string;
          p_qr_uuid: string;
          p_employee_id: string;
          p_mobile_number: string;
          p_user_agent?: string | null;
          p_ip_address?: string | null;
        };
        Returns: Json;
      };
      verify_rls_integrity: {
        Args: Record<string, never>;
        Returns: {
          test_name: string;
          passed: boolean;
          details: string;
        }[];
      };
    };
    Enums: {
      vehicle_category: VehicleCategory;
      vehicle_status: VehicleStatus;
      driver_duty_status: DriverDutyStatus;
      booking_type: BookingType;
      booking_status: BookingStatus;
      boarding_status: BoardingStatus;
      check_in_mode: CheckInMode;
    };
    CompositeTypes: Record<string, never>;
  };
}

// -----------------------------------------------------------------------------
// Helper Convenience Types (Entity Shortcuts)
// -----------------------------------------------------------------------------
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export type Site = Tables<'sites'>;
export type SiteGateway = Tables<'site_gateways'>;
export type SiteUser = Tables<'site_users'>;
export type Vehicle = Tables<'vehicles'>;
export type Driver = Tables<'drivers'>;
export type Booking = Tables<'bookings'>;
export type TripParticipant = Tables<'trip_participants'>;
export type VehicleQrScan = Tables<'vehicle_qr_scans'>;
export type AuditLog = Tables<'audit_logs'>;

// QR Attendance Stored Procedure Response Payload
export interface QrAttendanceResult {
  success: boolean;
  code:
    | 'BOARDING_CONFIRMED'
    | 'ALREADY_CHECKED_IN'
    | 'UNSCHEDULED_BOARDING_RECORDED'
    | 'INVALID_VEHICLE_QR'
    | 'NO_ACTIVE_TRIP'
    | 'OVER_CAPACITY'
    | 'PRIVATE_RESERVATION';
  message: string;
  data?: {
    booking_id: string;
    vehicle_registration: string;
    employee_name?: string;
    check_in_time: string;
    live_occupancy: number;
    seat_capacity: number;
    is_unscheduled?: boolean;
  };
}