'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import AppNavbar from '@/components/AppNavbar';
import { useAuth } from '@/lib/auth-context';
import {
  Building2,
  Shield,
  Key,
  Server,
  Plus,
  CheckCircle2,
  MapPin,
  Lock,
  ArrowRight,
  Search,
  Filter
} from 'lucide-react';

interface PlantSite {
  id: string;
  site_code: string;
  site_name: string;
  location_city: string;
  is_active: boolean;
  auto_allotment_enabled: boolean;
  require_admin_approval: boolean;
  manager_name?: string;
  fleet_count?: number;
}

const INITIAL_SITES: PlantSite[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    site_code: 'PLANT_VADODARA',
    site_name: 'Vadodara Chemical & Polymer Complex',
    location_city: 'Vadodara, Gujarat',
    is_active: true,
    auto_allotment_enabled: true,
    require_admin_approval: true,
    manager_name: 'Jignesh Joshi',
    fleet_count: 14,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    site_code: 'PLANT_BHARUCH',
    site_name: 'Dahej Heavy Engineering Unit',
    location_city: 'Bharuch, Gujarat',
    is_active: true,
    auto_allotment_enabled: false,
    require_admin_approval: true,
    manager_name: 'Hardik Shah',
    fleet_count: 9,
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    site_code: 'PLANT_JAMNAGAR',
    site_name: 'Jamnagar Coastal Refinery Works',
    location_city: 'Jamnagar, Gujarat',
    is_active: true,
    auto_allotment_enabled: true,
    require_admin_approval: false,
    manager_name: 'Jayesh Jadeja',
    fleet_count: 22,
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    site_code: 'PLANT_SURAT',
    site_name: 'Hazira Manufacturing Yard',
    location_city: 'Surat, Gujarat',
    is_active: false,
    auto_allotment_enabled: false,
    require_admin_approval: true,
    manager_name: 'Nilesh Patel',
    fleet_count: 6,
  },
];

export default function SuperAdminSitesPage() {
  const { session } = useAuth();
  const [sites, setSites] = useState<PlantSite[]>(INITIAL_SITES);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'SITES' | 'GATEWAY' | 'SECRETS'>('SITES');

  const filteredSites = sites.filter(
    (s) =>
      s.site_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.location_city.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-smart-bg flex flex-col">
      <AppNavbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-widest text-smart-blue uppercase bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                Super Admin Division
              </span>
              <span className="text-smart-muted">•</span>
              <span className="text-xs text-smart-muted font-medium">Cross-Tenant Global Controller</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-smart-navy tracking-tight mt-1">
              Multi-Plant Site Director
            </h1>
            <p className="text-xs sm:text-sm text-smart-muted mt-0.5">
              Provision plant partitions, configure site automation, and rotate SMS/WhatsApp dispatch keys.
            </p>
          </div>

          <button
            type="button"
            className="smart-gradient-blue text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-smart-lg hover:opacity-95 transition flex items-center gap-2 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Provision Plant Tenant</span>
          </button>
        </div>

        {/* Top Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="smart-glass-card p-5">
            <span className="text-xs font-bold uppercase tracking-wider text-smart-muted">Plant Replicas</span>
            <div className="flex items-center justify-between mt-2">
              <span className="text-3xl font-black text-smart-navy">4</span>
              <Building2 className="w-6 h-6 text-smart-blue" />
            </div>
            <p className="text-[11px] text-smart-success mt-1 font-semibold">3 operational sites in Gujarat</p>
          </div>

          <div className="smart-glass-card p-5">
            <span className="text-xs font-bold uppercase tracking-wider text-smart-muted">Fleet Capacity</span>
            <div className="flex items-center justify-between mt-2">
              <span className="text-3xl font-black text-smart-navy">51</span>
              <Server className="w-6 h-6 text-smart-cyan" />
            </div>
            <p className="text-[11px] text-smart-muted mt-1 font-medium">Dedicated plant vehicles tracked</p>
          </div>

          <div className="smart-glass-card p-5">
            <span className="text-xs font-bold uppercase tracking-wider text-smart-muted">Gateway Vault Security</span>
            <div className="flex items-center justify-between mt-2">
              <span className="text-3xl font-black text-smart-navy">AES-256</span>
              <Lock className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-[11px] text-smart-muted mt-1 font-medium">Cloudflare Secret Key rotation active</p>
          </div>
        </div>

        {/* Search & Tabs */}
        <div className="smart-glass-card p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('SITES')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'SITES'
                  ? 'bg-blue-50 text-smart-blue border border-blue-200'
                  : 'text-smart-muted hover:text-smart-navy'
              }`}
            >
              Plant Sites (4)
            </button>
            <button
              onClick={() => setActiveTab('GATEWAY')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'GATEWAY'
                  ? 'bg-blue-50 text-smart-blue border border-blue-200'
                  : 'text-smart-muted hover:text-smart-navy'
              }`}
            >
              Encrypted Gateway Vault
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-smart-muted absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search plant sites..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-smart-border rounded-xl pl-9 pr-3 py-2 text-xs text-smart-navy placeholder-slate-400 focus:bg-white focus:border-smart-blue focus:outline-none transition"
            />
          </div>
        </div>

        {/* Sites Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSites.map((site) => (
            <div key={site.id} className="smart-glass-card p-5 space-y-4 hover:shadow-smart-lg transition">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold text-smart-blue uppercase">
                    {site.site_code}
                  </span>
                  <h3 className="text-sm font-black text-smart-navy mt-0.5">{site.site_name}</h3>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    site.is_active
                      ? 'bg-emerald-50 text-smart-success border-emerald-200'
                      : 'bg-amber-50 text-smart-warning border-amber-200'
                  }`}
                >
                  {site.is_active ? 'ACTIVE' : 'MAINTENANCE'}
                </span>
              </div>

              <div className="space-y-2 text-xs py-2 border-y border-smart-border text-smart-muted">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-smart-cyan shrink-0" />
                  <span>{site.location_city}</span>
                </div>
                <div className="flex justify-between">
                  <span>Manager: <strong className="text-smart-navy">{site.manager_name}</strong></span>
                  <span>Fleet: <strong className="text-smart-blue">{site.fleet_count} Assets</strong></span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-[11px] text-smart-muted">
                  Auto-Allotment: <strong className={site.auto_allotment_enabled ? 'text-smart-success' : 'text-slate-400'}>
                    {site.auto_allotment_enabled ? 'ON' : 'OFF'}
                  </strong>
                </span>

                <Link
                  href={`/bookings?site_id=${site.id}`}
                  className="text-smart-blue font-bold flex items-center gap-1 hover:underline"
                >
                  <span>Bookings</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>

      </main>
    </div>
  );
}
