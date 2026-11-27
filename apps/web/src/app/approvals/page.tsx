'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import {
  ShieldCheck, CheckCircle2, XCircle, Clock, MapPin,
  Users, Calendar, LogOut, RefreshCw, AlertTriangle, Car,
  MessageSquare, X, User, Phone, Briefcase, FileText, Eye
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
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({});
  const [auditBooking, setAuditBooking] = useState<any | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('user_profile');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setUser(parsed);
          if (parsed.role === 'FH_HR_ADMIN' || parsed.role === 'DISPATCHER') {
            router.replace('/dispatch');
            return;
          }
        } catch {
          // ignore
        }
      }
    }
    loadBookings();
  }, []);

  const loadBookings = async () => {
    setLoading(true);
    try {
      const res = await fetchApi<{ bookings?: any[] }>('/api/bookings');
      const list = Array.isArray(res?.bookings) ? res.bookings : [];
      setBookings(list);
      // Keep audit modal in sync if open
      setAuditBooking((prev: any) =>
        prev ? list.find((item) => item.id === prev.id) || null : null
      );
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

  // Helper to resolve requester identity cleanly across top-level fields, booking_passengers, or passenger_manifest
  const getRequesterDetails = (b: any) => {
    const bp0 = Array.isArray(b.booking_passengers) && b.booking_passengers.length > 0 ? b.booking_passengers[0] : null;
    const pm0 = Array.isArray(b.passenger_manifest) && b.passenger_manifest.length > 0 ? b.passenger_manifest[0] : null;

    const name =
      (b.employee_name && b.employee_name !== 'Employee' ? b.employee_name : null) ||
      bp0?.passenger_name ||
      pm0?.name ||
      b.employee_name ||
      'Plant Employee';

    const empId =
      (b.employee_id && b.employee_id !== 'EMP-000' ? b.employee_id : null) ||
      bp0?.employee_code ||
      bp0?.employee_id ||
      pm0?.employee_id ||
      b.employee_id ||
      'N/A';

    const dept =
      (b.department && b.department !== 'General' ? b.department : null) ||
      bp0?.department ||
      pm0?.department ||
      b.department ||
      'Plant Operations';

    const mobile =
      b.mobile ||
      bp0?.mobile_number ||
      pm0?.mobile ||
      'Not Provided';

    return { name, empId, dept, mobile };
  };

  const getTravelersList = (b: any) => {
    if (Array.isArray(b.passenger_manifest) && b.passenger_manifest.length > 0) {
      return b.passenger_manifest.map((p: any) => ({
        name: p.name || p.passenger_name || 'Traveler',
        empId: p.employee_id || p.employee_code || '-',
        dept: p.department || '-',
        mobile: p.mobile || p.mobile_number || '-'
      }));
    }
    if (Array.isArray(b.booking_passengers) && b.booking_passengers.length > 0) {
      return b.booking_passengers.map((p: any) => ({
        name: p.passenger_name || 'Traveler',
        empId: p.employee_code || p.employee_id || '-',
        dept: p.department || '-',
        mobile: p.mobile_number || '-'
      }));
    }
    const req = getRequesterDetails(b);
    return [{ name: req.name, empId: req.empId, dept: req.dept, mobile: req.mobile }];
  };

  const handleDecision = async (bookingId: string, decision: 'APPROVED' | 'REJECTED') => {
    const remarkText = (remarksMap[bookingId] || '').trim();
    if (decision === 'REJECTED' && !remarkText) {
      alert('Please enter a rejection remark before rejecting this request.');
      return;
    }

    setProcessingId(bookingId);
    try {
      await fetchApi(`/api/bookings/${bookingId}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({
          stage: approverStage,
          decision,
          approver_name: user?.name || approverStage,
          approver_email: user?.email || '',
          remarks: remarkText
        })
      });
      setRemarksMap((prev) => {
        const next = { ...prev };
        delete next[bookingId];
        return next;
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

  const isRejectedAnyStage = (b: any) =>
    b.status === 'REJECTED' ||
    b.status === 'CANCELLED' ||
    b.dh_approval_status === 'REJECTED' ||
    b.fh_approval_status === 'REJECTED' ||
    b.uh_approval_status === 'REJECTED' ||
    b.admin_hr_approval_status === 'REJECTED';

  const relevantBookings = useMemo(() => {
    const currentUserEmail = (user?.email || '').trim().toLowerCase();

    const outstationList = bookings.filter((b) => {
      const isOut =
        b.is_outstation ||
        (b.destination_location && !String(b.destination_location).toLowerCase().includes('bharuch')) ||
        (b.drop_location && !String(b.drop_location).toLowerCase().includes('bharuch'));
      if (!isOut) return false;

      if (approverStage === 'FH' && b.assigned_fh_approver_email && currentUserEmail) {
        return String(b.assigned_fh_approver_email).trim().toLowerCase() === currentUserEmail;
      }
      if (approverStage === 'UH' && b.assigned_uh_approver_email && currentUserEmail) {
        return String(b.assigned_uh_approver_email).trim().toLowerCase() === currentUserEmail;
      }
      return true;
    });

    if (filterTab === 'ALL') {
      if (approverStage === 'UH') {
        return outstationList.filter(
          (b) => b.fh_approval_status === 'APPROVED' || b.uh_approval_status === 'APPROVED' || b.uh_approval_status === 'REJECTED'
        );
      }
      return outstationList;
    }

    return outstationList.filter((b) => {
      if (isRejectedAnyStage(b) || b.status === 'COMPLETED' || b.status === 'DISPATCHED') {
        return false;
      }

      if (approverStage === 'FH') {
        return b.fh_approval_status !== 'APPROVED' && b.fh_approval_status !== 'REJECTED';
      }

      return (
        b.fh_approval_status === 'APPROVED' &&
        b.uh_approval_status !== 'APPROVED' &&
        b.uh_approval_status !== 'REJECTED'
      );
    });
  }, [bookings, filterTab, approverStage, user]);

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
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
            <a
              href="/reports"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 transition shadow-sm"
            >
              Reports &amp; Excel Export
            </a>
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900">
              Outstation Cab Requisition Approvals
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any <strong>Booking Reference</strong> to audit complete requester details, traveler manifest, and trip purpose before signing off.
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

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-xs text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <strong>Grasim GCD Authorization Policy:</strong> Functional Head (FH) and Unit Head (UH) approval is mandatory for all outstation travel outside Bharuch. Click a blue <strong>BK-XXXXXXXX</strong> reference number to inspect full requester &amp; passenger audit details.
          </div>
        </div>

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
                    <th className="py-3.5 px-4">Approval Chain &amp; Remarks</th>
                    <th className="py-3.5 px-5 text-right w-80">Remark &amp; Authorization Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {relevantBookings.map((b) => {
                    const req = getRequesterDetails(b);
                    const currentStageStatus =
                      approverStage === 'FH'
                        ? b.fh_approval_status || 'PENDING'
                        : b.uh_approval_status || 'PENDING';
                    const isAlreadyDecided =
                      isRejectedAnyStage(b) || currentStageStatus === 'APPROVED' || currentStageStatus === 'REJECTED';
                    const recordedRemark =
                      approverStage === 'FH' ? b.fh_remarks : b.uh_remarks;

                    return (
                      <tr key={b.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-4 px-5 align-top">
                          <button
                            type="button"
                            onClick={() => setAuditBooking(b)}
                            title="Click to open full Requisition Audit & Requester Details"
                            className="inline-flex items-center gap-1.5 font-mono text-[11px] font-black text-blue-600 hover:text-blue-800 underline decoration-blue-300 underline-offset-2 cursor-pointer"
                          >
                            <span>{b.booking_reference}</span>
                            <Eye className="w-3 h-3" />
                          </button>
                          <span className="font-bold text-slate-900 block mt-0.5">
                            {req.name}
                          </span>
                          <span className="text-[11px] text-slate-500 block">
                            {req.empId} • {req.dept}
                          </span>
                          {req.mobile !== 'Not Provided' && (
                            <span className="text-[10px] font-mono text-slate-400 block">
                              {req.mobile}
                            </span>
                          )}
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

                        <td className="py-4 px-4 align-top space-y-1.5 text-[11px]">
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
                            {b.fh_remarks && (
                              <span className="block text-[10px] italic text-slate-500">
                                &ldquo;{b.fh_remarks}&rdquo;
                              </span>
                            )}
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
                            {b.uh_remarks && (
                              <span className="block text-[10px] italic text-slate-500">
                                &ldquo;{b.uh_remarks}&rdquo;
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="text-slate-400 font-semibold">FH-HR / Admin: </span>
                            <span className="font-bold text-slate-600">
                              {b.admin_hr_approval_status || 'PENDING'}
                            </span>
                            {b.admin_hr_remarks && (
                              <span className="block text-[10px] italic text-slate-500">
                                &ldquo;{b.admin_hr_remarks}&rdquo;
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-4 px-5 align-top text-right">
                          {isAlreadyDecided ? (
                            <div className="space-y-1.5 text-right">
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
                                {isRejectedAnyStage(b) && currentStageStatus !== 'REJECTED'
                                  ? 'REJECTED (CLOSED)'
                                  : `${approverStage} ${currentStageStatus}`}
                              </span>
                              {recordedRemark && (
                                <p className="text-[11px] text-slate-500 italic">
                                  Remark: &ldquo;{recordedRemark}&rdquo;
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="relative">
                                <MessageSquare className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                                <input
                                  type="text"
                                  value={remarksMap[b.id] || ''}
                                  onChange={(e) =>
                                    setRemarksMap((prev) => ({ ...prev, [b.id]: e.target.value }))
                                  }
                                  placeholder={`Enter ${approverStage} remark (required to reject)...`}
                                  className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-[11px] text-slate-900 focus:outline-none focus:border-blue-500"
                                />
                              </div>
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={processingId === b.id}
                                  onClick={() => handleDecision(b.id, 'APPROVED')}
                                  className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={processingId === b.id}
                                  onClick={() => handleDecision(b.id, 'REJECTED')}
                                  className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-black hover:bg-rose-100 disabled:opacity-50 transition"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  Reject
                                </button>
                              </div>
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

      {/* Requisition Full Audit & Requester Details Modal */}
      {auditBooking && (() => {
        const req = getRequesterDetails(auditBooking);
        const travelers = getTravelersList(auditBooking);
        const currentStageStatus =
          approverStage === 'FH'
            ? auditBooking.fh_approval_status || 'PENDING'
            : auditBooking.uh_approval_status || 'PENDING';
        const canActInModal =
          !isRejectedAnyStage(auditBooking) &&
          currentStageStatus !== 'APPROVED' &&
          currentStageStatus !== 'REJECTED';

        return (
          <div
            onClick={() => setAuditBooking(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-slate-200 pb-3.5">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-sm font-black text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200">
                      {auditBooking.booking_reference}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700">
                      {auditBooking.request_for || 'Self'} Requisition
                    </span>
                  </div>
                  <h2 className="text-base font-black text-slate-900 mt-1.5">
                    Complete Requisition Audit &amp; Requester Details
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Submitted on{' '}
                    {auditBooking.created_at
                      ? new Date(auditBooking.created_at).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })
                      : auditBooking.travel_date}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAuditBooking(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Audit Body */}
              <div className="overflow-y-auto space-y-5 pr-1 flex-1 text-xs">
                {/* 1. Requester Information */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-slate-800 font-black uppercase text-[11px] tracking-wider">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                    <span>Requester Identity &amp; Department</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-400">Requester Name</span>
                      <span className="font-black text-slate-900 text-sm">{req.name}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-400">Employee ID</span>
                      <span className="font-mono font-bold text-slate-800">{req.empId}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-400">Department</span>
                      <span className="font-bold text-slate-800">{req.dept}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-400">Contact Number</span>
                      <span className="font-mono font-bold text-slate-800 inline-flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {req.mobile}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Journey & Trip Parameters */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-slate-800 font-black uppercase text-[11px] tracking-wider">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    <span>Journey Itinerary &amp; Vehicle Requirement</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-400">Pickup Location</span>
                      <span className="font-bold text-slate-900">
                        {auditBooking.origin_location || auditBooking.pickup_location}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-400">Drop Location</span>
                      <span className="font-bold text-slate-900">
                        {auditBooking.destination_location || auditBooking.drop_location}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-400">Trip Type &amp; Duration</span>
                      <span className="font-bold text-slate-800">
                        {auditBooking.trip_type || 'One Way Trip'} ({auditBooking.total_days || 1} Day)
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-400">Travel Date &amp; Pickup Time</span>
                      <span className="font-bold text-slate-800">
                        {auditBooking.travel_date || (auditBooking.scheduled_start_time || '').slice(0, 10)} at{' '}
                        {auditBooking.pickup_time || '09:00'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-400">Return Date</span>
                      <span className="font-bold text-slate-800">
                        {auditBooking.return_date || auditBooking.travel_date || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-400">Vehicle Category</span>
                      <span className="font-bold text-slate-800">
                        {auditBooking.target_category || auditBooking.vehicle_category || 'SEDAN_4'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Full Purpose of Travel */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-800 font-black uppercase text-[11px] tracking-wider">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>Purpose of Travel (Full Justification)</span>
                  </div>
                  <p className="text-slate-800 font-medium leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                    {auditBooking.purpose_of_travel || auditBooking.purpose || 'No purpose description recorded.'}
                  </p>
                </div>

                {/* 4. Passenger / Traveler Manifest */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-800 font-black uppercase text-[11px] tracking-wider">
                      <Users className="w-3.5 h-3.5 text-blue-600" />
                      <span>Traveler / Passenger Manifest ({travelers.length})</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                          <th className="py-2 px-3">#</th>
                          <th className="py-2 px-3">Passenger Name</th>
                          <th className="py-2 px-3">Employee ID</th>
                          <th className="py-2 px-3">Department</th>
                          <th className="py-2 px-3">Mobile</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {travelers.map((t: any, idx: number) => (
                          <tr key={idx}>
                            <td className="py-2 px-3 font-mono text-slate-400">{idx + 1}</td>
                            <td className="py-2 px-3 font-bold text-slate-900">{t.name}</td>
                            <td className="py-2 px-3 font-mono text-slate-700">{t.empId}</td>
                            <td className="py-2 px-3 text-slate-700">{t.dept}</td>
                            <td className="py-2 px-3 font-mono text-slate-700">{t.mobile}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 5. Approval Chain & Audit Remarks */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-slate-800 font-black uppercase text-[11px] tracking-wider">
                    <Briefcase className="w-3.5 h-3.5 text-blue-600" />
                    <span>Approval Chain &amp; Recorded Remarks</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-slate-400 font-bold block">1. Functional Head (FH)</span>
                      <span className="font-black text-slate-900">{auditBooking.fh_approval_status || 'PENDING'}</span>
                      {auditBooking.assigned_fh_approver_name && (
                        <span className="block text-[10px] text-slate-500">
                          Assigned: {auditBooking.assigned_fh_approver_name}
                        </span>
                      )}
                      {auditBooking.fh_remarks && (
                        <span className="block text-[10px] italic text-slate-600 mt-1">
                          &ldquo;{auditBooking.fh_remarks}&rdquo;
                        </span>
                      )}
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-slate-400 font-bold block">2. Unit Head (UH)</span>
                      <span className="font-black text-slate-900">{auditBooking.uh_approval_status || 'PENDING'}</span>
                      {auditBooking.assigned_uh_approver_name && (
                        <span className="block text-[10px] text-slate-500">
                          Assigned: {auditBooking.assigned_uh_approver_name}
                        </span>
                      )}
                      {auditBooking.uh_remarks && (
                        <span className="block text-[10px] italic text-slate-600 mt-1">
                          &ldquo;{auditBooking.uh_remarks}&rdquo;
                        </span>
                      )}
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-slate-400 font-bold block">3. FH-HR / Admin</span>
                      <span className="font-black text-slate-900">
                        {auditBooking.admin_hr_approval_status || 'PENDING'}
                      </span>
                      {auditBooking.admin_hr_remarks && (
                        <span className="block text-[10px] italic text-slate-600 mt-1">
                          &ldquo;{auditBooking.admin_hr_remarks}&rdquo;
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer: Direct Approve / Reject Controls */}
              {canActInModal && (
                <div className="border-t border-slate-200 pt-3.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="relative flex-1">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={remarksMap[auditBooking.id] || ''}
                      onChange={(e) =>
                        setRemarksMap((prev) => ({ ...prev, [auditBooking.id]: e.target.value }))
                      }
                      placeholder={`Enter ${approverStage} remark (required to reject)...`}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={processingId === auditBooking.id}
                      onClick={() => handleDecision(auditBooking.id, 'APPROVED')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 disabled:opacity-50 transition"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve Request
                    </button>
                    <button
                      type="button"
                      disabled={processingId === auditBooking.id}
                      onClick={() => handleDecision(auditBooking.id, 'REJECTED')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-black hover:bg-rose-100 disabled:opacity-50 transition"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject Request
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
