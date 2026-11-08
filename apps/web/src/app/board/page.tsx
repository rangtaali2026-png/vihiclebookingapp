'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';
import { queueOfflineScan, getPendingScansCount, syncPendingScans } from '@/lib/offline-sync';
import {
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
  UserCheck,
  ChevronLeft
} from 'lucide-react';

interface Passenger {
  name: string;
  employee_id: string;
  department?: string;
  mobile?: string;
  pickup_point?: string;
  boarded: boolean;
  boarded_at?: string;
}

export default function GateBoardingPage() {
  const searchParams = useSearchParams();
  const vehicleIdParam = searchParams?.get('vehicle_id') || '';
  const bookingIdParam = searchParams?.get('booking_id') || '';

  const [vehicleId, setVehicleId] = useState(vehicleIdParam);
  const [employeeInput, setEmployeeInput] = useState('');
  const [manifest, setManifest] = useState<Passenger[]>([]);
  const [tripInfo, setTripInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{ type: 'success' | 'warning' | 'error'; msg: string } | null>(null);

  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    getPendingScansCount().then(setPendingSyncCount);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadTripManifest = async () => {
    if (!vehicleId && !bookingIdParam) return;
    setLoading(true);
    try {
      const query = bookingIdParam ? `booking_id=${bookingIdParam}` : `vehicle_id=${vehicleId}`;
      const res = await fetchApi<{ success: boolean; trip: any; manifest: Passenger[] }>(
        `/api/dispatch/manifest?${query}`
      );
      if (res.trip) {
        setTripInfo(res.trip);
        setManifest(res.manifest || res.trip.passenger_manifest || []);
      }
    } catch (err: any) {
      console.error('Manifest load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (vehicleId || bookingIdParam) loadTripManifest();
  }, [vehicleId, bookingIdParam]);

  const handleVerifyBoarding = async (empIdToVerify?: string) => {
    const targetEmpId = (empIdToVerify || employeeInput).trim().toUpperCase();
    if (!targetEmpId) return;

    setActionLoading(true);
    setStatusFeedback(null);
    const nowIso = new Date().toISOString();

    if (!navigator.onLine) {
      await queueOfflineScan({
        booking_id: tripInfo?.id || bookingIdParam,
        vehicle_id: vehicleId,
        employee_id: targetEmpId,
        scanned_at: nowIso,
      });

      setManifest((prev) =>
        prev.map((p) =>
          p.employee_id.toUpperCase() === targetEmpId
            ? { ...p, boarded: true, boarded_at: nowIso }
            : p
        )
      );

      const count = await getPendingScansCount();
      setPendingSyncCount(count);
      setStatusFeedback({
        type: 'warning',
        msg: `Offline: Scan for ${targetEmpId} buffered in local device storage.`,
      });
      setEmployeeInput('');
      setActionLoading(false);
      return;
    }

    try {
      await fetchApi('/api/dispatch/verify-boarding', {
        method: 'POST',
        body: JSON.stringify({
          booking_id: tripInfo?.id || bookingIdParam,
          vehicle_id: vehicleId,
          employee_id: targetEmpId,
          scanned_at: nowIso,
        }),
      });

      setStatusFeedback({
        type: 'success',
        msg: `Verified: Employee ${targetEmpId} boarded successfully.`,
      });

      setManifest((prev) =>
        prev.map((p) =>
          p.employee_id.toUpperCase() === targetEmpId
            ? { ...p, boarded: true, boarded_at: nowIso }
            : p
        )
      );
      setEmployeeInput('');
    } catch (err: any) {
      setStatusFeedback({ type: 'error', msg: `Boarding check failed: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-smart-bg p-4 md:p-6 max-w-lg mx-auto flex flex-col justify-between">
      <div className="space-y-4">
        {/* Top Header Strip */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl smart-gradient-blue text-white shadow-smart-sm">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-black text-smart-navy">Gate Boarding Terminal</h1>
              <p className="text-[11px] text-smart-muted">Offline-Resilient Roster Scanner</p>
            </div>
          </div>

          <span
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border ${
              isOnline
                ? 'bg-emerald-50 text-smart-success border-emerald-200'
                : 'bg-amber-50 text-smart-warning border-amber-200 animate-pulse'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
          </span>
        </div>

        {/* Input */}
        <div className="smart-glass-card p-4 space-y-3">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-smart-navy">
            Employee Badge Scan / Code:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. EMP-VAD-101"
              value={employeeInput}
              onChange={(e) => setEmployeeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerifyBoarding()}
              className="flex-1 bg-slate-50 border border-smart-border rounded-xl px-3.5 py-2.5 text-xs font-mono uppercase text-smart-navy focus:bg-white focus:border-smart-blue focus:outline-none transition"
            />
            <button
              type="button"
              disabled={actionLoading || !employeeInput.trim()}
              onClick={() => handleVerifyBoarding()}
              className="smart-gradient-blue text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-smart-lg hover:opacity-95 disabled:opacity-50 transition"
            >
              {actionLoading ? 'Verifying...' : 'Check-In'}
            </button>
          </div>
        </div>

        {statusFeedback && (
          <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            statusFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-smart-success font-semibold'
              : 'bg-amber-50 border-amber-200 text-smart-warning font-semibold'
          }`}>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusFeedback.msg}</span>
          </div>
        )}

        {/* Roster Manifest */}
        <div className="smart-glass-card p-4 space-y-2">
          <h2 className="text-xs font-black uppercase tracking-wider text-smart-navy">
            Passenger Manifest ({manifest.length})
          </h2>

          <div className="space-y-1.5 max-h-[42vh] overflow-y-auto pr-1">
            {manifest.map((p) => (
              <div
                key={p.employee_id}
                className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition ${
                  p.boarded
                    ? 'bg-emerald-50/70 border-emerald-200 text-smart-navy'
                    : 'bg-white border-smart-border text-smart-muted'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-smart-navy">{p.employee_id}</span>
                    <span className="font-semibold text-smart-navy">{p.name}</span>
                  </div>
                  {p.pickup_point && <p className="text-[10px] text-smart-muted">{p.pickup_point}</p>}
                </div>

                <div>
                  {p.boarded ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-smart-success">
                      <UserCheck className="w-3.5 h-3.5" />
                      Boarded
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleVerifyBoarding(p.employee_id)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-smart-navy text-[10px] font-bold"
                    >
                      Check-In
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-smart-border flex justify-between items-center text-xs text-smart-muted">
        <Link href="/bookings" className="text-smart-blue hover:underline font-bold flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </Link>
        <span>Gate Terminal v2.1</span>
      </div>
    </div>
  );
}
