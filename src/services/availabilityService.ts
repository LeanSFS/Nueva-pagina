/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { firestoreService, Booking } from './firestoreService.ts';

export interface TimeSlot {
  fecha: string;
  slots: string[];
  count?: number;
}

export interface BookingData {
  fecha: string;
  hora: string;
  tipo: string;
  servicio: string;
  nombre: string;
  telefono: string;
  direccion: string;
  blockedSlots?: string[];
}

// Memory cache for slots
let memoryCache: TimeSlot[] | null = null;
let lastFetchTime = 0;

/**
 * Gets the current Date object representing exact date/time in Argentina (UTC-3)
 */
export function getArgentinaDate(): Date {
  const d = new Date();
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(d);
    const getPart = (type: string) => Number(parts.find(p => p.type === type)?.value);
    
    return new Date(
      getPart('year'),
      getPart('month') - 1,
      getPart('day'),
      getPart('hour'),
      getPart('minute'),
      getPart('second')
    );
  } catch (e) {
    console.warn('Error formatting Argentina date, using local date:', e);
    return d;
  }
}

export async function fetchSlots(forceRefresh = false): Promise<TimeSlot[]> {
  const cacheDuration = 10000; // 10 seconds short-live client cache, fast response times
  const nowTime = Date.now();

  if (!forceRefresh && memoryCache && (nowTime - lastFetchTime < cacheDuration)) {
    return memoryCache;
  }

  try {
    // 1. Get taken / blocked slots from Firestore
    const takenList = await firestoreService.getPublicTakenSlots();
    
    // Create query lookup set: "YYYY-MM-DD_HH:MM"
    const busySlots = new Set<string>();
    takenList.forEach(ts => {
      busySlots.add(`${ts.fecha}_${ts.hora}`);
    });

    const slotsResult: TimeSlot[] = [];

    // 2. Generate slots for the next 14 days based on Argentina time
    const today = getArgentinaDate();
    
    // Extract today's date parts for safe comparison
    const tYear = today.getFullYear();
    const tMonth = String(today.getMonth() + 1).padStart(2, '0');
    const tDay = String(today.getDate()).padStart(2, '0');
    const todayStr = `${tYear}-${tMonth}-${tDay}`;

    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);

      // Skips Sundays (assuming Sunday is closed)
      if (d.getDay() === 0) {
        continue;
      }

      // Define possible times based on the day of the week
      // Saturday = 6, Weekdays = 1-5
      const dTimes = d.getDay() === 6 
        ? ['09:00', '11:00', '15:00', '17:00']
        : ['09:00', '11:00'];

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const fechaStr = `${year}-${month}-${day}`;

      // Filter possible slots checking if they are busy or in the past
      const availableSlots = dTimes.filter(time => {
        const lookupKey = `${fechaStr}_${time}`;
        
        // If it's today in Argentina, hide slots that have already passed or are too close
        if (fechaStr === todayStr) {
          const [hour, minute] = time.split(':').map(Number);
          const currentHour = today.getHours();
          const currentMinute = today.getMinutes();
          
          // Require at least 30 minutes in advance to book today (or simple hour check)
          if (hour < currentHour || (hour === currentHour && minute <= currentMinute + 30)) {
            return false;
          }
        }

        return !busySlots.has(lookupKey);
      });

      slotsResult.push({
        fecha: fechaStr,
        slots: availableSlots,
        count: availableSlots.length
      });
    }

    memoryCache = slotsResult;
    lastFetchTime = nowTime;
    return slotsResult;

  } catch (error) {
    console.error('Error computing available slots via Firestore:', error);
    return [];
  }
}

export function clearCache() {
  memoryCache = null;
  lastFetchTime = 0;
}

export async function createBooking(data: BookingData): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const bookingId = `book_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const newBooking: Booking = {
      id: bookingId,
      fecha: data.fecha,
      hora: data.hora,
      tipo: data.tipo,
      servicio: data.servicio,
      nombre: data.nombre,
      telefono: data.telefono,
      direccion: data.direccion,
      estado: 'pendiente',
      blockedSlots: data.blockedSlots
    };

    // Commit to Firestore (creates booking and blocks slot atomically)
    await firestoreService.createBooking(newBooking, false);
    clearCache();

    return { ok: true, id: bookingId };
  } catch (error) {
    console.error('Error reserving booking via Firestore:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Error al guardar reserva' };
  }
}
