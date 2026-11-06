'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';
import type { Vehicle, VehicleCategory } from '@plant-transit/shared-types';

export default function FleetPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Form State
  const [siteId] = useState('11111111-1111-1111-1111-111111111111');
  const [regNumber, setRegNumber] = useState('');
  const [makeModel, setMakeModel] = useState('');
  const [category, setCategory] = useState<VehicleCategory>('SEDAN_4');

  const loadVehicles = async () => {
    try {
      setLoading(true);
      const res = await fetchApi<{ success: boolean; vehicles: Vehicle[] }>('/api/fleet/vehicles');
      setVehicles(res.vehicles || []);
    } catch (err: any) {
      console.error('Failed to load fleet assets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regNumber.trim() || !makeModel.trim()) return;

    try {
      setSubmitting(true);
      await fetchApi('/api/fleet/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          site_id: siteId,
          registration_number: regNumber.trim().toUpperCase(),
          model: makeModel.trim(),
          category,
          seat_capacity: category === 'SEDAN_4' ? 4 : category === 'MPV_6' ? 6 : category === 'BUS_42' ? 42 : 52,
        }),
      });

      setRegNumber('');
      setMakeModel('');
      alert('Vehicle successfully registered!');
      await loadVehicles();
    } catch (err: any) {
      alert(`Registration failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-800">
                ← Home
              </Link>
              <span className="text-slate-300">/</span>
              <span className="text-sm font-semibold text-slate-800">Fleet Assets</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">Fleet Asset Management</h1>
            <p className="text-sm text-slate-600">Register new vehicles and monitor inventory capacity</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/fleet/qr-cards"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition"
            >
              🪪 View QR Placards
            </Link>
            <Link
              href="/bookings"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              ← Back to Bookings
            </Link>
          </div>
        </div>

        {/* Vehicle Registration Form */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Register New Asset</h2>
          <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Registration Number
              </label>
              <input
                type="text"
                required
                placeholder="e.g. GJ-06-XX-1234"
                value={regNumber}
                onChange={(e) => setRegNumber(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Make & Model
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Toyota Innova Crysta"
                value={makeModel}
                onChange={(e) => setMakeModel(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as VehicleCategory)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="SEDAN_4">Sedan (4 Seater)</option>
                <option value="MPV_6">MPV / SUV (6 Seater)</option>
                <option value="BUS_42">Plant Bus (42 Seater)</option>
                <option value="BUS_52">Plant Bus (52 Seater)</option>
              </select>
            </div>
            <div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-slate-900 py-2 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              >
                {submitting ? 'Registering...' : 'Add Vehicle'}
              </button>
            </div>
          </form>
        </div>

        {/* Fleet Assets Roster */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-800">
              Registered Fleet Assets ({vehicles.length})
            </h3>
            <button
              onClick={loadVehicles}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Loading vehicles...</div>
          ) : vehicles.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No fleet assets found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-xs uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Registration</th>
                    <th className="py-3 px-4">Model</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Capacity</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Placard</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vehicles.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/75">
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">{v.registration_number}</td>
                      <td className="py-3 px-4 text-slate-800">{v.model}</td>
                      <td className="py-3 px-4 text-slate-600 text-xs">{v.category}</td>
                      <td className="py-3 px-4 text-slate-700">{v.seat_capacity} seats</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          v.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-800' :
                          v.status === 'ON_TRIP' ? 'bg-purple-100 text-purple-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {v.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          href="/fleet/qr-cards"
                          className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline"
                        >
                          View QR
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
