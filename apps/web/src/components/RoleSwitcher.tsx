'use client';

import React, { useState } from 'react';
import { useAuth, UserRole } from '@/lib/auth-context';
import { Shield, ChevronDown, Check, Building2, User, Key, Truck } from 'lucide-react';

const PLANT_SITES = [
  { id: '11111111-1111-1111-1111-111111111111', site_code: 'PLANT_VADODARA', name: 'Vadodara Chemical Complex' },
  { id: '22222222-2222-2222-2222-222222222222', site_code: 'PLANT_BHARUCH', name: 'Dahej Heavy Engineering Unit' },
  { id: '33333333-3333-3333-3333-333333333333', site_code: 'PLANT_JAMNAGAR', name: 'Jamnagar Coastal Refinery Works' },
];

const ROLES: { role: UserRole; label: string; badgeColor: string; icon: any }[] = [
  { role: 'SUPER_ADMIN', label: 'Super Admin', badgeColor: 'bg-blue-50 text-smart-blue border-blue-200', icon: Key },
  { role: 'PLANT_SUPERVISOR', label: 'Plant Supervisor', badgeColor: 'bg-sky-50 text-sky-700 border-sky-200', icon: Building2 },
  { role: 'FLEET_ADMIN', label: 'Fleet Admin', badgeColor: 'bg-amber-50 text-amber-700 border-amber-200', icon: Shield },
  { role: 'EMPLOYEE_RIDER', label: 'Employee Rider', badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: User },
  { role: 'DRIVER', label: 'Transit Driver', badgeColor: 'bg-slate-100 text-slate-700 border-slate-200', icon: Truck },
];

export default function RoleSwitcher() {
  const { session, switchRole } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!session) return null;

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
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-smart-border text-xs text-smart-navy transition shadow-sm"
      >
        <div className="flex items-center gap-1.5">
          <IconComponent className="w-3.5 h-3.5 text-smart-blue" />
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${activeRoleConfig.badgeColor}`}>
            {activeRoleConfig.label}
          </span>
        </div>

        {session.siteName && session.role !== 'SUPER_ADMIN' && (
          <span className="hidden sm:inline text-smart-muted font-medium text-[11px] max-w-[120px] truncate">
            • {session.siteName.split(' ')[0]}
          </span>
        )}

        <ChevronDown className={`w-3.5 h-3.5 text-smart-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Light Glass Dropdown Menu */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white/95 backdrop-blur-xl border border-smart-border shadow-smart-lg z-50 p-3 space-y-3">
            {/* Active Persona Header */}
            <div className="px-2 pt-1 pb-2 border-b border-smart-border">
              <span className="text-[10px] uppercase font-bold text-smart-muted tracking-wider">Active Persona</span>
              <p className="text-xs font-black text-smart-navy mt-0.5">{session.fullName}</p>
              <p className="text-[11px] text-smart-muted truncate mt-0.5">{session.siteName}</p>
            </div>

            {/* Role List */}
            <div>
              <span className="text-[10px] uppercase font-bold text-smart-muted px-2 tracking-wider block mb-1">
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
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition ${
                        isSelected
                          ? 'bg-blue-50 text-smart-blue font-bold border border-blue-200'
                          : 'text-smart-navy hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <ItemIcon className={`w-3.5 h-3.5 ${isSelected ? 'text-smart-blue' : 'text-smart-muted'}`} />
                        <span>{r.label}</span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-smart-blue" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tenant Site Selector */}
            {session.role !== 'SUPER_ADMIN' && (
              <div className="pt-2 border-t border-smart-border">
                <span className="text-[10px] uppercase font-bold text-smart-muted px-2 tracking-wider block mb-1">
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
                        className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs transition flex items-center justify-between ${
                          isSiteActive
                            ? 'bg-blue-50 text-smart-blue font-bold'
                            : 'text-smart-muted hover:bg-slate-50 hover:text-smart-navy'
                        }`}
                      >
                        <span className="truncate">{site.name}</span>
                        {isSiteActive && <Check className="w-3 h-3 text-smart-blue shrink-0" />}
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
