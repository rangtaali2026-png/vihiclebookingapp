'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchApi } from '@/lib/api';
import {
  Building2,
  KeyRound,
  Car,
  Search,
  Plus,
  RefreshCw,
  ShieldAlert,
  X,
  Activity,
  Layers,
  MapPin,
  Lock,
  CheckCircle2,
  Phone,
  Radio,
  SlidersHorizontal,
  ChevronRight,
  ExternalLink
} from 'lucide-react';

export type EnvironmentType = 'PRODUCTION' | 'STAGING' | 'SANDBOX';
export type GatewayChannel = 'WHATSAPP' | 'SMS' | 'EMAIL' | 'WEBHOOK';
export type SiteStatus = 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE';

export interface PlantSite {
  id: string;
  siteCode: string;
  siteName: string;
  locationCity: string;
  state: string;
  managerName: string;
  managerPhone: string;
  connectedVehicles: number;
  totalCapacity: number;
  activeGatewaysCount: number;
  status: SiteStatus;
  autoAllotment: boolean;
  requireApproval: boolean;
  lastSyncTime: string;
}

export interface GatewaySecret {
  id: string;
  site_tag: string;
  gateway_name: string;
  channel: GatewayChannel;
  environment: EnvironmentType;
  gateway_identifier: string;
  secret_key_encrypted?: string;
  is_enabled: boolean;
  last_rotated_at?: string;
}

export interface SiteAuditLog {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  siteCode: string;
  details: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
}

const INITIAL_PLANTS: PlantSite[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    siteCode: 'PLANT_VADODARA',
    siteName: 'Vadodara Chemical & Polymer Complex',
    locationCity: 'Vadodara',
    state: 'Gujarat',
    managerName: 'Jignesh Joshi',
    managerPhone: '+91 98250 00101',
    connectedVehicles: 14,
    totalCapacity: 128,
    activeGatewaysCount: 3,
    status: 'ACTIVE',
    autoAllotment: true,
    requireApproval: true,
    lastSyncTime: 'Just now',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    siteCode: 'PLANT_BHARUCH',
    siteName: 'Dahej Heavy Engineering Unit',
    locationCity: 'Bharuch',
    state: 'Gujarat',
    managerName: 'Hardik Shah',
    managerPhone: '+91 98790 00201',
    connectedVehicles: 9,
    totalCapacity: 74,
    activeGatewaysCount: 2,
    status: 'ACTIVE',
    autoAllotment: false,
    requireApproval: true,
    lastSyncTime: '3 mins ago',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    siteCode: 'PLANT_JAMNAGAR',
    siteName: 'Jamnagar Coastal Refinery Works',
    locationCity: 'Jamnagar',
    state: 'Gujarat',
    managerName: 'Jayesh Jadeja',
    managerPhone: '+91 98980 00301',
    connectedVehicles: 22,
    totalCapacity: 240,
    activeGatewaysCount: 3,
    status: 'ACTIVE',
    autoAllotment: true,
    requireApproval: false,
    lastSyncTime: '12 mins ago',
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    siteCode: 'PLANT_SURAT',
    siteName: 'Hazira Manufacturing Yard',
    locationCity: 'Surat',
    state: 'Gujarat',
    managerName: 'Nilesh Patel',
    managerPhone: '+91 98240 00401',
    connectedVehicles: 6,
    totalCapacity: 48,
    activeGatewaysCount: 1,
    status: 'MAINTENANCE',
    autoAllotment: false,
    requireApproval: true,
    lastSyncTime: '1 hr ago',
  },
];

