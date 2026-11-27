'use client';

import React, { useState, useEffect } from 'react';
import { fetchApi } from '@/lib/api';
import {
  Car, Phone, Lock, Send, CheckCircle2, Play, User,
  MapPin, Calendar, Clock, RefreshCw, LogOut, ShieldCheck, KeyRound
} from 'lucide-react';

interface DriverSession {
  id: string;
  name: string;
  mobile_number: string;
  license_number?: string;
}

export default function DriverPortalPage() {
  const [driver, setDriver] = useState<DriverSession | null>(null);
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [trips, setTrips] = useState<any[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [otpInputs, setOtpInputs] = useState<Record<string, string>>({});
  const [odometerInputs, setOdometerInputs] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('driver_session');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed?.id) {
            setDriver(parsed);
            loadDriverTrips(parsed.id);
          }
        } catch {
          // ignore
        }
      }
    }
  }, []);

  const handleDriverLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetchApi<{ driver: DriverSession }>('/api/driver/login', {
        method: 'POST',
        body: JSON.stringify({ mobile, password })
      });
      if (res?.driver) {
        setDriver(res.driver);
        if (typeof window !== 'undefined') {
          localStorage.setItem('driver_session', JSON.stringify(res.driver));
        }
        await loadDriverTrips(res.driver.id);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Driver login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const loadDriverTrips = async (driverId: string) => {
    setLoadingTrips(true);
    try {
      const res = await fetchApi<{ trips?: any[] }>(
        `/api/driver/trips?driver_id=${encodeURIComponent(driverId)}`
      );
      const list = Array.isArray(res?.trips) ? res.trips : [];
      setTrips(list);
      if (list.length > 0 && !selectedTripId) {
        setSelectedTripId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load driver trips:', err);
    } finally {
      setLoadingTrips(false);
    }
  };

  const handleSendOtp = async (bookingId: string) => {
    setActionLoading(bookingId);
    setBannerMsg(null);
    try {
      await fetchApi(`/api/bookings/${bookingId}/send-otp`, { method: 'POST' });
      setBannerMsg({
        type: 'ok',
        text: '6-digit Boarding OTP sent! Ask the passenger to check their Request Status window and share the OTP.'
      });
      if (driver) await loadDriverTrips(driver.id);
    } catch (err: any) {
      setBannerMsg({ type: 'err', text: err.message || 'Failed to send OTP' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerifyOtp = async (bookingId: string) => {
    const code = (otpInputs[bookingId] || '').trim();
    if (code.length !== 6) {
      setBannerMsg({ type: 'err', text: 'Please enter the exact 6-digit OTP from the passenger.' });
      return;
    }
    setActionLoading(bookingId);
    setBannerMsg(null);
    try {
      await fetchApi(`/api/bookings/${bookingId}/verify-otp`, {
        method: 'POST',
        body: JSON.stringify({ otp: code })
      });
      setBannerMsg({
        type: 'ok',
        text: 'OTP verified! Passenger is now ONBOARDED. Press Start Trip when ready to depart.'
      });
      if (driver) await loadDriverTrips(driver.id);
    } catch (err: any) {
      setBannerMsg({ type: 'err', text: err.message || 'OTP verification failed' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartTrip = async (bookingId: string) => {
    setActionLoading(bookingId);
    setBannerMsg(null);
    try {
      const odo = odometerInputs[bookingId] ? Number(odometerInputs[bookingId]) : undefined;
      await fetchApi(`/api/bookings/${bookingId}/start-trip`, {
        method: 'POST',
        body: JSON.stringify({ start_odometer_km: odo })
      });
      setBannerMsg({
        type: 'ok',
        text: 'Trip STARTED! Have a safe journey.'
      });
      if (driver) await loadDriverTrips(driver.id);
    } catch (err: any) {
      setBannerMsg({ type: 'err', text: err.message || 'Failed to start trip' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('driver_session');
    }
    setDriver(null);
    setTrips([]);
    setSelectedTripId(null);
  };

  // =========================================================================
  // DRIVER MOBILE LOGIN SCREEN
  // =========================================================================
  if (!driver) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900">SmartDrive</h1>
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-extrabold uppercase">
                  Driver App
                </span>
              </div>
              <p className="text-xs text-slate-500">Chauffeur Boarding &amp; Trip Execution Portal</p>
            </div>
          </div>

          {authError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
              {authError}
            </div>
          )}

          <form onSubmit={handleDriverLogin} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">Driver Mobile Number *</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                <input
                  type="tel"
                  required
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="Enter registered 10-digit mobile number"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-slate-900 font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1.5">PIN / Password *</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter PIN (12345)"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-slate-900 font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-black shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {authLoading ? 'Signing In...' : 'Driver Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // =========================================================================
  // LOGGED-IN DRIVER CONSOLE (SELECT PASSENGER -> SEND OTP -> ONBOARD -> START)
  // =========================================================================
  const activeTrip = trips.find((t) => t.id === selectedTripId) || trips[0] || null;

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-5 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-black text-slate-900 block">{driver.name}</span>
              <span className="text-[11px] font-mono text-slate-500">{driver.mobile_number}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadDriverTrips(driver.id)}
              className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              title="Refresh Trips"
            >
              <RefreshCw className={`w-4 h-4 ${loadingTrips ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {bannerMsg && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-bold ${
              bannerMsg.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            {bannerMsg.text}
          </div>
        )}

        {/* Step 1: Select Assigned Passenger / Trip */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900">
              1. Select Passenger &amp; Assigned Trip ({trips.length})
            </h2>
          </div>

          {loadingTrips ? (
            <p className="text-xs text-slate-500 py-4">Loading assigned trips...</p>
          ) : trips.length === 0 ? (
            <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
              No active dispatched trips assigned to your mobile number yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {trips.map((t) => {
                const isSelected = activeTrip?.id === t.id;
                const isStarted = Boolean(t.trip_started_at || t.status === 'IN_PROGRESS');
                const isOnboarded = Boolean(t.passenger_onboarded_at);

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTripId(t.id)}
                    className={`text-left p-4 rounded-xl border transition space-y-1.5 ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-black text-blue-600">
                        {t.booking_reference}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          isStarted
                            ? 'bg-emerald-100 text-emerald-800'
                            : isOnboarded
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {isStarted ? 'TRIP IN PROGRESS' : isOnboarded ? 'ONBOARDED' : 'AWAITING OTP'}
                      </span>
                    </div>
                    <div className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {t.employee_name || 'Passenger'} ({t.employee_id || 'EMP'})
                    </div>
                    <div className="text-xs text-slate-600 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>
                        {t.origin_location} → {t.destination_location}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Step 2 & 3: Send 6-Digit OTP -> Verify & Onboard -> Start Trip */}
        {activeTrip && (() => {
          const isOtpSent = Boolean(activeTrip.boarding_otp);
          const isOnboarded = Boolean(activeTrip.passenger_onboarded_at);
          const isStarted = Boolean(activeTrip.trip_started_at || activeTrip.status === 'IN_PROGRESS');

          return (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <span className="text-[11px] font-bold uppercase text-slate-400">Selected Passenger</span>
                  <h3 className="text-base font-black text-slate-900">
                    {activeTrip.employee_name || 'Passenger'} • {activeTrip.mobile || activeTrip.employee_phone || ''}
                  </h3>
                  <p className="text-slate-500 mt-0.5">
                    {activeTrip.origin_location} → {activeTrip.destination_location} • Vehicle:{' '}
                    <strong>{activeTrip.vehicles?.registration_number || 'Allotted Cab'}</strong>
                  </p>
                </div>
                <span className="font-mono text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                  {activeTrip.booking_reference}
                </span>
              </div>

              {/* Step 2: Send 6-Digit Boarding OTP */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="font-black text-slate-900 text-sm block">
                    2. Send 6-Digit Boarding OTP to Passenger
                  </span>
                  <span className="text-slate-500">
                    Generates a 6-digit OTP on the employee&apos;s Request Status portal.
                  </span>
                </div>
                <button
                  type="button"
                  disabled={actionLoading === activeTrip.id || isOnboarded}
                  onClick={() => handleSendOtp(activeTrip.id)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-black hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isOtpSent ? 'Resend OTP' : 'Send OTP'}
                </button>
              </div>

              {/* Step 3: Enter & Verify 6-Digit OTP */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-black text-slate-900 text-sm block">
                      3. Verify Passenger OTP &amp; Onboard
                    </span>
                    <span className="text-slate-500">
                      Ask {activeTrip.employee_name || 'the passenger'} for the 6-digit OTP shown on their screen.
                    </span>
                  </div>
                  {isOnboarded && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      PASSENGER ONBOARDED
                    </span>
                  )}
                </div>

                {!isOnboarded && (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="relative flex-1 min-w-[180px]">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={otpInputs[activeTrip.id] || ''}
                        onChange={(e) =>
                          setOtpInputs((prev) => ({
                            ...prev,
                            [activeTrip.id]: e.target.value.replace(/\D/g, '').slice(0, 6)
                          }))
                        }
                        placeholder="Enter 6-digit OTP"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-base font-black tracking-widest text-slate-900"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={actionLoading === activeTrip.id || !isOtpSent}
                      onClick={() => handleVerifyOtp(activeTrip.id)}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-black hover:bg-emerald-700 disabled:opacity-50 transition"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Verify &amp; Onboard Passenger
                    </button>
                  </div>
                )}
              </div>

              {/* Step 4: Start Trip Button */}
              <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <span className="font-black text-slate-900 text-sm block">
                    4. Start Official Trip
                  </span>
                  <span className="text-slate-600 block">
                    {isStarted
                      ? `Trip started at ${new Date(activeTrip.trip_started_at).toLocaleTimeString('en-IN')}`
                      : isOnboarded
                      ? 'Passenger verified and onboarded. Ready to start trip.'
                      : 'Complete OTP verification above to unlock Start Trip.'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {!isStarted && (
                    <input
                      type="number"
                      value={odometerInputs[activeTrip.id] || ''}
                      onChange={(e) =>
                        setOdometerInputs((prev) => ({ ...prev, [activeTrip.id]: e.target.value }))
                      }
                      placeholder="Start Odo (km)"
                      className="w-32 px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-xs font-bold text-slate-900"
                    />
                  )}
                  <button
                    type="button"
                    disabled={actionLoading === activeTrip.id || !isOnboarded || isStarted}
                    onClick={() => handleStartTrip(activeTrip.id)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-slate-800 disabled:opacity-40 transition shadow-sm"
                  >
                    <Play className="w-4 h-4" />
                    {isStarted ? 'Trip In Progress' : 'Start Trip'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
}
