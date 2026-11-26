'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import {
  ShieldCheck, CheckCircle2, XCircle, Clock, MapPin,
  Users, Calendar, LogOut, RefreshCw, AlertTriangle, Car
} from 'lucide-react';

interface UserProfile {
  name?: string;
  email?: string;
  role?: string;
}

export default function ExecutiveApprovalsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'PENDING' | 'ALL'>('PENDING');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('user_profile');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setUser(parsed);
          // Redirect Admin/Dispatcher roles to Dispatch Console
          if (parsed.role === 'FH_HR_ADMIN' || parsed.role === 'DISPATCHER') {
            router.replace('/dispatch');
            return;
          }
        } catch {
          // ignore parse error
        }
      }
    }
    loadBookings();
  }, []);

  const loadBookings = async () => {
    setLoading(true);
    try {
      const res = await fetchApi<{ bookings?: any[] }>('/api/bookings');
      setBookings(Array.isArray(res?.bookings) ? res.bookings : []);
    } catch (err) {
      console.error('Failed to load requisitions:', err);
    } finally {
      setLoading(false);
    }
  };

  const approverStage: 'FH' | 'UH' = user?.role === 'UH_APPROVER' ? 'UH' : 'FH';
  const roleLabel =
    user?.role === 'UH_APPROVER'
      ? 'Unit Head (UH) Approval Portal'
      : 'Functional Head (FH) Approval Portal';

  const handleDecision = async (bookingId: string, decision: 'APPROVED' | 'REJECTED') => {
    setProcessingId(bookingId);
    try {
      await fetchApi(`/api/bookings/${bookingId}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({
          stage: approverStage,
          decision,
          approver_name: user?.name || approverStage
        })
      });
      await loadBookings();
    } catch (err: any) {
      alert(err.message || `Failed to ${decision.toLowerCase()} requisition`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_profile');
    }
    router.push('/login');
  };

  const relevantBookings = useMemo(() => {
    // Outstation trips (outside Bharuch) require mandatory FH & UH sign-off
    const outstationList = bookings.filter(
      (b) =>
        b.is_outstation ||
        (b.destination_location && !String(b.destination_location).toLowerCase().includes('bharuch')) ||
        (b.drop_location && !String(b.drop_location).toLowerCase().includes('bharuch'))
    );

    if (filterTab === 'ALL') return outstationList;

    return outstationList.filter((b) => {
      if (b.status === 'REJECTED' || b.status === 'CANCELLED' || b.status === 'COMPLETED') {
        return false;
      }
      if (approverStage === 'FH') {
        return !b.fh_approval_status || b.fh_approval_status === 'PENDING';
      }
      return !b.uh_approval_status || b.uh_approval_status === 'PENDING';
    });
  }, [bookings, filterTab, approverStage]);

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* Dedicated Executive Approver Top Header (No Fleet/Dispatch Links) */}
      <header className="sticky top-0 z-40 w-full bg-white border-b border-slate-200 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-slate-900">SmartDrive</span>
                <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-extrabold uppercase">
                  {approverStage} Authority
                </span>
              </div>
              <p className="text-xs text-slate-500">{roleLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <span className="block text-xs font-black text-slate-900">
                {user?.name || `${approverStage} Approver`}
              </span>
              <span className="block text-[11px] font-mono text-slate-500">
                {user?.email || ''}
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Page Title & Policy Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900">
              Outstation Cab Requisition Approvals
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Review and authorize outstation travel requests (Vadodara, Surat, Ahmedabad, etc.) prior to Admin vehicle allotment.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl bg-white border border-slate-200 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setFilterTab('PENDING')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  filterTab === 'PENDING'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Pending My Sign-Off
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('ALL')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  filterTab === 'ALL'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                All Outstation Requests
              </button>
            </div>

            <button
              type="button"
              onClick={loadBookings}
              className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
              title="Refresh Requisitions"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Governance Notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-xs text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <strong>Grasim GCD Authorization Policy:</strong> Functional Head (FH) and Unit Head (UH) approval is mandatory for all outstation travel outside Bharuch. Once approved, the request is automatically forwarded to the <strong>FH-HR / Admin Team</strong> for cab &amp; driver allotment.
          </div>
        </div>

        {/* Requisitions Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900">
              Outstation Travel Requisitions ({relevantBookings.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-10 text-center text-xs font-semibold text-slate-500">
              Loading requisitions...
            </div>
          ) : relevantBookings.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-800">No Pending Requisitions</p>
              <p className="text-xs text-slate-500">
                All outstation requests awaiting {approverStage} sign-off have been reviewed.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 px-5">Ref &amp; Requester</th>
                    <th className="py-3.5 px-4">Route &amp; Schedule</th>
                    <th className="py-3.5 px-4">Purpose &amp; Travelers</th>
                    <th className="py-3.5 px-4">Approval Chain</th>
                    <th className="py-3.5 px-5 text-right">Authorization Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {relevantBookings.map((b) => {
                    const currentStageStatus =
                      approverStage === 'FH'
                        ? b.fh_approval_status || 'PENDING'
                        : b.uh_approval_status || 'PENDING';
                    const isAlreadyDecided =
                      currentStageStatus === 'APPROVED' || currentStageStatus === 'REJECTED';

                    return (
                      <tr key={b.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-4 px-5 align-top">
                          <span className="font-mono text-[11px] font-black text-blue-600 block">
                            {b.booking_reference}
                          </span>
                          <span className="font-bold text-slate-900 block mt-0.5">
                            {b.employee_name || 'Employee'}
                          </span>
                          <span className="text-[11px] text-slate-500 block">
                            {b.employee_id} • {b.department}
                          </span>
                        </td>

                        <td className="py-4 px-4 align-top space-y-1">
                          <div className="font-bold text-slate-900 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span>
                              {b.origin_location || b.pickup_location} →{' '}
                              {b.destination_location || b.drop_location}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {b.travel_date || (b.scheduled_start_time || '').slice(0, 10)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {b.pickup_time || '09:00'}
                            </span>
                          </div>
                          <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600">
                            {b.trip_type || 'One Way Trip'} ({b.total_days || 1}d)
                          </span>
                        </td>

                        <td className="py-4 px-4 align-top max-w-xs">
                          <p className="text-slate-700 font-medium line-clamp-2">
                            {b.purpose_of_travel || b.purpose || 'Official Outstation Visit'}
                          </p>
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 mt-1">
                            <Users className="w-3 h-3" />
                            {b.passenger_count || 1} Traveler(s) ({b.request_for || 'Self'})
                          </span>
                        </td>

                        <td className="py-4 px-4 align-top space-y-1 text-[11px]">
                          <div>
                            <span className="text-slate-400 font-semibold">FH Sign-Off: </span>
                            <span
                              className={`font-extrabold ${
                                b.fh_approval_status === 'APPROVED'
                                  ? 'text-emerald-600'
                                  : b.fh_approval_status === 'REJECTED'
                                  ? 'text-rose-600'
                                  : 'text-amber-600'
                              }`}
                            >
                              {b.fh_approval_status || 'PENDING'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-semibold">UH Sign-Off: </span>
                            <span
                              className={`font-extrabold ${
                                b.uh_approval_status === 'APPROVED'
                                  ? 'text-emerald-600'
                                  : b.uh_approval_status === 'REJECTED'
                                  ? 'text-rose-600'
                                  : 'text-amber-600'
                              }`}
                            >
                              {b.uh_approval_status || 'PENDING'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-semibold">Admin Dispatch: </span>
                            <span className="font-bold text-slate-600">
                              {b.admin_hr_approval_status || 'AWAITING'}
                            </span>
                          </div>
                        </td>

                        <td className="py-4 px-5 align-top text-right">
                          {isAlreadyDecided ? (
                            <span
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-extrabold ${
                                currentStageStatus === 'APPROVED'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {currentStageStatus === 'APPROVED' ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5" />
                              )}
                              {approverStage} {currentStageStatus}
                            </span>
                          ) : (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                disabled={processingId === b.id}
                                onClick={() => handleDecision(b.id, 'APPROVED')}
                                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={processingId === b.id}
                                onClick={() => handleDecision(b.id, 'REJECTED')}
                                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-black hover:bg-rose-100 disabled:opacity-50 transition"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