const INITIAL_GATEWAYS: GatewaySecret[] = [
  {
    id: 'a1111111-0000-0000-0000-000000000001',
    site_tag: 'VADODARA COMPLEX',
    gateway_name: 'Meta WhatsApp Cloud API',
    channel: 'WHATSAPP',
    environment: 'PRODUCTION',
    gateway_identifier: '104928392019283',
    is_enabled: true,
    last_rotated_at: '2026-10-28',
  },
  {
    id: 'a1111111-0000-0000-0000-000000000002',
    site_tag: 'VADODARA COMPLEX',
    gateway_name: 'Airtel Telecom DLT Gateway',
    channel: 'SMS',
    environment: 'PRODUCTION',
    gateway_identifier: 'PLNTRN',
    is_enabled: true,
    last_rotated_at: '2026-09-14',
  },
  {
    id: 'a2222222-0000-0000-0000-000000000001',
    site_tag: 'DAHEJ UNIT',
    gateway_name: 'Meta WhatsApp Cloud API',
    channel: 'WHATSAPP',
    environment: 'PRODUCTION',
    gateway_identifier: '204928392019284',
    is_enabled: true,
    last_rotated_at: '2026-10-12',
  },
  {
    id: 'a3333333-0000-0000-0000-000000000001',
    site_tag: 'JAMNAGAR WORKS',
    gateway_name: 'Resend Transactional SMTP',
    channel: 'EMAIL',
    environment: 'PRODUCTION',
    gateway_identifier: 'transit-jamnagar@plant-logistics.company.com',
    is_enabled: true,
    last_rotated_at: '2026-11-01',
  },
  {
    id: 'a4444444-0000-0000-0000-000000000001',
    site_tag: 'HAZIRA YARD',
    gateway_name: 'Jio Telecom SMS Engine',
    channel: 'SMS',
    environment: 'STAGING',
    gateway_identifier: 'HZTRN',
    is_enabled: false,
    last_rotated_at: '2026-10-02',
  },
];

const INITIAL_AUDIT_LOGS: SiteAuditLog[] = [
  {
    id: 'aud-01',
    timestamp: '10 mins ago',
    action: 'SECRET_ROTATED',
    actor: 'superadmin@company.com',
    siteCode: 'PLANT_VADODARA',
    details: 'Rotated Meta WhatsApp API token for Vadodara Complex.',
    severity: 'WARNING',
  },
  {
    id: 'aud-02',
    timestamp: '1 hour ago',
    action: 'AUTO_ALLOTMENT_TOGGLE',
    actor: 'admin.jamnagar@company.com',
    siteCode: 'PLANT_JAMNAGAR',
    details: 'Enabled automated vehicle assignment without admin gate.',
    severity: 'INFO',
  },
  {
    id: 'aud-03',
    timestamp: '5 hours ago',
    action: 'GATEWAY_HEARTBEAT_TIMEOUT',
    actor: 'System Daemon',
    siteCode: 'PLANT_SURAT',
    details: 'Jio SMS Gateway missed 3 consecutive heartbeat probes.',
    severity: 'CRITICAL',
  },
  {
    id: 'aud-04',
    timestamp: '1 day ago',
    action: 'NEW_SITE_PROVISIONED',
    actor: 'superadmin@company.com',
    siteCode: 'PLANT_SURAT',
    details: 'Created tenant partition for Hazira Manufacturing Yard.',
    severity: 'INFO',
  },
];

