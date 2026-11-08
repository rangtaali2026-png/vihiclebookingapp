'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, UserSession, UserRole } from '@/lib/auth-context';
import {
  Bus,
  Key,
  Building2,
  Shield,
  User,
  Truck,
  ArrowRight,
  Lock,
  Mail,
  CheckCircle2,
  AlertCircle
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
    badgeClass: 'bg-purple-950/80 text-purple-300 border-purple-800/60',
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
    badgeClass: 'bg-blue-950/80 text-blue-300 border-blue-800/60',
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
    badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800/60',
    icon: Shield,
  },
  {
    role: 'EMPLOYEE_RIDER',
    title: 'Plant Employee (Jamnagar)',
    name: 'Amit Patel',
    email: 'rider.jamnagar@planttransit.com',
    pass: 'Rider@2026',
    siteId: '33333333-3333-3333-3333-333333333333',
    siteName: 'Jamnagar Refinery Works',
    targetPath: '/bookings',
    badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
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
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
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

    // Redirect to requested path or role default
    const destination = redirectTo || account.targetPath;
    router.push(destination);
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
      setErrorMsg('Invalid credentials. Select one of the demo role cards below for instant login.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="inline-flex p-3 rounded-2xl bg-purple-950 border border-purple-800/60 text-purple-400 shadow-xl">
          <Bus className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">Plant Transit & Fleet Portal</h1>
        <p className="text-xs text-slate-400">
          Multi-tenant transit operations across Vadodara, Dahej, Jamnagar & Hazira
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl px-4">
        {/* Auth Notice if redirected */}
        {authRequired && (
          <div className="mb-4 p-3 rounded-xl bg-amber-950/60 border border-amber-800/60 text-xs text-amber-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Authentication required to access administrative corridors. Please log in below.</span>
          </div>
        )}

        {/* Manual Credentials Box */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Corporate Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  placeholder="name@planttransit.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white shadow-lg shadow-purple-950/50 transition active:scale-[0.98]"
            >
              {loading ? 'Authenticating...' : 'Sign In to Transit Console'}
            </button>
          </form>

          {/* Quick Demo Switcher Strip */}
          <div className="mt-8 pt-6 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                ⚡ One-Click Demo Role Logins
              </span>
              <span className="text-[10px] text-slate-500">Auto-fills credentials</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {DEMO_ACCOUNTS.map((acc) => {
                const IconComp = acc.icon;
                return (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => performLogin(acc)}
                    className="w-full p-3 rounded-xl border border-slate-800/80 bg-slate-950/60 hover:bg-slate-800/60 hover:border-slate-700 text-left transition flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-purple-400 group-hover:text-purple-300">
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{acc.name}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${acc.badgeClass}`}>
                            {acc.role}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          <span className="font-mono text-slate-300">{acc.email}</span> • {acc.siteName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-purple-400 group-hover:translate-x-0.5 transition">
                      <span className="hidden sm:inline">Log In</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Demo Credentials Cheat Sheet */}
        <div className="mt-4 p-4 rounded-xl bg-slate-900/40 border border-slate-800/60 text-[11px] text-slate-400 space-y-1">
          <p className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">
            Demo Credentials Reference (Any password works with matching role accounts):
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 font-mono text-[10px] text-slate-400 pt-1">
            <div>• Super Admin: <span className="text-purple-300">Admin@2026</span></div>
            <div>• Supervisor: <span className="text-blue-300">Super@2026</span></div>
            <div>• Fleet Admin: <span className="text-amber-300">Fleet@2026</span></div>
            <div>• Employee: <span className="text-emerald-300">Rider@2026</span></div>
            <div>• Driver: <span className="text-slate-300">Driver@2026</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
