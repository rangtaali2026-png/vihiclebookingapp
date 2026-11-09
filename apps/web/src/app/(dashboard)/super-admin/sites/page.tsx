'use client';

import React, { useState, useMemo } from 'react';
import AppNavbar from '@/components/AppNavbar';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  KeyRound,
  Car,
  Wifi,
  WifiOff,
  Search,
  Bell,
  Plus,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldAlert,
  Download,
  Filter,
  CheckCircle2,
  Clock,
  MoreVertical,
  Activity,
  Layers,
  ChevronRight,
  TrendingUp,
  MapPin,
  ExternalLink,
  Lock,
  Radio,
  SlidersHorizontal,
  Calendar,
  X,
  UserCheck,
  Power
} from 'lucide-react';

// ============================================================================
// 1. TYPESCRIPT DATA CONTRACTS
// ============================================================================
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
  coordinates: { lat: number; lng: number };
}

export interface GatewaySecret {
  id: string;
  siteId: string;
  siteName: string;
  gatewayName: string;
  channel: GatewayChannel;
  gatewayIdentifier: string;
  apiSecret: string;
  environment: EnvironmentType;
  isEnabled: boolean;
  createdDate: string;
  lastUpdated: string;
  lastRotatedBy: string;
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

// ============================================================================
// 2. SEED MOCK DATA
// ============================================================================
const MOCK_PLANTS: PlantSite[] = [
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
    coordinates: { lat: 22.3072, lng: 73.1812 },
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
    coordinates: { lat: 21.7051, lng: 72.9959 },
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
    coordinates: { lat: 22.4707, lng: 70.0577 },
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
    coordinates: { lat: 21.1702, lng: 72.8311 },
  },
];

const MOCK_GATEWAY_SECRETS: GatewaySecret[] = [
  {
    id: 'gw-sec-01',
    siteId: '11111111-1111-1111-1111-111111111111',
    siteName: 'Vadodara Complex',
    gatewayName: 'Meta WhatsApp Cloud API',
    channel: 'WHATSAPP',
    gatewayIdentifier: '104928392019283',
    apiSecret: 'EAAG9z04ZA8qYBO87xK188mZBDyZARc2e4j84b72j84b29x',
    environment: 'PRODUCTION',
    isEnabled: true,
    createdDate: '2026-01-15',
    lastUpdated: '2026-10-28',
    lastRotatedBy: 'admin@planttransit.com',
  },
  {
    id: 'gw-sec-02',
    siteId: '11111111-1111-1111-1111-111111111111',
    siteName: 'Vadodara Complex',
    gatewayName: 'Airtel Telecom DLT Gateway',
    channel: 'SMS',
    gatewayIdentifier: 'PLNTRN',
    apiSecret: 'dlt_live_94821038471209384729104857201928',
    environment: 'PRODUCTION',
    isEnabled: true,
    createdDate: '2026-02-01',
    lastUpdated: '2026-09-14',
    lastRotatedBy: 'admin@planttransit.com',
  },
  {
    id: 'gw-sec-03',
    siteId: '22222222-2222-2222-2222-222222222222',
    siteName: 'Dahej Unit',
    gatewayName: 'Meta WhatsApp Cloud API',
    channel: 'WHATSAPP',
    gatewayIdentifier: '204928392019284',
    apiSecret: 'EAAG9z04ZA8qYBO22kK199mZBDyZARc99a84b72j84b33p',
    environment: 'PRODUCTION',
    isEnabled: true,
    createdDate: '2026-03-10',
    lastUpdated: '2026-10-12',
    lastRotatedBy: 'admin@planttransit.com',
  },
  {
    id: 'gw-sec-04',
    siteId: '33333333-3333-3333-3333-333333333333',
    siteName: 'Jamnagar Works',
    gatewayName: 'Resend Transactional SMTP',
    channel: 'EMAIL',
    gatewayIdentifier: 'transit-jamnagar@planttransit.com',
    apiSecret: 're_872xLqZp_9481kLmNoPqRsTuVwXyZ1234',
    environment: 'PRODUCTION',
    isEnabled: true,
    createdDate: '2026-04-05',
    lastUpdated: '2026-11-01',
    lastRotatedBy: 'admin@planttransit.com',
  },
  {
    id: 'gw-sec-05',
    siteId: '44444444-4444-4444-4444-444444444444',
    siteName: 'Hazira Yard',
    gatewayName: 'Jio Telecom SMS Engine',
    channel: 'SMS',
    gatewayIdentifier: 'HZTRN',
    apiSecret: 'dlt_test_33829104820194820194820194820194',
    environment: 'STAGING',
    isEnabled: false,
    createdDate: '2026-08-20',
    lastUpdated: '2026-10-02',
    lastRotatedBy: 'admin.surat@planttransit.com',
  },
];