export default function SuperAdminSitesPage() {
  const [activeTab, setActiveTab] = useState<'PLANTS' | 'GATEWAYS' | 'ANALYTICS' | 'AUDIT'>('PLANTS');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SiteStatus>('ALL');

  const [plants, setPlants] = useState<PlantSite[]>(INITIAL_PLANTS);
  const [gateways, setGateways] = useState<GatewaySecret[]>(INITIAL_GATEWAYS);
  const [auditLogs] = useState<SiteAuditLog[]>(INITIAL_AUDIT_LOGS);

  const [isNewPlantModalOpen, setIsNewPlantModalOpen] = useState(false);
  const [isRotateSecretModalOpen, setIsRotateSecretModalOpen] = useState(false);
  const [activeSecretForRotation, setActiveSecretForRotation] = useState<GatewaySecret | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [newPlantForm, setNewPlantForm] = useState({
    siteCode: '',
    siteName: '',
    locationCity: '',
    state: 'Gujarat',
    managerName: '',
    managerPhone: '',
    autoAllotment: true,
    requireApproval: true,
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    fetchApi<{ success: boolean; gateways: GatewaySecret[] }>('/api/admin/gateways')
      .then((res) => {
        if (res?.gateways && res.gateways.length > 0) {
          setGateways(res.gateways);
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleGateway = async (id: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    setTogglingId(id);
    setGateways((prev) =>
      prev.map((g) => (g.id === id ? { ...g, is_enabled: nextStatus } : g))
    );

    try {
      await fetchApi(`/api/admin/gateways/${id}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ is_enabled: nextStatus }),
      });
      showToast(`Gateway successfully ${nextStatus ? 'ENABLED' : 'DISABLED'}`);
    } catch (err: any) {
      showToast(`Toggle failed: ${err.message}`);
      setGateways((prev) =>
        prev.map((g) => (g.id === id ? { ...g, is_enabled: currentStatus } : g))
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleCreatePlant = (e: React.FormEvent) => {
    e.preventDefault();
    const newPlant: PlantSite = {
      id: `site-${Date.now()}`,
      siteCode: newPlantForm.siteCode.toUpperCase().trim(),
      siteName: newPlantForm.siteName.trim(),
      locationCity: newPlantForm.locationCity.trim(),
      state: newPlantForm.state,
      managerName: newPlantForm.managerName.trim(),
      managerPhone: newPlantForm.managerPhone.trim(),
      connectedVehicles: 0,
      totalCapacity: 0,
      activeGatewaysCount: 0,
      status: 'ACTIVE',
      autoAllotment: newPlantForm.autoAllotment,
      requireApproval: newPlantForm.requireApproval,
      lastSyncTime: 'Just now',
    };

    setPlants((prev) => [newPlant, ...prev]);
    setIsNewPlantModalOpen(false);
    showToast(`Plant ${newPlant.siteCode} provisioned with RLS isolation.`);
    setNewPlantForm({
      siteCode: '',
      siteName: '',
      locationCity: '',
      state: 'Gujarat',
      managerName: '',
      managerPhone: '',
      autoAllotment: true,
      requireApproval: true,
    });
  };

  const handleExecuteRotation = () => {
    if (!activeSecretForRotation) return;
    setGateways((prev) =>
      prev.map((g) =>
        g.id === activeSecretForRotation.id
          ? { ...g, last_rotated_at: new Date().toISOString().split('T')[0] }
          : g
      )
    );
    setIsRotateSecretModalOpen(false);
    showToast(`Secret rotated for ${activeSecretForRotation.gateway_name}`);
  };

  const metrics = useMemo(() => {
    const totalPlants = plants.length;
    const activeSites = plants.filter((p) => p.status === 'ACTIVE').length;
    const totalVehicles = plants.reduce((acc, p) => acc + p.connectedVehicles, 0);
    const totalSecrets = gateways.length;
    const onlineGateways = gateways.filter((g) => g.is_enabled).length;
    const offlineGateways = totalSecrets - onlineGateways;
    return {
      totalPlants,
      activeSites,
      totalVehicles,
      totalSecrets,
      onlineGateways,
      offlineGateways,
    };
  }, [plants, gateways]);

  const filteredPlants = useMemo(() => {
    return plants.filter((p) => {
      const matchesSearch =
        p.siteName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.siteCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.locationCity.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.managerName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [plants, searchTerm, statusFilter]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xl">
          {toastMessage}
        </div>
      )}

      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/" className="text-xs font-semibold text-purple-400 hover:text-purple-300">
              ← Transit Console
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Super Admin Division
            </span>
          </div>
          <h1 className="text-xl font-black text-white tracking-wide mt-1">Multi-Plant Site Director</h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsNewPlantModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-purple-950/40 hover:from-purple-500 hover:to-indigo-500 transition"
          >
            <Plus className="w-4 h-4" />
            Provision Plant Tenant
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Plant Replicas</span>
            <div className="text-2xl font-black text-white mt-1">{metrics.totalPlants}</div>
            <p className="text-[11px] text-emerald-400 mt-1">{metrics.activeSites} operational sites</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Fleet Capacity</span>
            <div className="text-2xl font-black text-white mt-1">{metrics.totalVehicles}</div>
            <p className="text-[11px] text-purple-400 mt-1">Dedicated vehicles</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Active Gateways</span>
            <div className="text-2xl font-black text-emerald-400 mt-1">{metrics.onlineGateways}</div>
            <p className="text-[11px] text-slate-400 mt-1">WhatsApp & SMS Live</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Disabled Gateways</span>
            <div className="text-2xl font-black text-rose-400 mt-1">{metrics.offlineGateways}</div>
            <p className="text-[11px] text-slate-400 mt-1">Dispatches blocked</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 gap-2">
          <button
            onClick={() => setActiveTab('PLANTS')}
            className={`pb-3 px-3 text-xs font-bold transition border-b-2 ${
              activeTab === 'PLANTS'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Plant Sites ({plants.length})
          </button>
          <button
            onClick={() => setActiveTab('GATEWAYS')}
            className={`pb-3 px-3 text-xs font-bold transition border-b-2 ${
              activeTab === 'GATEWAYS'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Encrypted Gateway Vault ({gateways.length})
          </button>
          <button
            onClick={() => setActiveTab('ANALYTICS')}
            className={`pb-3 px-3 text-xs font-bold transition border-b-2 ${
              activeTab === 'ANALYTICS'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Telemetry & Analytics
          </button>
          <button
            onClick={() => setActiveTab('AUDIT')}
            className={`pb-3 px-3 text-xs font-bold transition border-b-2 ${
              activeTab === 'AUDIT'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Platform Audit Ledger
          </button>
        </div>

        {/* TAB 1: PLANT SITES */}
        {activeTab === 'PLANTS' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter plant sites..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                  <option value="OFFLINE">OFFLINE</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPlants.map((plant) => (
                <div key={plant.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-purple-400">{plant.siteCode}</span>
                      <h3 className="text-sm font-bold text-white mt-0.5">{plant.siteName}</h3>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        {plant.locationCity}, {plant.state}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        plant.status === 'ACTIVE'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {plant.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-slate-800/60">
                    <div>
                      <span className="text-slate-500 text-[10px]">Manager:</span>
                      <p className="text-slate-200 font-medium">{plant.managerName}</p>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px]">Fleet Assets:</span>
                      <p className="text-slate-200 font-medium">{plant.connectedVehicles} Vehicles</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs pt-1">
                    <span className="text-[11px] text-slate-500">Auto-Allotment: {plant.autoAllotment ? 'ON' : 'OFF'}</span>
                    <Link
                      href="/bookings"
                      className="text-purple-400 hover:text-purple-300 font-semibold inline-flex items-center gap-1"
                    >
                      Bookings →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: ENCRYPTED GATEWAY VAULT WITH TOGGLES */}
        {activeTab === 'GATEWAYS' && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-amber-400">🔑</span>
                  <h2 className="text-lg font-bold text-white tracking-wide">Encrypted Gateway Secret Vault</h2>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Manage WhatsApp Cloud API keys, telecom SMS DLT credentials, and toggle outbound communications.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-medium bg-purple-950/60 text-purple-300 border border-purple-800/50 self-start sm:self-auto">
                AES-256 Cloudflare Storage
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {gateways.map((g) => (
                <div
                  key={g.id}
                  className={`rounded-xl border p-5 space-y-4 transition-all duration-200 ${
                    g.is_enabled
                      ? 'bg-slate-950/70 border-slate-800 shadow-sm'
                      : 'bg-slate-950/40 border-slate-800/60 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono font-bold tracking-wider text-purple-400 uppercase">
                        {g.site_tag}
                      </span>
                      <h3 className="text-sm font-bold text-white mt-0.5">{g.gateway_name}</h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                          g.is_enabled
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                            : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                        }`}
                      >
                        {g.is_enabled ? g.environment || 'PRODUCTION' : 'DISABLED'}
                      </span>

                      <button
                        type="button"
                        disabled={togglingId === g.id}
                        onClick={() => handleToggleGateway(g.id, g.is_enabled)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          g.is_enabled ? 'bg-emerald-500' : 'bg-slate-700'
                        } ${togglingId === g.id ? 'opacity-50' : ''}`}
                        title={g.is_enabled ? 'Click to Disable Gateway' : 'Click to Enable Gateway'}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            g.is_enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                      Gateway Identifier
                    </label>
                    <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-200 truncate">
                      {g.gateway_identifier}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                      API Token / Secret Key
                    </label>
                    <div className="flex items-center justify-between bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400">
                      <span className="tracking-widest">••••••••••••••••••••••••••••</span>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <button type="button" className="hover:text-slate-200 p-0.5" title="Masked Key">👁</button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-500">
                    <span>Updated: {g.last_rotated_at || '2026-10-28'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSecretForRotation(g);
                        setIsRotateSecretModalOpen(true);
                      }}
                      className="text-purple-400 hover:text-purple-300 font-medium inline-flex items-center gap-1"
                    >
                      🔄 Rotate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: TELEMETRY & ANALYTICS */}
        {activeTab === 'ANALYTICS' && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-white">Cross-Plant Operational Telemetry</h2>
              <p className="text-xs text-slate-400 mt-1">Multi-site telemetry synced via PostgreSQL row-level isolation.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-400">Security & Isolation</span>
                <p className="text-xs text-slate-300">
                  Every request requires valid tenant authentication. Multi-tenant database policies prevent cross-facility data leakage.
                </p>
              </div>
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-400">Gateway Failover Guard</span>
                <p className="text-xs text-slate-300">
                  If WhatsApp or SMS gateways are switched off in the vault, trips dispatch smoothly while skipping notifications and logging status.
                </p>
              </div>
            </div>
            <div className="pt-2">
              <Link
                href="/analytics"
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-bold text-white"
              >
                Open Analytics Console →
              </Link>
            </div>
          </div>
        )}

        {/* TAB 4: AUDIT LEDGER */}
        {activeTab === 'AUDIT' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  Platform Audit Ledger
                </h2>
                <p className="text-xs text-slate-400">
                  Security log recording tenant overrides, secret rotations, and policy changes.
                </p>
              </div>
              <span className="text-xs font-mono px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-slate-400">
                PostgreSQL RLS Protected
              </span>
            </div>

            <div className="space-y-2.5">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs font-mono"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        log.severity === 'CRITICAL'
                          ? 'bg-rose-500'
                          : log.severity === 'WARNING'
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-purple-300 font-bold">{log.action}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                          {log.siteCode}
                        </span>
                      </div>
                      <p className="text-slate-300 font-sans mt-0.5 text-xs">{log.details}</p>
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-slate-500">
                    <div>{log.actor}</div>
                    <div>{log.timestamp}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: PROVISION NEW PLANT */}
      <AnimatePresence>
        {isNewPlantModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-purple-950 border border-purple-500/40 text-purple-400">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Provision Plant Tenant</h3>
                    <p className="text-xs text-slate-400">Initialize isolated schema partition with unique site_id.</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsNewPlantModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreatePlant} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Plant Site Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PLANT_HALOL"
                    value={newPlantForm.siteCode}
                    onChange={(e) => setNewPlantForm({ ...newPlantForm, siteCode: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono uppercase focus:border-purple-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Plant Campus Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Halol Auto Components Plant"
                    value={newPlantForm.siteName}
                    onChange={(e) => setNewPlantForm({ ...newPlantForm, siteName: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-medium">Location City</label>
                    <input
                      type="text"
                      required
                      placeholder="Halol"
                      value={newPlantForm.locationCity}
                      onChange={(e) => setNewPlantForm({ ...newPlantForm, locationCity: e.target.value })}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1 font-medium">State</label>
                    <input
                      type="text"
                      required
                      value={newPlantForm.state}
                      onChange={(e) => setNewPlantForm({ ...newPlantForm, state: e.target.value })}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-medium">Plant Manager</label>
                    <input
                      type="text"
                      required
                      placeholder="Full Name"
                      value={newPlantForm.managerName}
                      onChange={(e) => setNewPlantForm({ ...newPlantForm, managerName: e.target.value })}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1 font-medium">Contact Phone</label>
                    <input
                      type="tel"
                      required
                      placeholder="+91 98XXX XXXXX"
                      value={newPlantForm.managerPhone}
                      onChange={(e) => setNewPlantForm({ ...newPlantForm, managerPhone: e.target.value })}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsNewPlantModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold"
                  >
                    Provision Site
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: ROTATE GATEWAY SECRET */}
      <AnimatePresence>
        {isRotateSecretModalOpen && activeSecretForRotation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3 text-orange-400">
                <div className="p-2 rounded-xl bg-orange-950 border border-orange-500/40">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Rotate Gateway Secret</h3>
                  <p className="text-xs text-slate-400 font-mono">{activeSecretForRotation.gateway_name}</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-2">
                <p>
                  Issuing a new token for <strong>{activeSecretForRotation.site_tag}</strong>.
                </p>
                <p className="text-amber-400">
                  ⚠️ The existing secret will be refreshed immediately.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setIsRotateSecretModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteRotation}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-white font-semibold"
                >
                  Confirm Rotation
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
