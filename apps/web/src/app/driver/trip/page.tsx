'use client';

import React, { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { fetchApi } from '@/lib/api';

function DriverTripConsoleContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('id') || '';

  const [trip, setTrip] = useState<any>(null);
  const [isTransmitting, setIsTransmitting] = useState<boolean>(false);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number; speed: number } | null>(null);
  const [lastPingTime, setLastPingTime] = useState<string | null>(null);
  const [pingCount, setPingCount] = useState<number>(0);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!bookingId) return;
    fetchApi<{ success: boolean; tracking: any }>(`/api/telemetry/live?booking_id=${bookingId}`)
      .then((res) => {
        if (res.tracking) setTrip(res.tracking);
      })
      .catch((err) => console.error('Trip fetch error:', err));
  }, [bookingId]);

  useEffect(() => {
    if (!isTransmitting || !trip?.vehicle?.id) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!('geolocation' in navigator)) {
      alert('Geolocation is not supported by your browser.');
      setIsTransmitting(false);
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const speed = Math.round((pos.coords.speed || 0) * 3.6);

        setCurrentCoords({ lat, lng, speed });

        try {
          await fetchApi('/api/telemetry/ping', {
            method: 'POST',
            body: JSON.stringify({
              booking_id: bookingId,
              vehicle_id: trip.vehicle.id,
              latitude: lat,
              longitude: lng,
              speed,
              heading: pos.coords.heading || 0,
              accuracy: pos.coords.accuracy || 0,
            }),
          });
          setLastPingTime(new Date().toLocaleTimeString());
          setPingCount((prev) => prev + 1);
        } catch (err) {
          console.error('Failed to transmit GPS ping:', err);
        }
      },
      (err) => console.error('Geolocation watch error:', err),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isTransmitting, trip, bookingId]);

  const handleUpdateStatus = async (newStatus: 'DISPATCHED' | 'COMPLETED') => {
    try {
      setActionLoading(true);
      await fetchApi(`/api/dispatch/${bookingId}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: newStatus,
          vehicle_id: trip.vehicle?.id,
          driver_id: trip.driver?.id,
        }),
      });

      if (newStatus === 'DISPATCHED') {
        setIsTransmitting(true);
      } else if (newStatus === 'COMPLETED') {
        setIsTransmitting(false);
      }

      setTrip((prev: any) => ({ ...prev, status: newStatus }));
    } catch (err: any) {
      alert(`Status update failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 flex flex-col justify-between max-w-md mx-auto">
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono tracking-widest text-emerald-400 uppercase bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded-full">
            Driver Cockpit
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            trip?.status === 'COMPLETED' ? 'bg-slate-800 text-slate-400' :
            trip?.status === 'DISPATCHED' ? 'bg-blue-900/60 text-blue-300' :
            'bg-amber-900/60 text-amber-300'
          }`}>
            {trip?.status || 'LOADING...'}
          </span>
        </div>

        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {trip ? trip.vehicle?.registration_number : 'Loading Transit...'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Ref: <span className="font-mono text-slate-200">{trip?.booking_reference}</span>
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold">●</span>
            <span className="text-slate-300">From: <strong>{trip?.origin?.name}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-purple-400 font-bold">■</span>
            <span className="text-slate-300">To: <strong>{trip?.destination?.name}</strong></span>
          </div>
        </div>
      </div>

      <div className="my-6 text-center space-y-4">
        <div className="relative inline-flex items-center justify-center p-8 rounded-full border-4 border-slate-800 bg-slate-900 shadow-2xl">
          <div>
            <span className="text-5xl font-black font-mono text-white">
              {currentCoords ? currentCoords.speed : 0}
            </span>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">KM/H</p>
          </div>
        </div>

        <div className="text-xs font-mono space-y-1">
          <p className="text-slate-400">
            GPS Beacon: <strong className={isTransmitting ? 'text-emerald-400' : 'text-slate-500'}>
              {isTransmitting ? 'TRANSMITTING LIVE' : 'STANDBY'}
            </strong>
          </p>
          {lastPingTime && (
            <p className="text-[11px] text-slate-500">
              Pings Sent: {pingCount} • Last Sync: {lastPingTime}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 pb-4">
        {trip?.status !== 'DISPATCHED' && trip?.status !== 'COMPLETED' ? (
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => handleUpdateStatus('DISPATCHED')}
            className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-bold shadow-lg shadow-blue-950/50 active:scale-[0.98] transition"
          >
            {actionLoading ? 'Starting Transit...' : '▶ Start Trip & Begin GPS Stream'}
          </button>
        ) : trip?.status === 'DISPATCHED' ? (
          <>
            <button
              type="button"
              onClick={() => setIsTransmitting((prev) => !prev)}
              className={`w-full py-3 rounded-xl border text-xs font-bold transition ${
                isTransmitting
                  ? 'border-amber-500/50 bg-amber-950/40 text-amber-300'
                  : 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
              }`}
            >
              {isTransmitting ? '⏸ Pause GPS Transmission' : '▶ Resume GPS Transmission'}
            </button>

            <button
              type="button"
              disabled={actionLoading}
              onClick={() => handleUpdateStatus('COMPLETED')}
              className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold shadow-lg shadow-emerald-950/50 active:scale-[0.98] transition"
            >
              {actionLoading ? 'Finishing...' : '✓ Complete Trip at Destination'}
            </button>
          </>
        ) : (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400">
            Trip has been completed successfully.
          </div>
        )}
      </div>
    </div>
  );
}

export default function DriverTripConsole() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <DriverTripConsoleContent />
    </Suspense>
  );
}