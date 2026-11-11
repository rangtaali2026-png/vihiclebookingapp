'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import AppNavbar from '@/components/AppNavbar';
import { useAuth } from '@/lib/auth-context';
import { fetchApi } from '@/lib/api';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  ShieldCheck,
  CheckCircle2,
  Clock4,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Car,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Plus,
  Trash2,
  UserPlus
} from 'lucide-react';

interface Passenger {
  name: string;
  employee_id: string;
  department?: string;
  mobile?: string;
  pickup_point?: string;
}

interface Booking {
  id: string;
  booking_reference: string;
  booking_type: string;
  origin_location: string;
  destination_location: string;
  pickup_time: string;
  passenger_count: number;
  status: string;
  purpose: string;
  allotted_vehicle_id?: string;
  vehicles?: { registration_number: string; model: string };
  drivers?: { name: string; mobile_number: string };
}

const CATEGORY_CAPACITIES = {
  SEDAN_4: 4,
  SUV_6: 6,
  VAN_12: 12,
  BUS_50: 50,
};

export default function SmartDriveDashboard() {
  const { session } = useAuth();

  // Reservation Form State
  const [bookingType, setBookingType] = useState<'EXCLUSIVE' | 'SHARED'>('EXCLUSIVE');
  const [category, setCategory] = useState<'SEDAN_4' | 'SUV_6' | 'VAN_12' | 'BUS_50'>('SEDAN_4');
  const [origin, setOrigin] = useState('Vadodara Chemical Complex Gate 1');
  const [destination, setDestination] = useState('Dahej Heavy Engineering Unit');
  const [pickupTime, setPickupTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 2);
    return d.toISOString().slice(0, 16);
  });
  const [purpose, setPurpose] = useState('Cross-Plant Engineering Audit');

  // Dynamic Multi-Passenger Roster
  const [passengers, setPassengers] = useState<Passenger[]>([
    {
      name: session?.fullName || 'Dhaval Mungara',
      employee_id: 'EMP-VAD-08',
      department: 'Infrastructure & Systems',
      mobile: '+91 98251 12345',
      pickup_point: 'Admin Gate 1'
    }
  ]);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const maxSeats = CATEGORY_CAPACITIES[category];

  const loadBookings = async () => {
    setLoading(true);
    try {
      const siteQuery = session?.siteId ? `?site_id=${session.siteId}` : '';
      const res = await fetchApi<{ success: boolean; bookings: Booking[] }>(`/api/dispatch${siteQuery}`);
      if (res.bookings) {
        setBookings(res.bookings);
      }
    } catch (err) {
      console.error('Error fetching bookings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, [session?.siteId]);

  // Attendee Roster Actions
  const handleAddPassenger = () => {
    if (passengers.length >= maxSeats) {
      alert(`The selected category (${category}) has a maximum limit of ${maxSeats} seats.`);
      return;
    }
    setPassengers([
      ...passengers,
      {
        name: '',
        employee_id: '',
        department: passengers[0]?.department || 'Plant Operations',
        mobile: '',
        pickup_point: origin
      }
    ]);
  };

  const handleUpdatePassenger = (index: number, field: keyof Passenger, value: string) => {
    const updated = [...passengers];
    updated[index] = { ...updated[index], [field]: value };
    setPassengers(updated);
  };

  const handleRemovePassenger = (index: number) => {
    if (passengers.length <= 1) return;
    setPassengers(passengers.filter((_, idx) => idx !== index));
  };

  // Submit Reservation
  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    // Validate that attendee names and IDs are filled
    const invalidPassenger = passengers.find(p => !p.name.trim() || !p.employee_id.trim());
    if (invalidPassenger) {
      setFeedback({
        type: 'error',
        message: 'Please provide Name and Employee ID for all passenger attendees.'
      });
      setSubmitting(false);
      return;
    }

    try {
      const payload = {
        site_id: session?.siteId || '11111111-1111-1111-1111-111111111111',
        booking_reference: `BK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`,
        employee_name: passengers[0]?.name || session?.fullName || 'Staff Employee',
        employee_email: session?.email || 'employee@planttransit.com',
        department: passengers[0]?.department || 'Plant Operations',
        booking_type: bookingType === 'EXCLUSIVE' ? 'PRIVATE' : 'SHARED',
        target_category: category,
        origin_location: origin,
        destination_location: destination,
        pickup_time: new Date(pickupTime).toISOString(),
        passenger_count: passengers.length,
        passenger_manifest: passengers,
        status: 'PENDING',
        purpose: purpose
      };

      await fetchApi('/api/dispatch/create', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setFeedback({
        type: 'success',
        message: `Your reservation for ${passengers.length} passenger(s) has been submitted successfully.`
      });
      loadBookings();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to submit reservation'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBookAgain = (prev: Booking) => {
    setOrigin(prev.origin_location);
    setDestination(prev.destination_location);
    setPurpose(`Re-booking: ${prev.purpose || 'Official Plant Transit'}`);
    window.scrollTo({ top: 350, behavior: 'smooth' });
  };

  const totalBookings = bookings.length;
  const upcomingTrips = bookings.filter(b => b.status === 'DISPATCHED' || b.status === 'PENDING').length;
  const pendingApproval = bookings.filter(b => b.status === 'PENDING').length;
  const completedTrips = bookings.filter(b => b.status === 'COMPLETED').length;

  return (
    <div className="min-h-screen bg-smart-bg flex flex-col">
      <AppNavbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        
        {/* Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-smart-cyan animate-pulse"></span>
              <span className="text-xs font-bold text-smart-blue uppercase tracking-wider">Enterprise Mobility Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-smart-navy tracking-tight mt-1">
              Welcome back, {session?.fullName || 'Employee'}
            </h1>
            <p className="text-xs sm:text-sm text-smart-muted mt-0.5">
              Request, track, and manage multi-passenger manufacturing plant transits.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/board"
              className="inline-flex items-center gap-2 bg-white border border-smart-border text-smart-navy hover:text-smart-blue px-4 py-2.5 rounded-xl text-xs font-bold shadow-smart-sm hover:shadow-smart transition"
            >
              <span>Gate Boarding Pass</span>
              <ChevronRight className="w-4 h-4 text-smart-muted" />
            </Link>
            <Link
              href="/dispatch"
              className="inline-flex items-center gap-2 smart-gradient-blue text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-smart-lg hover:opacity-95 transition"
            >
              <span>Fleet Operations</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Dashboard Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="smart-glass-card p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-smart-muted">Total Bookings</span>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-smart-blue flex items-center justify-center font-bold">
                <Car className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black text-smart-navy">{totalBookings}</span>
              <p className="text-[11px] text-smart-muted mt-1 flex items-center gap-1 font-medium">
                <TrendingUp className="w-3.5 h-3.5 text-smart-success" />
                All journeys recorded
              </p>
            </div>
          </div>

          <div className="smart-glass-card p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-smart-muted">Upcoming Trips</span>
              <div className="w-10 h-10 rounded-xl bg-cyan-50 text-smart-cyan flex items-center justify-center font-bold">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black text-smart-blue">{upcomingTrips}</span>
              <p className="text-[11px] text-smart-muted mt-1 font-medium">Active dispatches & queued</p>
            </div>
          </div>

          <div className="smart-glass-card p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-smart-muted">Pending Approval</span>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-smart-warning flex items-center justify-center font-bold">
                <Clock4 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black text-smart-warning">{pendingApproval}</span>
              <p className="text-[11px] text-smart-muted mt-1 font-medium">Awaiting plant supervisor</p>
            </div>
          </div>

          <div className="smart-glass-card p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-smart-muted">Completed Trips</span>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-smart-success flex items-center justify-center font-bold">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black text-smart-success">{completedTrips}</span>
              <p className="text-[11px] text-smart-muted mt-1 font-medium">Verified arrival at gates</p>
            </div>
          </div>
        </div>

        {/* Main Dashboard Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Side: Booking Form + Multi-Attendee Roster (7 Cols) */}
          <div className="lg:col-span-7 smart-glass-card p-6 sm:p-7 space-y-6">
            <div className="flex items-center justify-between border-b border-smart-border pb-4">
              <div>
                <span className="text-[11px] font-bold text-smart-blue uppercase tracking-wider">Fast Reservation</span>
                <h2 className="text-lg font-black text-smart-navy mt-0.5">Book Official Plant Transit</h2>
              </div>

              <div className="bg-slate-100 p-1 rounded-xl flex items-center text-xs font-bold text-smart-muted">
                <button
                  type="button"
                  onClick={() => setBookingType('EXCLUSIVE')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    bookingType === 'EXCLUSIVE'
                      ? 'bg-white text-smart-blue shadow-sm font-black'
                      : 'hover:text-smart-navy'
                  }`}
                >
                  Exclusive Car
                </button>
                <button
                  type="button"
                  onClick={() => setBookingType('SHARED')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    bookingType === 'SHARED'
                      ? 'bg-white text-smart-blue shadow-sm font-black'
                      : 'hover:text-smart-navy'
                  }`}
                >
                  Shared Shuttle
                </button>
              </div>
            </div>

            {feedback && (
              <div className={`p-4 rounded-xl text-xs flex items-center gap-2.5 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-smart-success font-semibold'
                  : 'bg-red-50 border border-red-200 text-smart-danger font-semibold'
              }`}>
                {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{feedback.message}</span>
              </div>
            )}

            <form onSubmit={handleCreateBooking} className="space-y-5">
              
              {/* Category Selector */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-smart-navy mb-2">
                  Target Vehicle Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { id: 'SEDAN_4', label: 'Executive Sedan', seats: '4 Seats' },
                    { id: 'SUV_6', label: 'Premium SUV', seats: '6 Seats' },
                    { id: 'VAN_12', label: 'Plant Van', seats: '12 Seats' },
                    { id: 'BUS_50', label: 'Transit Bus', seats: '50 Seats' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id as any)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        category === cat.id
                          ? 'border-smart-blue bg-blue-50/70 shadow-sm ring-1 ring-smart-blue'
                          : 'border-smart-border bg-white hover:bg-slate-50'
                      }`}
                    >
                      <p className={`text-xs font-black ${category === cat.id ? 'text-smart-blue' : 'text-smart-navy'}`}>
                        {cat.label}
                      </p>
                      <p className="text-[10px] text-smart-muted mt-0.5">{cat.seats}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Origin and Destination */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-smart-navy mb-1.5">
                    Origin Pick-up Hub
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-smart-blue absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      placeholder="e.g. Vadodara Gate 1"
                      className="w-full bg-slate-50 border border-smart-border rounded-xl pl-10 pr-3 py-2.5 text-xs text-smart-navy focus:bg-white focus:border-smart-blue focus:outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-smart-navy mb-1.5">
                    Destination Plant
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-smart-cyan absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="e.g. Dahej Heavy Complex"
                      className="w-full bg-slate-50 border border-smart-border rounded-xl pl-10 pr-3 py-2.5 text-xs text-smart-navy focus:bg-white focus:border-smart-blue focus:outline-none transition"
                    />
                  </div>
                </div>
              </div>

              {/* Departure Time & Purpose */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-smart-navy mb-1.5">
                    Departure Date & Time
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-smart-muted absolute left-3.5 top-3" />
                    <input
                      type="datetime-local"
                      required
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      className="w-full bg-slate-50 border border-smart-border rounded-xl pl-10 pr-3 py-2.5 text-xs text-smart-navy focus:bg-white focus:border-smart-blue focus:outline-none transition font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-smart-navy mb-1.5">
                    Transit Purpose / Cost Center
                  </label>
                  <input
                    type="text"
                    required
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="e.g. Safety Inspection, Project Meeting"
                    className="w-full bg-slate-50 border border-smart-border rounded-xl px-3.5 py-2.5 text-xs text-smart-navy focus:bg-white focus:border-smart-blue focus:outline-none transition"
                  />
                </div>
              </div>

              {/* Passenger Attendees Management Section */}
              <div className="pt-2 border-t border-smart-border space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-smart-navy">
                      Passenger Manifest ({passengers.length} / {maxSeats} Seats Reserved)
                    </label>
                    <span className="text-[10px] text-smart-muted">
                      Add team members traveling on this vehicle.
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddPassenger}
                    disabled={passengers.length >= maxSeats}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 disabled:opacity-40 text-smart-blue text-xs font-bold transition border border-blue-200"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>+ Add Attendee</span>
                  </button>
                </div>

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {passengers.map((passenger, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-smart-border bg-slate-50/70 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-smart-navy text-[11px]">
                          {idx === 0 ? 'Primary Rider (Lead)' : `Attendee #${idx + 1}`}
                        </span>
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => handleRemovePassenger(idx)}
                            className="p-1 rounded text-smart-muted hover:text-smart-danger transition"
                            title="Remove Attendee"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          required
                          placeholder="Employee Name"
                          value={passenger.name}
                          onChange={(e) => handleUpdatePassenger(idx, 'name', e.target.value)}
                          className="w-full bg-white border border-smart-border rounded-lg px-2.5 py-1.5 text-xs text-smart-navy placeholder-slate-400 focus:border-smart-blue focus:outline-none"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Emp Code (e.g. EMP-101)"
                          value={passenger.employee_id}
                          onChange={(e) => handleUpdatePassenger(idx, 'employee_id', e.target.value)}
                          className="w-full bg-white border border-smart-border rounded-lg px-2.5 py-1.5 text-xs text-smart-navy font-mono uppercase placeholder-slate-400 focus:border-smart-blue focus:outline-none"
                        />
                        <input
                          type="tel"
                          placeholder="Mobile (+91...)"
                          value={passenger.mobile || ''}
                          onChange={(e) => handleUpdatePassenger(idx, 'mobile', e.target.value)}
                          className="w-full bg-white border border-smart-border rounded-lg px-2.5 py-1.5 text-xs text-smart-navy placeholder-slate-400 focus:border-smart-blue focus:outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 rounded-xl smart-gradient-blue text-white font-black text-xs shadow-smart-lg hover:opacity-95 active:scale-98 transition flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {submitting
                      ? 'Reserving Asset...'
                      : `Confirm Reservation (${passengers.length} Seat${passengers.length > 1 ? 's' : ''})`}
                  </span>
                </button>
              </div>
            </form>
          </div>

          {/* Right Side: Vehicle Showcase & Features (5 Cols) */}
          <div className="lg:col-span-5 space-y-5">
            <div className="smart-glass-card p-6 relative overflow-hidden bg-gradient-to-br from-white via-white to-blue-50/40 border border-smart-border">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-widest text-smart-blue uppercase bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                  Fleet Ready
                </span>
                <span className="text-xs font-black text-smart-navy">Gujarat Plant Pool</span>
              </div>

              <div className="my-6 relative flex items-center justify-center">
                <div className="w-56 h-56 rounded-full bg-gradient-to-tr from-blue-100/60 to-cyan-100/40 absolute -z-10 blur-xl"></div>
                <svg className="w-full h-44 drop-shadow-2xl" viewBox="0 0 500 240" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <ellipse cx="250" cy="205" rx="190" ry="16" fill="#142B4A" fillOpacity="0.12" />
                  <path d="M70 170 C70 150 90 145 110 145 L150 145 L200 85 C215 70 235 65 260 65 L360 65 C390 65 410 80 425 105 L455 145 C475 145 490 155 490 170 C490 185 470 190 450 190 L90 190 C70 190 70 180 70 170 Z" fill="url(#paint0_linear)" />
                  <path d="M155 140 L198 88 C210 75 225 70 250 70 L350 70 C375 70 395 82 410 105 L445 140 Z" fill="#FFFFFF" fillOpacity="0.75" />
                  <path d="M210 92 L260 92 L260 135 L165 135 Z" fill="#142B4A" fillOpacity="0.85" />
                  <path d="M275 92 L345 92 C365 92 380 102 392 120 L402 135 L275 135 Z" fill="#142B4A" fillOpacity="0.85" />
                  <path d="M470 152 L485 152 C488 152 490 155 488 158 L475 165 Z" fill="#20C4D8" />
                  <circle cx="160" cy="188" r="32" fill="#142B4A" />
                  <circle cx="160" cy="188" r="22" fill="#E2E8F0" />
                  <circle cx="160" cy="188" r="10" fill="#2878F0" />
                  <circle cx="390" cy="188" r="32" fill="#142B4A" />
                  <circle cx="390" cy="188" r="22" fill="#E2E8F0" />
                  <circle cx="390" cy="188" r="10" fill="#2878F0" />
                  <defs>
                    <linearGradient id="paint0_linear" x1="70" y1="65" x2="490" y2="190" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#2878F0" />
                      <stop offset="0.6" stopColor="#1E65D0" />
                      <stop offset="1" stopColor="#142B4A" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-smart-border">
                <div className="p-2 rounded-xl bg-slate-50">
                  <span className="text-[10px] text-smart-muted uppercase font-bold block">Telemetry</span>
                  <span className="text-xs font-black text-smart-success">Live GPS</span>
                </div>
                <div className="p-2 rounded-xl bg-slate-50">
                  <span className="text-[10px] text-smart-muted uppercase font-bold block">Sanitization</span>
                  <span className="text-xs font-black text-smart-navy">HSE Certified</span>
                </div>
                <div className="p-2 rounded-xl bg-slate-50">
                  <span className="text-[10px] text-smart-muted uppercase font-bold block">Toll Gate</span>
                  <span className="text-xs font-black text-smart-blue">Fastag Linked</span>
                </div>
              </div>
            </div>

            <div className="smart-glass-card p-5 bg-gradient-to-br from-smart-navy to-[#1a385f] text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-smart-cyan">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Automated Shift Commutes</h3>
                  <p className="text-[11px] text-slate-300">Continuous plant transit runs scheduled at 06:00, 14:00, and 22:00.</p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                <span className="text-slate-300">Roster Attendance Mode</span>
                <Link href="/shifts" className="text-smart-cyan hover:underline font-bold flex items-center gap-1">
                  <span>View Rosters</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Section: Previous Bookings */}
        <div className="smart-glass-card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-smart-border pb-4">
            <div>
              <span className="text-[11px] font-bold text-smart-blue uppercase tracking-wider">Transit Manifest</span>
              <h2 className="text-lg font-black text-smart-navy mt-0.5">Your Active & Recent Journeys</h2>
            </div>
            <button
              onClick={loadBookings}
              className="text-xs text-smart-blue hover:underline font-bold flex items-center gap-1 self-start sm:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Refresh Schedule</span>
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-smart-muted">Loading journey manifests...</div>
          ) : bookings.length === 0 ? (
            <div className="py-12 text-center text-xs text-smart-muted border border-dashed border-smart-border rounded-xl">
              No previous bookings found. Reserve your first vehicle above.
            </div>
          ) : (
            <div className="divide-y divide-smart-border">
              {bookings.slice(0, 5).map((b) => (
                <div key={b.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 p-2 rounded-xl transition">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-smart-navy">{b.booking_reference}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        b.status === 'COMPLETED'
                          ? 'bg-emerald-50 text-smart-success border border-emerald-200'
                          : b.status === 'DISPATCHED'
                          ? 'bg-blue-50 text-smart-blue border border-blue-200'
                          : 'bg-amber-50 text-smart-warning border border-amber-200'
                      }`}>
                        {b.status}
                      </span>
                    </div>

                    <p className="text-xs font-bold text-smart-navy">
                      {b.origin_location} → <span className="text-smart-blue">{b.destination_location}</span>
                    </p>

                    <div className="flex items-center gap-4 text-[11px] text-smart-muted font-medium">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(b.pickup_time).toLocaleString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      <span>•</span>
                      <span>Passengers: <strong>{b.passenger_count || 1}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {b.status === 'DISPATCHED' && (
                      <Link
                        href={`/track/${b.id}`}
                        className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-smart-blue text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <Car className="w-3.5 h-3.5" />
                        <span>Track Live Radar</span>
                      </Link>
                    )}

                    <button
                      type="button"
                      onClick={() => handleBookAgain(b)}
                      className="px-3.5 py-2 rounded-xl border border-smart-border bg-white hover:bg-slate-50 text-smart-navy text-xs font-bold shadow-smart-sm transition flex items-center gap-1.5 active:scale-98"
                    >
                      <RotateCcw className="w-3 h-3 text-smart-blue" />
                      <span>Book Again</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
