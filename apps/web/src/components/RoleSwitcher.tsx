'use client';

import React, { useState } from 'react';
import { useAuth, UserRole } from '@/lib/auth-context';
import { Shield, ChevronDown, Check, Building2, User, Key, Truck } from 'lucide-react';

const PLANT_SITES = [
  { id: '11111111-1111-1111-1111-111111111111', site_code: 'PLANT_VADODARA', name: 'Vadodara Chemical Complex' },
  { id: '22222222-2222-2222-2222-222222222222', site_code: 'PLANT_BHARUCH', name: 'Dahej Heavy Engineering Unit' },
  { id: '33333333-3333-3333-3333-333333333333', site_code: 'PLANT_JAMNAGAR', name: 'Jamnagar Refinery Works' },
];

const ROLES: { role: UserRole; label: string; badgeColor: string; icon: any }[] = [
  { role: 'SUPER_ADMIN', label: 'Super Admin', badgeColor: 'bg-purple-900/60 text-purple-300 border-purple-700/60', icon: Key },
  { role: 'PLANT_SUPERVISOR', label: 'Plant Supervisor', badgeColor: 'bg-blue-900/60 text-blue-300 border-blue-700/60', icon: Building2 },
  { role: 'FLEET_ADMIN', label: 'Fleet Admin', badgeColor: 'bg-amber-900/60 text-amber-300 border-amber-700/60', icon: Shield },
  { role: 'EMPLOYEE_RIDER', label: 'Employee Rider', badgeColor: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/60', icon: User },
  { role: 'DRIVER', label: 'Transit Driver', badgeColor: 'bg-slate-800 text-slate-300 border-slate-700', icon: Truck },
];

export default function RoleSwitcher() {
  const { session, switchRole } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const activeRoleConfig = ROLES.find((r) => r.role === session.role) || ROLES[0];
  const IconComponent = activeRoleConfig.icon;

  const handleSelectRole = (newRole: UserRole) => {
    switchRole(newRole);
    setIsOpen(false);
  };

  const handleSelectSite = (site: typeof PLANT_SITES[0]) => {
    switchRole(session.role, site.id, site.name);
  };

  return (
    <div className="relative inline-block text-left">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-white transition shadow-sm"
      >
        <div className="flex items-center gap-1.5">
          <IconComponent className="w-3.5 h-3.5 text-purple-400" />
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${activeRoleConfig.badgeColor}`}>
            {activeRoleConfig.label}
          </span>
        </div>

        {session.siteName && session.role !== 'SUPER_ADMIN' && (
          <span className="hidden sm:inline text-slate-400 font-mono text-[11px] max-w-[130px] truncate">
            • {session.siteName.split(' ')[0]}
          </span>
        )}

        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl z-50 p-2.5 space-y-3">
            {/* Header / Active Profile */}
            <div className="px-2 pt-1 pb-2 border-b border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Persona</span>
              <p className="text-xs font-bold text-white mt-0.5">{session.fullName}</p>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">{session.siteName}</p>
            </div>

            {/* Role List */}
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 px-2 tracking-wider block mb-1">
                Switch Role
              </span>
              <div className="space-y-1">
                {ROLES.map((r) => {
                  const ItemIcon = r.icon;
                  const isSelected = session.role === r.role;
                  return (
                    <button
                      key={r.role}
                      type="button"
                      onClick={() => handleSelectRole(r.role)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition ${
                        isSelected ? 'bg-purple-950/80 text-purple-200 border border-purple-800/60' : 'text-slate-300 hover:bg-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <ItemIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span>{r.label}</span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-purple-400" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tenant Site Selector (Enabled for plant-level roles) */}
            {session.role !== 'SUPER_ADMIN' && (
              <div className="pt-2 border-t border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 px-2 tracking-wider block mb-1">
                  Assigned Plant Partition
                </span>
                <div className="space-y-1">
                  {PLANT_SITES.map((site) => {
                    const isSiteActive = session.siteId === site.id;
                    return (
                      <button
                        key={site.id}
                        type="button"
                        onClick={() => handleSelectSite(site)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex items-center justify-between ${
                          isSiteActive ? 'bg-blue-950/70 text-blue-200 border border-blue-800/60' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                        }`}
                      >
                        <span className="truncate">{site.name}</span>
                        {isSiteActive && <Check className="w-3 h-3 text-blue-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
