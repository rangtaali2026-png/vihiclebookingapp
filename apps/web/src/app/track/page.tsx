'use client';

import 'leaflet/dist/leaflet.css';
import React, { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';

function LiveTrackPageContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('id') || '';

  const [trackingData, setTrackingData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const pollIntervalRef = useRef<any>(null);

  const fetchTelemetry = async () => {
    if (!bookingId) {
      setLoading(false);
      return null;
    }

    try {
      const res = await fetchApi<{ success: boolean; tracking: any }>(`/api/telemetry/live?booking_id=${bookingId}`);
      if (res.tracking) {
        setTrackingData(res.tracking);
        return res.tracking;
      }
    } catch (err) {
      console.error('Failed to fetch telemetry:', err);
    } finally {
      setLoading(false);
    }
    return null;
  };

  useEffect(() => {
    if (!bookingId || typeof window === 'undefined' || !mapContainerRef.current) return;

    let isMounted = true;

    const defaultLat = 22.3072;
    const defaultLng = 73.1812;

    const initializeMap = async () => {
      try {
        const L = await import('leaflet');
        if (!isMounted || !mapContainerRef.current || mapInstanceRef.current) return;

        const map = L.map(mapContainerRef.current, {
          zoomControl: true,
          attributionControl: false
        }).setView([defaultLat, defaultLng], 12);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            subdomains: ['a', 'b', 'c'],
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }).addTo(map);

        mapInstanceRef.current = map;
        let destinationMarker: import('leaflet').Marker | null = null;

        const vehicleIcon = L.divIcon({
          className: 'custom-vehicle-marker',
          html: '<div style="background-color:#2563eb; color:white; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:3px solid white; box-shadow:0 4px 10px rgba(0,0,0,0.3); font-size:16px;">🚍</div>',
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        });
        markerRef.current = L.marker([defaultLat, defaultLng], { icon: vehicleIcon }).addTo(map);

        setTimeout(() => {
          if (isMounted && mapInstanceRef.current === map) map.invalidateSize();
        }, 250);

        const updateTracking = async () => {
          const data = await fetchTelemetry();
          if (!isMounted || !data || mapInstanceRef.current !== map) return;

          const latitude = data.current_position?.latitude ?? defaultLat;
          const longitude = data.current_position?.longitude ?? defaultLng;
          markerRef.current?.setLatLng([latitude, longitude]);
          map.setView([latitude, longitude], 13);

          const destination = data.destination?.coords;
          if (!destinationMarker && destination && Number.isFinite(destination.lat) && Number.isFinite(destination.lng)) {
            const destinationIcon = L.divIcon({
              className: 'custom-dest-marker',
              html: '<div style="background-color:#7c3aed; color:white; width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; border:2px solid white; font-weight:bold; font-size:13px;">🏢</div>',
              iconSize: [28, 28],
              iconAnchor: [14, 14]
            });
            destinationMarker = L.marker([destination.lat, destination.lng], { icon: destinationIcon })
              .addTo(map)
              .bindPopup(`Destination: ${data.destination.name || 'Destination'}`);
          }
        };

        await updateTracking();
        if (isMounted) {
          pollIntervalRef.current = setInterval(updateTracking, 5000);
        }
      } catch (error) {
        console.error('Failed to initialize tracking map:', error);
      }
    };

    void initializeMap();

    return () => {
      isMounted = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [bookingId]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <header className="bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-5 py-3.5 flex items-center justify-between z-20">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/dispatch" className="text-xs font-semibold text-purple-400 hover:text-purple-300">
              ← Dispatch Console
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs text-slate-400 font-mono">{trackingData?.booking_reference || bookingId}</span>
          </div>
          <h1 className="text-base font-bold text-white mt-0.5">Live Transit Radar</h1>
        </div>

        {trackingData && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Estimated ETA</span>
              <span className="text-lg font-black text-emerald-400">
                ~{trackingData.telemetry.estimated_arrival_minutes} mins
              </span>
            </div>
          </div>
        )}
      </header>

      <div className="relative flex-1 w-full h-[calc(100vh-140px)] min-h-[500px] overflow-hidden bg-slate-950">
        <div ref={mapContainerRef} id="leaflet-track-map" className="absolute inset-0 w-full h-full z-0 bg-[#0f172a]" style={{ minHeight: "100vh", height: "100%", width: "100%" }}></div>

        {trackingData && (
          <div className="absolute top-4 left-4 z-1000 bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl backdrop-blur-md text-xs text-slate-200 max-w-xs space-y-2">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="font-bold text-white">{trackingData.vehicle?.registration_number}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-900/60 text-blue-300">
                {trackingData.vehicle?.model}
              </span>
            </div>
            <p className="text-slate-400">
              Driver: <strong className="text-white">{trackingData.driver?.name}</strong> ({trackingData.driver?.mobile_number})
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
              <div>
                <span className="text-slate-500">Remaining:</span>
                <p className="text-emerald-400 font-bold">{trackingData.telemetry.remaining_distance_km} km</p>
              </div>
              <div>
                <span className="text-slate-500">Live Speed:</span>
                <p className="text-purple-400 font-bold">{trackingData.current_position.speed} km/h</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {trackingData && (
        <footer className="bg-slate-950 border-t border-slate-800 p-4 text-xs text-slate-300 z-20">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Active Route</span>
              <p className="font-semibold text-white">
                {trackingData.origin.name} → {trackingData.destination.name}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/board?vehicle_id=${trackingData.vehicle?.id}`}
                className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:text-white font-semibold"
              >
                Boarding Manifest
              </Link>
              <Link
                href={`/driver/trip?id=${encodeURIComponent(bookingId)}`}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold"
              >
                Open Driver Cockpit →
              </Link>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

export default function LiveTrackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <LiveTrackPageContent />
    </Suspense>
  );
}