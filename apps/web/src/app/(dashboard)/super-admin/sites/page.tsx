'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
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
  UserCheck
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
  gatewayIdentifier: string; // Phone ID, Sender ID, or Client ID
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
// 2. MOCK SEED DATA (ALIGNED WITH SYSTEM SEED FILES)
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
    lastRotatedBy: 'superadmin@company.com',
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
    lastRotatedBy: 'superadmin@company.com',
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
    lastRotatedBy: 'superadmin@company.com',
  },
  {
    id: 'gw-sec-04',
    siteId: '33333333-3333-3333-3333-333333333333',
    siteName: 'Jamnagar Works',
    gatewayName: 'Resend Transactional SMTP',
    channel: 'EMAIL',
    gatewayIdentifier: 'transit-jamnagar@plant-logistics.company.com',
    apiSecret: 're_872xLqZp_9481kLmNoPqRsTuVwXyZ1234',
    environment: 'PRODUCTION',
    isEnabled: true,
    createdDate: '2026-04-05',
    lastUpdated: '2026-11-01',
    lastRotatedBy: 'superadmin@company.com',
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
    lastRotatedBy: 'admin.surat@company.com',
  },
];

const MOCK_AUDIT_LOGS: SiteAuditLog[] = [
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

  // Modals & Drawers
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

  // Toast Helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Toggle Secret Masking
  const toggleSecretReveal = (id: string) => {
    setRevealedSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Clipboard Handler
  const handleCopySecret = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast('Secret successfully copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
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
              lastRotatedBy: 'superadmin@company.com',
            }
          : g
      )
    );

    setIsRotateSecretModalOpen(false);
    showToast(`Secret rotated for ${activeSecretForRotation.gatewayName}`);
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-purple-600 selection:text-white">
      {/* =====================================================================
          GLOBAL TOAST NOTIFICATION
      ===================================================================== */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3 rounded-xl bg-slate-900/90 backdrop-blur-xl border border-purple-500/40 text-white shadow-2xl shadow-purple-950/50"
          >
            <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-sm font-medium">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* =====================================================================
          HEADER SECTION (WITH SPANDAN IT BRANDING)
      ===================================================================== */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/80 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          {/* Logo Container with 3D Gloss Accent */}
          <div className="flex items-center gap-3.5 group cursor-pointer">
            <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-900/80 via-slate-900 to-orange-950/60 p-1.5 border border-purple-500/30 shadow-lg shadow-purple-950/40 group-hover:border-orange-500/50 transition-all duration-300">
              <Image
                src="/Spandan IT.jpg"
                alt="Spandan IT Peripherals"
                width={40}
                height={40}
                className="w-full h-full object-contain rounded-xl"
              />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-slate-950 rounded-full" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold bg-gradient-to-r from-purple-400 via-orange-400 to-amber-300 bg-clip-text text-transparent">
                  Spandan IT
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/40 text-purple-300">
                  Super Admin
                </span>
              </div>
              <h1 className="text-xs text-slate-400 font-medium">Plant & Gateway Governance Engine</h1>
            </div>
          </div>

          <div className="hidden lg:flex items-center h-6 w-px bg-slate-800" />

          {/* Search Bar */}
          <div className="relative hidden md:block w-80">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search plants, secrets, gateways, cities..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-slate-900/60 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20 transition-all"
            />
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => showToast('Syncing latest plant telemetry...')}
            className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all"
            title="Refresh Telemetry"
          >
            <RefreshCw className="w-4 h-4 hover:rotate-180 transition-transform duration-500" />
          </button>

          <button
            className="relative p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full animate-ping" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full" />
          </button>

          <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-orange-500 flex items-center justify-center font-bold text-xs text-white shadow-md">
              SA
            </div>
            <div className="hidden xl:block text-left">
              <p className="text-xs font-semibold text-slate-200">Enterprise Admin</p>
              <p className="text-[10px] text-slate-400 font-mono">root@spandan-it.in</p>
            </div>
          </div>
        </div>
      </header>

      {/* =====================================================================
          SUB-HEADER CONTROLS & NAVIGATION TABS
      ===================================================================== */}
      <div className="px-6 py-4 bg-slate-900/40 border-b border-slate-800/60 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {(
            [
              { key: 'PLANTS', label: 'Plants & Sites', icon: Building2 },
              { key: 'GATEWAYS', label: 'Gateway Secrets', icon: KeyRound },
              { key: 'ANALYTICS', label: 'Fleet Telemetry', icon: Activity },
              { key: 'AUDIT', label: 'Security Audit Logs', icon: ShieldAlert },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-600 to-orange-500 text-white shadow-lg shadow-purple-950/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsNewPlantModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-purple-600 hover:from-purple-500 to-purple-700 border border-purple-400/30 shadow-lg shadow-purple-950/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            Provision Plant Site
          </button>
        </div>
      </div>

      {/* =====================================================================
          MAIN DASHBOARD BODY
      ===================================================================== */}
      <main className="flex-1 p-6 space-y-6 max-w-[1720px] w-full mx-auto">
        {/* ===================================================================
            KPI SUMMARY CARDS (3D GLASSMORPHIC CARDS)
        =================================================================== */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            {
              title: 'Total Plants',
              value: metrics.totalPlants,
              subtitle: 'Multi-Tenant Units',
              icon: Building2,
              gradient: 'from-purple-900/50 via-slate-900 to-slate-950',
              accent: 'text-purple-400',
              border: 'border-purple-500/30',
              trend: '+1 this quarter',
            },
            {
              title: 'Active Sites',
              value: metrics.activeSites,
              subtitle: 'Healthy Operations',
              icon: CheckCircle2,
              gradient: 'from-emerald-950/50 via-slate-900 to-slate-950',
              accent: 'text-emerald-400',
              border: 'border-emerald-500/30',
              trend: '100% online rate',
            },
            {
              title: 'Gateway Secrets',
              value: metrics.totalSecrets,
              subtitle: 'Encrypted Vault Keys',
              icon: KeyRound,
              gradient: 'from-orange-950/50 via-slate-900 to-slate-950',
              accent: 'text-orange-400',
              border: 'border-orange-500/30',
              trend: 'HMAC / Meta Tokens',
            },
            {
              title: 'Fleet Vehicles',
              value: metrics.totalVehicles,
              subtitle: 'Real-time Linked',
              icon: Car,
              gradient: 'from-blue-950/50 via-slate-900 to-slate-950',
              accent: 'text-blue-400',
              border: 'border-blue-500/30',
              trend: 'Cars, SUVs & Buses',
            },
            {
              title: 'Online Gateways',
              value: metrics.onlineGateways,
              subtitle: 'WhatsApp & SMS APIs',
              icon: Wifi,
              gradient: 'from-teal-950/50 via-slate-900 to-slate-950',
              accent: 'text-teal-400',
              border: 'border-teal-500/30',
              trend: 'Sub-40ms latency',
            },
            {
              title: 'Offline / Alert',
              value: metrics.offlineGateways,
              subtitle: 'Needs Review',
              icon: WifiOff,
              gradient: 'from-rose-950/50 via-slate-900 to-slate-950',
              accent: 'text-rose-400',
              border: 'border-rose-500/30',
              trend: metrics.offlineGateways > 0 ? '1 action pending' : 'Zero errors',
            },
          ].map((kpi, idx) => {
            const Icon = kpi.icon;
            return (
              <motion.div
                key={kpi.title}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br ${kpi.gradient} border ${kpi.border} shadow-xl shadow-black/40 hover:border-slate-600 transition-all duration-300 group`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                    {kpi.title}
                  </span>
                  <div className={`p-2 rounded-xl bg-slate-900/90 border border-slate-800 ${kpi.accent} group-hover:scale-110 transition-transform`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-white tracking-tight">{kpi.value}</div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
                  <span className="text-[10px] text-slate-400 truncate">{kpi.subtitle}</span>
                  <span className="text-[10px] font-medium text-slate-300 font-mono">{kpi.trend}</span>
                </div>
              </motion.div>
            );
          })}
        </section>

        {/* ===================================================================
            TAB 1: PLANTS & SITES MANAGEMENT TABLE + DETAIL DRAWER
        =================================================================== */}
        {activeTab === 'PLANTS' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Table Section (2 Columns on XL) */}
            <div className="xl:col-span-2 space-y-4">
              <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 shadow-2xl backdrop-blur-xl">
                {/* Table Filters & Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-purple-400" />
                      Industrial Plant Partitions
                    </h2>
                    <p className="text-xs text-slate-400">
                      Row-Level Security isolated manufacturing campuses & local transport setups.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Status Filter */}
                    <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                      {(['ALL', 'ACTIVE', 'MAINTENANCE'] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => setStatusFilter(st)}
                          className={`px-3 py-1 rounded-lg font-medium transition-all ${
                            statusFilter === st
                              ? 'bg-purple-900/70 text-purple-300 border border-purple-500/40 shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    {/* Export CSV */}
                    <button
                      onClick={() => showToast('Exporting Plants Master (CSV)...')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export
                    </button>
                  </div>
                </div>

                {/* Table Container */}
                <div className="overflow-x-auto rounded-xl border border-slate-800/80">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold tracking-wider uppercase text-[10px]">
                        <th className="py-3 px-4">Plant & Location</th>
                        <th className="py-3 px-4">Plant Code</th>
                        <th className="py-3 px-4">Site Manager</th>
                        <th className="py-3 px-4 text-center">Vehicles</th>
                        <th className="py-3 px-4 text-center">Auto-Allot</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {filteredPlants.map((plant) => {
                        const isSelected = selectedPlant?.id === plant.id;
                        return (
                          <tr
                            key={plant.id}
                            onClick={() => setSelectedPlant(plant)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-purple-950/30 border-l-2 border-l-orange-500'
                                : 'hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-100 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-purple-400" />
                                {plant.siteName}
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 text-slate-500" />
                                {plant.locationCity}, {plant.state}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-purple-300">
                                {plant.siteCode}
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              <div className="text-slate-200 font-medium">{plant.managerName}</div>
                              <div className="text-[11px] text-slate-400 font-mono">{plant.managerPhone}</div>
                            </td>

                            <td className="py-3 px-4 text-center">
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 font-semibold text-slate-200">
                                <Car className="w-3 h-3 text-blue-400" />
                                {plant.connectedVehicles}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-center">
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  plant.autoAllotment
                                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                                }`}
                              >
                                {plant.autoAllotment ? 'ENABLED' : 'MANUAL'}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-center">
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  plant.status === 'ACTIVE'
                                    ? 'bg-teal-950/80 text-teal-300 border border-teal-500/40'
                                    : 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
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
                                  showToast(`Selected ${plant.siteCode} for telemetry.`);
                                }}
                                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all"
                              >
                                <ChevronRight className="w-4 h-4" />
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

            {/* Plant Detail & Location Map Panel (1 Column on XL) */}
            <div className="space-y-6">
              {selectedPlant ? (
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-5 backdrop-blur-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-orange-400 tracking-wider font-semibold">
                        Tenant Overview
                      </span>
                      <h3 className="text-base font-bold text-white">{selectedPlant.siteName}</h3>
                    </div>
                    <span className="text-xs font-mono px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300">
                      {selectedPlant.siteCode}
                    </span>
                  </div>

                  {/* Simulated Map View with 3D GPS Points */}
                  <div className="relative h-44 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex flex-col items-center justify-center p-4">
                    <div className="absolute inset-0 bg-[radial-gradient(#6B21A8_1px,transparent_1px)] [background-size:16px_16px] opacity-25" />
                    <div className="relative z-10 flex flex-col items-center text-center">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-orange-500 flex items-center justify-center text-white shadow-xl shadow-purple-950/60 mb-2 animate-bounce">
                        <MapPin className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-semibold text-slate-200">
                        {selectedPlant.locationCity}, {selectedPlant.state}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        GPS: {selectedPlant.coordinates.lat} N, {selectedPlant.coordinates.lng} E
                      </p>
                    </div>

                    <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-slate-900/90 border border-slate-800 text-[10px] text-slate-400 font-mono">
                      Real-time Geofenced
                    </div>
                  </div>

                  {/* Plant Quick Metrics */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 text-[11px]">Fleet Headroom</span>
                      <p className="text-base font-bold text-white mt-0.5">
                        {selectedPlant.connectedVehicles} Vehicles
                      </p>
                      <span className="text-[10px] text-emerald-400">
                        {selectedPlant.totalCapacity} Total Seats
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 text-[11px]">Approval Policy</span>
                      <p className="text-base font-bold text-white mt-0.5">
                        {selectedPlant.requireApproval ? 'Admin Gate' : 'Direct Allot'}
                      </p>
                      <span className="text-[10px] text-orange-400 font-mono">
                        Auto: {selectedPlant.autoAllotment ? 'Active' : 'Off'}
                      </span>
                    </div>
                  </div>

                  {/* Settings Actions for Selected Plant */}
                  <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">Auto Vehicle Allotment</span>
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
                          selectedPlant.autoAllotment ? 'bg-purple-600' : 'bg-slate-800'
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
                      <span className="text-slate-300">Require Transport Admin Approval</span>
                      <button
                        onClick={() => {
                          setPlants((prev) =>
                            prev.map((p) =>
                              p.id === selectedPlant.id ? { ...p, requireApproval: !p.requireApproval } : p
                            )
                          );
                          setSelectedPlant((prev) => (prev ? { ...prev, requireApproval: !prev.requireApproval } : null));
                          showToast(`Toggled Approval Policy for ${selectedPlant.siteCode}`);
                        }}
                        className={`w-11 h-6 rounded-full transition-colors relative ${
                          selectedPlant.requireApproval ? 'bg-orange-500' : 'bg-slate-800'
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
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
                  Select a plant from the table to view real-time fleet configuration.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 2: GATEWAY SECRETS & API KEYS VAULT
        =================================================================== */}
        {activeTab === 'GATEWAYS' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-orange-400" />
                  Encrypted Gateway Secret Vault
                </h2>
                <p className="text-xs text-slate-400">
                  Manage WhatsApp Cloud API keys, telecom SMS DLT credentials, and webhook signing secrets.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-purple-300 bg-purple-950/80 border border-purple-500/40 px-3 py-1 rounded-xl">
                  AES-256 Cloudflare Storage
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {gateways.map((gw) => {
                const isRevealed = revealedSecrets[gw.id] || false;
                const isCopied = copiedId === gw.id;

                return (
                  <div
                    key={gw.id}
                    className="p-5 rounded-2xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition-all space-y-4 shadow-xl"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-purple-400 font-semibold">
                          {gw.siteName}
                        </span>
                        <h4 className="text-sm font-bold text-white mt-0.5">{gw.gatewayName}</h4>
                      </div>
                      <span
                        className={`text-[9px] font-mono px-2 py-0.5 rounded-full uppercase font-bold ${
                          gw.environment === 'PRODUCTION'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                            : 'bg-amber-950 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {gw.environment}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <span className="text-[10px] text-slate-400 uppercase font-medium">Gateway Identifier</span>
                      <div className="font-mono text-[11px] p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 truncate">
                        {gw.gatewayIdentifier}
                      </div>
                    </div>

                    {/* Secret Mask / Reveal Control */}
                    <div className="space-y-1.5 text-xs">
                      <span className="text-[10px] text-slate-400 uppercase font-medium">API Token / Secret Key</span>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 font-mono text-[11px] p-2 rounded-lg bg-slate-900 border border-slate-800 text-orange-300 truncate">
                          {isRevealed ? gw.apiSecret : '••••••••••••••••••••••••••••••••'}
                        </div>
                        <button
                          onClick={() => toggleSecretReveal(gw.id)}
                          className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                          title={isRevealed ? 'Mask Secret' : 'Reveal Secret'}
                        >
                          {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleCopySecret(gw.id, gw.apiSecret)}
                          className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                          title="Copy Token"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Footer Meta & Rotate Action */}
                    <div className="pt-3 border-t border-slate-900 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Updated: {gw.lastUpdated}</span>
                      <button
                        onClick={() => {
                          setActiveSecretForRotation(gw);
                          setIsRotateSecretModalOpen(true);
                        }}
                        className="text-orange-400 hover:text-orange-300 font-semibold flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Rotate
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
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-2xl backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    Trip Booking Velocity by Plant
                  </h3>
                  <p className="text-xs text-slate-400">Daily transit reservations processed across sites.</p>
                </div>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800">
                  Last 7 Days
                </span>
              </div>

              {/* Visualized Bar Chart representation */}
              <div className="h-56 flex items-end gap-3 pt-6 pb-2 border-b border-slate-800">
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
                        className="w-2.5 bg-purple-500 rounded-t-sm hover:opacity-80 transition-all"
                        title={`Vadodara: ${item.vdr}`}
                      />
                      <div
                        style={{ height: `${(item.bh / 165) * 100}%` }}
                        className="w-2.5 bg-orange-500 rounded-t-sm hover:opacity-80 transition-all"
                        title={`Bharuch: ${item.bh}`}
                      />
                      <div
                        style={{ height: `${(item.jam / 165) * 100}%` }}
                        className="w-2.5 bg-emerald-500 rounded-t-sm hover:opacity-80 transition-all"
                        title={`Jamnagar: ${item.jam}`}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">{item.day}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-center gap-6 text-xs text-slate-300 pt-2 font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                  Vadodara Complex
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                  Dahej Unit
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Jamnagar Works
                </span>
              </div>
            </div>

            {/* Chart 2: Gateway Health & Egress Latency */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-2xl backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Messaging Gateway Dispatch Latency
                  </h3>
                  <p className="text-xs text-slate-400">Cloudflare Queue external API execution speed.</p>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-md border border-emerald-500/30">
                  99.98% Deliverability
                </span>
              </div>

              <div className="space-y-4 pt-2">
                {[
                  { name: 'Meta WhatsApp Cloud API (Vadodara)', latency: '124 ms', health: 99.8, color: 'bg-emerald-500' },
                  { name: 'Airtel Telecom DLT SMS (Vadodara)', latency: '310 ms', health: 99.4, color: 'bg-teal-500' },
                  { name: 'Meta WhatsApp Cloud API (Dahej)', latency: '142 ms', health: 99.6, color: 'bg-emerald-500' },
                  { name: 'Resend Transactional SMTP (Jamnagar)', latency: '88 ms', health: 100.0, color: 'bg-purple-500' },
                  { name: 'Jio Telecom SMS Engine (Hazira)', latency: 'Timeout / Unreachable', health: 0.0, color: 'bg-rose-500' },
                ].map((stat) => (
                  <div key={stat.name} className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300 font-medium">{stat.name}</span>
                      <span className="font-mono text-slate-400">{stat.latency}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
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
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  Immutable Platform Audit Ledger
                </h2>
                <p className="text-xs text-slate-400">
                  Cryptographically immutable security log recording tenant overrides, secret rotations, and policy changes.
                </p>
              </div>

              <span className="text-xs font-mono px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-slate-400">
                PostgreSQL RLS Protected
              </span>
            </div>

            <div className="space-y-2.5">
              {MOCK_AUDIT_LOGS.map((log) => (
                <div
                  key={log.id}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs font-mono"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        log.severity === 'CRITICAL'
                          ? 'bg-rose-500 animate-ping'
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

      {/* =====================================================================
          MODAL 1: PROVISION NEW PLANT REPLICA
      ===================================================================== */}
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

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-300">Enable Automated Allotment Heuristic</span>
                  <input
                    type="checkbox"
                    checked={newPlantForm.autoAllotment}
                    onChange={(e) => setNewPlantForm({ ...newPlantForm, autoAllotment: e.target.checked })}
                    className="w-4 h-4 accent-purple-600 rounded"
                  />
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
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-orange-500 text-white font-semibold shadow-lg shadow-purple-950/40"
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
                  <p className="text-xs text-slate-400 font-mono">{activeSecretForRotation.gatewayName}</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-2">
                <p>
                  You are about to issue a new cryptographic token for <strong>{activeSecretForRotation.siteName}</strong>.
                </p>
                <p className="text-amber-400">
                  ⚠️ The current key will be invalidated immediately across the Cloudflare Worker Queue consumer.
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
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-white font-semibold shadow-lg shadow-orange-950/50"
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