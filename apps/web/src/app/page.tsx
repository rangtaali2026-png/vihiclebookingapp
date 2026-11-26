'use client';

import React, { useState, useEffect, useMemo } from 'react';
import AppNavbar from '@/components/AppNavbar';
import { fetchApi } from '@/lib/api';
import {
  Calendar, Clock, MapPin, Users, ShieldCheck, AlertTriangle,
  Plus, Trash2, CheckCircle2, FileText, Info
} from 'lucide-react';

interface TravelerRow {
  name: string;
  employee_id: string;
  department: string;
  mobile: string;
}

export default function VehicleRequestFormPage() {
  const todayStr = new Date().toISOString().split('T')[0];

  // Dynamic Field Visibility Config controlled by Super Admin -> Form Fields
  const [enabledFields, setEnabledFields] = useState<Record<string, boolean>>({
    requester_name: true,
    employee_id: true,
    department: true,
    contact_no: true,
    request_for: true,
    trip_type: true,
    passenger_count: true,
    traveler_manifest: true,
    pickup_location: true,
    drop_location: true,
    travel_date: true,
    return_date: true,
    pickup_time: true,
    purpose_of_travel: true,
    approval_workflow: true,
    vehicle_category: false,
    cost_center: false,
    pickup_gate_point: false,
    priority_flag: false,
    whatsapp_notify: true
  });

  useEffect(() => {
    fetchApi<{ fields: any[] }>('/api/config/booking-fields')
      .then((res) => {
        if (res?.fields && Array.isArray(res.fields)) {
          const map: Record<string, boolean> = {};
          res.fields.forEach((f) => {
            map[f.key] = Boolean(f.enabled);
          });
          setEnabledFields((prev) => ({ ...prev, ...map }));
        }
      })
      .catch(() => {});
  }, []);

  // Grasim GCD Form State
  const [requestDate] = useState(todayStr);
  const [requesterName, setRequesterName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [department, setDepartment] = useState('');
  const [contactNo, setContactNo] = useState('');

  const [requestFor, setRequestFor] = useState<'Self' | 'Guest'>('Self');
  const [tripType, setTripType] = useState<'One Way Trip' | 'Round Trip'>('One Way Trip');
  const [passengerCount, setPassengerCount] = useState(1);

  const [travelers, setTravelers] = useState<TravelerRow[]>([
    { name: '', employee_id: '', department: '', mobile: '' }
  ]);

  const [pickupLocation, setPickupLocation] = useState('Bharuch Plant Gate 1');
  const [dropLocation, setDropLocation] = useState('Vadodara (Baroda)');
  const [travelDate, setTravelDate] = useState(todayStr);
  const [returnDate, setReturnDate] = useState(todayStr);
  const [pickupTime, setPickupTime] = useState('09:00');
  const [purposeOfTravel, setPurposeOfTravel] = useState('');

  const [fhApprovers, setFhApprovers] = useState<any[]>([]);
  const [uhApprovers, setUhApprovers] = useState<any[]>([]);
  const [selectedFhEmail, setSelectedFhEmail] = useState('');
  const [selectedUhEmail, setSelectedUhEmail] = useState('');

  useEffect(() => {
    fetchApi<{ fh_approvers?: any[]; uh_approvers?: any[] }>('/api/users/approvers')
      .then((res) => {
        const fhList = Array.isArray(res?.fh_approvers) ? res.fh_approvers : [];
        const uhList = Array.isArray(res?.uh_approvers) ? res.uh_approvers : [];
        setFhApprovers(fhList);
        setUhApprovers(uhList);
        if (fhList.length === 1) setSelectedFhEmail(fhList[0].email);
        if (uhList.length === 1) setSelectedUhEmail(uhList[0].email);
      })
      .catch(() => {});
  }, []);


  // Extra Configured Fields (shown only when toggled ON by Super Admin)
  const [vehicleCategory, setVehicleCategory] = useState('SEDAN_4');
  const [costCenter, setCostCenter] = useState('');
  const [pickupGatePoint, setPickupGatePoint] = useState('');
  const [priorityFlag, setPriorityFlag] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  // Sync Traveler rows count with Number of Travelers
  const handlePassengerCountChange = (count: number) => {
    const validCount = Math.max(1, Math.min(20, count));
    setPassengerCount(validCount);
    setTravelers((prev) => {
      if (validCount > prev.length) {
        const extra = Array.from({ length: validCount - prev.length }, () => ({
          name: '',
          employee_id: '',
          department: department || '',
          mobile: ''
        }));
        return [...prev, ...extra];
      }
      return prev.slice(0, validCount);
    });
  };

  // Auto-populate Traveler #1 when Request For = Self
  useEffect(() => {
    if (requestFor === 'Self' && travelers.length > 0) {
      setTravelers((prev) => {
        const copy = [...prev];
        copy[0] = {
          name: requesterName || copy[0].name,
          employee_id: employeeId || copy[0].employee_id,
          department: department || copy[0].department,
          mobile: contactNo || copy[0].mobile
        };
        return copy;
      });
    }
  }, [requestFor, requesterName, employeeId, department, contactNo]);

  // Calculate Total No. of Days
  const totalDays = useMemo(() => {
    if (tripType === 'One Way Trip' || !returnDate || !travelDate) return 1;
    const start = new Date(travelDate);
    const end = new Date(returnDate);
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 1;
  }, [tripType, travelDate, returnDate]);

  // Outstation Detection (Outside Bharuch -> Mandatory FH + UH Approval)
  const isOutstation = useMemo(() => {
    const dest = dropLocation.trim().toLowerCase();
    return dest.length > 0 && !dest.includes('bharuch');
  }, [dropLocation]);

  // 24-Hour Advance Notice Check
  const isLessThan24Hours = useMemo(() => {
    if (!travelDate || !pickupTime) return false;
    const departure = new Date(`${travelDate}T${pickupTime}:00`);
    const hoursDiff = (departure.getTime() - Date.now()) / (1000 * 60 * 60);
    return hoursDiff < 24;
  }, [travelDate, pickupTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const chosenFh = fhApprovers.find((a) => a.email === selectedFhEmail);
      const chosenUh = uhApprovers.find((a) => a.email === selectedUhEmail);
      const payload = {
        request_date: requestDate,
        employee_name: requesterName,
        employee_id: employeeId,
        department,
        mobile: contactNo,
        request_for: requestFor,
        trip_type: tripType,
        passenger_count: passengerCount,
        passenger_manifest: travelers.map((t) => ({
          name: t.name || requesterName,
          employee_id: t.employee_id || employeeId,
          department: t.department || department,
          mobile: t.mobile || contactNo,
          boarded: false
        })),
        pickup_location: pickupGatePoint ? `${pickupLocation} (${pickupGatePoint})` : pickupLocation,
        drop_location: dropLocation,
        travel_date: travelDate,
        return_date: tripType === 'Round Trip' ? returnDate : travelDate,
        total_days: totalDays,
        pickup_time: pickupTime,
        purpose_of_travel: purposeOfTravel,
        is_outstation: isOutstation,
        assigned_fh_approver_id: chosenFh?.id || null,
        assigned_fh_approver_email: chosenFh?.email || null,
        assigned_fh_approver_name: chosenFh?.full_name || null,
        assigned_uh_approver_id: chosenUh?.id || null,
        assigned_uh_approver_email: chosenUh?.email || null,
        assigned_uh_approver_name: chosenUh?.full_name || null,
        vehicle_category: enabledFields.vehicle_category ? vehicleCategory : 'SEDAN_4',
        cost_center: enabledFields.cost_center ? costCenter : null,
        priority_flag: enabledFields.priority_flag ? priorityFlag : false,
        approval_chain: isOutstation
          ? ['Dept. DH Approval', 'Functional Head (FH) Approval', 'Unit Head (UH) Approval', 'FH-HR/Admin Confirmation']
          : ['Dept. DH Approval', 'FH-HR/Admin Confirmation']
      };

      const res = await fetchApi<{ booking?: any; booking_reference?: string }>('/api/bookings', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setSubmittedRef(res?.booking?.booking_reference || res?.booking_reference || 'SUBMITTED');
    } catch (err: any) {
      alert(err.message || 'Failed to submit Vehicle Request Form');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <AppNavbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Form Header */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 mb-2">
              <FileText className="w-3 h-3" /> Aditya Birla • Grasim (GCD)
            </span>
            <h1 className="text-2xl font-black text-slate-900">Vehicle Request Form</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Outstation & Local Plant Cab Requisition (Bharuch, Vadodara/Baroda, Surat, Ahmedabad)
            </p>
          </div>
          <div className="text-right bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl">
            <span className="block text-[10px] font-bold uppercase text-slate-400">Request Date</span>
            <span className="font-mono text-sm font-black text-slate-800">{requestDate}</span>
          </div>
        </div>

        {submittedRef && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <h3 className="text-sm font-black text-emerald-900">
                  Vehicle Request Submitted ({submittedRef})
                </h3>
                <p className="text-xs text-emerald-700">
                  {isOutstation
                    ? 'Routed for mandatory Functional Head (FH) & Unit Head (UH) approval prior to Admin cab allotment.'
                    : 'Routed to Dept. DH & Admin Team for first-come-first-serve cab allotment.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSubmittedRef(null)}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
            >
              New Request
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Requester Details */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
              1. Requester Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {enabledFields.requester_name && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Requester Name *</label>
                  <input
                    type="text"
                    required
                    value={requesterName}
                    onChange={(e) => setRequesterName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-semibold"
                  />
                </div>
              )}
              {enabledFields.employee_id && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Employee ID & Sign *</label>
                  <input
                    type="text"
                    required
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                    placeholder="e.g. EMP-1042"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-900 font-bold"
                  />
                </div>
              )}
              {enabledFields.department && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Department *</label>
                  <input
                    type="text"
                    required
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Operations / HR / IT"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-semibold"
                  />
                </div>
              )}
              {enabledFields.contact_no && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contact No *</label>
                  <input
                    type="tel"
                    required
                    value={contactNo}
                    onChange={(e) => setContactNo(e.target.value)}
                    placeholder="+91 98XXXXXXXX"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-900 font-semibold"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Request For, Trip Mode & Travelers */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
              2. Request Classification & Traveler Details
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              {enabledFields.request_for && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">Request For *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['Self', 'Guest'] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setRequestFor(opt)}
                        className={`py-2 px-3 rounded-xl font-bold border transition ${
                          requestFor === opt
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {enabledFields.trip_type && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">Trip Type *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['One Way Trip', 'Round Trip'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setTripType(mode)}
                        className={`py-2 px-3 rounded-xl font-bold border transition ${
                          tripType === mode
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {enabledFields.passenger_count && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">Number Of Travelers *</label>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    <input
                      type="number"
                      min={1}
                      max={20}
                      required
                      value={passengerCount}
                      onChange={(e) => handlePassengerCountChange(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-900"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Traveler Detail Rows */}
            {enabledFields.traveler_manifest && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-700">
                    Traveler Detail ({travelers.length} {travelers.length === 1 ? 'Person' : 'Persons'})
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePassengerCountChange(passengerCount + 1)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Traveler
                  </button>
                </div>

                <div className="space-y-2">
                  {travelers.map((t, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs"
                    >
                      <div className="sm:col-span-4">
                        <input
                          type="text"
                          required
                          placeholder={`Employee / Guest Name #${idx + 1}`}
                          value={t.name}
                          onChange={(e) => {
                            const copy = [...travelers];
                            copy[idx].name = e.target.value;
                            setTravelers(copy);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-900"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <input
                          type="text"
                          required
                          placeholder="Employee / Guest Code"
                          value={t.employee_id}
                          onChange={(e) => {
                            const copy = [...travelers];
                            copy[idx].employee_id = e.target.value.toUpperCase();
                            setTravelers(copy);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono font-semibold text-slate-900"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          placeholder="Department"
                          value={t.department}
                          onChange={(e) => {
                            const copy = [...travelers];
                            copy[idx].department = e.target.value;
                            setTravelers(copy);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="tel"
                          required
                          placeholder="Contact Number"
                          value={t.mobile}
                          onChange={(e) => {
                            const copy = [...travelers];
                            copy[idx].mobile = e.target.value;
                            setTravelers(copy);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-slate-900"
                        />
                      </div>
                      <div className="sm:col-span-1 text-right">
                        {travelers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handlePassengerCountChange(passengerCount - 1)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Route, Schedule & Purpose */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
              3. Route, Schedule & Purpose Of Travel
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {enabledFields.pickup_location && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Travel From *</label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={pickupLocation}
                      onChange={(e) => setPickupLocation(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-semibold"
                    />
                  </div>
                </div>
              )}

              {enabledFields.drop_location && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Travel Destination *</label>
                  <input
                    type="text"
                    required
                    value={dropLocation}
                    onChange={(e) => setDropLocation(e.target.value)}
                    placeholder="Bharuch, Vadodara, Surat, Ahmedabad..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-semibold"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {['Bharuch Local', 'Vadodara (Baroda)', 'Surat', 'Ahmedabad'].map((city) => (
                      <button
                        key={city}
                        type="button"
                        onClick={() => setDropLocation(city)}
                        className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-[10px] font-bold text-slate-600 transition"
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
              {enabledFields.travel_date && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date Of Travel *</label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="date"
                      required
                      value={travelDate}
                      onChange={(e) => setTravelDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-900"
                    />
                  </div>
                </div>
              )}

              {enabledFields.return_date && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Return Date</label>
                  <input
                    type="date"
                    disabled={tripType === 'One Way Trip'}
                    min={travelDate}
                    value={tripType === 'Round Trip' ? returnDate : travelDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
              )}

              {enabledFields.return_date && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Total No. of Days</label>
                  <div className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono font-black text-slate-800">
                    {totalDays} {totalDays === 1 ? 'Day' : 'Days'}
                  </div>
                </div>
              )}

              {enabledFields.pickup_time && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Pickup Time *</label>
                  <div className="relative">
                    <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="time"
                      required
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 font-mono font-semibold text-slate-900"
                    />
                  </div>
                </div>
              )}
            </div>

            {enabledFields.purpose_of_travel && (
              <div className="text-xs">
                <label className="block font-bold text-slate-700 mb-1">Purpose Of Travel *</label>
                <textarea
                  rows={2}
                  required
                  value={purposeOfTravel}
                  onChange={(e) => setPurposeOfTravel(e.target.value)}
                  placeholder="Specify official visit, plant audit, vendor meeting, or client work..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-medium"
                />
              </div>
            )}

            {/* Extra Configured Fields (Rendered ONLY if toggled ON by Super Admin) */}
            {(enabledFields.vehicle_category ||
              enabledFields.cost_center ||
              enabledFields.pickup_gate_point ||
              enabledFields.priority_flag) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-slate-100 text-xs">
                {enabledFields.vehicle_category && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Vehicle Category</label>
                    <select
                      value={vehicleCategory}
                      onChange={(e) => setVehicleCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900"
                    >
                      <option value="SEDAN_4">Sedan (4 Seater)</option>
                      <option value="SUV_6">SUV / Innova (6 Seater)</option>
                      <option value="BUS">Plant Shuttle / Bus</option>
                    </select>
                  </div>
                )}
                {enabledFields.cost_center && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Cost Center / WBS</label>
                    <input
                      type="text"
                      value={costCenter}
                      onChange={(e) => setCostCenter(e.target.value)}
                      placeholder="e.g. CC-4401"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-900"
                    />
                  </div>
                )}
                {enabledFields.pickup_gate_point && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Plant Gate / Sub-Point</label>
                    <input
                      type="text"
                      value={pickupGatePoint}
                      onChange={(e) => setPickupGatePoint(e.target.value)}
                      placeholder="Admin Block / Main Gate"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900"
                    />
                  </div>
                )}
                {enabledFields.priority_flag && (
                  <div className="flex items-end pb-1">
                    <label className="inline-flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={priorityFlag}
                        onChange={(e) => setPriorityFlag(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      Urgent / VIP Priority
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 4: Grasim GCD Approval Matrix & Policy Notes */}
          {enabledFields.approval_workflow && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  4. Required Approval Chain
                </h2>
                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-extrabold ${
                    isOutstation
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {isOutstation
                    ? 'OUTSTATION (Outside Bharuch): Mandatory FH & UH Approval'
                    : 'LOCAL (Within Bharuch): Dept. DH & Admin Approval'}
                </span>
              </div>

                            {/* Assigned FH & UH Approver Selection Dropdowns (from Access List) */}
              {isOutstation && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 pb-2 text-xs">
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      Select Functional Head (FH) Approver *
                    </label>
                    <select
                      required={isOutstation}
                      value={selectedFhEmail}
                      onChange={(e) => setSelectedFhEmail(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-amber-300 bg-amber-50/30 font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">-- Choose Functional Head from Access List --</option>
                      {fhApprovers.map((fh) => (
                        <option key={fh.email} value={fh.email}>
                          {fh.full_name} ({fh.department || 'Operations'}) — {fh.email}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      Select Unit Head (UH) Approver *
                    </label>
                    <select
                      required={isOutstation}
                      value={selectedUhEmail}
                      onChange={(e) => setSelectedUhEmail(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-amber-300 bg-amber-50/30 font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">-- Choose Unit Head from Access List --</option>
                      {uhApprovers.map((uh) => (
                        <option key={uh.email} value={uh.email}>
                          {uh.full_name} ({uh.department || 'Leadership'}) — {uh.email}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/50">
                  <span className="block text-[10px] font-bold uppercase text-blue-600">Step 1</span>
                  <span className="font-black text-slate-900">Dept. DH Approval</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">Required for all requests</span>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    isOutstation
                      ? 'border-amber-300 bg-amber-50/70'
                      : 'border-slate-200 bg-slate-50 opacity-60'
                  }`}
                >
                  <span className="block text-[10px] font-bold uppercase text-amber-700">Step 2 (Outstation)</span>
                  <span className="font-black text-slate-900">FH Approval</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">
                    {isOutstation ? 'Mandatory Functional Head sign-off' : 'Not required for Bharuch local'}
                  </span>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    isOutstation
                      ? 'border-amber-300 bg-amber-50/70'
                      : 'border-slate-200 bg-slate-50 opacity-60'
                  }`}
                >
                  <span className="block text-[10px] font-bold uppercase text-amber-700">Step 3 (Outstation)</span>
                  <span className="font-black text-slate-900">UH Approval</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">
                    {isOutstation ? 'Mandatory Unit Head sign-off' : 'Not required for Bharuch local'}
                  </span>
                </div>

                <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50">
                  <span className="block text-[10px] font-bold uppercase text-emerald-700">Final Step</span>
                  <span className="font-black text-slate-900">FH-HR / Admin Approval</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">Cab allotment & driver SMS/WhatsApp</span>
                </div>
              </div>

              {/* Policy Notes from Grasim GCD Form */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1.5">
                <div className="font-extrabold text-slate-800 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-blue-600" /> Policy Guidelines:
                </div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Vehicle allotment is on a <strong>first-come, first-serve basis</strong> subject to fleet availability.</li>
                  <li>
                    For all <strong>outstation requirements (outside of Bharuch)</strong> such as Baroda (Vadodara), Surat, Ahmedabad, etc.,{' '}
                    <strong>Functional Head&apos;s (FH) and Unit Head&apos;s (UH) approval is mandatory</strong>.
                  </li>
                  <li>
                    For any planned visit, please inform Admin <strong>at least 24 hours in advance</strong> (applicable to both local and outstation trips).
                  </li>
                </ul>
              </div>

              {isLessThan24Hours && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  Advisory: Travel is within 24 hours. Please coordinate directly with the Admin Desk after submitting.
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 rounded-xl bg-blue-600 text-white text-sm font-black shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {submitting ? 'Submitting Vehicle Request...' : 'Submit Vehicle Request Form'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
