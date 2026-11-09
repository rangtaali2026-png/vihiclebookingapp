'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, UserSession, UserRole } from '@/lib/auth-context';
import {
  Car,
  Key,
  Building2,
  Shield,
  User,
  Truck,
  ArrowRight,
  Lock,
  Mail,
  AlertCircle,
  Download,
  Smartphone
} from 'lucide-react';

interface DemoAccount {
  role: UserRole;
  title: string;
  name: string;
  email: string;
  pass: string;
  siteId: string | null;
  siteName: string;
  targetPath: string;
  badgeClass: string;
  icon: any;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'SUPER_ADMIN',
    title: 'Super Administrator',
    name: 'Dhaval Mungara',
    email: 'admin@planttransit.com',
    pass: 'Admin@2026',
    siteId: '11111111-1111-1111-1111-111111111111',
    siteName: 'Cross-Tenant Global Controller',
    targetPath: '/super-admin/sites',
    badgeClass: 'bg-blue-50 text-smart-blue border-blue-200',
    icon: Key,
  },
  {
    role: 'PLANT_SUPERVISOR',
    title: 'Plant Supervisor (Vadodara)',
    name: 'Rajesh Solanki',
    email: 'supervisor.vadodara@planttransit.com',
    pass: 'Super@2026',
    siteId: '11111111-1111-1111-1111-111111111111',
    siteName: 'Vadodara Chemical Complex',
    targetPath: '/dispatch',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    icon: Building2,
  },
  {
    role: 'FLEET_ADMIN',
    title: 'Fleet Controller (Dahej)',
    name: 'Vikram Mehta',
    email: 'fleet.dahej@planttransit.com',
    pass: 'Fleet@2026',
    siteId: '22222222-2222-2222-2222-222222222222',
    siteName: 'Dahej Heavy Engineering Unit',
    targetPath: '/dispatch',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: Shield,
  },
  {
    role: 'EMPLOYEE_RIDER',
    title: 'Plant Employee (Jamnagar)',
    name: 'Amit Patel',
    email: 'rider.jamnagar@planttransit.com',
    pass: 'Rider@2026',
    siteId: '33333333-3333-3333-3333-333333333333',
    siteName: 'Jamnagar Coastal Refinery Works',
    targetPath: '/bookings',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: User,
  },
  {
    role: 'DRIVER',
    title: 'Transit Driver (Vadodara)',
    name: 'Suresh Rathod',
    email: 'driver.vadodara@planttransit.com',
    pass: 'Driver@2026',
    siteId: '11111111-1111-1111-1111-111111111111',
    siteName: 'Vadodara Plant Transit Pool',
    targetPath: '/board',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: Truck,
  },
];

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams?.get('redirect_to');
  const authRequired = searchParams?.get('auth_required');

  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const performLogin = (account: DemoAccount) => {
    const session: UserSession = {
      userId: `usr-${account.role.toLowerCase()}-${Date.now().toString().slice(-4)}`,
      fullName: account.name,
      email: account.email,
      role: account.role,
      siteId: account.siteId,
      siteName: account.siteName,
    };

    login(session);
    router.push(redirectTo || account.targetPath);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    const match = DEMO_ACCOUNTS.find(
      (a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.pass === password
    );

    if (match) {
      performLogin(match);
    } else {
      setLoading(false);
      setErrorMsg('Invalid credentials. Click any demo role card below to log in instantly.');
    }
  };

  return (
    <div className="min-h-screen bg-smart-bg flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative selection:bg-smart-blue selection:text-white">
      
      {/* Top Right Corner - Android APK Download Button */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <a
          href="/downloads/SmartDrive.apk"
          download="SmartDrive-Enterprise.apk"
          className="group inline-flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl bg-white/90 backdrop-blur-md border border-smart-border text-smart-navy hover:text-smart-blue shadow-smart-sm hover:shadow-smart-lg hover:border-smart-blue/50 transition-all duration-200 active:scale-95"
          title="Download Android Driver & Staff App"
        >
          <div className="p-1.5 rounded-xl bg-blue-50 text-smart-blue group-hover:bg-smart-blue group-hover:text-white transition-colors">
            <Smartphone className="w-4 h-4" />
          </div>
          <div className="text-left hidden xs:block sm:block">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black tracking-tight leading-none">Download APK</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-smart-cyan bg-cyan-50 border border-cyan-200/60 px-1.5 py-0.2 rounded-full">
                v2.1
              </span>
            </div>
            <span className="text-[10px] text-smart-muted font-medium block mt-0.5">Android Native App</span>
          </div>
          <Download className="w-3.5 h-3.5 text-smart-muted group-hover:text-smart-blue group-hover:translate-y-0.5 transition-transform ml-0.5" />
        </a>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="inline-flex w-12 h-12 rounded-2xl smart-gradient-blue text-white shadow-smart-lg items-center justify-center">
          <Car className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-black text-smart-navy tracking-tight">SmartDrive Enterprise Portal</h1>
        <p className="text-xs text-smart-muted">
          Employee & Fleet Transportation System for Gujarat Manufacturing Hubs
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
        {authRequired && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-smart-warning flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Authentication required to access administrative portals. Please sign in below.</span>
          </div>
        )}

        {/* White Glass Card */}
        <div className="smart-glass-card p-6 sm:p-8 shadow-smart-lg">
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-smart-navy mb-1.5">
                Corporate Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-smart-muted absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  placeholder="name@planttransit.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-smart-border rounded-xl pl-10 pr-3 py-2.5 text-xs text-smart-navy placeholder-slate-400 focus:bg-white focus:border-smart-blue focus:outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-smart-navy mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-smart-muted absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-smart-border rounded-xl pl-10 pr-3 py-2.5 text-xs text-smart-navy placeholder-slate-400 focus:bg-white focus:border-smart-blue focus:outline-none transition"
                />
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-smart-danger flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl smart-gradient-blue text-white text-xs font-bold shadow-smart-lg hover:opacity-95 active:scale-98 transition"
            >
              {loading ? 'Authenticating...' : 'Sign In to SmartDrive'}
            </button>
          </form>

          {/* Quick Demo Logins Strip */}
          <div className="mt-8 pt-6 border-t border-smart-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-smart-navy">
                ⚡ One-Click Demo Role Logins
              </span>
              <span className="text-[10px] text-smart-muted">Instant Access</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {DEMO_ACCOUNTS.map((acc) => {
                const IconComp = acc.icon;
                return (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => performLogin(acc)}
                    className="w-full p-3 rounded-xl border border-smart-border bg-white hover:bg-slate-50 hover:border-smart-blue text-left transition flex items-center justify-between group shadow-smart-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-blue-50 text-smart-blue">
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-smart-navy">{acc.name}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${acc.badgeClass}`}>
                            {acc.role}
                          </span>
                        </div>
                        <p className="text-[11px] text-smart-muted mt-0.5">
                          <span className="font-mono text-smart-navy">{acc.email}</span> • {acc.siteName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] font-bold text-smart-blue group-hover:translate-x-0.5 transition">
                      <span className="hidden sm:inline">Log In</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Demo Credentials Footer Cheat Sheet */}
        <div className="mt-4 p-4 rounded-2xl bg-white/70 border border-smart-border text-[11px] text-smart-muted space-y-1">
          <p className="font-bold text-smart-navy uppercase tracking-wider text-[10px]">
            Demo Credentials (Password: Admin@2026, Super@2026, Fleet@2026, Rider@2026, Driver@2026)
          </p>
        </div>
      </div>
    </div>
  );
}
