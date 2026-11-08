'use client';

import React, { useState, useEffect } from 'react';
import AppNavbar from '@/components/AppNavbar';
import { useAuth } from '@/lib/auth-context';
import { fetchApi } from '@/lib/api';
import {
  Activity,
  BarChart3,
  TrendingUp,
  Car,
  Users,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';

export default function AnalyticsPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<any>({
    fleetUtilization: '75%',
    totalCompleted: 6,
    passengersServed: 18,
    activeVehicles: 8,
    activeDrivers: 4
  });

  return (
    <div className="min-h-screen bg-smart-bg flex flex-col">
      <AppNavbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-widest text-smart-blue uppercase bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                Operations Intelligence
              </span>
              <span className="text-smart-muted">•</span>
              <span className="text-xs text-smart-muted font-medium">{session?.siteName || 'Vadodara Chemical Complex'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-smart-navy tracking-tight mt-1">
              Fleet Analytics & Asset Utilization
            </h1>
            <p className="text-xs sm:text-sm text-smart-muted mt-0.5">
              Live fleet telemetry, seat occupancy ratios, and HSE transport compliance metrics.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-white border border-smart-border text-xs font-bold text-smart-navy shadow-smart-sm">
              {session?.siteName?.split(' ')[0] || 'Vadodara'}
            </span>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="smart-glass-card p-5">
            <span className="text-xs font-bold uppercase tracking-wider text-smart-muted">Fleet Utilization</span>
            <div className="flex items-center justify-between mt-2">
              <span className="text-3xl font-black text-smart-blue">{metrics.fleetUtilization}</span>
              <Activity className="w-5 h-5 text-smart-blue" />
            </div>
            <p className="text-[11px] text-smart-success mt-1 font-semibold">Active duty across plant gates</p>
          </div>

          <div className="smart-glass-card p-5">
            <span className="text-xs font-bold uppercase tracking-wider text-smart-muted">Total Trips Completed</span>
            <div className="flex items-center justify-between mt-2">
              <span className="text-3xl font-black text-smart-navy">{metrics.totalCompleted}</span>
              <TrendingUp className="w-5 h-5 text-smart-success" />
            </div>
            <p className="text-[11px] text-smart-muted mt-1 font-medium">Verified gate arrival</p>
          </div>

          <div className="smart-glass-card p-5">
            <span className="text-xs font-bold uppercase tracking-wider text-smart-muted">Passengers Served</span>
            <div className="flex items-center justify-between mt-2">
              <span className="text-3xl font-black text-smart-navy">{metrics.passengersServed}</span>
              <Users className="w-5 h-5 text-smart-cyan" />
            </div>
            <p className="text-[11px] text-smart-muted mt-1 font-medium">Across all manufacturing shifts</p>
          </div>

          <div className="smart-glass-card p-5">
            <span className="text-xs font-bold uppercase tracking-wider text-smart-muted">Operational Fleet & Drivers</span>
            <div className="flex items-center justify-between mt-2">
              <span className="text-3xl font-black text-smart-navy">{metrics.activeVehicles} Cars</span>
              <Car className="w-5 h-5 text-smart-blue" />
            </div>
            <p className="text-[11px] text-smart-muted mt-1 font-medium">{metrics.activeDrivers} Certified Drivers</p>
          </div>
        </div>

        {/* Compliance & HSE Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="smart-glass-card p-6 space-y-3">
            <h3 className="text-sm font-black text-smart-navy uppercase tracking-wider">Demand by Vehicle Category</h3>
            <div className="space-y-2 pt-2">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-smart-navy">Executive Sedans (4-Seater)</span>
                  <span className="text-smart-blue">6 Trips (60%)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="smart-gradient-blue h-2 rounded-full" style={{ width: '60%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-smart-navy">Plant Commuter Buses (32-Seater)</span>
                  <span className="text-smart-cyan">4 Trips (40%)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-smart-cyan h-2 rounded-full" style={{ width: '40%' }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="smart-glass-card p-6 space-y-3">
            <h3 className="text-sm font-black text-smart-navy uppercase tracking-wider">Operational Health & Safety (HSE)</h3>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-xs font-bold text-smart-success block">100% Manifest Adherence</span>
                <span className="text-[10px] text-slate-600">Emp ID scan before gate departure</span>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                <span className="text-xs font-bold text-smart-blue block">Zero Overlaps</span>
                <span className="text-[10px] text-slate-600">Protected by Postgres row locks</span>
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
