'use client';

import AppNavbar from '@/components/AppNavbar';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';
import type { Booking, Vehicle, Driver, BookingPassenger } from '@plant-transit/shared-types';
import { Users, X } from 'lucide-react';

type DispatchBooking = Booking & {
  fh_remarks?: string | null;
  uh_remarks?: string | null;
  admin_hr_remarks?: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  department?: string | null;
  mobile?: string | null;
  employee_phone?: string | null;
};

type ManifestBooking = DispatchBooking & {
  passenger_manifest?: BookingPassenger[] | string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  department?: string | null;
  employee_phone?: string | null;
};

export default function DispatchPage() {
  const [adminRemarksMap, setAdminRemarksMap] = useState<Record<string, string>>({});
  const [processingApprovalId, setProcessingApprovalId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('user_profile');
        if (raw) {
          const u = JSON.parse(raw);
          if (u.role === 'FH_APPROVER' || u.role === 'UH_APPROVER') {
            window.location.replace('/approvals');
          }
        }
      } catch {}
    }
  }, []);

  const [bookings, setBookings] = useState<DispatchBooking[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [dispatchTab, setDispatchTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
  const [viewingRequestForm, setViewingRequestForm] = useState<any | null>(null);

  // Assignment Modal State
  const [assigningBooking, setAssigningBooking] = useState<Booking | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Boarding Verification State
  const [verifyingBooking, setVerifyingBooking] = useState<Booking | null>(null);
  const [scanEmpId, setScanEmpId] = useState<string>('');
  const [boardingMessage, setBoardingMessage] = useState<string | null>(null);
  
  // Notification Logs Modal State
  const [activeNotificationLogs, setActiveNotificationLogs] = useState<{
    reference: string;
    logs: any[];
  } | null>(null);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [selectedManifestBooking, setSelectedManifestBooking] = useState<ManifestBooking | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [bookingsRes, vehiclesRes, driversRes] = await Promise.all([
        fetchApi<{ success: boolean; bookings: DispatchBooking[] }>('/api/bookings'),
        fetchApi<{ success: boolean; vehicles: Vehicle[] }>('/api/fleet/vehicles'),
        fetchApi<{ success: boolean; drivers: Driver[] }>('/api/drivers?site_id=11111111-1111-1111-1111-111111111111'),
      ]);

      setBookings(bookingsRes.bookings || []);
      setVehicles(vehiclesRes.vehicles || []);
      setDrivers(driversRes.drivers || []);
    } catch (err: any) {
      console.error('Failed to load dispatch data:', err);
    } finally {
      setLoading(false);
    }
  };

    const isOutstationApproved = (b: any) => {
    if (
      b.status === 'REJECTED' ||
      b.status === 'CANCELLED' ||
      b.fh_approval_status === 'REJECTED' ||
      b.uh_approval_status === 'REJECTED' ||
      b.admin_hr_approval_status === 'REJECTED'
    ) {
      return false;
    }
    const isOut = Boolean(
      b.is_outstation ||
      (b.destination_location && !String(b.destination_location).toLowerCase().includes('bharuch')) ||
      (b.drop_location && !String(b.drop_location).toLowerCase().includes('bharuch'))
    );
    if (!isOut) return true;
    return b.fh_approval_status === 'APPROVED' && b.uh_approval_status === 'APPROVED';
  };

  const handleAdminApprovalDecision = async (bookingId: string, decision: 'APPROVED' | 'REJECTED') => {
    const remarkText = (adminRemarksMap[bookingId] || '').trim();
    if (decision === 'REJECTED' && !remarkText) {
      alert('Please enter a remark before rejecting this requisition.');
      return;
    }
    setProcessingApprovalId(bookingId);
    try {
      await fetchApi(`/api/bookings/${bookingId}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({
          stage: 'FH_HR_ADMIN',
          decision,
          approver_name: 'FH-HR / Admin',
          remarks: remarkText
        })
      });
      setAdminRemarksMap((prev) => {
        const next = { ...prev };
        delete next[bookingId];
        return next;
      });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to record FH-HR / Admin decision');
    } finally {
      setProcessingApprovalId(null);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAssignModal = (b: Booking) => {
    setAssigningBooking(b);
    setSelectedVehicleId(b.allotted_vehicle_id || (vehicles.length > 0 ? vehicles[0].id : ''));
    setSelectedDriverId(b.allotted_driver_id || (drivers.length > 0 ? drivers[0].id : ''));
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningBooking || !selectedVehicleId || !selectedDriverId) return;

    try {
      setSubmitting(true);
      await fetchApi(`/api/dispatch/${assigningBooking.id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({
          vehicle_id: selectedVehicleId,
          driver_id: selectedDriverId,
          status: 'DISPATCHED',
        }),
      });

      alert(`Booking ${assigningBooking.booking_reference} successfully dispatched!`);
      setAssigningBooking(null);
      await loadData();
    } catch (err: any) {
      alert(`Assignment failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteTrip = async (bookingId: string, reference: string) => {
    const confirm = window.confirm(`Mark trip ${reference} as COMPLETED and return vehicle/driver to available inventory?`);
    if (!confirm) return;

    try {
      await fetchApi(`/api/dispatch/${bookingId}/complete`, { method: 'PATCH' });
      alert(`Trip ${reference} completed!`);
      await loadData();
    } catch (err: any) {
      alert(`Error completing trip: ${err.message}`);
    }
  };

  
  const handleViewNotifications = async (bookingId: string, reference: string) => {
    try {
      setLoadingLogs(true);
      const res = await fetchApi<{ success: boolean; notifications: any[] }>(`/api/dispatch/${bookingId}/notifications`);
      setActiveNotificationLogs({
        reference,
        logs: res.notifications || []
      });
    } catch (err: any) {
      alert(`Could not load alerts: ${err.message}`);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleVerifyBoarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyingBooking || !scanEmpId) return;

    try {
      setBoardingMessage(null);
      const res = await fetchApi<{ success: boolean; message: string }>('/api/dispatch/verify-boarding', {
        method: 'POST',
        body: JSON.stringify({
          booking_id: verifyingBooking.id,
          booking_reference: verifyingBooking.booking_reference,
          employee_id: scanEmpId.trim().toUpperCase(),
        }),
      });

      setBoardingMessage(`✓ ${res.message}`);
      setScanEmpId('');
      await loadData();
    } catch (err: any) {
      setBoardingMessage(`✕ ${err.message}`);
    }
  };

  const isOutstationReq = (b: any) =>
    Boolean(
      b.is_outstation ||
      (b.destination_location && !String(b.destination_location).toLowerCase().includes('bharuch'))
    );

  const isReadyOrActiveForDispatch = (b: any) => {
    if (b.status === 'COMPLETED' || b.status === 'REJECTED' || b.status === 'CANCELLED') return false;
    if (b.fh_approval_status === 'REJECTED' || b.uh_approval_status === 'REJECTED' || b.admin_hr_approval_status === 'REJECTED') {
      return false;
    }
    // Outstation requests must have BOTH FH and UH approved before appearing in FH-HR / Admin Dispatch
    if (isOutstationReq(b)) {
      return b.fh_approval_status === 'APPROVED' && b.uh_approval_status === 'APPROVED';
    }
    return true;
  };

  const filteredDispatchBookings = (Array.isArray(bookings) ? bookings : []).filter((b: any) => {
    if (dispatchTab === 'HISTORY') {
      return b.status === 'COMPLETED' || b.status === 'REJECTED' || b.status === 'CANCELLED';
    }
    return isReadyOrActiveForDispatch(b);
  });

  return (
    <div className="min-h-screen bg-slate-50 px-6 pb-6 md:px-10 md:pb-10">
      <AppNavbar />
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Link href="/" className="text-sm font-medium text-slate-400 hover:text-slate-800">
                ← Home
              </Link>
              <span className="text-slate-300">/</span>
              <span className="text-sm font-semibold text-slate-800">Dispatch Operations</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-smart-navy tracking-tight mt-1">Admin Dispatch & Operations Console</h1>
            <p className="text-sm text-slate-600">Allocate drivers, assign ride assets, and verify passenger boarding manifests</p>
          </div>
          <div className="flex gap-2">
            <a
              href="/reports"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 transition shadow-sm"
            >
              Reports &amp; Excel Export
            </a>
            <Link
              href="/bookings"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              Booking Engine →
            </Link>
            <Link
              href="/fleet"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              Ride Assets →
            </Link>
          </div>
        </div>

        {/* Quick Driver & Fleet Operational Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-800 p-4 shadow-xs">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Allotment</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              {bookings.filter((b) => b.status === 'PENDING').length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-800 p-4 shadow-xs">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Dispatched</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">
              {bookings.filter((b) => b.status === 'DISPATCHED').length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-800 p-4 shadow-xs">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Available Drivers</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {drivers.filter((d) => d.duty_status === 'AVAILABLE').length} / {drivers.length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-800 p-4 shadow-xs">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Available Vehicles</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">
              {vehicles.filter((v) => v.status === 'AVAILABLE').length} / {vehicles.length}
            </p>
          </div>
        </div>

        {/* Dispatch Operations Table */}
        <div className="bg-white rounded-xl border border-slate-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-800">
              Trip Dispatch &amp; Asset Allocation Queue ({filteredDispatchBookings.length})
            </h3>
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-bold mr-2">
              <button
                type="button"
                onClick={() => setDispatchTab('ACTIVE')}
                className={`px-3 py-1 rounded-lg transition ${dispatchTab === 'ACTIVE' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Ready for Dispatch
              </button>
              <button
                type="button"
                onClick={() => setDispatchTab('HISTORY')}
                className={`px-3 py-1 rounded-lg transition ${dispatchTab === 'HISTORY' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Completed &amp; Closed
              </button>
            </div>
            <button
              onClick={loadData}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Refresh Queue
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading operational trips...</div>
          ) : bookings.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No operational trips found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-50/50 text-xs uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Ref #</th>
                    <th className="py-3 px-4">Route & Time</th>
                    <th className="py-3 px-4">Allocated Vehicle</th>
                    <th className="py-3 px-4">Allocated Driver</th>
                    <th className="py-3 px-4">Manifest</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Dispatch Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredDispatchBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/75 transition">
                      <td className="py-3 px-4">
                        <div className="space-y-0.5 mb-1">
                          <button
                            type="button"
                            onClick={() => setViewingRequestForm(b)}
                            title="View Submitted Vehicle Request Form & Approval Details"
                            className="font-mono text-xs font-black text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 block text-left cursor-pointer"
                          >
                            {b.booking_reference || \'PENDING-REF\'}
                          </button>
                          <span className="font-bold text-slate-900 text-xs block">
                            {b.employee_name || b.booking_passengers?.[0]?.employee_name || 'Employee'}
                          </span>
                          <span className="text-[11px] text-slate-500 block">
                            {b.employee_id || 'EMP'} &bull; {b.department || 'General'}
                          </span>
                          {(b.mobile || b.employee_phone) && (
                            <span className="font-mono text-[11px] text-slate-500 block">
                              {b.mobile || b.employee_phone}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">{b.booking_type} • {b.target_category}</div>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-medium text-slate-800">{b.origin_location} → {b.destination_location}</div>
                        <div className="text-slate-400 mt-0.5">{new Date(b.scheduled_start_time).toLocaleString()}</div>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {b.vehicles ? (
                          <div className="font-bold text-slate-900">
                            {b.vehicles.registration_number} <span className="text-slate-400">({b.vehicles.model})</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Not Assigned</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {b.drivers ? (
                          <div>
                            <div className="font-medium text-white">{b.drivers.name}</div>
                            <div className="text-slate-400 font-mono">{b.drivers.mobile_number}</div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Not Assigned</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => setSelectedManifestBooking(b)}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium underline"
                        >
                          👥 {b.booking_passengers?.filter(p => p.is_boarded).length || 0}/{b.passenger_count} Boarded
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          b.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                          b.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                          b.status === 'DISPATCHED' ? 'bg-purple-100 text-purple-800' :
                          b.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                          'bg-emerald-100 text-emerald-800'
                        }`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {(b.status === 'PENDING' || b.status === 'APPROVED') && (
                          <button
                            type="button"
                            onClick={() => openAssignModal(b)}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
                          >
                            Assign & Dispatch
                          </button>
                        )}
                        {/* FH-HR / Admin Approval & Remark Controls */}
                        {(b.status === 'PENDING' || b.status === 'APPROVED') && (
                          <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5 text-left">
                            {(b.fh_remarks || b.uh_remarks) && (
                              <div className="text-[10px] text-slate-500 space-y-0.5">
                                {b.fh_remarks && <div><strong>FH Remark:</strong> {b.fh_remarks}</div>}
                                {b.uh_remarks && <div><strong>UH Remark:</strong> {b.uh_remarks}</div>}
                              </div>
                            )}
                            {b.admin_hr_remarks ? (
                              <div className="text-[10px] text-emerald-700 font-semibold">
                                <strong>HR/Admin Remark:</strong> {b.admin_hr_remarks}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                <input
                                  type="text"
                                  value={adminRemarksMap[b.id] || ''}
                                  onChange={(e) =>
                                    setAdminRemarksMap((prev) => ({ ...prev, [b.id]: e.target.value }))
                                  }
                                  placeholder="FH-HR / Admin remark..."
                                  className="w-full px-2 py-1 rounded border border-slate-300 text-[11px] text-slate-800 bg-white"
                                />
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    disabled={processingApprovalId === b.id}
                                    onClick={() => handleAdminApprovalDecision(b.id, 'APPROVED')}
                                    className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold hover:bg-emerald-100"
                                  >
                                    Approve HR/Admin
                                  </button>
                                  <button
                                    type="button"
                                    disabled={processingApprovalId === b.id}
                                    onClick={() => handleAdminApprovalDecision(b.id, 'REJECTED')}
                                    className="px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold hover:bg-rose-100"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="inline-flex items-center justify-end gap-1.5 flex-wrap mt-1">
                          <button
                            type="button"
                            onClick={() => handleViewNotifications(b.id, b.booking_reference)}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 transition"
                            title="View Dispatch Notifications"
                          >
                            <span>📩</span>
                            <span>Alerts</span>
                          </button>
                          <Link
                            href={`/track?id=${encodeURIComponent(b.id)}`}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700 hover:bg-purple-100 transition"
                            title="Open Live Transit Radar"
                          >
                            <span>📡</span>
                            <span>Track</span>
                          </Link>
                        </div>
                        
                        {b.status === 'DISPATCHED' && (
                          <>
                            <button
                              type="button"
                              onClick={() => setVerifyingBooking(b)}
                              className="rounded border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100"
                            >
                              Verify Rider
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCompleteTrip(b.id, b.booking_reference)}
                              className="rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                            >
                              Complete Trip
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Driver & Vehicle Allotment Modal */}
      {assigningBooking && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-white">
                  Assign Ride Assets: {assigningBooking.booking_reference}
                </h3>
                <p className="text-xs text-slate-400">
                  Required: {assigningBooking.target_category} • {assigningBooking.passenger_count} Passenger(s)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssigningBooking(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Select Vehicle
                </label>
                <select
                  required
                  value={selectedVehicleId}
                  onChange={(e) => {
                      const vId = e.target.value;
                      setSelectedVehicleId(vId);
                      // Auto-preload permanent assigned driver
                      const matched = vehicles.find((v: any) => v.id === vId);
                      if (matched?.default_driver_id) {
                        setSelectedDriverId(matched.default_driver_id);
                      }
                    }}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option className="text-smart-navy bg-white py-1.5 font-medium" value="">-- Choose Vehicle --</option>
                  {vehicles.map((v) => (
                    <option className="text-smart-navy bg-white py-1.5 font-medium" key={v.id} value={v.id}>
                      {v.registration_number} ({v.model}) - {v.seat_capacity} seats [{v.status}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Select Plant Driver
                </label>
                <select
                  required
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option className="text-smart-navy bg-white py-1.5 font-medium" value="">-- Choose Driver --</option>
                  {drivers.map((d) => (
                    <option className="text-smart-navy bg-white py-1.5 font-medium" key={d.id} value={d.id}>
                      {d.name} ({d.mobile_number}) - [{d.duty_status}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAssigningBooking(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Dispatching...' : 'Confirm & Dispatch Trip'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Boarding Verification & Scanner Modal */}
      {verifyingBooking && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-smart-navy tracking-tight">
                  QR Boarding Verification: {verifyingBooking.booking_reference}
                </h3>
                <p className="text-xs text-slate-400">
                  <p className="text-xs text-smart-muted font-medium mt-0.5">Scan badge or enter Employee ID to verify boarding</p>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setVerifyingBooking(null);
                  setBoardingMessage(null);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleVerifyBoarding} className="flex gap-2">
              <input
                type="text"
                required
                placeholder="Scan / Enter Employee ID (e.g. EMP-1001)"
                value={scanEmpId}
                onChange={(e) => setScanEmpId(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm uppercase"
              />
              <button
                type="submit"
                className="rounded-md bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700"
              >
                Verify Rider
              </button>
            </form>

            {boardingMessage && (
              <div className={`p-2.5 rounded-lg text-xs font-medium ${
                boardingMessage.startsWith('✓') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {boardingMessage}
              </div>
            )}

            {/* Live Boarding Manifest */}
            <div className="border border-slate-800 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="p-2">Emp ID</th>
                    <th className="p-2">Name</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {verifyingBooking.booking_passengers?.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2 font-mono font-medium text-white">{p.employee_id}</td>
                      <td className="p-2 text-slate-700">{p.employee_name || '—'}</td>
                      <td className="p-2">
                        {p.is_boarded ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            ✓ Boarded
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                            Awaiting
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setVerifyingBooking(null);
                  setBoardingMessage(null);
                }}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Close Scanner
              </button>
            </div>
          </div>
        </div>
      )}

    
      {/* =======================================================================
          Passenger Manifest Roster Modal
      ======================================================================= */}
      {selectedManifestBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-smart-navy/40 backdrop-blur-md">
          <div className="w-full max-w-2xl bg-white border border-smart-border rounded-2xl p-6 shadow-smart-lg space-y-5 animate-in fade-in duration-150">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-smart-border pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50 text-smart-blue">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-black text-smart-blue uppercase">
                      {selectedManifestBooking.booking_reference}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs font-bold text-smart-navy">
                      {selectedManifestBooking.target_category || 'SEDAN_4'}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-smart-navy mt-0.5">
                    Passenger Manifest & Boarding Roster
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedManifestBooking(null)}
                className="p-1.5 rounded-xl text-smart-muted hover:text-smart-navy hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Route & Allocated Asset Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-smart-border text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-smart-muted block">
                  Transit Journey
                </span>
                <p className="font-bold text-smart-navy mt-0.5">
                  {selectedManifestBooking.origin_location} → {selectedManifestBooking.destination_location}
                </p>
                <span className="text-[11px] text-smart-muted font-medium block mt-0.5">
                  Purpose: {selectedManifestBooking.purpose || 'Official Plant Duty'}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-smart-muted block">
                  Assigned Vehicle & Driver
                </span>
                <p className="font-bold text-smart-blue mt-0.5">
                  {selectedManifestBooking.vehicles?.registration_number || selectedManifestBooking.allotted_vehicle_id || 'Not Assigned'}
                </p>
                <span className="text-[11px] text-smart-navy font-medium block mt-0.5">
                  Driver: {selectedManifestBooking.drivers?.name || 'Awaiting Allocation'} 
                  {selectedManifestBooking.drivers?.mobile_number ? ` (${selectedManifestBooking.drivers.mobile_number})` : ''}
                </span>
              </div>
            </div>

            {/* Manifest Table */}
            <div className="border border-smart-border rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 text-smart-muted text-[10px] font-bold uppercase tracking-wider border-b border-smart-border">
                  <tr>
                    <th className="py-2.5 px-3">Emp ID</th>
                    <th className="py-2.5 px-3">Passenger Name</th>
                    <th className="py-2.5 px-3">Department</th>
                    <th className="py-2.5 px-3">Contact / Pickup</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-smart-border text-smart-navy">
                  {(() => {
                    let manifestList: any[] = [];
                    if (Array.isArray(selectedManifestBooking.passenger_manifest)) {
                      manifestList = selectedManifestBooking.passenger_manifest;
                    } else if (typeof selectedManifestBooking.passenger_manifest === 'string') {
                      try {
                        manifestList = JSON.parse(selectedManifestBooking.passenger_manifest);
                      } catch (e) {
                        manifestList = [];
                      }
                    }

                    // Fallback if manifest is empty: use employee_name and employee_email from booking
                    if (manifestList.length === 0) {
                      manifestList = [{
                        employee_id: selectedManifestBooking.employee_id || 'EMP-LEAD',
                        name: selectedManifestBooking.employee_name || 'Primary Booking Lead',
                        department: selectedManifestBooking.department || 'Operations',
                        mobile: selectedManifestBooking.employee_phone || '—',
                        pickup_point: selectedManifestBooking.origin_location,
                        boarded: selectedManifestBooking.status === 'COMPLETED' || selectedManifestBooking.status === 'DISPATCHED'
                      }];
                    }

                    return manifestList.map((passenger: any, idx: number) => {
                      const isBoarded = passenger.boarded ?? (selectedManifestBooking.status === 'DISPATCHED' || selectedManifestBooking.status === 'COMPLETED');
                      return (
                        <tr key={idx} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-3 font-mono font-bold text-smart-navy text-[11px]">
                            {passenger.employee_id || passenger.emp_id || `EMP-0${idx + 1}`}
                          </td>

                          <td className="py-3 px-3">
                            <div className="font-bold text-smart-navy flex items-center gap-1.5">
                              <span>{passenger.name || 'Unnamed Passenger'}</span>
                              {idx === 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-50 text-smart-blue border border-blue-200 font-bold uppercase">
                                  Lead
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-3 text-smart-muted font-medium text-[11px]">
                            {passenger.department || selectedManifestBooking.department || 'Plant Transit'}
                          </td>

                          <td className="py-3 px-3 text-[11px]">
                            <div className="font-mono text-smart-navy">{passenger.mobile || passenger.phone || '—'}</div>
                            {passenger.pickup_point && (
                              <div className="text-[10px] text-smart-muted truncate max-w-[140px]">
                                {passenger.pickup_point}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3 text-right">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              isBoarded
                                ? 'bg-emerald-50 text-smart-success border-emerald-200'
                                : 'bg-amber-50 text-smart-warning border-amber-200'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isBoarded ? 'bg-smart-success' : 'bg-smart-warning'}`} />
                              <span>{isBoarded ? 'BOARDED' : 'PENDING'}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-smart-border text-xs">
              <span className="text-[11px] text-smart-muted font-medium">
                Verified against Plant Security Gate Access Protocol
              </span>
              <button
                type="button"
                onClick={() => setSelectedManifestBooking(null)}
                className="smart-gradient-blue text-white px-5 py-2 rounded-xl font-bold shadow-smart-md hover:opacity-95 transition"
              >
                Close Roster
              </button>
            </div>

          </div>
        </div>
      )}

    
      {/* Submitted Vehicle Request Form & Approval Detail Modal */}
      {viewingRequestForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 text-xs">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <span className="font-mono text-xs font-black text-blue-600 uppercase tracking-wider">
                  {viewingRequestForm.booking_reference}
                </span>
                <h2 className="text-lg font-black text-slate-900 mt-0.5">
                  Submitted Vehicle Requisition Form
                </h2>
                <p className="text-[11px] text-slate-500">
                  Submitted on {viewingRequestForm.created_at ? new Date(viewingRequestForm.created_at).toLocaleString('en-IN') : 'N/A'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingRequestForm(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-bold hover:bg-slate-200"
              >
                ✕ Close
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200/80 rounded-xl p-4">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Requester Name</span>
                <span className="font-bold text-slate-900">{viewingRequestForm.employee_name || 'Employee'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Employee ID</span>
                <span className="font-mono font-bold text-slate-900">{viewingRequestForm.employee_id || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Department</span>
                <span className="font-bold text-slate-900">{viewingRequestForm.department || 'General'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Mobile Number</span>
                <span className="font-mono font-bold text-slate-900">{viewingRequestForm.mobile || viewingRequestForm.employee_phone || 'N/A'}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Email Address</span>
                <span className="font-mono font-semibold text-slate-800">{viewingRequestForm.employee_email || 'Not Provided'}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-slate-200 rounded-xl p-4">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Origin / Pickup Point</span>
                <span className="font-bold text-slate-900">{viewingRequestForm.origin_location}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Destination</span>
                <span className="font-bold text-slate-900">{viewingRequestForm.destination_location}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Departure Date &amp; Time</span>
                <span className="font-semibold text-slate-800">
                  {viewingRequestForm.scheduled_start_time ? new Date(viewingRequestForm.scheduled_start_time).toLocaleString('en-IN') : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Return Date &amp; Time</span>
                <span className="font-semibold text-slate-800">
                  {viewingRequestForm.scheduled_end_time
                    ? new Date(viewingRequestForm.scheduled_end_time).toLocaleString('en-IN')
                    : viewingRequestForm.return_date || 'Same Day / N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Booking Type &amp; Category</span>
                <span className="font-bold text-slate-800">
                  {viewingRequestForm.booking_type || 'PRIVATE'} • {viewingRequestForm.target_category || 'SEDAN_4'} ({viewingRequestForm.trip_type || 'One Way Trip'})
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Passenger Count</span>
                <span className="font-bold text-slate-800">{viewingRequestForm.passenger_count || 1} Traveler(s)</span>
              </div>
              <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Purpose of Travel</span>
                <p className="font-semibold text-slate-900 mt-0.5">
                  {viewingRequestForm.purpose_of_travel || viewingRequestForm.purpose || 'Official Duty'}
                </p>
              </div>
            </div>

            {Array.isArray(viewingRequestForm.passenger_manifest) && viewingRequestForm.passenger_manifest.length > 0 && (
              <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                <span className="text-[10px] font-black uppercase text-slate-500 block">Passenger Manifest</span>
                <div className="divide-y divide-slate-100">
                  {viewingRequestForm.passenger_manifest.map((p: any, i: number) => (
                    <div key={i} className="py-1.5 flex items-center justify-between">
                      <span className="font-bold text-slate-900">
                        {i + 1}. {p.name || p.passenger_name} ({p.employee_id || 'GUEST'})
                      </span>
                      <span className="text-slate-500 font-mono">
                        {p.department || ''} {p.mobile ? `• ${p.mobile}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-blue-50/50 border border-blue-200/80 rounded-xl p-4 space-y-1.5">
              <span className="text-[10px] font-black uppercase text-blue-800 block">Approval Sign-Off Audit Trail</span>
              <p className="text-slate-700">
                <strong>FH Status:</strong> {viewingRequestForm.fh_approval_status || 'N/A'}
                {viewingRequestForm.fh_remarks ? ` — "${viewingRequestForm.fh_remarks}"` : ''}
              </p>
              <p className="text-slate-700">
                <strong>UH Status:</strong> {viewingRequestForm.uh_approval_status || 'N/A'}
                {viewingRequestForm.uh_remarks ? ` — "${viewingRequestForm.uh_remarks}"` : ''}
              </p>
              <p className="text-slate-700">
                <strong>FH-HR / Admin Status:</strong> {viewingRequestForm.admin_hr_approval_status || viewingRequestForm.status}
                {viewingRequestForm.admin_hr_remarks ? ` — "${viewingRequestForm.admin_hr_remarks}"` : ''}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              {(viewingRequestForm.status === 'PENDING' || viewingRequestForm.status === 'APPROVED') && (
                <button
                  type="button"
                  onClick={() => {
                    const target = viewingRequestForm;
                    setViewingRequestForm(null);
                    openAssignModal(target);
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-black hover:bg-blue-700"
                >
                  Assign &amp; Dispatch
                </button>
              )}
              <a
                href={`/track?id=${encodeURIComponent(viewingRequestForm.id)}`}
                className="px-4 py-2 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 font-bold hover:bg-purple-100"
              >
                📡 Open Live Transit Radar
              </a>
              <button
                type="button"
                onClick={() => setViewingRequestForm(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white font-black hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
