'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { Car, Lock, Mail, HelpCircle, X, KeyRound, Check, Copy, ArrowRight } from 'lucide-react';

interface DemoCredential {
  title: string;
  email: string;
  pass: string;
  role: string;
  badge: string;
  redirect: string;
}

const DEMO_CREDENTIALS: DemoCredential[] = [
  {
    title: 'Super Admin (Cross-Tenant)',
    email: 'superadmin@smartdrive.local',
    pass: 'Admin@2026',
    role: 'SUPER_ADMIN',
    badge: 'Full Governance',
    redirect: '/super-admin/sites'
  },
  {
    title: 'Ride Controller (Dahej)',
    email: 'fleet.dahej@smartdrive.local',
    pass: 'Fleet@2026',
    role: 'DISPATCHER',
    badge: 'Dispatch & Ride',
    redirect: '/dispatch'
  },
  {
    title: 'FH Approval (Functional Head)',
    email: 'fh.approval@grasim.local',
    pass: 'Approver@2026',
    role: 'FH_APPROVER',
    badge: 'Outstation Step 2',
    redirect: '/approvals'
  },
  {
    title: 'UH Approval (Unit Head)',
    email: 'uh.approval@grasim.local',
    pass: 'Approver@2026',
    role: 'UH_APPROVER',
    badge: 'Outstation Step 3',
    redirect: '/approvals'
  },
  {
    title: 'FH-HR / Admin Approval',
    email: 'hr.admin@grasim.local',
    pass: 'Approver@2026',
    role: 'FH_HR_ADMIN',
    badge: 'Final Sign-Off',
    redirect: '/dispatch'
  },
  {
    title: 'Plant Employee (Requester)',
    email: 'employee@grasim.local',
    pass: 'Emp@2026',
    role: 'EMPLOYEE',
    badge: 'Cab Requisition',
    redirect: '/book'
  }
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const performLogin = async (loginEmail: string, loginPass: string, fallbackRedirect = '/dispatch') => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi<{ token?: string; user?: any; redirect?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPass })
      });

      if (res?.token && typeof window !== 'undefined') {
        localStorage.setItem('auth_token', res.token);
      }
      if (res?.user && typeof window !== 'undefined') {
        localStorage.setItem('user_profile', JSON.stringify(res.user));
      }

      const resolvedRole = res?.user?.role || '';
      if (resolvedRole === 'FH_APPROVER' || resolvedRole === 'UH_APPROVER') {
        router.push('/approvals');
        return;
      }
      router.push(res?.redirect || fallbackRedirect);
    } catch (err: any) {
      const matchedPreset = DEMO_CREDENTIALS.find(
        (c) => c.email.toLowerCase() === loginEmail.trim().toLowerCase() && c.pass === loginPass
      );
      if (matchedPreset && typeof window !== 'undefined') {
        localStorage.setItem(
          'user_profile',
          JSON.stringify({
            name: matchedPreset.title,
            email: matchedPreset.email,
            role: matchedPreset.role
          })
        );
        router.push(matchedPreset.redirect);
        return;
      }
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(email, password);
  };

  const handleSelectPreset = (cred: DemoCredential) => {
    setEmail(cred.email);
    setPassword(cred.pass);
    setShowDemoModal(false);
  };

  const handleCopy = (e: React.MouseEvent, cred: DemoCredential) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(`${cred.email} / ${cred.pass}`);
    setCopiedEmail(cred.email);
    setTimeout(() => setCopiedEmail(null), 1500);
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col items-center justify-center p-4 relative">
      {/* Main Clean Login Card (No Credentials Exposed on Screen) */}
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <Car className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900">SmartDrive</h1>
              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 text-[10px] font-extrabold uppercase tracking-wider">
                Enterprise
              </span>
            </div>
            <p className="text-xs text-slate-500">Gujarat Industrial Mobility & Transit Portal</p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">Corporate Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 font-semibold focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 font-semibold focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-black shadow-sm hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {loading ? 'Authenticating...' : 'Sign In to Portal'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Bottom-Right Floating "?" Circular Button */}
      <button
        type="button"
        onClick={() => setShowDemoModal(true)}
        title="View Demo Credentials"
        aria-label="Demo Credentials Help"
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 hover:scale-105 active:scale-95 transition flex items-center justify-center border-2 border-white"
      >
        <HelpCircle className="w-6 h-6" />
      </button>

      {/* Demo Credentials Modal Popup */}
      {showDemoModal && (
        <div
          onClick={() => setShowDemoModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">Demo Access Credentials</h2>
                  <p className="text-xs text-slate-500">Click any role below to auto-fill login details</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDemoModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-2.5 pr-1">
              {DEMO_CREDENTIALS.map((cred) => (
                <div
                  key={cred.email}
                  onClick={() => handleSelectPreset(cred)}
                  className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 cursor-pointer transition flex items-center justify-between gap-3 group"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-slate-900 group-hover:text-blue-700">
                        {cred.title}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        {cred.badge}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-600">
                      <span>
                        <strong className="text-slate-400 font-sans">User:</strong> {cred.email}
                      </span>
                      <span>
                        <strong className="text-slate-400 font-sans">Pass:</strong> {cred.pass}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => handleCopy(e, cred)}
                      title="Copy credentials"
                      className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:border-blue-300 transition"
                    >
                      {copiedEmail === cred.email ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <span className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-bold group-hover:bg-blue-700">
                      Use
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
