import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { fetchApi } from './api';

interface OfflineScan {
  id?: number;
  booking_id?: string;
  vehicle_id?: string;
  employee_id: string;
  scanned_at: string;
  synced: boolean;
}

interface PlantTransitDB extends DBSchema {
  offline_scans: {
    key: number;
    value: OfflineScan;
  };
}

const DB_NAME = 'plant-transit-offline-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<PlantTransitDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<PlantTransitDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('offline_scans')) {
          const store = db.createObjectStore('offline_scans', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
      },
    });
  }
  return dbPromise;
}

// Queue a scan locally when offline
export async function queueOfflineScan(scan: Omit<OfflineScan, 'id' | 'synced'>): Promise<number> {
  const db = await getDB();
  const id = await db.add('offline_scans', {
    ...scan,
    synced: false,
  });
  return id;
}

// Get all pending unsynced scans count
export async function getPendingScansCount(): Promise<number> {
  const db = await getDB();
  const unsynced = (await db.getAll('offline_scans')).filter((scan) => !scan.synced);
  return unsynced.length;
}

// Flush/Sync pending scans to Cloudflare Worker API
export async function syncPendingScans(): Promise<{ syncedCount: number; errors: any[] }> {
  const db = await getDB();
  const pendingScans = (await db.getAll('offline_scans')).filter((scan) => !scan.synced);

  if (pendingScans.length === 0) {
    return { syncedCount: 0, errors: [] };
  }

  let syncedCount = 0;
  const errors: any[] = [];

  for (const item of pendingScans) {
    try {
      await fetchApi('/api/dispatch/verify-boarding', {
        method: 'POST',
        body: JSON.stringify({
          booking_id: item.booking_id, booking_reference: item.booking_reference || item.booking_id,
          vehicle_id: item.vehicle_id,
          employee_id: item.employee_id,
          scanned_at: item.scanned_at,
        }),
      });

      // Mark scan as synced or remove from store
      if (item.id) {
        await db.delete('offline_scans', item.id);
        syncedCount++;
      }
    } catch (err) {
      console.error(`Failed to sync scan ID ${item.id}:`, err);
      errors.push({ id: item.id, error: err });
    }
  }

  return { syncedCount, errors };
}
