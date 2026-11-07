'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import RoleSwitcher from './RoleSwitcher';
import { useAuth } from '@/lib/auth-context';
import {
  Bus,
  Activity,
  Calendar,
  ShieldCheck,
  FileSpreadsheet,
  LogOut,
  LogIn
} from 'lucide-react';

export default function AppNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { session, isAuthenticated, logout } = useAuth();

  const isSuperAdmin = session?.role === 'SUPER_ADMIN';

  const navLinks = [
    { href: '/bookings', label: 'Bookings', icon: Calendar, visible: true },
    { href: '/shifts', label: 'Shift Rosters', icon: Bus, visible: isSuperAdmin || session?.role === 'PLANT_SUPERVISOR' || session?.role === 'FLEET_ADMIN' },
    { href: '/dispatch', label: 'Dispatch', icon: Bus, visible: isSuperAdmin || session?.role === 'PLANT_SUPERVISOR' || session?.role === 'FLEET_ADMIN' },
    { href: '/analytics', label: 'Analytics', icon: Activity, visible: isSuperAdmin || session?.role === 'PLANT_SUPERVISOR' || session?.role === 'FLEET_ADMIN' },
    { href: '/audit', label: 'Compliance & Audits', icon: FileSpreadsheet, visible: isSuperAdmin || session?.role === 'PLANT_SUPERVISOR' || session?.role === 'FLEET_ADMIN' },
    { href: '/super-admin/sites', label: 'Super Admin', icon: ShieldCheck, visible: isSuperAdmin },
  ];

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-black text-white text-sm tracking-wide">
            <span className="p-1 rounded-lg bg-purple-600 text-white">
              <Bus className="w-4 h-4" />
            </span>
            <span>Plant Transit</span>
          </Link>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.filter(l => l.visible).map((link) => {
              const Icon = link.icon;
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    isActive ? 'bg-slate-900 text-purple-400 border border-slate-800' : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right Action Area */}
        <div className="flex items-center gap-3">
          {isAuthenticated && session ? (
            <>
              <RoleSwitcher />
              <button
                type="button"
                onClick={handleLogout}
                className="p-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-rose-400 hover:border-rose-900/60 transition"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white transition shadow-sm"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
