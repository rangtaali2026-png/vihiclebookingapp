'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import RoleSwitcher from './RoleSwitcher';
import { useAuth } from '@/lib/auth-context';
import {
  Car,
  Calendar,
  Layers,
  BarChart3,
  FileSpreadsheet,
  Bell,
  LogOut,
  LogIn,
  MapPin,
  ChevronRight
} from 'lucide-react';

export default function AppNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { session, isAuthenticated, logout } = useAuth();

  const isSuperAdmin = session?.role === 'SUPER_ADMIN';

  const navLinks = [
    { href: '/bookings', label: 'Dashboard & Bookings', icon: Calendar, visible: true },
    { href: '/shifts', label: 'Shift Rosters', icon: Layers, visible: isSuperAdmin || session?.role === 'PLANT_SUPERVISOR' || session?.role === 'FLEET_ADMIN' },
    { href: '/dispatch', label: 'Fleet Dispatch', icon: Car, visible: isSuperAdmin || session?.role === 'PLANT_SUPERVISOR' || session?.role === 'FLEET_ADMIN' },
    { href: '/analytics', label: 'Operations Intelligence', icon: BarChart3, visible: isSuperAdmin || session?.role === 'PLANT_SUPERVISOR' || session?.role === 'FLEET_ADMIN' },
    { href: '/audit', label: 'Settlement & Audit', icon: FileSpreadsheet, visible: isSuperAdmin || session?.role === 'PLANT_SUPERVISOR' || session?.role === 'FLEET_ADMIN' },
  ];

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-smart-border shadow-smart-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-8">
          <Link href="/bookings" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl smart-gradient-blue flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-smart-navy text-base tracking-tight">SmartDrive</span>
                <span className="text-[10px] font-bold text-smart-blue bg-blue-50 border border-blue-200/60 px-1.5 py-0.2 rounded-full uppercase">Enterprise</span>
              </div>
              <p className="text-[10px] text-smart-muted font-medium tracking-wide">Gujarat Industrial Mobility</p>
            </div>
          </Link>

          {/* Navigation Items */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.filter(l => l.visible).map((link) => {
              const Icon = link.icon;
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-50 text-smart-blue shadow-sm shadow-blue-500/5 font-bold'
                      : 'text-smart-muted hover:text-smart-navy hover:bg-slate-100/70'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-smart-blue' : 'text-smart-muted'}`} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: User State, Notifications, Switcher & Profile */}
        <div className="flex items-center gap-3">
          {isAuthenticated && session ? (
            <>
              {/* Site indicator pill */}
              <div className="hidden sm:flex items-center gap-1.5 bg-slate-100/90 border border-smart-border px-3 py-1.5 rounded-full text-[11px] text-smart-navy font-semibold">
                <MapPin className="w-3.5 h-3.5 text-smart-cyan" />
                <span className="truncate max-w-[140px]">{session.siteName.split(' ')[0]}</span>
              </div>

              {/* Notification Bell */}
              <button 
                type="button"
                className="relative p-2 rounded-xl text-smart-navy hover:bg-slate-100 transition border border-transparent hover:border-smart-border"
                title="Notifications"
              >
                <Bell className="w-4 h-4 text-smart-navy" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-smart-blue ring-2 ring-white"></span>
              </button>

              <div className="h-5 w-[1px] bg-smart-border mx-0.5"></div>

              {/* Persona Switcher */}
              <RoleSwitcher />

              {/* Sign Out */}
              <button
                type="button"
                onClick={handleLogout}
                className="p-2 rounded-xl text-smart-muted hover:text-smart-danger hover:bg-red-50 border border-transparent hover:border-red-100 transition"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="smart-gradient-blue text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 hover:opacity-95 transition flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Corporate Login</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
