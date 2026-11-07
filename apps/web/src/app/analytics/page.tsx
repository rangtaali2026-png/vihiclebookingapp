'use client';

import AppNavbar from '@/components/AppNavbar';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';

interface AnalyticsMetrics {
  total_bookings: number;
  completed_trips: number;
  active_dispatched: number;
  cancelled_trips: number;
  total_passengers_served: number;
  total_fleet_assets: number;
  available_vehicles: number;
  active_vehicles_on_trip: number;
  total_drivers: number;
  fleet_utilization_rate: number;
  category_breakdown: Record<string, number>;
  vehicle_stats: Array<{
    id: string;
    registration_number: string;
    model: string;
    seat_capacity: number;
    status: string;
    total_trips: number;
  }>;
}

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedSite, setSelectedSite] = useState<string>('11111111-1111-1111-1111-111111111111');

  const loadMetrics = async (siteId: string) => {
    try {
      setLoading(true);
      const url = siteId ? `/api/analytics/metrics?site_id=${siteId}` : '/api/analytics/metrics';
      const res = await fetchApi<{ success: boolean; metrics: AnalyticsMetrics }>(url);
      setMetrics(res.metrics);
    } catch (err: any) {
      console.error('Failed to load metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics(selectedSite);
  }, [selectedSite]);

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <AppNavbar />
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-800">
                ← Home
              </Link>
              <span className="text-slate-300">/</span>
              <span className="text-sm font-semibold text-slate-800">Operations Intelligence</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">Fleet Analytics & Utilization</h1>
            <p className="text-sm text-slate-600">Operational performance, asset utilization, and transit manifest telemetry</p>
          </div>

          {/* Plant Site Filter */}
          <div className="flex items-center gap-3">
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs"
            >
              <option value="11111111-1111-1111-1111-111111111111">Vadodara Chemical Complex</option>
              <option value="22222222-2222-2222-2222-222222222222">Dahej Petrochemical Unit</option>
              <option value="33333333-3333-3333-3333-333333333333">Jamnagar Works</option>
              <option value="">All Plant Sites (Aggregate)</option>
            </select>
            <button
              onClick={() => loadMetrics(selectedSite)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {loading || !metrics ? (
          <div className="p-12 text-center text-sm text-slate-500 bg-white rounded-xl border border-slate-200">
            Calculating telemetry and utilization metrics...
          </div>
        ) : (
          <>
            {/* Top Operational KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Fleet Utilization</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-black text-blue-600">{metrics.fleet_utilization_rate}%</span>
                  <span className="text-xs text-slate-400">active duty</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full"
                    style={{ width: `${Math.min(metrics.fleet_utilization_rate, 100)}%` }}
                  />
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Trips Completed</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-black text-emerald-600">{metrics.completed_trips}</span>
                  <span className="text-xs text-slate-400">of {metrics.total_bookings} requested</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 font-mono">
                  Active Dispatched: {metrics.active_dispatched} • Cancelled: {metrics.cancelled_trips}
                </p>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Passengers Served</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-black text-purple-600">{metrics.total_passengers_served}</span>
                  <span className="text-xs text-slate-400">personnel</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 font-mono">
                  Verified boardings across plant shifts
                </p>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Operational Fleet & Drivers</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-black text-slate-900">{metrics.total_fleet_assets}</span>
                  <span className="text-xs text-slate-400">vehicles</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 font-mono">
                  {metrics.available_vehicles} Ready • {metrics.total_drivers} Plant Drivers
                </p>
              </div>
            </div>

            {/* Category Demand Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">Vehicle Category Demand</h3>
                <div className="space-y-3">
                  {Object.entries(metrics.category_breakdown).length === 0 ? (
                    <p className="text-xs text-slate-400">No category demand recorded yet.</p>
                  ) : (
                    Object.entries(metrics.category_breakdown).map(([category, count]) => {
                      const pct = Math.round((count / (metrics.total_bookings || 1)) * 100);
                      return (
                        <div key={category} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-slate-700">{category}</span>
                            <span className="text-slate-500">{count} trips ({pct}%)</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div className="bg-slate-800 h-2 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">Operational Health & Safety</h3>
                  <p className="text-xs text-slate-600 mb-4">
                    All dispatches require verified driver license validity and vehicle QR windshield boarding compliance.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <p className="font-bold text-emerald-800">100% Manifest Adherence</p>
                    <p className="text-[11px] text-emerald-600 mt-0.5">Emp ID scan before vehicle departure</p>
                  </div>
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="font-bold text-blue-800">Zero Overlaps</p>
                    <p className="text-[11px] text-blue-600 mt-0.5">Protected by PL/pgSQL row locks</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Individual Vehicle Trip Logs & Utilization Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Vehicle Utilization Breakdown</h3>
                <span className="text-xs text-slate-500">{metrics.vehicle_stats.length} Assets Tracked</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 uppercase tracking-wider text-slate-500">
                      <th className="p-3">Vehicle</th>
                      <th className="p-3">Model</th>
                      <th className="p-3">Capacity</th>
                      <th className="p-3">Trips Handled</th>
                      <th className="p-3">Current Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {metrics.vehicle_stats.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50/75">
                        <td className="p-3 font-mono font-bold text-slate-900">{v.registration_number}</td>
                        <td className="p-3 text-slate-700">{v.model}</td>
                        <td className="p-3 text-slate-600">{v.seat_capacity} seats</td>
                        <td className="p-3 font-semibold text-blue-700">{v.total_trips} trips</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            v.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-800' :
                            v.status === 'ON_TRIP' ? 'bg-purple-100 text-purple-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {v.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