const MOCK_AUDIT_LOGS: SiteAuditLog[] = [
  {
    id: 'aud-01',
    timestamp: '10 mins ago',
    action: 'SECRET_ROTATED',
    actor: 'admin@planttransit.com',
    siteCode: 'PLANT_VADODARA',
    details: 'Rotated Meta WhatsApp API token for Vadodara Complex.',
    severity: 'WARNING',
  },
  {
    id: 'aud-02',
    timestamp: '1 hour ago',
    action: 'AUTO_ALLOTMENT_TOGGLE',
    actor: 'supervisor.vadodara@planttransit.com',
    siteCode: 'PLANT_JAMNAGAR',
    details: 'Enabled automated vehicle assignment without admin gate.',
    severity: 'INFO',
  },
  {
    id: 'aud-03',
    timestamp: '5 hours ago',
    action: 'GATEWAY_TOGGLED_OFF',
    actor: 'System Daemon',
    siteCode: 'PLANT_SURAT',
    details: 'Jio SMS Gateway disabled by operator pending DLT template verification.',
    severity: 'CRITICAL',
  },
  {
    id: 'aud-04',
    timestamp: '1 day ago',
    action: 'NEW_SITE_PROVISIONED',
    actor: 'admin@planttransit.com',
    siteCode: 'PLANT_SURAT',
    details: 'Created tenant partition for Hazira Manufacturing Yard.',
    severity: 'INFO',
  },
];

