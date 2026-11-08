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
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadRoutes = () => {
    setLoading(true);
    const siteQuery = session?.siteId ? `?site_id=${session.siteId}` : '';
    fetchApi<{ success: boolean; routes: ShiftRoute[] }>(`/api/shifts/routes${siteQuery}`)
      .then((res) => {
        if (res.routes) setRoutes(res.routes);
      })
      .catch((err) => console.error('Failed to load shift routes:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRoutes();
  }, [session?.siteId]);

  const handleGenerateRuns = async () => {
    try {
      setGenerating(true);
      setStatusMessage(null);
      const res = await fetchApi<{ success: boolean; message: string; generated: number }>(
        '/api/shifts/generate-runs',
        {
          method: 'POST',
          body: JSON.stringify({
            site_id: session?.siteId || '11111111-1111-1111-1111-111111111111',
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
    <div className="min-h-screen bg-smart-bg flex flex-col">
      <AppNavbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-widest text-smart-blue uppercase bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                Phase 7 Module
              </span>
              <span className="text-smart-muted">•</span>
              <span className="text-xs text-smart-muted font-medium">{session?.siteName || 'Vadodara Chemical Complex'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-smart-navy tracking-tight mt-1">
              Shift Transit Rosters & Automated Recurring Runs
            </h1>
            <p className="text-xs sm:text-sm text-smart-muted mt-0.5">
              Automated bus dispatch generator mapping employee shifts (Morning, Afternoon, General) to dedicated plant buses.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-white border border-smart-border rounded-xl p-2 shadow-smart-sm">
            <div className="flex items-center gap-2 px-2">
              <Calendar className="w-4 h-4 text-smart-muted" />
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="bg-transparent text-xs font-mono text-smart-navy focus:outline-none"
              />
            </div>

            <button
              type="button"
              disabled={generating}
              onClick={handleGenerateRuns}
              className="inline-flex items-center gap-2 smart-gradient-blue text-white px-4 py-2 rounded-lg text-xs font-bold shadow-smart-lg hover:opacity-95 disabled:opacity-50 transition"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{generating ? 'Generating...' : 'Generate Shift Runs'}</span>
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-smart-success flex items-center justify-between font-semibold">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{statusMessage}</span>
            </div>
            <a href="/dispatch" className="underline font-bold">
              View in Dispatch Console →
            </a>
          </div>
        )}

        {/* Shift Routes Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-smart-navy">
              Configured Shift Bus Routes ({routes.length})
            </h2>
            <button onClick={loadRoutes} className="text-xs text-smart-blue hover:underline font-bold flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {routes.map((route) => {
              const passengerCount = route.shift_roster_members?.[0]?.count || 0;
              return (
                <div key={route.id} className="smart-glass-card p-5 space-y-4 shadow-smart hover:shadow-smart-lg transition">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-smart-blue uppercase">
                        {route.shift_code.replace('_', ' ')}
                      </span>
                      <h3 className="text-sm font-black text-smart-navy mt-0.5">{route.route_name}</h3>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-smart-blue border border-blue-200">
                      {route.default_vehicle_category}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs py-2 border-y border-smart-border text-smart-muted">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-smart-cyan shrink-0" />
                      <span className="truncate">Hub: {route.origin_hub}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-smart-blue shrink-0" />
                      <span className="truncate">Plant: {route.destination_plant}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-smart-warning shrink-0" />
                      <span>Departure: <strong className="text-smart-navy">{route.departure_time}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <div className="flex items-center gap-1.5 text-smart-muted font-medium">
                      <Users className="w-3.5 h-3.5 text-smart-blue" />
                      <span>Roster: <strong className="text-smart-navy">{passengerCount}</strong> Employees</span>
                    </div>
                    <span className="text-[10px] font-bold text-smart-success bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      RECURRING
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </main>
    </div>
  );
}
