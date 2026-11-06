'use client';

import React, { useState, useEffect } from 'react';
import { fetchApi } from '@/lib/api';

export interface Gateway {
  id: string;
  site_tag: string;
  gateway_name: string;
  channel: string;
  environment: string;
  gateway_identifier: string;
  secret_key_encrypted?: string;
  is_enabled: boolean;
  last_rotated_at?: string;
}

const DEFAULT_GATEWAYS: Gateway[] = [
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

export default function GatewaySecretVault() {
  const [gateways, setGateways] = useState<Gateway[]>(DEFAULT_GATEWAYS);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    fetchApi<{ success: boolean; gateways: Gateway[] }>('/api/admin/gateways')
      .then((res) => {
        if (res?.gateways && res.gateways.length > 0) {
          setGateways(res.gateways);
        }
      })
      .catch((err) => console.error('Failed to load gateways:', err));
  }, []);

  const handleToggle = async (id: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    setTogglingId(id);

    // Optimistic UI update
    setGateways((prev) =>
      prev.map((g) => (g.id === id ? { ...g, is_enabled: nextStatus } : g))
    );

    try {
      await fetchApi(`/api/admin/gateways/${id}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ is_enabled: nextStatus }),
      });
    } catch (err: any) {
      alert(`Failed to update gateway: ${err.message}`);
      // Revert on failure
      setGateways((prev) =>
        prev.map((g) => (g.id === id ? { ...g, is_enabled: currentStatus } : g))
      );
    } finally {
      setTogglingId(null);
    }
  };

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
            {/* Header: Site Tag, Status Badge & Toggle Button */}
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
                  onClick={() => handleToggle(g.id, g.is_enabled)}
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
                  <button type="button" className="hover:text-slate-200 p-0.5" title="Masked Key">👁</button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-500">
              <span>Updated: {g.last_rotated_at || '2026-10-28'}</span>
              <button
                type="button"
                className="text-purple-400 hover:text-purple-300 font-medium inline-flex items-center gap-1"
              >
                🔄 Rotate
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
