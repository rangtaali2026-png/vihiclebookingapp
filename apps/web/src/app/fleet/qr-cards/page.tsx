'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { fetchApi } from '@/lib/api';
import type { Vehicle } from '@plant-transit/shared-types';

export default function VehicleQrCardsPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const loadVehicles = async () => {
    try {
      setLoading(true);
      const res = await fetchApi<{ success: boolean; vehicles: Vehicle[] }>('/api/fleet/vehicles');
      setVehicles(res.vehicles || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 print:bg-white print:p-0">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header - Hidden during print */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 print:hidden">
          <div>
            <div className="flex items-center gap-2">
              <Link href="/fleet" className="text-sm font-medium text-slate-500 hover:text-slate-800">
                ← Fleet Assets
              </Link>
              <span className="text-slate-300">/</span>
              <span className="text-sm font-semibold text-slate-800">QR Placards</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">Vehicle Windshield QR Badges</h1>
            <p className="text-sm text-slate-600">Printable scanning badges for passenger boarding check-in</p>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition"
          >
            🖨️ Print All Badges
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500 bg-white rounded-xl">Loading fleet assets...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 print:grid-cols-2 print:gap-4">
            {vehicles.map((v) => {
              const boardingUrl = `https://vehiclebookingapp.pages.dev/board?vehicle_id=${v.id}`;

              return (
                <div
                  key={v.id}
                  className="bg-white rounded-2xl border-2 border-slate-300 p-6 flex flex-col items-center text-center shadow-xs print:shadow-none print:border-black page-break-inside-avoid"
                >
                  <div className="w-full flex items-center justify-between border-b border-slate-200 pb-2 mb-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-700">PLANT TRANSIT</span>
                    <span className="text-xs font-mono text-slate-500">{v.category}</span>
                  </div>

                  <h2 className="text-xl font-black font-mono tracking-tight text-slate-900 mb-0.5">
                    {v.registration_number}
                  </h2>
                  <p className="text-xs font-medium text-slate-600 mb-4">{v.model} • {v.seat_capacity} Seats</p>

                  <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-inner mb-4">
                    <QRCodeSVG
                      value={boardingUrl}
                      size={180}
                      level="H"
                      includeMargin={false}
                    />
                  </div>

                  <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                    Scan with Phone Camera to Board
                  </p>
                  <p className="text-[9px] font-mono text-slate-400 mt-1 truncate max-w-full">
                    {boardingUrl}
                  </p>

                  <div className="w-full border-t border-slate-100 pt-3 mt-4 text-[10px] text-slate-400">
                    Vadodara Chemical & Polymer Complex
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