// ============================================================================
// 3. MAIN COMPONENT
// ============================================================================
export default function SuperAdminSitesPage() {
  // Navigation & View State
  const [activeTab, setActiveTab] = useState<'PLANTS' | 'GATEWAYS' | 'ANALYTICS' | 'AUDIT'>('PLANTS');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SiteStatus>('ALL');

  // Plants & Gateways Data States
  const [plants, setPlants] = useState<PlantSite[]>(MOCK_PLANTS);
  const [gateways, setGateways] = useState<GatewaySecret[]>(MOCK_GATEWAY_SECRETS);
  const [selectedPlant, setSelectedPlant] = useState<PlantSite | null>(MOCK_PLANTS[0]);

  // Modals
  const [isNewPlantModalOpen, setIsNewPlantModalOpen] = useState(false);
  const [isRotateSecretModalOpen, setIsRotateSecretModalOpen] = useState(false);
  const [activeSecretForRotation, setActiveSecretForRotation] = useState<GatewaySecret | null>(null);

  // Form State for New Plant
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

  // Security UI State
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const toggleSecretReveal = (id: string) => {
    setRevealedSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopySecret = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast('Secret successfully copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Toggle Gateway Enabled / Disabled
  const handleToggleGateway = (id: string) => {
    setGateways((prev) =>
      prev.map((g) => {
        if (g.id === id) {
          const updatedState = !g.isEnabled;
          showToast(`${g.gatewayName} for ${g.siteName} is now ${updatedState ? 'ENABLED' : 'DISABLED'}`);
          return {
            ...g,
            isEnabled: updatedState,
            lastUpdated: 'Just now',
          };
        }
        return g;
      })
    );
  };

  // Create Plant Handler
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
      coordinates: { lat: 22.3, lng: 73.1 },
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

  // Rotate Secret Handler
  const handleExecuteRotation = () => {
    if (!activeSecretForRotation) return;
    const newMockSecret = `sec_rot_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;

    setGateways((prev) =>
      prev.map((g) =>
        g.id === activeSecretForRotation.id
          ? {
              ...g,
              apiSecret: newMockSecret,
              lastUpdated: 'Just now',
              lastRotatedBy: 'admin@planttransit.com',
            }
          : g
      )
    );

    setIsRotateSecretModalOpen(false);
    showToast(`Secret rotated successfully for ${activeSecretForRotation.gatewayName}`);
  };

  // KPI Calculations
  const metrics = useMemo(() => {
    const totalPlants = plants.length;
    const activeSites = plants.filter((p) => p.status === 'ACTIVE').length;
    const totalVehicles = plants.reduce((acc, p) => acc + p.connectedVehicles, 0);
    const totalSecrets = gateways.length;
    const onlineGateways = gateways.filter((g) => g.isEnabled).length;
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

  // Filtered Plants
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
    <div className="min-h-screen bg-smart-bg text-smart-navy flex flex-col font-sans">
      <AppNavbar />

      {/* Global Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl bg-white border border-smart-border text-smart-navy shadow-smart-lg"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-smart-cyan animate-pulse" />
            <span className="text-xs font-bold">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        
        {/* Header Section */}
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
              Multi-Plant Site Director & Gateway Vault
            </h1>
            <p className="text-xs sm:text-sm text-smart-muted mt-0.5">
              Provision plant partitions, configure site automation, and manage SMS / WhatsApp dispatch gateways.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => showToast('Syncing latest plant telemetry...')}
              className="p-2.5 rounded-xl bg-white border border-smart-border text-smart-muted hover:text-smart-navy shadow-smart-sm transition"
              title="Refresh Telemetry"
            >
              <RefreshCw className="w-4 h-4 hover:rotate-180 transition-transform duration-500" />
            </button>

            <button
              onClick={() => setIsNewPlantModalOpen(true)}
              className="smart-gradient-blue text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-smart-lg hover:opacity-95 transition flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Provision Plant Site</span>
            </button>
          </div>
        </div>

        {/* Top 6 KPI Summary Cards */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            {
              title: 'Total Plants',
              value: metrics.totalPlants,
              subtitle: 'Multi-Tenant Units',
              icon: Building2,
              accent: 'text-smart-blue',
              trend: '+1 this quarter',
            },
            {
              title: 'Active Sites',
              value: metrics.activeSites,
              subtitle: 'Healthy Operations',
              icon: CheckCircle2,
              accent: 'text-smart-success',
              trend: '100% online rate',
            },
            {
              title: 'Gateway Secrets',
              value: metrics.totalSecrets,
              subtitle: 'Encrypted Vault Keys',
              icon: KeyRound,
              accent: 'text-smart-warning',
              trend: 'AES-256 Storage',
            },
            {
              title: 'Fleet Vehicles',
              value: metrics.totalVehicles,
              subtitle: 'Real-time Linked',
              icon: Car,
              accent: 'text-smart-blue',
              trend: 'Cars, SUVs & Buses',
            },
            {
              title: 'Online Gateways',
              value: metrics.onlineGateways,
              subtitle: 'WhatsApp & SMS APIs',
              icon: Wifi,
              accent: 'text-smart-cyan',
              trend: 'Sub-40ms latency',
            },
            {
              title: 'Offline / Alert',
              value: metrics.offlineGateways,
              subtitle: 'Needs Review',
              icon: WifiOff,
              accent: 'text-smart-danger',
              trend: metrics.offlineGateways > 0 ? 'Action required' : 'Zero errors',
            },
          ].map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.title}
                className="smart-glass-card p-4 space-y-2 hover:shadow-smart-lg transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-wider text-smart-muted uppercase">
                    {kpi.title}
                  </span>
                  <div className={`p-1.5 rounded-lg bg-slate-50 ${kpi.accent}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-smart-navy">{kpi.value}</div>
                <div className="flex items-center justify-between pt-1 border-t border-smart-border text-[10px] text-smart-muted">
                  <span className="truncate">{kpi.subtitle}</span>
                  <span className="font-semibold text-smart-blue">{kpi.trend}</span>
                </div>
              </div>
            );
          })}
        </section>

        {/* Tab Selection Bar & Search */}
        <div className="smart-glass-card p-3 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            {[
              { key: 'PLANTS', label: 'Plants & Sites', icon: Building2 },
              { key: 'GATEWAYS', label: 'Encrypted Gateway Vault', icon: KeyRound },
              { key: 'ANALYTICS', label: 'Fleet Telemetry', icon: Activity },
              { key: 'AUDIT', label: 'Security Audit Logs', icon: ShieldAlert },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-50 text-smart-blue border border-blue-200 shadow-sm'
                      : 'text-smart-muted hover:text-smart-navy hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-smart-muted absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search plants, secrets, gateways..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-smart-border rounded-xl pl-9 pr-3 py-2 text-xs text-smart-navy placeholder-slate-400 focus:bg-white focus:border-smart-blue focus:outline-none transition"
            />
          </div>
        </div>

        {/* ===================================================================
            TAB 1: PLANTS & SITES MANAGEMENT TABLE + DETAIL DRAWER
        =================================================================== */}
        {activeTab === 'PLANTS' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-4">
              <div className="smart-glass-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-base font-bold text-smart-navy flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-smart-blue" />
                      <span>Industrial Plant Partitions</span>
                    </h2>
                    <p className="text-xs text-smart-muted">
                      Row-Level Security isolated manufacturing campuses & local transport setups.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center p-1 rounded-xl bg-slate-100 border border-smart-border text-xs">
                      {(['ALL', 'ACTIVE', 'MAINTENANCE'] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => setStatusFilter(st)}
                          className={`px-3 py-1 rounded-lg font-bold transition ${
                            statusFilter === st
                              ? 'bg-white text-smart-blue shadow-sm'
                              : 'text-smart-muted hover:text-smart-navy'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => showToast('Exporting Plants Master (CSV)...')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-smart-border text-smart-navy text-xs font-semibold shadow-smart-sm transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-smart-border">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50/80 text-smart-muted border-b border-smart-border uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3 px-4 font-bold">Plant & Location</th>
                        <th className="py-3 px-4 font-bold">Plant Code</th>
                        <th className="py-3 px-4 font-bold">Site Manager</th>
                        <th className="py-3 px-4 font-bold text-center">Vehicles</th>
                        <th className="py-3 px-4 font-bold text-center">Auto-Allot</th>
                        <th className="py-3 px-4 font-bold text-center">Status</th>
                        <th className="py-3 px-4 font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-smart-border text-smart-navy">
                      {filteredPlants.map((plant) => {
                        const isSelected = selectedPlant?.id === plant.id;
                        return (
                          <tr
                            key={plant.id}
                            onClick={() => setSelectedPlant(plant)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-blue-50/60 font-semibold'
                                : 'hover:bg-slate-50/60'
                            }`}
                          >
                            <td className="py-3 px-4">
                              <div className="font-bold text-smart-navy flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-smart-blue" />
                                {plant.siteName}
                              </div>
                              <div className="text-[11px] text-smart-muted flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 text-smart-cyan" />
                                {plant.locationCity}, {plant.state}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-slate-100 border border-smart-border text-smart-blue font-bold">
                                {plant.siteCode}
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              <div className="text-smart-navy font-semibold">{plant.managerName}</div>
                              <div className="text-[11px] text-smart-muted font-mono">{plant.managerPhone}</div>
                            </td>

                            <td className="py-3 px-4 text-center">
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-smart-border font-bold text-smart-navy">
                                <Car className="w-3 h-3 text-smart-blue" />
                                {plant.connectedVehicles}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-center">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  plant.autoAllotment
                                    ? 'bg-emerald-50 text-smart-success border-emerald-200'
                                    : 'bg-amber-50 text-smart-warning border-amber-200'
                                }`}
                              >
                                {plant.autoAllotment ? 'ENABLED' : 'MANUAL'}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-center">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  plant.status === 'ACTIVE'
                                    ? 'bg-emerald-50 text-smart-success border-emerald-200'
                                    : 'bg-red-50 text-smart-danger border-red-200'
                                }`}
                              >
                                {plant.status}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPlant(plant);
                                  showToast(`Selected ${plant.siteCode} for telemetry inspection.`);
                                }}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-smart-navy transition"
                              >
                                <ChevronRight className="w-4 h-4 text-smart-blue" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Plant Detail Drawer */}
            <div className="space-y-6">
              {selectedPlant ? (
                <div className="smart-glass-card p-5 space-y-5">
                  <div className="flex items-center justify-between border-b border-smart-border pb-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-smart-blue tracking-wider">
                        Tenant Overview
                      </span>
                      <h3 className="text-base font-black text-smart-navy">{selectedPlant.siteName}</h3>
                    </div>
                    <span className="text-xs font-mono px-2 py-1 rounded bg-slate-100 border border-smart-border text-smart-blue font-bold">
                      {selectedPlant.siteCode}
                    </span>
                  </div>

                  {/* Simulated GPS Geofenced View */}
                  <div className="relative h-44 rounded-2xl overflow-hidden border border-smart-border bg-slate-50 flex flex-col items-center justify-center p-4">
                    <div className="w-12 h-12 rounded-2xl smart-gradient-blue flex items-center justify-center text-white shadow-smart-lg mb-2 animate-bounce">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-bold text-smart-navy">
                      {selectedPlant.locationCity}, {selectedPlant.state}
                    </p>
                    <p className="text-[10px] text-smart-muted font-mono">
                      GPS: {selectedPlant.coordinates.lat} N, {selectedPlant.coordinates.lng} E
                    </p>
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-white border border-smart-border text-[9px] text-smart-success font-bold">
                      Geofence Active
                    </div>
                  </div>

                  {/* Plant Quick Metrics */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 border border-smart-border">
                      <span className="text-smart-muted text-[11px] font-bold">Fleet Headroom</span>
                      <p className="text-base font-black text-smart-navy mt-0.5">
                        {selectedPlant.connectedVehicles} Vehicles
                      </p>
                      <span className="text-[10px] text-smart-success font-bold">
                        {selectedPlant.totalCapacity} Total Seats
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-smart-border">
                      <span className="text-smart-muted text-[11px] font-bold">Approval Policy</span>
                      <p className="text-base font-black text-smart-navy mt-0.5">
                        {selectedPlant.requireApproval ? 'Admin Gate' : 'Direct Allot'}
                      </p>
                      <span className="text-[10px] text-smart-blue font-mono">
                        Auto: {selectedPlant.autoAllotment ? 'Active' : 'Off'}
                      </span>
                    </div>
                  </div>

                  {/* Interactive Configuration Switches */}
                  <div className="pt-2 border-t border-smart-border space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-smart-navy font-bold">Auto Vehicle Allotment Heuristic</span>
                      <button
                        onClick={() => {
                          setPlants((prev) =>
                            prev.map((p) =>
                              p.id === selectedPlant.id ? { ...p, autoAllotment: !p.autoAllotment } : p
                            )
                          );
                          setSelectedPlant((prev) => (prev ? { ...prev, autoAllotment: !prev.autoAllotment } : null));
                          showToast(`Toggled Auto-Allotment for ${selectedPlant.siteCode}`);
                        }}
                        className={`w-11 h-6 rounded-full transition-colors relative ${
                          selectedPlant.autoAllotment ? 'bg-smart-blue' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                            selectedPlant.autoAllotment ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-smart-navy font-bold">Require Transport Admin Approval</span>
                      <button
                        onClick={() => {
                          setPlants((prev) =>
                            prev.map((p) =>
                              p.id === selectedPlant.id ? { ...p, requireApproval: !p.requireApproval } : p
                            )
                          );
                          setSelectedPlant((prev) => (prev ? { ...prev, requireApproval: !prev.requireApproval } : null));
                          showToast(`Toggled Approval Gate for ${selectedPlant.siteCode}`);
                        }}
                        className={`w-11 h-6 rounded-full transition-colors relative ${
                          selectedPlant.requireApproval ? 'bg-smart-blue' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                            selectedPlant.requireApproval ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="smart-glass-card p-8 text-center text-xs text-smart-muted">
                  Select a plant from the table to view real-time fleet configuration.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 2: ENCRYPTED GATEWAY SECRETS & API KEYS VAULT (WITH ENABLE/DISABLE)
        =================================================================== */}
        {activeTab === 'GATEWAYS' && (
          <div className="smart-glass-card p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-smart-border pb-4">
              <div>
                <h2 className="text-base font-bold text-smart-navy flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-smart-blue" />
                  <span>Encrypted Gateway Secret Vault</span>
                </h2>
                <p className="text-xs text-smart-muted">
                  Manage WhatsApp Cloud API keys, telecom SMS DLT credentials, and webhook signing secrets with individual toggles.
                </p>
              </div>

              <span className="text-xs font-mono text-smart-blue bg-blue-50 border border-blue-200 px-3 py-1 rounded-xl font-bold">
                AES-256 Cloudflare Storage
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {gateways.map((gw) => {
                const isRevealed = revealedSecrets[gw.id] || false;
                const isCopied = copiedId === gw.id;

                return (
                  <div
                    key={gw.id}
                    className={`p-5 rounded-2xl border transition-all space-y-4 shadow-smart-sm ${
                      gw.isEnabled
                        ? 'bg-white border-smart-border'
                        : 'bg-slate-50/80 border-slate-200 opacity-75'
                    }`}
                  >
                    {/* Header Strip with Enable/Disable Button */}
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-smart-blue font-bold">
                          {gw.siteName}
                        </span>
                        <h4 className="text-sm font-black text-smart-navy mt-0.5">{gw.gatewayName}</h4>
                      </div>

                      {/* Interactive Enable / Disable Toggle Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleGateway(gw.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
                          gw.isEnabled
                            ? 'bg-emerald-50 text-smart-success border-emerald-200 hover:bg-red-50 hover:text-smart-danger hover:border-red-200'
                            : 'bg-slate-200 text-slate-600 border-slate-300 hover:bg-emerald-50 hover:text-smart-success hover:border-emerald-200'
                        }`}
                        title={gw.isEnabled ? 'Click to Disable Gateway' : 'Click to Enable Gateway'}
                      >
                        <Power className="w-3 h-3" />
                        <span>{gw.isEnabled ? 'ACTIVE' : 'DISABLED'}</span>
                      </button>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <span className="text-[10px] text-smart-muted uppercase font-bold">Gateway Identifier</span>
                      <div className="font-mono text-[11px] p-2 rounded-xl bg-slate-50 border border-smart-border text-smart-navy truncate">
                        {gw.gatewayIdentifier}
                      </div>
                    </div>

                    {/* Secret Mask / Reveal Control */}
                    <div className="space-y-1.5 text-xs">
                      <span className="text-[10px] text-smart-muted uppercase font-bold">API Token / Secret Key</span>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 font-mono text-[11px] p-2 rounded-xl bg-slate-50 border border-smart-border text-smart-blue truncate">
                          {isRevealed ? gw.apiSecret : '••••••••••••••••••••••••••••••••'}
                        </div>
                        <button
                          onClick={() => toggleSecretReveal(gw.id)}
                          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-smart-muted hover:text-smart-navy transition"
                          title={isRevealed ? 'Mask Secret' : 'Reveal Secret'}
                        >
                          {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleCopySecret(gw.id, gw.apiSecret)}
                          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-smart-muted hover:text-smart-navy transition"
                          title="Copy Token"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-smart-success" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Footer Meta & Rotate Action */}
                    <div className="pt-3 border-t border-smart-border flex items-center justify-between text-[11px] text-smart-muted">
                      <span>Updated: {gw.lastUpdated}</span>
                      <button
                        onClick={() => {
                          setActiveSecretForRotation(gw);
                          setIsRotateSecretModalOpen(true);
                        }}
                        className="text-smart-blue hover:underline font-bold flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Rotate</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 3: FLEET TELEMETRY & ANALYTICS CHARTS
        =================================================================== */}
        {activeTab === 'ANALYTICS' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Vehicle Booking Velocity */}
            <div className="smart-glass-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-smart-navy flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-smart-blue" />
                    <span>Trip Booking Velocity by Plant</span>
                  </h3>
                  <p className="text-xs text-smart-muted">Daily transit reservations processed across sites.</p>
                </div>
                <span className="text-[10px] font-mono text-smart-muted bg-slate-100 px-2.5 py-1 rounded-md border border-smart-border font-bold">
                  Last 7 Days
                </span>
              </div>

              <div className="h-56 flex items-end gap-3 pt-6 pb-2 border-b border-smart-border">
                {[
                  { day: 'Mon', vdr: 84, bh: 45, jam: 110 },
                  { day: 'Tue', vdr: 92, bh: 52, jam: 125 },
                  { day: 'Wed', vdr: 105, bh: 58, jam: 130 },
                  { day: 'Thu', vdr: 115, bh: 64, jam: 142 },
                  { day: 'Fri', vdr: 130, bh: 72, jam: 165 },
                  { day: 'Sat', vdr: 70, bh: 35, jam: 90 },
                  { day: 'Sun', vdr: 40, bh: 20, jam: 60 },
                ].map((item) => (
                  <div key={item.day} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <div className="w-full flex items-end justify-center gap-1 h-44">
                      <div
                        style={{ height: `${(item.vdr / 165) * 100}%` }}
                        className="w-2.5 bg-smart-navy rounded-t-sm hover:opacity-80 transition-all"
                        title={`Vadodara: ${item.vdr}`}
                      />
                      <div
                        style={{ height: `${(item.bh / 165) * 100}%` }}
                        className="w-2.5 bg-smart-blue rounded-t-sm hover:opacity-80 transition-all"
                        title={`Bharuch: ${item.bh}`}
                      />
                      <div
                        style={{ height: `${(item.jam / 165) * 100}%` }}
                        className="w-2.5 bg-smart-cyan rounded-t-sm hover:opacity-80 transition-all"
                        title={`Jamnagar: ${item.jam}`}
                      />
                    </div>
                    <span className="text-[10px] text-smart-muted font-mono">{item.day}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-center gap-6 text-xs text-smart-navy pt-2 font-semibold">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-smart-navy" />
                  Vadodara Complex
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-smart-blue" />
                  Dahej Unit
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-smart-cyan" />
                  Jamnagar Works
                </span>
              </div>
            </div>

            {/* Chart 2: Gateway Health & Egress Latency */}
            <div className="smart-glass-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-smart-navy flex items-center gap-2">
                    <Activity className="w-4 h-4 text-smart-cyan" />
                    <span>Messaging Gateway Dispatch Latency</span>
                  </h3>
                  <p className="text-xs text-smart-muted">Cloudflare Queue external API execution speed.</p>
                </div>
                <span className="text-[10px] font-mono text-smart-success bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 font-bold">
                  99.98% Deliverability
                </span>
              </div>

              <div className="space-y-4 pt-2">
                {[
                  { name: 'Meta WhatsApp Cloud API (Vadodara)', latency: '124 ms', health: 99.8, color: 'bg-smart-success' },
                  { name: 'Airtel Telecom DLT SMS (Vadodara)', latency: '310 ms', health: 99.4, color: 'bg-smart-blue' },
                  { name: 'Meta WhatsApp Cloud API (Dahej)', latency: '142 ms', health: 99.6, color: 'bg-smart-success' },
                  { name: 'Resend Transactional SMTP (Jamnagar)', latency: '88 ms', health: 100.0, color: 'bg-smart-cyan' },
                  { name: 'Jio Telecom SMS Engine (Hazira)', latency: 'Disabled / Inactive', health: 0.0, color: 'bg-smart-danger' },
                ].map((stat) => (
                  <div key={stat.name} className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-smart-navy font-semibold">{stat.name}</span>
                      <span className="font-mono text-smart-muted">{stat.latency}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden border border-smart-border">
                      <div style={{ width: `${stat.health}%` }} className={`h-full ${stat.color} rounded-full`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 4: ENTERPRISE AUDIT LOGS
        =================================================================== */}
        {activeTab === 'AUDIT' && (
          <div className="smart-glass-card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-smart-border pb-4">
              <div>
                <h2 className="text-base font-bold text-smart-navy flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-smart-danger" />
                  <span>Immutable Platform Audit Ledger</span>
                </h2>
                <p className="text-xs text-smart-muted">
                  Cryptographically immutable security log recording tenant overrides, secret rotations, and policy changes.
                </p>
              </div>

              <span className="text-xs font-mono px-3 py-1 rounded-xl bg-slate-100 border border-smart-border text-smart-muted font-bold">
                PostgreSQL RLS Protected
              </span>
            </div>

            <div className="space-y-2.5">
              {MOCK_AUDIT_LOGS.map((log) => (
                <div
                  key={log.id}
                  className="p-3.5 rounded-xl bg-slate-50 border border-smart-border flex flex-wrap items-center justify-between gap-4 text-xs font-mono"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        log.severity === 'CRITICAL'
                          ? 'bg-smart-danger animate-ping'
                          : log.severity === 'WARNING'
                          ? 'bg-smart-warning'
                          : 'bg-smart-success'
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-smart-navy font-bold">{log.action}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-smart-blue border border-smart-border font-bold">
                          {log.siteCode}
                        </span>
                      </div>
                      <p className="text-smart-muted font-sans mt-0.5 text-xs">{log.details}</p>
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-smart-muted">
                    <div>{log.actor}</div>
                    <div>{log.timestamp}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>

      {/* =====================================================================
          MODAL 1: PROVISION NEW PLANT REPLICA
      ===================================================================== */}
      <AnimatePresence>
        {isNewPlantModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-smart-navy/40 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-white border border-smart-border rounded-2xl p-6 shadow-smart-lg space-y-5"
            >
              <div className="flex items-center justify-between border-b border-smart-border pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-50 text-smart-blue">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-smart-navy">Provision Plant Tenant</h3>
                    <p className="text-xs text-smart-muted">Initialize isolated schema partition with unique site_id.</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsNewPlantModalOpen(false)}
                  className="p-1 rounded-lg text-smart-muted hover:text-smart-navy"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreatePlant} className="space-y-4 text-xs">
                <div>
                  <label className="block text-smart-navy mb-1 font-bold">Plant Site Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PLANT_HALOL"
                    value={newPlantForm.siteCode}
                    onChange={(e) => setNewPlantForm({ ...newPlantForm, siteCode: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-smart-border text-smart-navy font-mono uppercase focus:border-smart-blue focus:bg-white focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-smart-navy mb-1 font-bold">Plant Campus Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Halol Auto Components Plant"
                    value={newPlantForm.siteName}
                    onChange={(e) => setNewPlantForm({ ...newPlantForm, siteName: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-smart-border text-smart-navy focus:border-smart-blue focus:bg-white focus:outline-none transition"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-smart-navy mb-1 font-bold">Location City</label>
                    <input
                      type="text"
                      required
                      placeholder="Halol"
                      value={newPlantForm.locationCity}
                      onChange={(e) => setNewPlantForm({ ...newPlantForm, locationCity: e.target.value })}
                      className="w-full p-2.5 rounded-xl bg-slate-50 border border-smart-border text-smart-navy focus:border-smart-blue focus:bg-white focus:outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="block text-smart-navy mb-1 font-bold">State</label>
                    <input
                      type="text"
                      required
                      value={newPlantForm.state}
                      onChange={(e) => setNewPlantForm({ ...newPlantForm, state: e.target.value })}
                      className="w-full p-2.5 rounded-xl bg-slate-50 border border-smart-border text-smart-navy focus:border-smart-blue focus:bg-white focus:outline-none transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-smart-navy mb-1 font-bold">Plant Manager</label>
                    <input
                      type="text"
                      required
                      placeholder="Full Name"
                      value={newPlantForm.managerName}
                      onChange={(e) => setNewPlantForm({ ...newPlantForm, managerName: e.target.value })}
                      className="w-full p-2.5 rounded-xl bg-slate-50 border border-smart-border text-smart-navy focus:border-smart-blue focus:bg-white focus:outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="block text-smart-navy mb-1 font-bold">Contact Phone</label>
                    <input
                      type="tel"
                      required
                      placeholder="+91 98XXX XXXXX"
                      value={newPlantForm.managerPhone}
                      onChange={(e) => setNewPlantForm({ ...newPlantForm, managerPhone: e.target.value })}
                      className="w-full p-2.5 rounded-xl bg-slate-50 border border-smart-border text-smart-navy font-mono focus:border-smart-blue focus:bg-white focus:outline-none transition"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-smart-border">
                  <span className="text-smart-navy font-bold">Enable Automated Allotment Heuristic</span>
                  <input
                    type="checkbox"
                    checked={newPlantForm.autoAllotment}
                    onChange={(e) => setNewPlantForm({ ...newPlantForm, autoAllotment: e.target.checked })}
                    className="w-4 h-4 accent-smart-blue rounded"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-smart-border">
                  <button
                    type="button"
                    onClick={() => setIsNewPlantModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-smart-muted hover:text-smart-navy font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="smart-gradient-blue text-white px-5 py-2.5 rounded-xl font-bold shadow-smart-lg hover:opacity-95 transition"
                  >
                    Provision Site
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =====================================================================
          MODAL 2: ROTATE GATEWAY SECRET
      ===================================================================== */}
      <AnimatePresence>
        {isRotateSecretModalOpen && activeSecretForRotation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-smart-navy/40 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white border border-smart-border rounded-2xl p-6 shadow-smart-lg space-y-4"
            >
              <div className="flex items-center gap-3 text-smart-warning">
                <div className="p-2 rounded-xl bg-amber-50 border border-amber-200">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                </div>
                <div>
                  <h3 className="text-base font-black text-smart-navy">Rotate Gateway Secret</h3>
                  <p className="text-xs text-smart-muted font-mono">{activeSecretForRotation.gatewayName}</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-smart-border text-xs text-smart-navy space-y-2">
                <p>
                  You are about to issue a new cryptographic token for <strong>{activeSecretForRotation.siteName}</strong>.
                </p>
                <p className="text-smart-danger font-semibold">
                  ⚠️ The current key will be invalidated immediately across Cloudflare Queue dispatchers.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-smart-border text-xs">
                <button
                  type="button"
                  onClick={() => setIsRotateSecretModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-smart-muted hover:text-smart-navy font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteRotation}
                  className="px-5 py-2.5 rounded-xl bg-smart-danger text-white font-bold shadow-smart-lg hover:opacity-95 transition"
                >
                  Confirm & Invalidate Old Key
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
