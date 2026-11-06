'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';
import type { Booking, Vehicle, VehicleCategory, BookingType } from '@plant-transit/shared-types';

interface PassengerInput {
  employee_id: string;
  employee_name: string;
  department: string;
  contact_number: string;
  pickup_point: string;
  drop_point: string;
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Form State
  const [siteId] = useState('11111111-1111-1111-1111-111111111111');
  const [requesterId] = useState('00000000-0000-0000-0000-000000000002');
  const [bookingType, setBookingType] = useState<BookingType>('PRIVATE');
  const [targetCategory, setTargetCategory] = useState<VehicleCategory>('SEDAN_4');
  const [preferredVehicleId, setPreferredVehicleId] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [originLocation, setOriginLocation] = useState<string>('Main Plant Gate 1');
  const [destinationLocation, setDestinationLocation] = useState<string>('City Transit Hub');
  const [purpose, setPurpose] = useState<string>('Client Plant Visit');

  // Passenger Manifest State
  const [passengers, setPassengers] = useState<PassengerInput[]>([
    {
      employee_id: 'EMP-1001',
      employee_name: 'Lead Engineer',
      department: 'Operations',
      contact_number: '+91 9876543210',
      pickup_point: 'Main Plant Gate 1',
      drop_point: 'City Transit Hub',
    },
  ]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [bookingsRes, vehiclesRes] = await Promise.all([
        fetchApi<{ success: boolean; bookings: Booking[] }>('/api/bookings'),
        fetchApi<{ success: boolean; vehicles: Vehicle[] }>('/api/fleet/vehicles'),
      ]);
      setBookings(bookingsRes.bookings || []);
      setVehicles(vehiclesRes.vehicles || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Set default departure in 1 hour
    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000);
    const end = new Date(now.getTime() + 180 * 60 * 1000);
    setStartTime(start.toISOString().slice(0, 16));
    setEndTime(end.toISOString().slice(0, 16));

    loadData();
  }, []);

  const addPassenger = () => {
    setPassengers([
      ...passengers,
      {
        employee_id: `EMP-${1000 + passengers.length + 1}`,
        employee_name: '',
        department: 'Operations',
        contact_number: '',
        pickup_point: originLocation,
        drop_point: destinationLocation,
      },
    ]);
  };

  const removePassenger = (index: number) => {
    if (passengers.length === 1) return;
    setPassengers(passengers.filter((_, i) => i !== index));
  };

  const updatePassenger = (index: number, field: keyof PassengerInput, val: string) => {
    const updated = [...passengers];
    updated[index][field] = val;
    setPassengers(updated);
  };

  const handleReserve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startTime || !endTime) return;

    try {
      setSubmitting(true);
      await fetchApi('/api/bookings/reserve', {
        method: 'POST',
        body: JSON.stringify({
          site_id: siteId,
          requester_id: requesterId,
          booking_type: bookingType,
          target_category: targetCategory,
          preferred_vehicle_id: preferredVehicleId || null,
          scheduled_start_time: new Date(startTime).toISOString(),
          scheduled_end_time: new Date(endTime).toISOString(),
          origin_location: originLocation,
          destination_location: destinationLocation,
          purpose,
          passengers,
        }),
      });

      alert('Booking successfully reserved with concurrency guard!');
      await loadData();
    } catch (err: any) {
      alert(`Reservation Failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handle1ClickRebook = async (bookingId: string) => {
    const confirm = window.confirm('Rebook this exact itinerary for tomorrow same time?');
    if (!confirm) return;

    try {
      // Shift tomorrow
      const tomorrowStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const tomorrowEnd = new Date(tomorrowStart.getTime() + 2 * 60 * 60 * 1000);

      await fetchApi(`/api/bookings/${bookingId}/rebook`, {
        method: 'POST',
        body: JSON.stringify({
          scheduled_start_time: tomorrowStart.toISOString(),
          scheduled_end_time: tomorrowEnd.toISOString(),
        }),
      });

      alert('1-Click Re-booking successful!');
      await loadData();
    } catch (err: any) {
      alert(`Re-booking failed: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-800">
                ← Home
              </Link>
              <span className="text-slate-300">/</span>
              <span className="text-sm font-semibold text-slate-800">Booking Engine</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">Vehicle Booking Engine</h1>
            <p className="text-sm text-slate-600">Reserve dedicated cars or book shared shuttle seats with atomic concurrency safety</p>
          </div>
          <Link
            href="/fleet"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            Manage Fleet Assets →
          </Link>
        </div>

        {/* Booking Creation Form */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">New Reservation Request</h2>
            
            {/* Private vs Shared Mode Selector */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setBookingType('PRIVATE')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  bookingType === 'PRIVATE' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Private (Exclusive Vehicle)
              </button>
              <button
                type="button"
                onClick={() => setBookingType('SHARED')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  bookingType === 'SHARED' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Shared (Seat Allocation)
              </button>
            </div>
          </div>

          <form onSubmit={handleReserve} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Target Vehicle Category
                </label>
                <select
                  value={targetCategory}
                  onChange={(e) => setTargetCategory(e.target.value as VehicleCategory)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="SEDAN_4">Sedan (4 Seater)</option>
                  <option value="MPV_6">MPV / SUV (6 Seater)</option>
                  <option value="BUS_42">Plant Bus (42 Seater)</option>
                  <option value="BUS_52">Plant Bus (52 Seater)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Assigned / Preferred Vehicle
                </label>
                <select
                  value={preferredVehicleId}
                  onChange={(e) => setPreferredVehicleId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="">Auto-allocate Best Fit</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.registration_number} - {v.make_model} ({v.total_capacity} seats)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Purpose of Transit
                </label>
                <input
                  type="text"
                  required
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Scheduled Departure
                </label>
                <input
                  type="datetime-local"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Scheduled Arrival / End
                </label>
                <input
                  type="datetime-local"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Origin
                  </label>
                  <input
                    type="text"
                    required
                    value={originLocation}
                    onChange={(e) => setOriginLocation(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Destination
                  </label>
                  <input
                    type="text"
                    required
                    value={destinationLocation}
                    onChange={(e) => setDestinationLocation(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Passenger Manifest Section */}
            <div className="border-t border-slate-100 pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Passenger Manifest ({passengers.length} seat{passengers.length > 1 ? 's' : ''})
                  </h3>
                  <p className="text-xs text-slate-500">Add all passengers boarding this transit trip</p>
                </div>
                <button
                  type="button"
                  onClick={addPassenger}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  + Add Passenger
                </button>
              </div>

              <div className="space-y-3">
                {passengers.map((p, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                    <div>
                      <input
                        type="text"
                        placeholder="Employee ID"
                        value={p.employee_id}
                        onChange={(e) => updatePassenger(idx, 'employee_id', e.target.value)}
                        className="w-full rounded border border-slate-300 p-1.5 bg-white"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Full Name"
                        value={p.employee_name}
                        onChange={(e) => updatePassenger(idx, 'employee_name', e.target.value)}
                        className="w-full rounded border border-slate-300 p-1.5 bg-white"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Contact Phone"
                        value={p.contact_number}
                        onChange={(e) => updatePassenger(idx, 'contact_number', e.target.value)}
                        className="w-full rounded border border-slate-300 p-1.5 bg-white"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Pickup Point"
                        value={p.pickup_point}
                        onChange={(e) => updatePassenger(idx, 'pickup_point', e.target.value)}
                        className="w-full rounded border border-slate-300 p-1.5 bg-white"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Drop Point"
                        value={p.drop_point}
                        onChange={(e) => updatePassenger(idx, 'drop_point', e.target.value)}
                        className="w-full rounded border border-slate-300 p-1.5 bg-white"
                      />
                    </div>
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => removePassenger(idx)}
                        disabled={passengers.length === 1}
                        className="text-red-600 hover:text-red-800 disabled:opacity-30 font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {submitting ? 'Reserving...' : 'Confirm Reservation'}
              </button>
            </div>
          </form>
        </div>

        {/* Existing Bookings & 1-Click Rebooking Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-800">
              Recent Plant Bookings ({bookings.length})
            </h3>
            <button
              onClick={loadData}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Loading bookings...</div>
          ) : bookings.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No bookings recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-xs uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Ref #</th>
                    <th className="py-3 px-4">Mode</th>
                    <th className="py-3 px-4">Route</th>
                    <th className="py-3 px-4">Departure</th>
                    <th className="py-3 px-4">Seats</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/75 transition">
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">{b.booking_reference}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                          {b.booking_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {b.origin_location} → {b.destination_location}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-xs">
                        {new Date(b.scheduled_start_time).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-slate-900 font-medium">{b.passenger_count}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          b.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                          b.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                          b.status === 'DISPATCHED' ? 'bg-purple-100 text-purple-800' :
                          'bg-emerald-100 text-emerald-800'
                        }`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handle1ClickRebook(b.id)}
                          className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-xs"
                          title="1-Click Re-book tomorrow"
                        >
                          ⚡ 1-Click Re-book
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
