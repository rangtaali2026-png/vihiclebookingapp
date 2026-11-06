'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import type { Booking, Vehicle } from '@plant-transit/shared-types';

function BoardingContent() {
  const searchParams = useSearchParams();
  const vehicleId = searchParams.get('vehicle_id') || '';

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [employeeId, setEmployeeId] = useState<string>('');
  const [verifying, setVerifying] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadTripData = async () => {
    if (!vehicleId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetchApi<{
        success: boolean;
        vehicle: Vehicle;
        active_booking: Booking | null;
      }>(`/api/fleet/vehicles/${vehicleId}/active-trip`);

      setVehicle(res.vehicle);
      setActiveBooking(res.active_booking);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to retrieve vehicle details.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTripData();
  }, [vehicleId]);

  const handleBoardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBooking || !employeeId.trim()) return;

    try {
      setVerifying(true);
      setMessage(null);

      const res = await fetchApi<{ success: boolean; message: string }>('/api/dispatch/verify-boarding', {
        method: 'POST',
        body: JSON.stringify({
          booking_id: activeBooking.id,
          employee_id: employeeId.trim().toUpperCase(),
        }),
      });

      setMessage({ type: 'success', text: `Boarding Confirmed! ${res.message}` });
      setEmployeeId('');
      await loadTripData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Verification failed. Employee ID not on manifest.' });
    } finally {
      setVerifying(false);
    }
  };

  if (!vehicleId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-500">
        <div className="text-center space-y-2">
          <p className="font-semibold text-slate-800">No vehicle specified.</p>
          <p className="text-xs">Scan a valid vehicle QR placard to verify boarding.</p>
          <Link href="/bookings" className="text-xs text-blue-600 underline">Return Home</Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-500">
        Verifying transit vehicle assignment...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between p-4 md:p-8">
      <div className="max-w-md w-full mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        
        {/* Vehicle Header Badge */}
        <div className="text-center pb-4 border-b border-slate-100">
          <div className="inline-flex px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold uppercase tracking-wider mb-2">
            Plant Transit Boarding
          </div>
          <h1 className="text-2xl font-black font-mono text-slate-900">
            {vehicle?.registration_number || 'Vehicle Scan'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {vehicle?.model} • Capacity {vehicle?.seat_capacity} seats
          </p>
        </div>

        {/* Active Trip Information */}
        {!activeBooking ? (
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-center space-y-2">
            <p className="text-sm font-semibold text-amber-900">No Active Trip Dispatched</p>
            <p className="text-xs text-amber-700">
              This vehicle is currently awaiting dispatch. Please check with plant dispatch administration.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Trip Ref:</span>
                <span className="font-mono font-bold text-slate-900">{activeBooking.booking_reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Route:</span>
                <span className="font-semibold text-slate-800">
                  {activeBooking.origin_location} → {activeBooking.destination_location}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Assigned Driver:</span>
                <span className="font-medium text-slate-900">
                  {activeBooking.drivers?.name || 'On Duty'}
                </span>
              </div>
            </div>

            {/* Check-In Input Form */}
            <form onSubmit={handleBoardingSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Enter Your Employee ID
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. EMP-1001"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-3 text-base uppercase font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={verifying}
                className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {verifying ? 'Verifying Rider...' : 'Confirm Boarding'}
              </button>
            </form>

            {message && (
              <div className={`p-3 rounded-lg text-xs font-semibold ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {message.text}
              </div>
            )}

            {/* Current Boarding Manifest Roster */}
            <div className="pt-2">
              <p className="text-xs font-semibold text-slate-700 mb-2">
                Passenger Manifest ({activeBooking.booking_passengers?.filter(p => p.is_boarded).length || 0}/{activeBooking.passenger_count} Boarded)
              </p>
              <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto border border-slate-100 rounded-lg">
                {activeBooking.booking_passengers?.map((p, idx) => (
                  <div key={idx} className="p-2 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-medium text-slate-800">{p.employee_id}</span>
                      <span className="text-slate-500 ml-1.5">{p.employee_name || 'Passenger'}</span>
                    </div>
                    {p.is_boarded ? (
                      <span className="text-emerald-700 font-semibold text-[11px]">✓ On Board</span>
                    ) : (
                      <span className="text-slate-400 text-[11px]">Awaiting</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="text-center pt-2">
          <Link href="/bookings" className="text-xs text-slate-400 hover:text-slate-600">
            ← Return to Plant Transit Home
          </Link>
        </div>
      </div>

      <div className="text-center text-[11px] text-slate-400 py-4">
        Vadodara Chemical & Polymer Complex • Transit Operations
      </div>
    </div>
  );
}

export default function BoardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-500">Loading Transit Page...</div>}>
      <BoardingContent />
    </Suspense>
  );
}
