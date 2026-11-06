import { fetchApi } from '@/lib/api';
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
    apiSecret: 'smtp_mock_token_jamnagar_development_key',
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

  const [gateways, setGateways] = useState<any[]>([
    {
      id: 'a1111111-0000-0000-0000-000000000001',
      site_tag: 'VADODARA COMPLEX',
      gateway_name: 'Meta WhatsApp Cloud API',
      channel: 'WHATSAPP',
      environment: 'PRODUCTION',
      gateway_identifier: '104928392019283',
      secret_key: '••••••••••••••••••••••••••••••••',
      is_enabled: true,
      last_rotated_at: '2026-10-28'
    },
    {
      id: 'a1111111-0000-0000-0000-000000000002',
      site_tag: 'VADODARA COMPLEX',
      gateway_name: 'Airtel Telecom DLT Gateway',
      channel: 'SMS',
      environment: 'PRODUCTION',
      gateway_identifier: 'PLNTRN',
      secret_key: '••••••••••••••••••••••••••••••••',
      is_enabled: true,
      last_rotated_at: '2026-09-14'
    },
    {
      id: 'a2222222-0000-0000-0000-000000000001',
      site_tag: 'DAHEJ UNIT',
      gateway_name: 'Meta WhatsApp Cloud API',
      channel: 'WHATSAPP',
      environment: 'PRODUCTION',
      gateway_identifier: '204928392019284',
      secret_key: '••••••••••••••••••••••••••••••••',
      is_enabled: true,
      last_rotated_at: '2026-10-12'
    },
    {
      id: 'a3333333-0000-0000-0000-000000000001',
      site_tag: 'JAMNAGAR WORKS',
      gateway_name: 'Resend Transactional SMTP',
      channel: 'EMAIL',
      environment: 'PRODUCTION',
      gateway_identifier: 'transit-jamnagar@plant-logistics.company.com',
      secret_key: '••••••••••••••••••••••••••••••••',
      is_enabled: true,
      last_rotated_at: '2026-11-01'
    },
    {
      id: 'a4444444-0000-0000-0000-000000000001',
      site_tag: 'HAZIRA YARD',
      gateway_name: 'Jio Telecom SMS Engine',
      channel: 'SMS',
      environment: 'STAGING',
      gateway_identifier: 'HZTRN',
      secret_key: '••••••••••••••••••••••••••••••••',
      is_enabled: false,
      last_rotated_at: '2026-10-02'
    }
  ]);

  useEffect(() => {
    fetchApi<{ success: boolean; gateways: any[] }>('/api/admin/gateways')
      .then(res => {
        if (res.gateways && res.gateways.length > 0) setGateways(res.gateways);
      })
      .catch(() => {});
  }, []);

  const handleToggleGateway = async (id: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    // Optimistic UI update
    setGateways(prev => prev.map(g => g.id === id ? { ...g, is_enabled: nextStatus } : g));

    try {
      await fetchApi(`/api/admin/gateways/${id}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ is_enabled: nextStatus })
      });
    } catch (err: any) {
      alert(`Failed to update gateway: ${err.message}`);
      // Revert on error
      setGateways(prev => prev.map(g => g.id === id ? { ...g, is_enabled: currentStatus } : g));
    }
  };

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
                {/* Header: Site Tag, Status & Toggle Button */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-mono font-bold tracking-wider text-purple-400 uppercase">
                      {g.site_tag}
                    </span>
                    <h3 className="text-sm font-bold text-white mt-0.5">{g.gateway_name}</h3>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Status Badge */}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                      g.is_enabled
                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                        : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                    }`}>
                      {g.is_enabled ? g.environment : 'DISABLED'}
                    </span>

                    {/* Interactive ON/OFF Switch */}
                    <button
                      type="button"
                      onClick={() => handleToggleGateway(g.id, g.is_enabled)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        g.is_enabled ? 'bg-emerald-500' : 'bg-slate-700'
                      }`}
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

                {/* Gateway Identifier */}
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                    Gateway Identifier
                  </label>
                  <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-200 truncate">
                    {g.gateway_identifier}
                  </div>
                </div>

                {/* Secret Key Mask */}
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                    API Token / Secret Key
                  </label>
                  <div className="flex items-center justify-between bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400">
                    <span className="tracking-widest">••••••••••••••••••••••••••••</span>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <button type="button" className="hover:text-slate-200 p-0.5" title="Reveal Secret">👁</button>
                      <button type="button" className="hover:text-slate-200 p-0.5" title="Copy Secret">📋</button>
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-500">
                  <span>Updated: {g.last_rotated_at || '2026-10-28'}</span>
                  <button type="button" className="text-purple-400 hover:text-purple-300 font-medium inline-flex items-center gap-1">
                    🔄 Rotate
                  </button>
                </div>
              </div>
            ))}
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