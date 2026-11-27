'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { fetchApi } from '@/lib/api';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet, Download, RefreshCw, ArrowLeft,
  Calendar, Filter, Search, Car, Gauge, CheckCircle2
} from 'lucide-react';

interface UserProfile {
  name?: string;
  email?: string;
  role?: string;
}

function formatDateDDMMYYYY(raw?: string | null): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : String(raw);
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function formatTimeAMPM(raw?: string | null): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  });
}

function toISODateOnly(raw?: string | null): string {
  if (!raw) return '';
  const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export default function TripReportsPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'ACTIVE' | 'PENDING'>('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('user_profile');
      if (raw) {
        try {
          setUser(JSON.parse(raw));
        } catch {
          // ignore
        }
      }
    }
    loadReportData();
  }, []);

  const loadReportData = async () => {
    setLoading(true);
    try {
      const res = await fetchApi<{ bookings?: any[] }>('/api/bookings');
      setBookings(Array.isArray(res?.bookings) ? res.bookings : []);
    } catch (err) {
      console.error('Failed to load report records:', err);
    } finally {
      setLoading(false);
    }
  };

  const backHref = user?.role === 'SUPER_ADMIN' ? '/super-admin/sites' : '/dispatch';
  const backLabel = user?.role === 'SUPER_ADMIN' ? 'Back to Super Admin Console' : 'Back to Dispatch Console';

  const departments = useMemo(() => {
    const set = new Set<string>();
    bookings.forEach((b) => {
      if (b.department) set.add(String(b.department).trim());
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // Status filter
      if (statusFilter === 'COMPLETED' && b.status !== 'COMPLETED') return false;
      if (
        statusFilter === 'ACTIVE' &&
        b.status !== 'DISPATCHED' &&
        b.status !== 'IN_PROGRESS' &&
        !b.trip_started_at
      ) {
        return false;
      }
      if (
        statusFilter === 'PENDING' &&
        b.status !== 'PENDING' &&
        b.status !== 'APPROVED'
      ) {
        return false;
      }

      // Department filter
      if (deptFilter !== 'ALL' && String(b.department || '').trim() !== deptFilter) {
        return false;
      }

      // Date range filter (against trip_started_at or scheduled_start_time)
      const rowDate = toISODateOnly(b.trip_started_at || b.scheduled_start_time || b.created_at);
      if (fromDate && rowDate && rowDate < fromDate) return false;
      if (toDate && rowDate && rowDate > toDate) return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = [
          b.booking_reference,
          b.employee_name,
          b.employee_id,
          b.department,
          b.origin_location,
          b.destination_location,
          b.drivers?.name,
          b.vehicles?.registration_number,
          b.purpose_of_travel || b.purpose
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [bookings, statusFilter, deptFilter, fromDate, toDate, searchQuery]);

  // Map each booking to the exact 17-column schema of Required record.xlsx
  const reportRows = useMemo(() => {
    return filteredBookings.map((b, idx) => {
      const paxCount = Number(b.passenger_count) || 1;
      const baseName =
        (b.employee_name && b.employee_name !== 'Employee' ? b.employee_name : null) ||
        (Array.isArray(b.booking_passengers) && b.booking_passengers[0]?.passenger_name) ||
        b.employee_name ||
        'Employee';
      const useBy = paxCount > 1 ? `${baseName} + ${paxCount - 1}` : baseName;

      // DSIG (Approval authority badge)
      const dsig =
        b.uh_approval_status === 'APPROVED'
          ? 'UH'
          : b.fh_approval_status === 'APPROVED'
          ? 'FH'
          : b.dh_approval_status === 'APPROVED'
          ? 'DH'
          : b.admin_hr_approval_status === 'APPROVED'
          ? 'HR'
          : b.status || 'PENDING';

      const depRaw = b.trip_started_at || b.scheduled_start_time;
      const retRaw = b.trip_ended_at || b.scheduled_end_time || b.return_date;

      const startKm = Number(b.start_odometer_km || 0);
      const endKm = Number(b.end_odometer_km || 0);
      const totalKm =
        b.billed_distance_km !== undefined && b.billed_distance_km !== null && Number(b.billed_distance_km) > 0
          ? Number(b.billed_distance_km)
          : endKm > startKm
          ? Number((endKm - startKm).toFixed(2))
          : 0;

      const remarkParts = [
        b.purpose_of_travel || b.purpose,
        b.fh_remarks ? `FH: ${b.fh_remarks}` : '',
        b.uh_remarks ? `UH: ${b.uh_remarks}` : '',
        b.admin_hr_remarks ? `Admin: ${b.admin_hr_remarks}` : ''
      ].filter(Boolean);

      return {
        'S.No.': idx + 1,
        'DSIG': dsig,
        'Dept': b.department || '',
        'Use By': useBy,
        'From': b.origin_location || '',
        'To': b.destination_location || '',
        'Round Trip / Pick Up / Drop': b.trip_type || 'One Way Trip',
        'Departure Date': formatDateDDMMYYYY(depRaw),
        'Departure Time': formatTimeAMPM(depRaw),
        'Start KM': startKm || '',
        'Ending KM': endKm || '',
        'Total KM': totalKm || '',
        'Driver': b.drivers?.name || '',
        'Vehicle No ': b.vehicles?.registration_number || '',
        'Return Date': formatDateDDMMYYYY(retRaw),
        'Return Time': formatTimeAMPM(b.trip_ended_at || b.scheduled_end_time),
        'Remarks': remarkParts.join(' | ')
      };
    });
  }, [filteredBookings]);

  const totalDistanceSum = useMemo(() => {
    return reportRows.reduce((acc, r) => acc + (Number(r['Total KM']) || 0), 0);
  }, [reportRows]);

  const completedCount = useMemo(() => {
    return filteredBookings.filter((b) => b.status === 'COMPLETED').length;
  }, [filteredBookings]);

  const handleExportExcel = () => {
    if (reportRows.length === 0) {
      alert('No records match your current filter to export.');
      return;
    }

    const headers = [
      'S.No.',
      'DSIG',
      'Dept',
      'Use By',
      'From',
      'To',
      'Round Trip / Pick Up / Drop',
      'Departure Date',
      'Departure Time',
      'Start KM',
      'Ending KM',
      'Total KM',
      'Driver',
      'Vehicle No ',
      'Return Date',
      'Return Time',
      'Remarks'
    ];

    const worksheet = XLSX.utils.json_to_sheet(reportRows, { header: headers });

    // Set clean column widths matching the 17-column register
    worksheet['!cols'] = [
      { wch: 7 },  // S.No.
      { wch: 10 }, // DSIG
      { wch: 16 }, // Dept
      { wch: 24 }, // Use By
      { wch: 24 }, // From
      { wch: 24 }, // To
      { wch: 26 }, // Round Trip / Pick Up / Drop
      { wch: 15 }, // Departure Date
      { wch: 15 }, // Departure Time
      { wch: 12 }, // Start KM
      { wch: 12 }, // Ending KM
      { wch: 12 }, // Total KM
      { wch: 20 }, // Driver
      { wch: 18 }, // Vehicle No
      { wch: 15 }, // Return Date
      { wch: 15 }, // Return Time
      { wch: 36 }  // Remarks
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Required_record_${stamp}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] py-8 px-4 sm:px-6">
      <div className="max-w-[1440px] mx-auto space-y-6">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <a
              href={backHref}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {backLabel}
            </a>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-900">
                  Fleet Movement &amp; Odometer Log Report
                </h1>
                <p className="text-xs text-slate-500">
                  Filter travel logs by date, department, or status and export directly to Excel (.xlsx) in the standard 17-column register format.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={loadReportData}
              className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
              title="Refresh Records"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 transition shadow-sm"
            >
              <Download className="w-4 h-4" />
              Export Excel (.xlsx)
            </button>
          </div>
        </div>

        {/* KPI Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase text-slate-400 block">Filtered Records</span>
              <span className="text-2xl font-black text-slate-900">{reportRows.length}</span>
            </div>
            <Car className="w-6 h-6 text-blue-500" />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase text-slate-400 block">Completed Trips</span>
              <span className="text-2xl font-black text-emerald-600">{completedCount}</span>
            </div>
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase text-slate-400 block">Total Logged Distance</span>
              <span className="text-2xl font-black font-mono text-slate-900">
                {totalDistanceSum.toLocaleString('en-IN')} <span className="text-xs font-bold text-slate-500">KM</span>
              </span>
            </div>
            <Gauge className="w-6 h-6 text-indigo-500" />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase text-slate-400 block">Export Template</span>
              <span className="text-sm font-black text-slate-800">Required record.xlsx</span>
              <span className="text-[11px] text-slate-500 block">17 Standard Columns</span>
            </div>
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
          </div>
        </div>

        {/* Filter Controls */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="block font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-900"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-900"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              Trip Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-900 bg-white"
            >
              <option value="ALL">All Requisitions</option>
              <option value="COMPLETED">Completed Trips (With KM)</option>
              <option value="ACTIVE">Dispatched / In Progress</option>
              <option value="PENDING">Pending / Approved</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1">Department</label>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-900 bg-white"
            >
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d === 'ALL' ? 'All Departments' : d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1">Search</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name, Driver, Vehicle, Route..."
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 font-medium text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* 17-Column Register Data Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-black text-slate-900">
              Trip Register Preview ({reportRows.length} Rows)
            </span>
            {(fromDate || toDate || statusFilter !== 'ALL' || deptFilter !== 'ALL' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setStatusFilter('ALL');
                  setDeptFilter('ALL');
                  setSearchQuery('');
                }}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                Reset Filters
              </button>
            )}
          </div>

          {loading ? (
            <div className="p-10 text-center text-xs font-semibold text-slate-500">
              Loading trip register...
            </div>
          ) : reportRows.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No records found matching the selected criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap text-[11px]">
                <thead>
                  <tr className="bg-slate-900 text-white font-extrabold uppercase tracking-wider">
                    <th className="py-3 px-3">S.No.</th>
                    <th className="py-3 px-3">DSIG</th>
                    <th className="py-3 px-3">Dept</th>
                    <th className="py-3 px-3">Use By</th>
                    <th className="py-3 px-3">From</th>
                    <th className="py-3 px-3">To</th>
                    <th className="py-3 px-3">Round Trip / Pick Up / Drop</th>
                    <th className="py-3 px-3">Departure Date</th>
                    <th className="py-3 px-3">Departure Time</th>
                    <th className="py-3 px-3 text-right">Start KM</th>
                    <th className="py-3 px-3 text-right">Ending KM</th>
                    <th className="py-3 px-3 text-right">Total KM</th>
                    <th className="py-3 px-3">Driver</th>
                    <th className="py-3 px-3">Vehicle No</th>
                    <th className="py-3 px-3">Return Date</th>
                    <th className="py-3 px-3">Return Time</th>
                    <th className="py-3 px-3">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportRows.map((row) => (
                    <tr key={row['S.No.']} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-500">{row['S.No.']}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-extrabold">
                          {row['DSIG']}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-700">{row['Dept']}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{row['Use By']}</td>
                      <td className="py-2.5 px-3 text-slate-800">{row['From']}</td>
                      <td className="py-2.5 px-3 text-slate-800">{row['To']}</td>
                      <td className="py-2.5 px-3 text-slate-700">{row['Round Trip / Pick Up / Drop']}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{row['Departure Date']}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{row['Departure Time']}</td>
                      <td className="py-2.5 px-3 font-mono text-right text-slate-700">{row['Start KM'] || '-'}</td>
                      <td className="py-2.5 px-3 font-mono text-right text-slate-700">{row['Ending KM'] || '-'}</td>
                      <td className="py-2.5 px-3 font-mono text-right font-black text-emerald-700">
                        {row['Total KM'] || '-'}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{row['Driver'] || '-'}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{row['Vehicle No '] || '-'}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{row['Return Date'] || '-'}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{row['Return Time'] || '-'}</td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate" title={row['Remarks']}>
                        {row['Remarks'] || '-'}
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
