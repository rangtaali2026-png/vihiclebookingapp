'use client';

import React, { Suspense, useState, useEffect } from 'react';
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
  RefreshCw,
  Search,
  UserCheck,
  ShieldCheck,
  ArrowRight
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

function GateBoardingPageContent() {
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

  // Offline PWA State
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Monitor network connectivity
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => {
      setIsOnline(true);
      triggerAutoSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check of pending scans in IndexedDB
    getPendingScansCount().then(setPendingSyncCount);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const triggerAutoSync = async () => {
    setIsSyncing(true);
    try {
      const res = await syncPendingScans();
      if (res.syncedCount > 0) {
        setStatusFeedback({
          type: 'success',
          msg: `Online! Synced ${res.syncedCount} buffered gate scans.`,
        });
        loadTripManifest();
      }
      const remaining = await getPendingScansCount();
      setPendingSyncCount(remaining);
    } catch (err) {
      console.error('Auto sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const loadTripManifest = async () => {
    if (!vehicleId && !bookingIdParam) return;
    setLoading(true);
    setStatusFeedback(null);

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
      // If offline, preserve any in-memory manifest
      if (!isOnline) {
        setStatusFeedback({
          type: 'warning',
          msg: 'Offline mode active: Using cached roster from local storage.',
        });
      } else {
        console.error('Manifest load error:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (vehicleId || bookingIdParam) {
      loadTripManifest();
    }
  }, [vehicleId, bookingIdParam]);

  // Handle employee boarding verification (Online or Offline IndexedDB queue)
  const handleVerifyBoarding = async (empIdToVerify?: string) => {
    const targetEmpId = (empIdToVerify || employeeInput).trim().toUpperCase();
    if (!targetEmpId) return;

    setActionLoading(true);
    setStatusFeedback(null);

    const nowIso = new Date().toISOString();

    // 1. If Offline: Store in IndexedDB and update UI optimistically
    if (!navigator.onLine) {
      try {
        await queueOfflineScan({
          booking_id: tripInfo?.id || bookingIdParam,
          vehicle_id: vehicleId,
          employee_id: targetEmpId,
          scanned_at: nowIso,
        });

        // Update local state manifest
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
          msg: `Offline: Scan for ${targetEmpId} queued in local device storage.`,
        });
        setEmployeeInput('');
      } catch (err: any) {
        setStatusFeedback({ type: 'error', msg: `Storage failed: ${err.message}` });
      } finally {
        setActionLoading(false);
      }
      return;
    }

    // 2. If Online: Dispatch directly to Worker
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
      // If network fails unexpectedly mid-request, buffer to IndexedDB fallback
      await queueOfflineScan({
        booking_id: tripInfo?.id || bookingIdParam,
        vehicle_id: vehicleId,
        employee_id: targetEmpId,
        scanned_at: nowIso,
      });
      const count = await getPendingScansCount();
      setPendingSyncCount(count);

      setStatusFeedback({
        type: 'warning',
        msg: `Network dropped: ${targetEmpId} saved locally to sync queue.`,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const boardedCount = manifest.filter((p) => p.boarded).length;
  const totalCount = manifest.length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 max-w-lg mx-auto flex flex-col justify-between">
      {/* Top Status Strip */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-purple-950 border border-purple-500/40 text-purple-400">
              <QrCode className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-base font-bold text-white">Gate Boarding Terminal</h1>
              <p className="text-[11px] text-slate-400">Phase 8: Offline-Resilient Scanner</p>
            </div>
          </div>

          {/* Network Indicator Badge */}
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                isOnline
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60'
                  : 'bg-amber-950/80 text-amber-400 border-amber-800/60 animate-pulse'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </span>
          </div>
        </div>

        {/* Unsynced Queue Alert */}
        {pendingSyncCount > 0 && (
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/50 flex items-center justify-between text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span><strong>{pendingSyncCount}</strong> scans queued in offline storage</span>
            </div>
            {isOnline && (
              <button
                type="button"
                disabled={isSyncing}
                onClick={triggerAutoSync}
                className="px-2.5 py-1 rounded bg-amber-800 hover:bg-amber-700 text-white font-bold text-[10px]"
              >
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            )}
          </div>
        )}

        {/* Vehicle Selection or Ref */}
        {!vehicleIdParam && (
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Bus / Vehicle UUID or Reg No:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter vehicle ID or Reg..."
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
              <button
                type="button"
                onClick={loadTripManifest}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white"
              >
                Load
              </button>
            </div>
          </div>
        )}

        {/* Trip Summary Card */}
        {tripInfo && (
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-mono text-purple-400 font-bold">{tripInfo.booking_reference}</span>
              <span className="text-slate-400">{tripInfo.target_category || 'BUS'}</span>
            </div>
            <p className="text-white font-semibold">
              {tripInfo.origin_location} → {tripInfo.destination_location}
            </p>
            <div className="flex justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800">
              <span>Attendance Rate:</span>
              <strong className="text-emerald-400">
                {boardedCount} / {totalCount} Boarded ({totalCount > 0 ? Math.round((boardedCount / totalCount) * 100) : 0}%)
              </strong>
            </div>
          </div>
        )}

        {/* Scan Input */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Manual Scan / Employee Code Entry:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. EMP-VAD-101"
              value={employeeInput}
              onChange={(e) => setEmployeeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerifyBoarding()}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono uppercase text-white focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              disabled={actionLoading || !employeeInput.trim()}
              onClick={() => handleVerifyBoarding()}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white shadow-lg shadow-emerald-950/40"
            >
              {actionLoading ? 'Checking...' : 'Check-In'}
            </button>
          </div>
        </div>

        {/* Feedback Message */}
        {statusFeedback && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              statusFeedback.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-800/60 text-emerald-300'
                : statusFeedback.type === 'warning'
                ? 'bg-amber-950/80 border-amber-800/60 text-amber-300'
                : 'bg-rose-950/80 border-rose-800/60 text-rose-300'
            }`}
          >
            {statusFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusFeedback.msg}</span>
          </div>
        )}

        {/* Manifest Roster List */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Trip Roster ({manifest.length} Registered)
          </h2>

          <div className="space-y-1.5 max-h-[38vh] overflow-y-auto pr-1">
            {manifest.map((p) => (
              <div
                key={p.employee_id}
                className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition ${
                  p.boarded
                    ? 'bg-emerald-950/30 border-emerald-800/40 text-slate-200'
                    : 'bg-slate-900/60 border-slate-800/80 text-slate-400'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white">{p.employee_id}</span>
                    <span className="font-medium text-slate-300">{p.name}</span>
                  </div>
                  {p.pickup_point && (
                    <p className="text-[10px] text-slate-500 mt-0.5">{p.pickup_point}</p>
                  )}
                </div>

                <div>
                  {p.boarded ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                      <UserCheck className="w-3.5 h-3.5" />
                      Boarded
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleVerifyBoarding(p.employee_id)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-300"
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

      {/* Footer Navigation */}
      <div className="pt-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
        <Link href="/dispatch" className="text-purple-400 hover:text-purple-300 font-semibold">
          ← Dispatch Console
        </Link>
        <span>PWA Offline Mode Ready</span>
      </div>
    </div>
  );
}

export default function GateBoardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <GateBoardingPageContent />
    </Suspense>
  );
}
