'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';
import type { Vehicle, VehicleCategory } from '@plant-transit/shared-types';

export default function FleetPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [siteId, setSiteId] = useState<string>('11111111-1111-1111-1111-111111111111');
  const [registrationNumber, setRegistrationNumber] = useState<string>('');
  const [makeModel, setMakeModel] = useState<string>('');
  const [category, setCategory] = useState<VehicleCategory>('SEDAN_4');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const loadVehicles = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchApi<{ success: boolean; vehicles: Vehicle[] }>('/api/fleet/vehicles');
      setVehicles(res.vehicles || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch vehicles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();
  }, []);

  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registrationNumber || !makeModel) return;

    try {
      setSubmitting(true);
      await fetchApi('/api/fleet/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          site_id: siteId,
          registration_number: registrationNumber,
          model: makeModel, seat_capacity: 4,
          category,
        }),
      });

      setRegistrationNumber('');
      setMakeModel('');
      await loadVehicles();
    } catch (err: any) {
      alert(`Error registering vehicle: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const categoryCapacity = (cat: VehicleCategory) => {
    switch (cat) {
      case 'SEDAN_4': return '4 Seats';
      case 'MPV_6': return '6 Seats';
      case 'BUS_42': return '42 Seats';
      case 'BUS_52': return '52 Seats';
      default: return '4 Seats';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-800">
                ← Home
              </Link>
              <span className="text-slate-300">/</span>
              <span className="text-sm font-semibold text-slate-800">Fleet Inventory</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">Fleet Inventory & Master Assets</h1>
            <p className="text-sm text-slate-600">Register and monitor plant cars, MPVs, and employee shuttles</p>
          </div>
          <Link
            href="/bookings"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition"
          >
            Go to Booking Engine →
          </Link>
        </div>

        {/* Add New Vehicle Form Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Register New Fleet Asset</h2>
          <form onSubmit={handleCreateVehicle} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Reg Number
              </label>
              <input
                type="text"
                required
                placeholder="e.g. GJ-06-AB-1234"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Capacity Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as VehicleCategory)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="SEDAN_4">Sedan (4 Seater)</option>
                <option value="MPV_6">MPV / SUV (6 Seater)</option>
                <option value="BUS_42">Plant Bus (42 Seater)</option>
                <option value="BUS_52">Plant Bus (52 Seater)</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-slate-900 py-2.5 text-sm font-semibold text-white shadow hover:bg-slate-800 disabled:opacity-50 transition"
              >
                {submitting ? 'Registering...' : 'Add Vehicle'}
              </button>
            </div>
          </form>
        </div>

        {/* Fleet Roster Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-800">
              Active Fleet List ({vehicles.length})
            </h3>
            <button
              onClick={loadVehicles}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Loading fleet inventory...</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-red-600">{error}</div>
          ) : vehicles.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No vehicles registered yet. Add one above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-xs uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Registration</th>
                    <th className="py-3 px-4">Model</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Total Seats</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vehicles.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/75 transition">
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">{v.registration_number}</td>
                      <td className="py-3 px-4 text-slate-700">{v.model}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                          {v.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-medium">{v.seat_capacity}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          v.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-800' :
                          v.status === 'ON_TRIP' ? 'bg-blue-100 text-blue-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {v.status}
                        </span>
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
