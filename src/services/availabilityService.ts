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
  modalidad?: 'taller' | 'domicilio';
  recargoDomicilio?: number;
  precioTotal?: number;
  indicacionesDomicilio?: string;
  cumpleRequisitosDomicilio?: boolean;
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

      const dayOfWeek = d.getDay();
      // Skips Sundays (assuming Sunday is closed)
      if (dayOfWeek === 0) {
        continue;
      }

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const fechaStr = `${year}-${month}-${day}`;
      const isToday = fechaStr === todayStr;

      let dTimes: string[] = [];

      // 1. SÁBADOS (dayOfWeek === 6): Dinámicos en parejas
      // Base: 08:00, 12:00, 16:00.
      // Desbloqueo de 10:00, 14:00, 18:00 al ocuparse sus turnos base.
      if (dayOfWeek === 6) {
        dTimes = ['08:00', '12:00', '16:00'];
        if (busySlots.has(`${fechaStr}_08:00`)) {
          dTimes.push('10:00');
        }
        if (busySlots.has(`${fechaStr}_12:00`)) {
          dTimes.push('14:00');
        }
        if (busySlots.has(`${fechaStr}_16:00`)) {
          dTimes.push('18:00');
        }
      } 
      // 2. LUNES (dayOfWeek === 1): Disponibilidad únicamente a partir de las 12:00
      else if (dayOfWeek === 1) {
        dTimes = ['12:00', '15:00', '17:00'];
      } 
      // 3. MARTES A VIERNES (dayOfWeek 2 a 5):
      // Grilla limpia: 07:00, 08:00, 09:00, 12:00, 15:00, 17:00
      else {
        dTimes = ['07:00', '08:00', '09:00', '12:00', '15:00', '17:00'];
      }

      // Copia de slots ocupados para procesar reglas exclusivas del día
      const dayBusySlots = new Set(busySlots);

      // REGLA: Martes por la tarde -> SOLO UN TURNO DE TARDE
      // Al reservarse uno (15 o 17), el otro se bloquea automáticamente
      if (dayOfWeek === 2) {
        if (dayBusySlots.has(`${fechaStr}_15:00`)) {
          dayBusySlots.add(`${fechaStr}_17:00`);
        }
        if (dayBusySlots.has(`${fechaStr}_17:00`)) {
          dayBusySlots.add(`${fechaStr}_15:00`);
        }
      }

      // REGLA: Mismo Día (isToday) -> SOLO UN TURNO DE TARDE (anticipación de 1 día para equipo)
      if (isToday) {
        if (dayBusySlots.has(`${fechaStr}_15:00`)) {
          dayBusySlots.add(`${fechaStr}_17:00`);
        }
        if (dayBusySlots.has(`${fechaStr}_17:00`)) {
          dayBusySlots.add(`${fechaStr}_15:00`);
        }
      }

      // Ordenar horarios cronológicamente
      dTimes.sort((a, b) => a.localeCompare(b));

      // Filter possible slots checking if they are busy or in the past
      const availableSlots = dTimes.filter(time => {
        const lookupKey = `${fechaStr}_${time}`;
        
        // If it's today in Argentina, hide slots that have already passed or are too close
        if (isToday) {
          const [hour, minute] = time.split(':').map(Number);
          const currentHour = today.getHours();
          const currentMinute = today.getMinutes();
          
          // Require at least 30 minutes in advance to book today
          if (hour < currentHour || (hour === currentHour && minute <= currentMinute + 30)) {
            return false;
          }
        }

        return !dayBusySlots.has(lookupKey);
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
      blockedSlots: data.blockedSlots,
      modalidad: data.modalidad || 'taller',
      recargoDomicilio: data.recargoDomicilio,
      precioTotal: data.precioTotal,
      indicacionesDomicilio: data.indicacionesDomicilio,
      cumpleRequisitosDomicilio: data.cumpleRequisitosDomicilio
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
