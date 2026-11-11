'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import AppNavbar from '@/components/AppNavbar';
import { useAuth } from '@/lib/auth-context';
import { fetchApi } from '@/lib/api';
import {
  Car,
  User,
  Phone,
  Plus,
  Edit2,
  Trash2,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  X,
  Search,
  RotateCcw,
  ShieldCheck,
  ChevronRight,
  FileText,
  Calendar
} from 'lucide-react';

interface Driver {
  id: string;
  name: string;
  mobile_number: string;
  license_number?: string;
  license_expiry?: string;
  status?: string;
}

interface Vehicle {
  id: string;
  site_id: string;
  registration_number: string;
  model: string;
  category: string;
  capacity: number;
  status: string;
  default_driver_id?: string;
  default_driver?: Driver | null;
}

export default function FleetManagementPage() {
  const { session } = useAuth();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal States
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [isEditDriverOpen, setIsEditDriverOpen] = useState(false);
  const [selectedVehicleForDriver, setSelectedVehicleForDriver] = useState<Vehicle | null>(null);

  // Add Vehicle Form State
  const [newRegNo, setNewRegNo] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newCategory, setNewCategory] = useState('SEDAN_4');
  const [newCapacity, setNewCapacity] = useState(4);
  const [driverOption, setDriverOption] = useState<'EXISTING' | 'NEW'>('EXISTING');
  const [selectedDriverId, setSelectedDriverId] = useState('');

  // Quick Driver State (Option B)
  const [quickDriverName, setQuickDriverName] = useState('');
  const [quickDriverMobile, setQuickDriverMobile] = useState('');
  const [quickDriverLicense, setQuickDriverLicense] = useState('');
  const [quickDriverExpiry, setQuickDriverExpiry] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 5);
    return d.toISOString().slice(0, 10);
  });
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // Edit Driver Form State
  const [editDriverId, setEditDriverId] = useState('');
  const [editDriverMobile, setEditDriverMobile] = useState('');
  const [editDriverLicense, setEditDriverLicense] = useState('');
  const [editDriverExpiry, setEditDriverExpiry] = useState('');
  const [submittingEditDriver, setSubmittingEditDriver] = useState(false);

  // Load Vehicles & Active Drivers
  const loadFleetData = async () => {
    setLoading(true);
    try {
      const siteQuery = session?.siteId ? `?site_id=${session.siteId}` : '';
      
      const [vRes, dRes] = await Promise.all([
        fetchApi<any>(`/api/fleet/vehicles${siteQuery}`),
        fetchApi<any>(`/api/fleet/drivers${siteQuery}`)
      ]);

      const vehicleList = Array.isArray(vRes) ? vRes : vRes.vehicles || [];
      const driverList = Array.isArray(dRes) ? dRes : dRes.drivers || [];

      setVehicles(vehicleList);
      setDrivers(driverList);
    } catch (err: any) {
      console.error('Failed to load fleet data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFleetData();
  }, [session?.siteId]);

  // Open Edit Driver Modal
  const handleOpenEditDriver = (vehicle: Vehicle) => {
    setSelectedVehicleForDriver(vehicle);
    setEditDriverId(vehicle.default_driver_id || '');
    setEditDriverMobile(vehicle.default_driver?.mobile_number || '');
    setEditDriverLicense(vehicle.default_driver?.license_number || '');
    setEditDriverExpiry(
      vehicle.default_driver?.license_expiry
        ? vehicle.default_driver.license_expiry.slice(0, 10)
        : ''
    );
    setIsEditDriverOpen(true);
  };

  // Save Driver Reassignment / Update
  const handleSaveDriverAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicleForDriver) return;

    setSubmittingEditDriver(true);
    setFeedback(null);

    try {
      await fetchApi<any>('/api/fleet/vehicles/assign-driver', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: selectedVehicleForDriver.id,
          driver_id: editDriverId || null,
          driver_mobile: editDriverMobile,
          license_number: editDriverLicense,
          license_expiry: editDriverExpiry
        })
      });

      // Update state in-place without page reload
      setVehicles((prev) =>
        prev.map((v) =>
          v.id === selectedVehicleForDriver.id
            ? {
                ...v,
                default_driver_id: editDriverId || undefined,
                default_driver: editDriverId
                  ? {
                      id: editDriverId,
                      name: drivers.find((d) => d.id === editDriverId)?.name || v.default_driver?.name || 'Driver',
                      mobile_number: editDriverMobile || v.default_driver?.mobile_number || '',
                      license_number: editDriverLicense || v.default_driver?.license_number,
                      license_expiry: editDriverExpiry || v.default_driver?.license_expiry
                    }
                  : null
              }
            : v
        )
      );

      setFeedback({
        type: 'success',
        message: editDriverId
          ? `Driver record and assignment updated for ${selectedVehicleForDriver.registration_number}.`
          : `Driver unassigned from ${selectedVehicleForDriver.registration_number}.`
      });
      setIsEditDriverOpen(false);
      loadFleetData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update driver assignment' });
    } finally {
      setSubmittingEditDriver(false);
    }
  };

  // Submit Add Vehicle Modal
  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingAdd(true);
    setFeedback(null);

    try {
      let finalDriverId = selectedDriverId;

      // Option B: Quick Add New Driver with License & Expiry
      if (driverOption === 'NEW' && quickDriverName.trim() && quickDriverMobile.trim()) {
        const dRes = await fetchApi<any>('/api/fleet/drivers', {
          method: 'POST',
          body: JSON.stringify({
            site_id: session?.siteId || '11111111-1111-1111-1111-111111111111',
            name: quickDriverName.trim(),
            mobile_number: quickDriverMobile.trim(),
            license_number: quickDriverLicense.trim() || `DL-GJ-${Date.now().toString().slice(-6)}`,
            license_expiry: quickDriverExpiry || new Date(Date.now() + 5*365*24*60*60*1000).toISOString().slice(0, 10),
            status: 'AVAILABLE'
          })
        });
        if (dRes?.driver?.id) {
          finalDriverId = dRes.driver.id;
        }
      }

      await fetchApi('/api/fleet/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          site_id: session?.siteId || '11111111-1111-1111-1111-111111111111',
          registration_number: newRegNo.trim().toUpperCase(),
          model: newModel.trim(),
          category: newCategory,
          capacity: Number(newCapacity),
          seat_capacity: Number(newCapacity),
          status: 'ACTIVE',
          default_driver_id: finalDriverId || null
        })
      });

      setFeedback({ type: 'success', message: `Vehicle ${newRegNo.toUpperCase()} created successfully.` });
      setIsAddVehicleOpen(false);
      
      // Reset form
      setNewRegNo('');
      setNewModel('');
      setSelectedDriverId('');
      setQuickDriverName('');
      setQuickDriverMobile('');
      setQuickDriverLicense('');
      loadFleetData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to create vehicle' });
    } finally {
      setSubmittingAdd(false);
    }
  };

  const filteredVehicles = vehicles.filter((v) =>
    v.registration_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.default_driver?.name && v.default_driver.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-smart-bg flex flex-col font-sans">
      <AppNavbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-widest text-smart-blue uppercase bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                Fleet Controller
              </span>
              <span className="text-smart-muted">•</span>
              <span className="text-xs text-smart-muted font-medium">{session?.siteName || 'Vadodara Chemical Complex'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-smart-navy tracking-tight mt-1">
              Fleet Asset & Permanent Driver Roster
            </h1>
            <p className="text-xs sm:text-sm text-smart-muted mt-0.5">
              Manage plant transit cars, buses, and verified commercial driving licenses.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dispatch"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-smart-border bg-white text-smart-navy hover:text-smart-blue text-xs font-bold shadow-smart-sm transition"
            >
              <span>Dispatch Console</span>
              <ChevronRight className="w-4 h-4 text-smart-muted" />
            </Link>

            <button
              type="button"
              onClick={() => setIsAddVehicleOpen(true)}
              className="smart-gradient-blue text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-smart-lg hover:opacity-95 transition flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Vehicle</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div className={`p-4 rounded-xl text-xs flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-smart-success font-semibold'
              : 'bg-red-50 border border-red-200 text-smart-danger font-semibold'
          }`}>
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Toolbar */}
        <div className="smart-glass-card p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-smart-muted absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search reg no, model, or driver name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-smart-border rounded-xl pl-9 pr-3 py-2 text-xs text-smart-navy placeholder-slate-400 focus:bg-white focus:border-smart-blue focus:outline-none transition"
            />
          </div>

          <button
            onClick={loadFleetData}
            className="text-xs text-smart-blue hover:underline font-bold flex items-center gap-1 self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Refresh Roster</span>
          </button>
        </div>

        {/* Fleet Management Table */}
        <div className="smart-glass-card p-0 overflow-hidden shadow-smart">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-smart-muted border-b border-smart-border uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3.5 px-4 font-bold">Vehicle No</th>
                  <th className="py-3.5 px-4 font-bold">Model & Capacity</th>
                  <th className="py-3.5 px-4 font-bold">Permanent Driver</th>
                  <th className="py-3.5 px-4 font-bold">Commercial License</th>
                  <th className="py-3.5 px-4 font-bold">Contact</th>
                  <th className="py-3.5 px-4 font-bold">Status</th>
                  <th className="py-3.5 px-4 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-smart-border text-smart-navy">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-smart-muted">Loading fleet inventory...</td>
                  </tr>
                ) : filteredVehicles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-smart-muted">No vehicles registered. Click "+ Add Vehicle" to onboard.</td>
                  </tr>
                ) : (
                  filteredVehicles.map((v) => {
                    const hasDriver = !!v.default_driver;
                    return (
                      <tr key={v.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3.5 px-4 font-mono font-black text-smart-navy">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-smart-blue"></span>
                            <span>{v.registration_number}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-smart-navy">{v.model}</div>
                          <div className="text-[11px] text-smart-muted font-medium">
                            {v.category} • {v.capacity || 4} Seats
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {hasDriver ? (
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-blue-50 text-smart-blue flex items-center justify-center font-bold text-[11px]">
                                {v.default_driver?.name.charAt(0)}
                              </div>
                              <span className="font-bold text-smart-navy">{v.default_driver?.name}</span>
                            </div>
                          ) : (
                            <span className="italic text-smart-muted">Unassigned</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {v.default_driver?.license_number ? (
                            <div>
                              <div className="font-mono font-bold text-smart-navy text-[11px]">
                                {v.default_driver.license_number}
                              </div>
                              <div className="text-[10px] text-smart-muted flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-smart-blue" />
                                <span>Exp: {v.default_driver.license_expiry ? new Date(v.default_driver.license_expiry).toLocaleDateString('en-IN') : 'N/A'}</span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-smart-muted">—</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-[11px] text-smart-muted font-medium">
                          {v.default_driver?.mobile_number ? (
                            <div className="flex items-center gap-1.5">
                              <Phone className="w-3 h-3 text-smart-cyan" />
                              <span>{v.default_driver.mobile_number}</span>
                            </div>
                          ) : (
                            <span>—</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            v.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-smart-success border-emerald-200'
                              : 'bg-amber-50 text-smart-warning border-amber-200'
                          }`}>
                            {v.status || 'ACTIVE'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenEditDriver(v)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-smart-sm active:scale-95 ${
                              hasDriver
                                ? 'bg-blue-50 text-smart-blue border border-blue-200 hover:bg-blue-100'
                                : 'smart-gradient-blue text-white hover:opacity-95'
                            }`}
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>{hasDriver ? 'Edit Driver ✏️' : 'Assign Driver ➕'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {/* =======================================================================
          A. "Add Vehicle" Modal with Driver License & Expiry (Option B)
      ======================================================================= */}
      {isAddVehicleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-smart-navy/40 backdrop-blur-md">
          <div className="w-full max-w-lg bg-white border border-smart-border rounded-2xl p-6 shadow-smart-lg space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-smart-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-50 text-smart-blue">
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-smart-navy">Add Fleet Vehicle</h3>
                  <p className="text-xs text-smart-muted">Register vehicle asset & link dedicated driver.</p>
                </div>
              </div>
              <button onClick={() => setIsAddVehicleOpen(false)} className="p-1 rounded-lg text-smart-muted hover:text-smart-navy">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateVehicle} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-smart-navy mb-1 font-bold">Vehicle Registration No</label>
                  <input
                    type="text"
                    required
                    placeholder="GJ-06-AX-1001"
                    value={newRegNo}
                    onChange={(e) => setNewRegNo(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-smart-border text-smart-navy font-mono uppercase focus:border-smart-blue focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-smart-navy mb-1 font-bold">Model & Make</label>
                  <input
                    type="text"
                    required
                    placeholder="Maruti Dzire VXi"
                    value={newModel}
                    onChange={(e) => setNewModel(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-smart-border text-smart-navy focus:border-smart-blue focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-smart-navy mb-1 font-bold">Target Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => {
                      setNewCategory(e.target.value);
                      if (e.target.value === 'SEDAN_4') setNewCapacity(4);
                      else if (e.target.value === 'SUV_6') setNewCapacity(6);
                      else if (e.target.value === 'VAN_12') setNewCapacity(12);
                      else if (e.target.value === 'BUS_50') setNewCapacity(50);
                    }}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-smart-border text-smart-navy font-bold focus:border-smart-blue focus:outline-none"
                  >
                    <option value="SEDAN_4">SEDAN_4 (4 Seats)</option>
                    <option value="SUV_6">SUV_6 (6 Seats)</option>
                    <option value="VAN_12">VAN_12 (12 Seats)</option>
                    <option value="BUS_50">BUS_50 (50 Seats)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-smart-navy mb-1 font-bold">Seat Capacity</label>
                  <input
                    type="number"
                    required
                    value={newCapacity}
                    onChange={(e) => setNewCapacity(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-smart-border text-smart-navy focus:border-smart-blue focus:outline-none"
                  />
                </div>
              </div>

              {/* Driver Section */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-smart-border space-y-3">
                <span className="block text-smart-navy font-bold uppercase tracking-wider text-[10px]">
                  Permanent / Dedicated Driver Assignment
                </span>

                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-smart-navy">
                    <input
                      type="radio"
                      name="driverOption"
                      checked={driverOption === 'EXISTING'}
                      onChange={() => setDriverOption('EXISTING')}
                      className="accent-smart-blue"
                    />
                    <span>Option A: Pick Existing Driver</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-smart-navy">
                    <input
                      type="radio"
                      name="driverOption"
                      checked={driverOption === 'NEW'}
                      onChange={() => setDriverOption('NEW')}
                      className="accent-smart-blue"
                    />
                    <span>Option B: Quick Add New Driver</span>
                  </label>
                </div>

                {driverOption === 'EXISTING' ? (
                  <div>
                    <select
                      value={selectedDriverId}
                      onChange={(e) => setSelectedDriverId(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-white border border-smart-border text-smart-navy font-bold focus:border-smart-blue focus:outline-none"
                    >
                      <option value="">-- No permanent driver (Unassigned) --</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.mobile_number}) {d.license_number ? `• ${d.license_number}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-2.5 pt-1">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-smart-navy text-[10px] font-bold mb-1">Driver Full Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Suresh Rathod"
                          value={quickDriverName}
                          onChange={(e) => setQuickDriverName(e.target.value)}
                          className="w-full bg-white border border-smart-border rounded-xl p-2 text-xs text-smart-navy focus:border-smart-blue focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-smart-navy text-[10px] font-bold mb-1">Mobile Number *</label>
                        <input
                          type="tel"
                          required
                          placeholder="+91 99989 93551"
                          value={quickDriverMobile}
                          onChange={(e) => setQuickDriverMobile(e.target.value)}
                          className="w-full bg-white border border-smart-border rounded-xl p-2 text-xs text-smart-navy focus:border-smart-blue focus:outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-smart-navy text-[10px] font-bold mb-1">License Number</label>
                        <div className="relative">
                          <FileText className="w-3.5 h-3.5 text-smart-muted absolute left-2.5 top-2.5" />
                          <input
                            type="text"
                            placeholder="GJ-06-2020-0012345"
                            value={quickDriverLicense}
                            onChange={(e) => setQuickDriverLicense(e.target.value)}
                            className="w-full bg-white border border-smart-border rounded-xl pl-8 pr-2 py-2 text-xs text-smart-navy font-mono uppercase focus:border-smart-blue focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-smart-navy text-[10px] font-bold mb-1">License Expiry Date *</label>
                        <div className="relative">
                          <Calendar className="w-3.5 h-3.5 text-smart-muted absolute left-2.5 top-2.5" />
                          <input
                            type="date"
                            required
                            value={quickDriverExpiry}
                            onChange={(e) => setQuickDriverExpiry(e.target.value)}
                            className="w-full bg-white border border-smart-border rounded-xl pl-8 pr-2 py-2 text-xs text-smart-navy font-medium focus:border-smart-blue focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-smart-border">
                <button
                  type="button"
                  onClick={() => setIsAddVehicleOpen(false)}
                  className="px-4 py-2 rounded-xl text-smart-muted hover:text-smart-navy font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdd}
                  className="smart-gradient-blue text-white px-5 py-2.5 rounded-xl font-bold shadow-smart-lg hover:opacity-95 transition"
                >
                  {submittingAdd ? 'Saving...' : 'Add Vehicle Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =======================================================================
          C. Driver Edit Modal Workflow (Includes License & Expiry Updates)
      ======================================================================= */}
      {isEditDriverOpen && selectedVehicleForDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-smart-navy/40 backdrop-blur-md">
          <div className="w-full max-w-md bg-white border border-smart-border rounded-2xl p-6 shadow-smart-lg space-y-4">
            <div className="flex items-center justify-between border-b border-smart-border pb-3">
              <div>
                <span className="text-[10px] font-bold text-smart-blue uppercase tracking-wider">
                  Driver Assignment
                </span>
                <h3 className="text-base font-black text-smart-navy">
                  Reassign Driver for {selectedVehicleForDriver.registration_number}
                </h3>
              </div>
              <button onClick={() => setIsEditDriverOpen(false)} className="p-1 rounded-lg text-smart-muted hover:text-smart-navy">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Driver Display */}
            <div className="p-3 rounded-xl bg-slate-50 border border-smart-border flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] text-smart-muted uppercase font-bold block">Current Driver</span>
                <span className="font-bold text-smart-navy">
                  {selectedVehicleForDriver.default_driver?.name || 'Unassigned'}
                </span>
                {selectedVehicleForDriver.default_driver?.mobile_number && (
                  <span className="text-smart-muted block text-[11px] font-mono">
                    {selectedVehicleForDriver.default_driver.mobile_number}
                  </span>
                )}
              </div>

              {selectedVehicleForDriver.default_driver_id && (
                <button
                  type="button"
                  onClick={() => {
                    setEditDriverId('');
                    setEditDriverMobile('');
                    setEditDriverLicense('');
                    setEditDriverExpiry('');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-red-50 text-smart-danger border border-red-200 text-[10px] font-bold hover:bg-red-100 transition"
                >
                  Unlink Driver
                </button>
              )}
            </div>

            <form onSubmit={handleSaveDriverAssignment} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-smart-navy mb-1.5 font-bold">Select Active Plant Driver</label>
                <select
                  value={editDriverId}
                  onChange={(e) => {
                    const did = e.target.value;
                    setEditDriverId(did);
                    const found = drivers.find((d) => d.id === did);
                    if (found) {
                      setEditDriverMobile(found.mobile_number);
                      setEditDriverLicense(found.license_number || '');
                      setEditDriverExpiry(found.license_expiry ? found.license_expiry.slice(0, 10) : '');
                    }
                  }}
                  className="w-full p-2.5 rounded-xl bg-white border border-smart-border text-smart-navy font-bold focus:border-smart-blue focus:outline-none"
                >
                  <option value="">-- No Driver (Leave Unassigned) --</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.mobile_number}) {d.license_number ? `• ${d.license_number}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-smart-navy mb-1 font-bold">Driver Mobile Contact</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-smart-muted absolute left-3 top-2.5" />
                  <input
                    type="tel"
                    placeholder="+91 98250 44444"
                    value={editDriverMobile}
                    onChange={(e) => setEditDriverMobile(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-smart-border text-smart-navy font-mono focus:bg-white focus:border-smart-blue focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-smart-navy mb-1 font-bold">License Number</label>
                  <input
                    type="text"
                    placeholder="GJ-06-2020-XXXX"
                    value={editDriverLicense}
                    onChange={(e) => setEditDriverLicense(e.target.value)}
                    className="w-full p-2 rounded-xl bg-slate-50 border border-smart-border text-smart-navy font-mono uppercase focus:bg-white focus:border-smart-blue focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-smart-navy mb-1 font-bold">License Expiry</label>
                  <input
                    type="date"
                    value={editDriverExpiry}
                    onChange={(e) => setEditDriverExpiry(e.target.value)}
                    className="w-full p-2 rounded-xl bg-slate-50 border border-smart-border text-smart-navy focus:bg-white focus:border-smart-blue focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-smart-border">
                <button
                  type="button"
                  onClick={() => setIsEditDriverOpen(false)}
                  className="px-4 py-2 rounded-xl text-smart-muted hover:text-smart-navy font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEditDriver}
                  className="smart-gradient-blue text-white px-5 py-2.5 rounded-xl font-bold shadow-smart-lg hover:opacity-95 transition"
                >
                  {submittingEditDriver ? 'Saving...' : 'Save Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
