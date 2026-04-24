/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TimeSlot {
  fecha: string;
  slots: string[];
  count?: number;
}

const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyDd--FDaQPnqG_LQ4MzLuRmIQc99Y0WK1Axpwh3Tc4GX1DLCHn77XTr2-wBZUVCuVO/exec';

let memoryCache: TimeSlot[] | null = null;

export async function fetchSlots(forceRefresh = false): Promise<TimeSlot[]> {
  // Check memory cache first
  if (memoryCache && !forceRefresh) return memoryCache;

  // Check session storage
  if (!forceRefresh) {
    try {
      const cached = sessionStorage.getItem('lys_slots_cache');
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        // Cache valid for 2 minutes
        if (Date.now() - timestamp < 120000) {
          memoryCache = data;
          return data;
        }
      }
    } catch (e) {
      console.error('Error reading cache:', e);
    }
  }

  try {
    const response = await fetch(`${WEBAPP_URL}?action=slots14&days=14&t=${Date.now()}`);
    const data = await response.json();
    if (!data.ok || !Array.isArray(data.rows)) {
      throw new Error(data.error || 'Respuesta inválida del servidor');
    }
    
    // Update caches
    memoryCache = data.rows;
    sessionStorage.setItem('lys_slots_cache', JSON.stringify({
      data: data.rows,
      timestamp: Date.now()
    }));

    return data.rows;
  } catch (error) {
    console.error('Error fetching slots:', error);
    return memoryCache || [];
  }
}

export interface BookingData {
  fecha: string;
  hora: string;
  tipo: string;
  servicio: string;
  nombre: string;
  telefono: string;
  direccion: string;
}

export async function createBooking(data: BookingData): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const qs = new URLSearchParams({
      action: 'create',
      ...data
    });
    const response = await fetch(`${WEBAPP_URL}?${qs.toString()}`);
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error creating booking:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
}
