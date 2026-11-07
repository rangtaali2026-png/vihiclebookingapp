'use client';

import React, { useState, useEffect } from 'react';
import AppNavbar from '@/components/AppNavbar';
import { useAuth } from '@/lib/auth-context';
import { fetchApi } from '@/lib/api';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Play,
  CheckCircle2,
  Bus,
  RefreshCw
} from 'lucide-react';

interface ShiftRoute {
  id: string;
  site_id: string;
  route_name: string;
  shift_code: string;
  origin_hub: string;
  destination_plant: string;
  departure_time: string;
  arrival_time: string;
  default_vehicle_category: string;
  is_active: boolean;
  shift_roster_members?: { count: number }[];
}

export default function ShiftRosterPage() {
  const { session } = useAuth();
  const [routes, setRoutes] = useState<ShiftRoute[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [generating, setGenerating] = useState<boolean>(false);
  const [targetDate, setTargetDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadRoutes = () => {
    setLoading(true);
    const siteQuery = session.siteId ? `?site_id=${session.siteId}` : '';
    fetchApi<{ success: boolean; routes: ShiftRoute[] }>(`/api/shifts/routes${siteQuery}`)
      .then((res) => {
        if (res.routes) setRoutes(res.routes);
      })
      .catch((err) => console.error('Failed to load shift routes:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRoutes();
  }, [session.siteId]);

  const handleGenerateRuns = async () => {
    if (!session.siteId) {
      alert('Please select an active plant site first using the top-right persona selector.');
      return;
    }

    try {
      setGenerating(true);
      setStatusMessage(null);
      const res = await fetchApi<{ success: boolean; message: string; generated: number }>(
        '/api/shifts/generate-runs',
        {
          method: 'POST',
          body: JSON.stringify({
            site_id: session.siteId,
            target_date: targetDate,
          }),
        }
      );

      setStatusMessage(res.message || 'Successfully generated shift runs.');
    } catch (err: any) {
      alert(`Generation failed: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <AppNavbar />

      <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold tracking-widest text-purple-400 uppercase bg-purple-950/60 border border-purple-800/60 px-2.5 py-0.5 rounded-full">
                Phase 7 Module
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-xs text-slate-400 font-medium">{session.siteName}</span>
            </div>
            <h1 className="text-xl font-black text-white tracking-wide mt-1">
              Shift Transit Rosters & Automated Recurring Runs
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Automated bus dispatch generator mapping employee shifts (Morning, Afternoon, General) to dedicated plant buses.
            </p>
          </div>

          {/* Trigger Daily Generator Bar */}
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl p-2">
            <div className="flex items-center gap-2 px-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="bg-transparent text-xs font-mono text-white focus:outline-none"
              />
            </div>

            <button
              type="button"
              disabled={generating}
              onClick={handleGenerateRuns}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-bold text-white shadow-lg shadow-purple-950/40 disabled:opacity-50 transition"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{generating ? 'Generating Runs...' : 'Generate Shift Runs'}</span>
            </button>
          </div>
        </div>

        {/* Status Notification */}
        {statusMessage && (
          <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-xs text-emerald-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{statusMessage}</span>
            </div>
            <a
              href="/dispatch"
              className="px-2.5 py-1 rounded bg-emerald-900/80 hover:bg-emerald-800 font-bold text-[11px] text-white"
            >
              View in Dispatch Console →
            </a>
          </div>
        )}

        {/* Shift Routes Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
              Configured Shift Bus Routes ({routes.length})
            </h2>
            <button
              onClick={loadRoutes}
              className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading shift routes...</div>
          ) : routes.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
              No shift routes configured for this site.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {routes.map((route) => {
                const passengerCount = route.shift_roster_members?.[0]?.count || 0;
                return (
                  <div
                    key={route.id}
                    className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-purple-400 uppercase">
                          {route.shift_code.replace('_', ' ')}
                        </span>
                        <h3 className="text-sm font-bold text-white mt-0.5">{route.route_name}</h3>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800/50">
                        {route.default_vehicle_category}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs py-2 border-y border-slate-800/60 text-slate-300">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate">Hub: {route.origin_hub}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span className="truncate">Plant: {route.destination_plant}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Departure: <strong>{route.departure_time}</strong> (Arrival ~{route.arrival_time})</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        <span>Roster: <strong className="text-white">{passengerCount}</strong> Employees</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded">
                        RECURRING
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
