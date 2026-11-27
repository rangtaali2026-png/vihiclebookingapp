'use client';

import React, { useState, useEffect } from 'react';
import { fetchApi } from '@/lib/api';
import {
  Mail, Server, Lock, Send, CheckCircle2, AlertCircle,
  ArrowLeft, ShieldCheck, ToggleLeft, ToggleRight, Sparkles
} from 'lucide-react';

export default function SuperAdminEmailServicePage() {
  const [provider, setProvider] = useState<'O365' | 'GMAIL' | 'CUSTOM_SMTP'>('O365');
  const [smtpHost, setSmtpHost] = useState('smtp.office365.com');
  const [smtpPort, setSmtpPort] = useState(587);
  const [senderName, setSenderName] = useState('SmartDrive Mobility Desk');
  const [senderEmail, setSenderEmail] = useState('');
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [notifyOnBooking, setNotifyOnBooking] = useState(true);
  const [notifyOnApproval, setNotifyOnApproval] = useState(true);
  const [notifyOnDispatch, setNotifyOnDispatch] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    fetchApi<{ config?: any }>('/api/super-admin/email-config')
      .then((res) => {
        if (res?.config) {
          const c = res.config;
          setProvider(c.provider || 'O365');
          setSmtpHost(c.smtp_host || 'smtp.office365.com');
          setSmtpPort(Number(c.smtp_port) || 587);
          setSenderName(c.sender_name || 'SmartDrive Mobility Desk');
          setSenderEmail(c.sender_email || '');
          setSmtpUsername(c.smtp_username || '');
          setSmtpPassword(c.smtp_password || '');
          setIsEnabled(c.is_enabled !== false);
          setNotifyOnBooking(c.notify_on_booking !== false);
          setNotifyOnApproval(c.notify_on_approval !== false);
          setNotifyOnDispatch(c.notify_on_dispatch !== false);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const applyPreset = (targetProvider: 'O365' | 'GMAIL' | 'CUSTOM_SMTP') => {
    setProvider(targetProvider);
    setFeedback(null);
    if (targetProvider === 'O365') {
      setSmtpHost('smtp.office365.com');
      setSmtpPort(587);
    } else if (targetProvider === 'GMAIL') {
      setSmtpHost('smtp.gmail.com');
      setSmtpPort(465);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetchApi<{ message?: string }>('/api/super-admin/email-config', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          smtp_host: smtpHost,
          smtp_port: Number(smtpPort),
          use_tls: true,
          sender_name: senderName,
          sender_email: senderEmail,
          smtp_username: smtpUsername,
          smtp_password: smtpPassword,
          is_enabled: isEnabled,
          notify_on_booking: notifyOnBooking,
          notify_on_approval: notifyOnApproval,
          notify_on_dispatch: notifyOnDispatch
        })
      });
      setFeedback({
        type: 'ok',
        text: res?.message || 'Email dispatch configuration saved successfully.'
      });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'Failed to save email settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient.trim()) return;
    setTesting(true);
    setFeedback(null);
    try {
      const res = await fetchApi<{ message?: string }>('/api/super-admin/email-test', {
        method: 'POST',
        body: JSON.stringify({ test_recipient: testRecipient.trim() })
      });
      setFeedback({
        type: 'ok',
        text: res?.message || `Test email sent to ${testRecipient}!`
      });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'Test email failed.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] py-8 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Navigation & Title */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <a
              href="/super-admin/sites"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Super Admin Console
            </a>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-900">
                  Enterprise Email Dispatch Service
                </h1>
                <p className="text-xs text-slate-500">
                  Configure Microsoft Office 365 or Google Gmail SMTP for automated requisition &amp; dispatch alerts
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsEnabled(!isEnabled)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black transition ${
              isEnabled
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-slate-100 border-slate-200 text-slate-500'
            }`}
          >
            {isEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            {isEnabled ? 'Service Active' : 'Service Paused'}
          </button>
        </div>

        {feedback && (
          <div
            className={`p-4 rounded-2xl border flex items-center gap-3 text-xs font-bold ${
              feedback.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Provider Quick-Select Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <button
            type="button"
            onClick={() => applyPreset('O365')}
            className={`p-4 rounded-2xl border text-left transition space-y-1 ${
              provider === 'O365'
                ? 'bg-blue-50/60 border-blue-600 ring-2 ring-blue-500/20'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <span className="font-black text-slate-900 text-sm block">Microsoft Office 365</span>
            <span className="font-mono text-[11px] text-slate-500 block">smtp.office365.com : 587</span>
            <span className="inline-block text-[10px] font-bold text-blue-600">STARTTLS • Exchange Online</span>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('GMAIL')}
            className={`p-4 rounded-2xl border text-left transition space-y-1 ${
              provider === 'GMAIL'
                ? 'bg-blue-50/60 border-blue-600 ring-2 ring-blue-500/20'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <span className="font-black text-slate-900 text-sm block">Google Gmail / Workspace</span>
            <span className="font-mono text-[11px] text-slate-500 block">smtp.gmail.com : 587 / 465</span>
            <span className="inline-block text-[10px] font-bold text-emerald-600">App Password / OAuth Relay</span>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('CUSTOM_SMTP')}
            className={`p-4 rounded-2xl border text-left transition space-y-1 ${
              provider === 'CUSTOM_SMTP'
                ? 'bg-blue-50/60 border-blue-600 ring-2 ring-blue-500/20'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <span className="font-black text-slate-900 text-sm block">Custom Corporate SMTP</span>
            <span className="font-mono text-[11px] text-slate-500 block">Custom Host &amp; Port</span>
            <span className="inline-block text-[10px] font-bold text-slate-500">Internal Relay / SES / SendGrid</span>
          </button>
        </div>

        {/* Provider Setup Tip */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-900">
          <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            {provider === 'O365' ? (
              <span>
                <strong>Office 365 Requirement:</strong> Ensure <em>Authenticated SMTP</em> is enabled for the licensed mailbox in Microsoft 365 Admin Center → Users → Active Users → Mail → Manage email apps. If MFA is enforced, generate an App Password in Microsoft Security Info.
              </span>
            ) : provider === 'GMAIL' ? (
              <span>
                <strong>Gmail / Google Workspace Requirement:</strong> Enable 2-Step Verification on the Google account and generate a 16-character <strong>App Password</strong> under <em>Google Account → Security → App Passwords</em>. Use that 16-character code in the Password field below.
              </span>
            ) : (
              <span>
                <strong>Custom SMTP:</strong> Enter your corporate mail relay hostname, TLS port (587 or 465), and authorized service credentials.
              </span>
            )}
          </div>
        </div>

        {/* Main SMTP Credentials & Event Triggers Form */}
        <form
          onSubmit={handleSave}
          className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5 text-xs"
        >
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <Server className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-black text-slate-900">
              {provider === 'O365'
                ? 'Office 365 Outbound Server Settings'
                : provider === 'GMAIL'
                ? 'Gmail Outbound Server Settings'
                : 'Custom SMTP Server Settings'}
            </h2>
          </div>

          {loading ? (
            <p className="text-slate-500 py-4">Loading saved configuration...</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">SMTP Server Host *</label>
                  <input
                    type="text"
                    required
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono font-semibold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">SMTP Port *</label>
                  <select
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono font-semibold text-slate-900 bg-white"
                  >
                    <option value={587}>587 (STARTTLS — Recommended)</option>
                    <option value={465}>465 (SSL / TLS — Best for Gmail)</option>
                    <option value={25}>25 (Internal Relay)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Display Sender Name *</label>
                  <input
                    type="text"
                    required
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="SmartDrive Mobility Desk"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-semibold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">From / Sender Email Address *</label>
                  <input
                    type="email"
                    required
                    value={senderEmail}
                    onChange={(e) => {
                      setSenderEmail(e.target.value);
                      if (!smtpUsername) setSmtpUsername(e.target.value);
                    }}
                    placeholder={provider === 'O365' ? 'mobility@company.com' : 'mobility@gmail.com'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono font-semibold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">SMTP Login Username *</label>
                  <input
                    type="text"
                    required
                    value={smtpUsername}
                    onChange={(e) => setSmtpUsername(e.target.value)}
                    placeholder="Usually same as Sender Email"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono font-semibold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {provider === 'GMAIL' ? '16-Character Gmail App Password *' : 'Mailbox / App Password *'}
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="password"
                      required
                      value={smtpPassword}
                      onChange={(e) => setSmtpPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 font-mono font-semibold text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Automated Event Notification Triggers */}
              <div className="pt-3 border-t border-slate-200 space-y-2.5">
                <span className="block font-black text-slate-800 uppercase text-[11px] tracking-wider">
                  Automated Workflow Email Triggers
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyOnBooking}
                      onChange={(e) => setNotifyOnBooking(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span className="font-bold text-slate-800">New Booking → FH Approver</span>
                  </label>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyOnApproval}
                      onChange={(e) => setNotifyOnApproval(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span className="font-bold text-slate-800">FH / UH Sign-Off → Next Stage</span>
                  </label>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyOnDispatch}
                      onChange={(e) => setNotifyOnDispatch(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span className="font-bold text-slate-800">Cab Allotted → Employee</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white font-black hover:bg-blue-700 disabled:opacity-50 transition shadow-sm"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {saving ? 'Saving Configuration...' : `Save ${provider} Configuration`}
                </button>
              </div>
            </>
          )}
        </form>

        {/* Live Test Email Card */}
        <form
          onSubmit={handleSendTest}
          className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-4 text-xs"
        >
          <div className="flex-1">
            <label className="block font-black text-slate-900 mb-1">
              Verify Outbound Connection (Send Test Email)
            </label>
            <input
              type="email"
              required
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              placeholder="Enter recipient email address to test delivery..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-slate-900"
            />
          </div>
          <button
            type="submit"
            disabled={testing}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white font-black hover:bg-slate-800 disabled:opacity-50 transition shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            {testing ? 'Sending Test...' : 'Send Test Email'}
          </button>
        </form>
      </div>
    </div>
  );
}
