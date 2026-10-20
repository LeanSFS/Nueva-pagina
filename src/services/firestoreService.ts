import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  writeBatch,
  onSnapshot
} from 'firebase/firestore';
import { db, auth } from './firebase.ts';
import { SERVICES, VEHICLES } from '../constants.ts';
import { ArcaConfig, ArcaFacturaRecord } from '../types.ts';
import bundledFacturasJson from '../../public/facturas_arca.json';
import bundledMovementsJson from '../../public/movements.json';

// --- Error Handler conformance with FirestoreErrorInfo schema ---
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Notice (Saved locally / offline fallback):', JSON.stringify(errInfo));
}

// --- Timeout Promise Wrapper ---
async function withTimeout<T>(promise: Promise<T>, timeoutMs = 10000): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Firebase operation timed out (client offline/unconfigured)'));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

// --- Exponential Backoff Wrapper for Firestore Writes with Quota Detection ---
let firestoreQuotaExhaustedUntil = 0;

export function isCloudQuotaExhausted(): boolean {
  return Date.now() < firestoreQuotaExhaustedUntil;
}

async function executeWithBackoff<T>(fn: () => Promise<T>, maxRetries = 2, initialDelayMs = 500): Promise<T> {
  if (isCloudQuotaExhausted()) {
    throw new Error('resource-exhausted: Firestore write quota currently limited');
  }
  let delay = initialDelayMs;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isRateLimit = err?.code === 'resource-exhausted' || 
                          err?.message?.includes('resource-exhausted') || 
                          err?.message?.includes('maximum bandwidth') ||
                          err?.message?.includes('RESOURCE_EXHAUSTED');
      if (isRateLimit) {
        // Daily write limit reached on Firebase, avoid blocking user with repeated long retries
        firestoreQuotaExhaustedUntil = Date.now() + 120000; // 2 minute cooldown
        console.warn(`Firestore daily write quota reached. System falling back to server local persistence.`);
        throw err;
      }
      if (attempt < maxRetries) {
        await new Promise(res => setTimeout(res, delay));
        delay *= 2;
      } else {
        throw err;
      }
    }
  }
  return fn();
}

// --- Local Storage Cache Helpers ---
function getLocalCache<T>(key: string, defaultValue: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

function setLocalCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

export function getApiUrl(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) return endpoint;
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return `${window.location.origin}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  }
  return `http://localhost:3000${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
}

// Synchronize schedule overrides (unblocked days and slots) with server API & localStorage
async function syncScheduleOverrides(): Promise<{ unblockedDays: Set<string>; unblockedSlots: Set<string> }> {
  const localDays = new Set(getLocalCache<string[]>('lys_unblocked_days', []));
  const localSlots = new Set(getLocalCache<string[]>('lys_unblocked_slots', []));
  try {
    const res = await fetch(getApiUrl('/api/schedule/overrides'), { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.unblockedDays)) {
        data.unblockedDays.forEach((d: string) => localDays.add(d));
        setLocalCache('lys_unblocked_days', Array.from(localDays));
      }
      if (Array.isArray(data.unblockedSlots)) {
        data.unblockedSlots.forEach((s: string) => localSlots.add(s));
        setLocalCache('lys_unblocked_slots', Array.from(localSlots));
      }
    }
  } catch (e) {
    // Offline or server not responding, fallback to local storage
  }
  return { unblockedDays: localDays, unblockedSlots: localSlots };
}

function cleanFirestoreData<T>(obj: T): T {
  if (obj === undefined) return null as any;
  const deepClean = (item: any): any => {
    if (item === undefined) return null;
    if (item === null || typeof item !== 'object') return item;
    if (Array.isArray(item)) {
      return item.map(deepClean);
    }
    const res: Record<string, any> = {};
    for (const [key, val] of Object.entries(item)) {
      if (val !== undefined) {
        res[key] = deepClean(val);
      }
    }
    return res;
  };
  return deepClean(obj);
}

function isUserAdmin(): boolean {
  const user = auth.currentUser;
  if (!user) return false;
  const email = user.email?.toLowerCase();
  return email === 'leandro.saralegui@gmail.com' || user.uid === 'AYbEVBVfFxcx9vgxAWb83cJvDV02';
}

// --- Validate Connection on boot ---
async function testConnection() {
  try {
    await withTimeout(getDoc(doc(db, 'test', 'connection')), 3000);
  } catch (error) {
    if (error instanceof Error) {
      console.warn("Firestore connection check notice:", error.message);
    }
  }
}
testConnection();

// --- Firestore Base API ---

export interface Booking {
  id: string;
  fecha: string;
  hora: string;
  nombre: string;
  telefono: string;
  tipo: string;
  servicio: string;
  estado: 'pendiente' | 'confirmado' | 'hecho' | 'cancelado';
  direccion: string;
  blockedSlots?: string[];
  modalidad?: 'taller' | 'domicilio';
  recargoDomicilio?: number;
  precioTotal?: number;
  indicacionesDomicilio?: string;
  cumpleRequisitosDomicilio?: boolean;
}

export interface DomicilioConfig {
  enabled: boolean;
  extraPrice: number;
  bufferMinutes: number;
  city: string;
  whatsappHelpPhone: string;
}

export interface TakenSlot {
  id: string; // "YYYY-MM-DD_HH:MM"
  fecha: string;
  hora: string;
  isBlocked: boolean;
}

export interface Movement {
  id: string;
  fecha: string; // YYYY-MM-DD
  tipo: 'Ingreso' | 'Gasto';
  categoria: string;
  concepto: string;
  monto_ars: number;
  medio: string;
  estado: 'Pagado' | 'Pendiente';
  factura: string;
  cliente: string;
  notas: string;
  cae?: string;
  caeVto?: string;
  facturado?: boolean;
  facturaId?: string;
}

export interface CatalogService {
  id: string;
  name: string;
  label: string;
  description: string;
  features: string[];
  isFeatured?: boolean;
  isHidden?: boolean;
  basePrice: number;
  prices?: {
    auto: number;
    suv: number;
    pickup: number;
  };
  duration?: number;
}

export interface CatalogVehicle {
  id: string;
  name: string;
  icon: string;
  examples: string;
  extraPrice: number;
}

export interface GalleryPhoto {
  id: string;
  url: string;
  title: string;
  description: string;
  createdAt: string;
}

// Helper to convert Google Drive, Imgur page URLs, and Dropbox sharing links into direct image URLs
export function sanitizeImageUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();

  // Base64 images
  if (url.startsWith('data:image')) return url;

  // Google Drive link conversion
  const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveFileMatch && driveFileMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${driveFileMatch[1]}`;
  }
  const driveIdMatch = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (driveIdMatch && driveIdMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${driveIdMatch[1]}`;
  }

  // Imgur page link conversion
  if (url.includes('imgur.com') && !url.includes('i.imgur.com')) {
    const imgurMatch = url.match(/imgur\.com\/(?:a\/|gallery\/)?([a-zA-Z0-9]+)/);
    if (imgurMatch && imgurMatch[1]) {
      return `https://i.imgur.com/${imgurMatch[1]}.jpg`;
    }
  }

  // Dropbox link conversion
  if (url.includes('dropbox.com')) {
    url = url.replace('dl=0', 'raw=1').replace('dl=1', 'raw=1');
  }

  return url;
}

export function calculateDurationFromServiceName(serviceName: string, modalidad?: string): number {
  if (!serviceName) return modalidad === 'domicilio' ? 135 : 90;
  const lower = serviceName.toLowerCase();
  
  // Check for Full / Combo / Exterior + Interior
  let total = 0;
  if (lower.includes('full') || lower.includes('combo') || (lower.includes('exterior') && lower.includes('interior'))) {
    total = 180; // 3 hours
  } else {
    if (lower.includes('exterior')) total += 90;
    if (lower.includes('interior')) total += 90;
    if (lower.includes('tapizados de tela') || lower.includes('tapizados tela')) total += 90;
    if (lower.includes('tapizados de cuero') || lower.includes('cuero')) total += 60;
    if (lower.includes('techo')) total += 60;
    if (lower.includes('vidrios')) total += 60;
    if (total === 0) total = 90;
  }

  // 45 min buffer logístico para viaje y armado/desarmado en domicilio
  if (modalidad === 'domicilio' || lower.includes('domicilio')) {
    total += 45;
  }

  return total;
}

export function calculateBlockedSlotsForStart(startHour: string, durationMinutes: number): string[] {
  if (!startHour) return ['08:00'];
  const [h, m] = startHour.split(':').map(Number);
  const startMins = h * 60 + (m || 0);
  const endMins = startMins + (durationMinutes || 60);
  const blocked: string[] = [];

  for (let mins = 7 * 60; mins <= 18 * 60; mins += 60) {
    if (mins >= startMins && mins < endMins) {
      const slotH = Math.floor(mins / 60);
      const slotM = mins % 60;
      blocked.push(`${String(slotH).padStart(2, '0')}:${String(slotM).padStart(2, '0')}`);
    }
  }

  return blocked.length > 0 ? blocked : [startHour];
}

export const firestoreService = {
  // ------------------ 1. BOOKINGS (TURNOS) ------------------

  getDeletedBookingIds(): Set<string> {
    const local = getLocalCache<string[]>('lys_deleted_booking_ids', []);
    return new Set(Array.isArray(local) ? local : []);
  },

  async syncDeletedBookingIds(): Promise<Set<string>> {
    const localSet = this.getDeletedBookingIds();
    try {
      const res = await fetch(getApiUrl('/api/bookings/deleted'), { signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        const serverDeleted: string[] = await res.json();
        if (Array.isArray(serverDeleted)) {
          for (const id of serverDeleted) {
            if (id) localSet.add(id);
          }
          setLocalCache('lys_deleted_booking_ids', Array.from(localSet));
        }
      }
    } catch (e) {
      // Offline fallback: keep local set
    }
    return localSet;
  },

  markBookingDeleted(id: string): void {
    if (!id) return;
    const localSet = this.getDeletedBookingIds();
    localSet.add(id);
    setLocalCache('lys_deleted_booking_ids', Array.from(localSet));
  },

  unmarkBookingDeleted(id: string): void {
    if (!id) return;
    const localSet = this.getDeletedBookingIds();
    if (localSet.has(id)) {
      localSet.delete(id);
      setLocalCache('lys_deleted_booking_ids', Array.from(localSet));
    }
  },
  
  async getBookings(): Promise<Booking[]> {
    const colPath = 'bookings';
    const loadedMap = new Map<string, Booking>();
    const deletedIds = await this.syncDeletedBookingIds();

    // 0. Query server-side persistent bookings (shared across all clients & admin, fail-safe against Firestore quota)
    try {
      const serverRes = await fetch(getApiUrl('/api/bookings'), { signal: AbortSignal.timeout(2500) });
      if (serverRes.ok) {
        const serverBookings: Booking[] = await serverRes.json();
        if (Array.isArray(serverBookings)) {
          for (const b of serverBookings) {
            if (b && b.id && !deletedIds.has(b.id)) {
              if (!b.blockedSlots || b.blockedSlots.length === 0) {
                const dur = calculateDurationFromServiceName(b.servicio, b.modalidad);
                b.blockedSlots = calculateBlockedSlotsForStart(b.hora, dur);
              }
              loadedMap.set(b.id, b);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Could not fetch server bookings, proceeding to Firestore/local:', e);
    }

    // 1. Fetch remote from Firestore 'bookings' collection (succeeds when authenticated with Google)
    try {
      const q = collection(db, colPath);
      const snap = await withTimeout(getDocs(q), 6000);
      snap.forEach(docSnap => {
        const data = docSnap.data() as Booking;
        if (data && data.id && !deletedIds.has(data.id)) {
          if (!data.blockedSlots || data.blockedSlots.length === 0) {
            const dur = calculateDurationFromServiceName(data.servicio, data.modalidad);
            data.blockedSlots = calculateBlockedSlotsForStart(data.hora, dur);
          }
          loadedMap.set(data.id, data);
        }
      });

      if (snap.size > 0) {
        const allCloudRows = Array.from(loadedMap.values()).filter(b => !deletedIds.has(b.id));
        setLocalCache('lys_cache_bookings', allCloudRows);
      }
    } catch (e) {
      console.warn("Firestore getBookings notice (cloud collection query unauthenticated or timeout):", e);
    }

    // 2. Fallback: Fetch shared bookings registry from settings (accessible to all devices)
    try {
      const regSnap = await withTimeout(getDoc(doc(db, 'settings', 'bookings_registry')), 3000).catch(() => null);
      if (regSnap && regSnap.exists()) {
        const regData = regSnap.data();
        if (Array.isArray(regData?.bookings)) {
          for (const b of regData.bookings) {
            if (b && b.id && !deletedIds.has(b.id) && !loadedMap.has(b.id)) {
              if (!b.blockedSlots || b.blockedSlots.length === 0) {
                const dur = calculateDurationFromServiceName(b.servicio, b.modalidad);
                b.blockedSlots = calculateBlockedSlotsForStart(b.hora, dur);
              }
              loadedMap.set(b.id, b);
            }
          }
        }
      }
    } catch (e) {}

    // 3. Fallback: Merge with local cached bookings from localStorage
    const cached = getLocalCache<Booking[]>('lys_cache_bookings', []);
    for (const b of cached) {
      if (b && b.id && !deletedIds.has(b.id) && !loadedMap.has(b.id)) {
        if (!b.blockedSlots || b.blockedSlots.length === 0) {
          const dur = calculateDurationFromServiceName(b.servicio, b.modalidad);
          b.blockedSlots = calculateBlockedSlotsForStart(b.hora, dur);
        }
        loadedMap.set(b.id, b);
      }
    }

    // 4. Fallback: Query taken_slots (100% public in Firestore, containing all 500+ reserved & blocked slots)
    // Ensures the calendar schedule is NEVER empty even when opening without Google credentials!
    try {
      const takenSlotsSnap = await withTimeout(getDocs(collection(db, 'taken_slots')), 5000).catch(() => null);
      if (takenSlotsSnap && !takenSlotsSnap.empty) {
        const slotsByDate = new Map<string, TakenSlot[]>();
        takenSlotsSnap.forEach(docSnap => {
          const ts = docSnap.data() as TakenSlot;
          if (ts && ts.fecha && ts.hora) {
            const list = slotsByDate.get(ts.fecha) || [];
            list.push(ts);
            slotsByDate.set(ts.fecha, list);
          }
        });

        const { unblockedDays, unblockedSlots } = await syncScheduleOverrides();

        slotsByDate.forEach((slots, fecha) => {
          // If the day was completely unblocked by admin, skip its old blocks
          if (unblockedDays.has(fecha)) return;

          slots.sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));

          // Check which slots are not already covered by an existing booking on this date and not manually unblocked
          const uncovered = slots.filter(ts => {
            if (unblockedSlots.has(ts.id) || unblockedSlots.has(`${fecha}_${ts.hora}`)) return false;
            let covered = false;
            loadedMap.forEach(b => {
              if (b.fecha === fecha) {
                const bSlots = b.blockedSlots && b.blockedSlots.length > 0 ? b.blockedSlots : [b.hora];
                if (bSlots.includes(ts.hora)) {
                  covered = true;
                }
              }
            });
            return !covered;
          });

          // Cluster contiguous uncovered slots (ONLY for admin-blocked hours, NEVER invent fake client bookings)
          let currentCluster: TakenSlot[] = [];
          const flushCluster = () => {
            if (currentCluster.length === 0) return;
            const first = currentCluster[0];
            const isBlock = Boolean(first.isBlocked);
            const clusterHours = currentCluster.map(s => s.hora);
            const syntheticId = `slot_${fecha}_${first.hora.replace(':', '')}`;
            const durationHours = clusterHours.length;

            // Only register real admin blocks, NEVER invent fake clients
            if (isBlock) {
              loadedMap.set(syntheticId, {
                id: syntheticId,
                fecha,
                hora: first.hora,
                tipo: 'BLOQUEO',
                servicio: durationHours > 1 ? `Horario Bloqueado (${durationHours} hs)` : 'Horario Bloqueado',
                nombre: 'TURNO BLOQUEADO',
                telefono: '-',
                direccion: 'Taller',
                estado: 'confirmado',
                blockedSlots: clusterHours
              });
            }
            currentCluster = [];
          };

          for (let i = 0; i < uncovered.length; i++) {
            const slot = uncovered[i];
            if (currentCluster.length === 0) {
              currentCluster.push(slot);
            } else {
              const prev = currentCluster[currentCluster.length - 1];
              const prevHour = parseInt(prev.hora.split(':')[0], 10);
              const currHour = parseInt(slot.hora.split(':')[0], 10);
              const sameType = Boolean(prev.isBlocked) === Boolean(slot.isBlocked);
              if (currHour === prevHour + 1 && sameType) {
                currentCluster.push(slot);
              } else {
                flushCluster();
                currentCluster.push(slot);
              }
            }
          }
          flushCluster();
        });
      }
    } catch (e) {
      console.warn("Could not query taken_slots fallback:", e);
    }

    const consolidated = Array.from(loadedMap.values())
      .filter(b => b && b.id && !deletedIds.has(b.id))
      .map(b => {
        if (!b.blockedSlots || b.blockedSlots.length === 0) {
          const dur = calculateDurationFromServiceName(b.servicio || '', b.modalidad);
          return { ...b, blockedSlots: calculateBlockedSlotsForStart(b.hora || '09:00', dur) };
        }
        return b;
      });

    // Update local cache
    setLocalCache('lys_cache_bookings', consolidated);
    return consolidated;
  },

  async createBooking(booking: Booking, isBlocked = false): Promise<void> {
    if (booking && booking.id) {
      this.unmarkBookingDeleted(booking.id);
    }
    const duration = calculateDurationFromServiceName(booking.servicio, booking.modalidad);
    const calculatedSlots = calculateBlockedSlotsForStart(booking.hora, duration);
    const hoursToBlock = (booking.blockedSlots && booking.blockedSlots.length > 0)
      ? booking.blockedSlots
      : calculatedSlots;
    
    // Ensure blockedSlots is saved in the booking object
    booking.blockedSlots = hoursToBlock;

    // Save to local cache first
    const localBookings = getLocalCache<Booking[]>('lys_cache_bookings', []);
    if (!localBookings.some(b => b.id === booking.id)) {
      localBookings.push(booking);
      setLocalCache('lys_cache_bookings', localBookings);
    }

    const localTaken = getLocalCache<TakenSlot[]>('lys_cache_taken_slots', []);
    for (const h of hoursToBlock) {
      const sId = `${booking.fecha}_${h}`;
      if (!localTaken.some(ts => ts.id === sId)) {
        localTaken.push({ id: sId, fecha: booking.fecha, hora: h, isBlocked });
      }
    }
    setLocalCache('lys_cache_taken_slots', localTaken);

    // Prepare complete formatted text descriptions so all details are preserved in Firestore
    let fullServicio = booking.servicio || '';
    if (booking.modalidad === 'domicilio' && !fullServicio.includes('[A DOMICILIO')) {
      fullServicio += ` [A DOMICILIO 🏠]`;
    }
    if (booking.recargoDomicilio && booking.recargoDomicilio > 0 && !fullServicio.includes('Recargo')) {
      fullServicio += ` (Recargo: $${booking.recargoDomicilio.toLocaleString('es-AR')})`;
    }

    let fullDireccion = booking.direccion || 'Taller (Venezuela 1659, Cipolletti)';
    if (booking.indicacionesDomicilio && !fullDireccion.includes(booking.indicacionesDomicilio)) {
      fullDireccion += ` (Entre: ${booking.indicacionesDomicilio})`;
    }

    // Clean, strictly validated Firestore document adhering to live Firestore security rules
    const firestoreBooking = {
      id: booking.id,
      fecha: booking.fecha,
      hora: booking.hora,
      tipo: booking.tipo || 'Auto',
      servicio: fullServicio.slice(0, 490),
      nombre: booking.nombre || 'Cliente',
      telefono: booking.telefono || '-',
      direccion: fullDireccion.slice(0, 490),
      estado: booking.estado || 'pendiente',
      blockedSlots: hoursToBlock
    };

    // Synchronize to server-side persistent database (shared across all devices)
    try {
      await fetch(getApiUrl('/api/bookings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...booking, servicio: fullServicio, direccion: fullDireccion, isBlocked })
      });
    } catch (err) {
      console.warn('Could not sync booking to server /api/bookings:', err);
    }

    // Cloud Firestore synchronization (atomic batch with fallback)
    try {
      await executeWithBackoff(async () => {
        const bach = writeBatch(db);
        const bookingRef = doc(db, 'bookings', booking.id);
        bach.set(bookingRef, firestoreBooking);

        for (const h of hoursToBlock) {
          const sId = `${booking.fecha}_${h}`;
          const slotRef = doc(db, 'taken_slots', sId);
          bach.set(slotRef, {
            id: sId,
            fecha: booking.fecha,
            hora: h,
            isBlocked: isBlocked
          });
        }

        await withTimeout(bach.commit(), 5000);
      });
      console.log(`Booking ${booking.id} and ${hoursToBlock.length} taken slots registered successfully in Cloud Firestore!`);
    } catch (e: any) {
      console.warn(`Batch write warning for ${booking.id}, ensuring taken slots are saved:`, e);
      // Secondary fallback: guarantee that taken_slots are stored individually so slot is 100% blocked
      for (const h of hoursToBlock) {
        try {
          const sId = `${booking.fecha}_${h}`;
          await setDoc(doc(db, 'taken_slots', sId), {
            id: sId,
            fecha: booking.fecha,
            hora: h,
            isBlocked: isBlocked
          });
        } catch (slotErr) {
          console.warn(`Could not set individual slot ${h}:`, slotErr);
        }
      }
    }

    // Notify local views (Agenda, etc.) immediately
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('lys_booking_updated', { detail: booking }));
    }
  },

  async deleteBooking(bookingId: string, fecha: string, hora: string): Promise<void> {
    if (!bookingId) return;

    // 1. Immediately register in deleted bookings list
    this.markBookingDeleted(bookingId);

    const localBookings = getLocalCache<Booking[]>('lys_cache_bookings', []);
    const bk = localBookings.find(b => b.id === bookingId);
    
    const duration = calculateDurationFromServiceName(bk?.servicio || '', bk?.modalidad);
    const calculatedSlots = calculateBlockedSlotsForStart(bk?.hora || hora, duration);
    const hoursToBlock = bk && bk.blockedSlots && bk.blockedSlots.length > 0
      ? bk.blockedSlots
      : calculatedSlots;

    // 2. Remove from local client cache immediately
    const filteredBookings = localBookings.filter(b => b.id !== bookingId);
    setLocalCache('lys_cache_bookings', filteredBookings);

    const localTaken = getLocalCache<TakenSlot[]>('lys_cache_taken_slots', []);
    const hoursToBlockSet = new Set(hoursToBlock.map(h => `${fecha}_${h}`));
    const filteredTaken = localTaken.filter(ts => !hoursToBlockSet.has(ts.id));
    setLocalCache('lys_cache_taken_slots', filteredTaken);

    // 3. Await server-side persistent deletion (guarantees next fetch / reload has it deleted)
    try {
      await withTimeout(
        fetch(getApiUrl(`/api/bookings/${encodeURIComponent(bookingId)}`), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fecha, hora, blockedSlots: hoursToBlock })
        }),
        3500
      );
    } catch (serverErr) {
      console.warn('Notice from server delete (continuing):', serverErr);
    }

    // 4. Liberate all associated slots both locally and on server
    const isBlock = bk?.tipo === 'BLOQUEO' || bk?.nombre?.includes('BLOQUEADO') || bookingId.startsWith('block_') || bookingId.startsWith('slot_');
    if (isBlock && (hoursToBlock.length >= 8 || bk?.nombre?.includes('DÍA COMPLETO') || bk?.servicio?.includes('DÍA COMPLETO'))) {
      await this.unblockDay(fecha).catch(() => null);
    } else {
      for (const h of hoursToBlock) {
        await this.unblockSlot(fecha, h).catch(() => null);
      }
    }

    // 5. Cloud Firestore cleanups: delete slots and booking independently so permission errors don't roll back slot cleanup
    for (const h of hoursToBlock) {
      const sId = `${fecha}_${h}`;
      try {
        await deleteDoc(doc(db, 'taken_slots', sId));
      } catch (err) {
        // Silently catch in case of network timeout
      }
    }

    try {
      await deleteDoc(doc(db, 'bookings', bookingId));
    } catch (err) {
      // Catch permission error if not admin authenticated in cloud
    }

    // 6. If settings/bookings_registry exists, clean it up
    try {
      const regRef = doc(db, 'settings', 'bookings_registry');
      const regSnap = await withTimeout(getDoc(regRef), 2000).catch(() => null);
      if (regSnap && regSnap.exists()) {
        const regData = regSnap.data();
        if (Array.isArray(regData?.bookings)) {
          const updatedReg = regData.bookings.filter((b: any) => b?.id !== bookingId);
          await setDoc(regRef, { bookings: updatedReg }, { merge: true }).catch(() => null);
        }
      }
    } catch (e) {}

    // 7. Dispatch booking update to notify all active views immediately
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('lys_booking_updated', { detail: { id: bookingId, deleted: true } }));
    }
  },

  async unblockDay(fecha: string): Promise<void> {
    // 1. Mark day in unblocked days set locally
    const unblockedDays = new Set(getLocalCache<string[]>('lys_unblocked_days', []));
    unblockedDays.add(fecha);
    setLocalCache('lys_unblocked_days', Array.from(unblockedDays));

    // 2. Notify backend persistent storage across all clients
    fetch(getApiUrl('/api/schedule/unblock-day'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha })
    }).catch(() => null);

    // 3. Remove all block bookings for this day from local cache
    const localBookings = getLocalCache<Booking[]>('lys_cache_bookings', []);
    const filteredBookings = localBookings.filter(b => !(b.fecha === fecha && (b.tipo === 'BLOQUEO' || b.nombre?.includes('BLOQUEADO') || b.id.startsWith('slot_') || b.id.startsWith('block_'))));
    setLocalCache('lys_cache_bookings', filteredBookings);

    // 4. Remove all blocked slots for this date from local taken slots
    const localTaken = getLocalCache<TakenSlot[]>('lys_cache_taken_slots', []);
    const filteredTaken = localTaken.filter(ts => !(ts.fecha === fecha && ts.isBlocked));
    setLocalCache('lys_cache_taken_slots', filteredTaken);

    // 5. Delete all blocked slots for this date from Firestore in cloud if permissions allow
    try {
      const q = query(collection(db, 'taken_slots'), where('fecha', '==', fecha));
      const snap = await withTimeout(getDocs(q), 5000);
      const batch = writeBatch(db);
      let count = 0;
      snap.forEach(d => {
        const data = d.data() as TakenSlot;
        if (data.isBlocked) {
          batch.delete(doc(db, 'taken_slots', d.id));
          count++;
        }
      });

      if (count > 0) {
        await executeWithBackoff(async () => {
          await withTimeout(batch.commit(), 10000);
        });
      }
    } catch (e) {
      console.warn(`Cloud unblock for day ${fecha} deferred, cleared locally:`, e);
    }
  },

  async unblockSlot(fecha: string, hora: string): Promise<void> {
    const sId = `${fecha}_${hora}`;
    
    // 1. Mark in unblocked slots set locally
    const unblockedSlots = new Set(getLocalCache<string[]>('lys_unblocked_slots', []));
    unblockedSlots.add(sId);
    setLocalCache('lys_unblocked_slots', Array.from(unblockedSlots));

    // 2. Notify backend persistent storage across all clients
    fetch(getApiUrl('/api/schedule/unblock-slot'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha, hora })
    }).catch(() => null);

    // 3. Update local caches
    const localTaken = getLocalCache<TakenSlot[]>('lys_cache_taken_slots', []);
    setLocalCache('lys_cache_taken_slots', localTaken.filter(ts => ts.id !== sId));

    const localBookings = getLocalCache<Booking[]>('lys_cache_bookings', []);
    const updatedBookings = localBookings.filter(b => {
      if (b.fecha === fecha && (b.tipo === 'BLOQUEO' || b.nombre?.includes('BLOQUEADO') || b.id.startsWith('slot_') || b.id.startsWith('block_'))) {
        const slots = b.blockedSlots || [b.hora];
        if (slots.length <= 1 && slots.includes(hora)) return false;
        if (slots.includes(hora)) {
          b.blockedSlots = slots.filter(h => h !== hora);
          return true;
        }
      }
      return true;
    });
    setLocalCache('lys_cache_bookings', updatedBookings);

    // 4. Delete from Firestore if permitted
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'taken_slots', sId));
      await executeWithBackoff(async () => {
        await withTimeout(batch.commit(), 6000);
      });
    } catch (e) {
      console.warn(`Cloud unblock for slot ${sId} deferred, cleared locally:`, e);
    }
  },

  async updateBookingStatus(bookingId: string, booking: Booking, newStatus: Booking['estado']): Promise<void> {
    const duration = calculateDurationFromServiceName(booking.servicio);
    const calculatedSlots = calculateBlockedSlotsForStart(booking.hora, duration);
    const hoursToBlock = booking.blockedSlots && booking.blockedSlots.length > 0
      ? booking.blockedSlots
      : calculatedSlots;

    // Update local cache
    const localBookings = getLocalCache<Booking[]>('lys_cache_bookings', []);
    const updatedBookings = localBookings.map(b => b.id === bookingId ? { ...b, estado: newStatus } : b);
    setLocalCache('lys_cache_bookings', updatedBookings);

    const localTaken = getLocalCache<TakenSlot[]>('lys_cache_taken_slots', []);
    let updatedTaken = localTaken;
    const hoursToBlockSet = new Set(hoursToBlock.map(h => `${booking.fecha}_${h}`));

    if (newStatus === 'cancelado') {
      updatedTaken = localTaken.filter(ts => !hoursToBlockSet.has(ts.id));
    } else {
      for (const h of hoursToBlock) {
        const sId = `${booking.fecha}_${h}`;
        if (!updatedTaken.some(ts => ts.id === sId)) {
          updatedTaken.push({ id: sId, fecha: booking.fecha, hora: h, isBlocked: booking.nombre.includes('BLOQUEADO') });
        }
      }
    }
    setLocalCache('lys_cache_taken_slots', updatedTaken);

    try {
      await executeWithBackoff(async () => {
        const bookingRef = doc(db, 'bookings', bookingId);
        const bach = writeBatch(db);
        
        bach.update(bookingRef, { estado: newStatus });

        for (const h of hoursToBlock) {
          const sId = `${booking.fecha}_${h}`;
          const slotRef = doc(db, 'taken_slots', sId);
          if (newStatus === 'cancelado') {
            bach.delete(slotRef);
          } else {
            bach.set(slotRef, {
              id: sId,
              fecha: booking.fecha,
              hora: h,
              isBlocked: booking.nombre.includes('BLOQUEADO')
            });
          }
        }

        await withTimeout(bach.commit(), 10000);
      });
    } catch (e) {
      console.warn(`Cloud booking status update deferred/failed for ${bookingId}, preserved locally:`, e);
    }
  },

  // ------------------ 2. PUBLIC AVAILABILITY ------------------

  async getPublicTakenSlots(): Promise<TakenSlot[]> {
    const colPath = 'taken_slots';
    try {
      // Calculate today's date in Argentina timezone
      let todayStr = new Date().toISOString().split('T')[0];
      try {
        const formatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Argentina/Buenos_Aires',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        todayStr = formatter.format(new Date());
      } catch (e) {
        console.warn('Fallback to system timezone for todayStr:', e);
      }

      const resMap = new Map<string, TakenSlot>();
      const { unblockedDays, unblockedSlots } = await syncScheduleOverrides();

      // 0. Query server-side persistent taken slots first (always fast and quota-independent)
      try {
        const sRes = await fetch(getApiUrl('/api/taken_slots'), { signal: AbortSignal.timeout(2000) });
        if (sRes.ok) {
          const sSlots: TakenSlot[] = await sRes.json();
          if (Array.isArray(sSlots)) {
            sSlots.forEach(s => {
              if (s && s.id && s.fecha >= todayStr) {
                if (!unblockedDays.has(s.fecha) && !unblockedSlots.has(s.id) && !unblockedSlots.has(`${s.fecha}_${s.hora}`)) {
                  resMap.set(s.id, s);
                }
              }
            });
          }
        }
      } catch (err) {}

      // 1. Query Firestore taken_slots if available
      try {
        const q = query(
          collection(db, colPath), 
          where('fecha', '>=', todayStr)
        );
        const snap = await withTimeout(getDocs(q), 3000);
        snap.forEach(docSnap => {
          const data = docSnap.data() as TakenSlot;
          if (data && data.id) {
            if (!unblockedDays.has(data.fecha) && !unblockedSlots.has(data.id) && !unblockedSlots.has(`${data.fecha}_${data.hora}`)) {
              resMap.set(data.id, data);
            }
          }
        });
      } catch (cloudErr) {
        console.warn('Could not query Firestore cloud taken_slots, using server & local data:', cloudErr);
      }

      // ALSO cross-reference active bookings to dynamically block all slots required by their duration
      try {
        const allBookings = await this.getBookings();
        const activeBookings = allBookings.filter(b => b.fecha >= todayStr && b.estado !== 'cancelado');

        for (const bk of activeBookings) {
          let hoursToBlock: string[] = [];

          if (bk.blockedSlots && bk.blockedSlots.length > 1) {
            hoursToBlock = bk.blockedSlots;
          } else {
            const durationMins = calculateDurationFromServiceName(bk.servicio);
            hoursToBlock = calculateBlockedSlotsForStart(bk.hora, durationMins);
          }

          for (const h of hoursToBlock) {
            const sId = `${bk.fecha}_${h}`;
            if (!resMap.has(sId)) {
              resMap.set(sId, {
                id: sId,
                fecha: bk.fecha,
                hora: h,
                isBlocked: false
              });
            }
          }
        }
      } catch (err) {
        console.warn('Silent warning parsing active bookings for extra blocked slots:', err);
      }

      const resList = Array.from(resMap.values());
      setLocalCache('lys_cache_taken_slots', resList);
      return resList;
    } catch (e) {
      console.warn("Firestore getPublicTakenSlots error/timeout, using local cache:", e);
      let todayStr = new Date().toISOString().split('T')[0];
      const localTaken = getLocalCache<TakenSlot[]>('lys_cache_taken_slots', []);
      return localTaken.filter(ts => ts.fecha >= todayStr);
    }
  },

  // ------------------ 3. CAJA (MOVEMENTS) ------------------

  async getMovements(): Promise<Movement[]> {
    const colPath = 'movements';
    const firestoreList: Movement[] = [];

    // 1. Fetch remote from Firestore
    try {
      const snap = await withTimeout(getDocs(collection(db, colPath)), 3000);
      snap.forEach(d => {
        firestoreList.push(d.data() as Movement);
      });
    } catch (e) {
      console.warn("Firestore getMovements notice, reading local/static fallback:", e);
    }

    // 1b. Fetch shared movements registry from settings
    try {
      const regSnap = await withTimeout(getDoc(doc(db, 'settings', 'movements_registry')), 3000).catch(() => null);
      if (regSnap && regSnap.exists()) {
        const regData = regSnap.data();
        if (Array.isArray(regData?.movements)) {
          firestoreList.push(...regData.movements);
        }
      }
    } catch (e) {}

    // 2. Fetch bundled static movements (/movements.json)
    const staticMovements: Movement[] = Array.isArray(bundledMovementsJson) ? [...(bundledMovementsJson as Movement[])] : [];
    try {
      const staticRes = await fetch('/movements.json').catch(() => null);
      if (staticRes && staticRes.ok) {
        const json = await staticRes.json().catch(() => null);
        if (Array.isArray(json)) {
          staticMovements.push(...json);
        }
      }
    } catch (e) {}

    // 3. Local cached and unsynced
    const cached = getLocalCache<Movement[]>('lys_cache_movements', []);
    const unsynced = getLocalCache<Movement[]>('lys_unsynced_movements', []);

    // 4. Synthesize movements from any ARCA facturas
    const facturasMovements: Movement[] = [];
    try {
      const allFacturas = await this.getArcaFacturas().catch(() => []);
      for (const f of allFacturas) {
        if (!f || !f.id) continue;
        const movId = f.movementId || `mov_${f.id}`;
        facturasMovements.push({
          id: movId,
          fecha: f.fechaIso || (f.fechaEmision ? f.fechaEmision.split('/').reverse().join('-') : new Date().toISOString().split('T')[0]),
          tipo: 'Ingreso',
          categoria: 'Lavado',
          concepto: f.conceptoDescripcion || 'Servicio de Estética y Lavado Automotor',
          monto_ars: Number(f.total),
          medio: 'Efectivo',
          estado: 'Pagado',
          factura: `${f.tipoComprobanteNombre || 'FACTURA C'} Nº ${String(f.puntoVenta).padStart(4, '0')}-${String(f.cbteNro).padStart(8, '0')}`,
          cliente: f.clienteNombre || 'Consumidor Final',
          facturado: true,
          cae: f.cae,
          caeVto: f.caeVto,
          facturaId: f.id,
          notas: `Factura oficial ARCA emitida con CAE ${f.cae}`
        });
      }
    } catch (e) {}

    // 5. Merge all without duplicates (preferring firestore/unsynced/cached with richest details)
    const map = new Map<string, Movement>();
    for (const m of [...facturasMovements, ...staticMovements, ...cached, ...firestoreList, ...unsynced]) {
      if (m && m.id) {
        const existing = map.get(m.id);
        if (!existing) {
          map.set(m.id, m);
        } else {
          // Merge fields so factura info is not lost
          map.set(m.id, {
            ...m,
            factura: m.factura || existing.factura,
            cae: m.cae || existing.cae,
            caeVto: m.caeVto || existing.caeVto,
            facturaId: m.facturaId || existing.facturaId,
            facturado: m.facturado ?? existing.facturado
          });
        }
      }
    }

    const mergedList = Array.from(map.values()).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    setLocalCache('lys_cache_movements', mergedList);
    return mergedList;
  },

  async saveMovement(movement: Movement): Promise<void> {
    const colPath = 'movements';
    
    // Save to local cache first
    const localMovements = getLocalCache<Movement[]>('lys_cache_movements', []);
    const filtered = localMovements.filter(m => m.id !== movement.id);
    filtered.push(movement);
    setLocalCache('lys_cache_movements', filtered);

    // Save to unsynced queue
    const unsynced = getLocalCache<Movement[]>('lys_unsynced_movements', []);
    const filteredUnsynced = unsynced.filter(m => m.id !== movement.id);
    filteredUnsynced.push(movement);
    setLocalCache('lys_unsynced_movements', filteredUnsynced);

    try {
      const cleanMov = cleanFirestoreData(movement);
      await executeWithBackoff(async () => {
        await withTimeout(setDoc(doc(db, colPath, movement.id), cleanMov), 4000);
      });
      
      // Successfully saved to Firestore! Remove from unsynced queue
      const updatedUnsynced = getLocalCache<Movement[]>('lys_unsynced_movements', []).filter(m => m.id !== movement.id);
      setLocalCache('lys_unsynced_movements', updatedUnsynced);
    } catch (e) {
      console.warn(`Cloud save for movement ${movement.id} deferred, preserved locally:`, e);
    }

    // Sync to shared settings/movements_registry
    try {
      const regRef = doc(db, 'settings', 'movements_registry');
      const regSnap = await withTimeout(getDoc(regRef), 3000).catch(() => null);
      const currentList: Movement[] = regSnap?.exists() && Array.isArray(regSnap.data()?.movements) ? regSnap.data().movements : [];
      const updatedList = [movement, ...currentList.filter(m => m.id !== movement.id)];
      const cleanReg = cleanFirestoreData({ movements: updatedList, lastUpdated: new Date().toISOString() });
      await executeWithBackoff(async () => {
        await withTimeout(setDoc(regRef, cleanReg), 4000);
      }).catch(() => null);
    } catch (e) {}
  },

  async deleteMovement(id: string): Promise<void> {
    const colPath = 'movements';

    // Delete locally
    const localMovements = getLocalCache<Movement[]>('lys_cache_movements', []);
    const filtered = localMovements.filter(m => m.id !== id);
    setLocalCache('lys_cache_movements', filtered);

    // Remove from unsynced queue
    const unsynced = getLocalCache<Movement[]>('lys_unsynced_movements', []);
    const filteredUnsynced = unsynced.filter(m => m.id !== id);
    setLocalCache('lys_unsynced_movements', filteredUnsynced);

    try {
      await withTimeout(deleteDoc(doc(db, colPath, id)), 2500);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${colPath}/${id}`);
    }
  },

  async syncUnsyncedMovements(): Promise<number> {
    const unsynced = getLocalCache<Movement[]>('lys_unsynced_movements', []);
    if (unsynced.length === 0) return 0;
    
    let count = 0;
    const colPath = 'movements';
    
    for (const m of unsynced) {
      if (!m || !m.id) continue;
      try {
        const cleanMov = cleanFirestoreData(m);
        await executeWithBackoff(async () => {
          await withTimeout(setDoc(doc(db, colPath, m.id), cleanMov), 6000);
        });
        count++;
        // Remove from unsynced queue
        const current = getLocalCache<Movement[]>('lys_unsynced_movements', []);
        setLocalCache('lys_unsynced_movements', current.filter(x => x.id !== m.id));
        // Polite delay between individual document writes
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.warn(`Could not sync movement ${m.id} to Firestore collection, deferring:`, err);
      }
    }

    // Push current consolidated list to shared movements_registry
    try {
      const allLocal = getLocalCache<Movement[]>('lys_cache_movements', []);
      if (allLocal.length > 0) {
        const regRef = doc(db, 'settings', 'movements_registry');
        const cleanReg = cleanFirestoreData({ movements: allLocal, lastUpdated: new Date().toISOString() });
        await executeWithBackoff(async () => {
          await withTimeout(setDoc(regRef, cleanReg), 6000);
        }).catch(() => null);
      }
    } catch (e) {}

    return count;
  },

  // ------------------ 4. SERVICES CATALOG ------------------

  async getServices(): Promise<CatalogService[]> {
    const colPath = 'services';
    try {
      const snap = await withTimeout(getDocs(collection(db, colPath)), 3000);
      if (snap.empty) {
        // Self-bootstrap initial items from local constants to save setup time
        const initialServices: CatalogService[] = SERVICES.map(s => {
          return {
            id: s.id,
            name: s.name,
            label: s.label,
            description: s.description,
            features: s.features,
            isFeatured: s.isFeatured ?? false,
            isHidden: (s as any).isHidden ?? false,
            basePrice: s.basePrice || 15000,
            prices: s.prices || { auto: 15000, suv: 20000, pickup: 30000 },
            duration: s.duration || 60
          };
        });
        
        setLocalCache('lys_cache_services', initialServices);
        return initialServices;
      }

      const list: CatalogService[] = [];
      snap.forEach(d => {
        const item = d.data() as CatalogService;
        const staticMatch = SERVICES.find(s => s.id === item.id);
        list.push({
          ...item,
          duration: item.duration || staticMatch?.duration || 60
        });
      });
      setLocalCache('lys_cache_services', list);
      return list;
    } catch (e) {
      console.warn("Firestore getServices error/timeout, using fallback:", e);
      return getLocalCache<CatalogService[]>('lys_cache_services', SERVICES.map(s => ({
        id: s.id,
        name: s.name,
        label: s.label,
        description: s.description,
        features: s.features,
        isFeatured: s.isFeatured ?? false,
        isHidden: (s as any).isHidden ?? false,
        basePrice: s.basePrice || 15000,
        prices: s.prices || { auto: 15000, suv: 20000, pickup: 30000 },
        duration: s.duration || 60
      })));
    }
  },

  async saveService(service: CatalogService): Promise<void> {
    const colPath = 'services';

    // Save locally
    const localServices = getLocalCache<CatalogService[]>('lys_cache_services', []);
    const filtered = localServices.filter(s => s.id !== service.id);
    filtered.push(service);
    setLocalCache('lys_cache_services', filtered);

    try {
      await withTimeout(setDoc(doc(db, colPath, service.id), {
        ...service,
        isFeatured: service.isFeatured ?? false
      }), 2500);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `${colPath}/${service.id}`);
    }
  },

  async deleteService(serviceId: string): Promise<void> {
    const colPath = 'services';

    // Delete locally
    const localServices = getLocalCache<CatalogService[]>('lys_cache_services', []);
    const filtered = localServices.filter(s => s.id !== serviceId);
    setLocalCache('lys_cache_services', filtered);

    try {
      await withTimeout(deleteDoc(doc(db, colPath, serviceId)), 2500);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${colPath}/${serviceId}`);
    }
  },

  // ------------------ 5. VEHICLES CONFIG ------------------

  async getVehicles(): Promise<CatalogVehicle[]> {
    const colPath = 'vehicles';
    try {
      const snap = await withTimeout(getDocs(collection(db, colPath)), 3000);
      if (snap.empty) {
        // Self-bootstrap initial vehicles
        const initialVehicles: CatalogVehicle[] = VEHICLES.map(v => {
          let extraPrice = 0;
          if (v.id === 'suv') extraPrice = 5000;
          if (v.id === 'pickup') extraPrice = 15000;
          return {
            id: v.id,
            name: v.name,
            icon: v.icon,
            examples: v.examples,
            extraPrice
          };
        });

        setLocalCache('lys_cache_vehicles', initialVehicles);
        return initialVehicles;
      }

      const list: CatalogVehicle[] = [];
      snap.forEach(d => {
        list.push(d.data() as CatalogVehicle);
      });
      setLocalCache('lys_cache_vehicles', list);
      return list;
    } catch (e) {
      console.warn("Firestore getVehicles error/timeout, using fallback:", e);
      return getLocalCache<CatalogVehicle[]>('lys_cache_vehicles', VEHICLES.map(v => ({
        id: v.id,
        name: v.name,
        icon: v.icon,
        examples: v.examples,
        extraPrice: v.id === 'suv' ? 5000 : (v.id === 'pickup' ? 15000 : 0)
      })));
    }
  },

  async saveVehicle(vehicle: CatalogVehicle): Promise<void> {
    const colPath = 'vehicles';

    // Save locally
    const localVehicles = getLocalCache<CatalogVehicle[]>('lys_cache_vehicles', []);
    const filtered = localVehicles.filter(v => v.id !== vehicle.id);
    filtered.push(vehicle);
    setLocalCache('lys_cache_vehicles', filtered);

    try {
      await withTimeout(setDoc(doc(db, colPath, vehicle.id), vehicle), 2500);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `${colPath}/${vehicle.id}`);
    }
  },

  // ------------------ 6. DYNAMIC GALLERY PHOTOS ------------------

  async getGallery(): Promise<GalleryPhoto[]> {
    const colPath = 'gallery';
    try {
      const snap = await withTimeout(getDocs(collection(db, colPath)), 3000);
      if (snap.empty) {
        // Self-bootstrap visual defaults if desired
        const defaultPhotos: GalleryPhoto[] = [
          {
            id: 'demo-1',
            url: 'https://images.unsplash.com/photo-1601362840469-51e4d8d59085?auto=format&fit=crop&q=80&w=600',
            title: 'Detallado de Llantas & Carrocería',
            description: 'Aplicación técnica de Koch Chemie Gentle Snow Foam y remoción profunda en BMW Serie 3.',
            createdAt: new Date().toISOString()
          },
          {
            id: 'demo-2',
            url: 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&q=80&w=600',
            title: 'Interiores Libres de Polvo',
            description: 'Acondicionado absoluto con Top Star, dejando un acabado mate sedoso, antiestático y con aroma premium.',
            createdAt: new Date().toISOString()
          },
          {
            id: 'demo-3',
            url: 'https://images.unsplash.com/photo-1520340356584-f9917d1ecc6f?auto=format&fit=crop&q=80&w=600',
            title: 'Protector Wax Aplicación Full',
            description: 'Brillo húmedo extremo, efecto lotus de autolimpieza e hidrofobia duradera hasta por 3 meses.',
            createdAt: new Date().toISOString()
          }
        ];

        setLocalCache('lys_cache_gallery', defaultPhotos);
        return defaultPhotos;
      }

      const list: GalleryPhoto[] = [];
      snap.forEach(d => {
        list.push(d.data() as GalleryPhoto);
      });
      const sorted = list.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
      setLocalCache('lys_cache_gallery', sorted);
      return sorted;
    } catch (e) {
      console.warn("Firestore getGallery error/timeout, using fallback:", e);
      return getLocalCache<GalleryPhoto[]>('lys_cache_gallery', []);
    }
  },

  async addGalleryPhoto(photo: GalleryPhoto): Promise<void> {
    const colPath = 'gallery';

    const sanitizedPhoto: GalleryPhoto = {
      ...photo,
      url: sanitizeImageUrl(photo.url)
    };

    // Save locally
    const localGallery = getLocalCache<GalleryPhoto[]>('lys_cache_gallery', []);
    const filtered = localGallery.filter(p => p.id !== sanitizedPhoto.id);
    filtered.unshift(sanitizedPhoto);
    setLocalCache('lys_cache_gallery', filtered);

    try {
      await withTimeout(setDoc(doc(db, colPath, sanitizedPhoto.id), sanitizedPhoto), 2500);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `${colPath}/${sanitizedPhoto.id}`);
    }
  },

  async deleteGalleryPhoto(photoId: string): Promise<void> {
    const colPath = 'gallery';

    // Delete locally
    const localGallery = getLocalCache<GalleryPhoto[]>('lys_cache_gallery', []);
    const filtered = localGallery.filter(p => p.id !== photoId);
    setLocalCache('lys_cache_gallery', filtered);

    try {
      await withTimeout(deleteDoc(doc(db, colPath, photoId)), 2500);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${colPath}/${photoId}`);
    }
  },

  async restoreDefaultGallery(): Promise<GalleryPhoto[]> {
    const colPath = 'gallery';
    const defaultPhotos: GalleryPhoto[] = [
      {
        id: 'demo-1',
        url: 'https://images.unsplash.com/photo-1601362840469-51e4d8d59085?auto=format&fit=crop&q=80&w=600',
        title: 'Detallado de Llantas & Carrocería',
        description: 'Aplicación técnica de Koch Chemie Gentle Snow Foam y remoción profunda en BMW Serie 3.',
        createdAt: new Date().toISOString()
      },
      {
        id: 'demo-2',
        url: 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&q=80&w=600',
        title: 'Interiores Libres de Polvo',
        description: 'Acondicionado absoluto con Top Star, dejando un acabado mate sedoso, antiestático y con aroma premium.',
        createdAt: new Date().toISOString()
      },
      {
        id: 'demo-3',
        url: 'https://images.unsplash.com/photo-1520340356584-f9917d1ecc6f?auto=format&fit=crop&q=80&w=600',
        title: 'Protector Wax Aplicación Full',
        description: 'Brillo húmedo extremo, efecto lotus de autolimpieza e hidrofobia duradera hasta por 3 meses.',
        createdAt: new Date().toISOString()
      }
    ];

    setLocalCache('lys_cache_gallery', defaultPhotos);
    try {
      const batch = writeBatch(db);
      defaultPhotos.forEach(p => {
        batch.set(doc(db, colPath, p.id), p);
      });
      await withTimeout(batch.commit(), 3000);
    } catch (e) {
      console.warn("restoreDefaultGallery cloud write failed, saved locally:", e);
    }
    return defaultPhotos;
  },

  // ------------------ 8. DOMICILIO CONFIG ------------------
  async getDomicilioConfig(): Promise<DomicilioConfig> {
    const defaults: DomicilioConfig = {
      enabled: true,
      extraPrice: 5000,
      bufferMinutes: 45,
      city: 'Cipolletti',
      whatsappHelpPhone: '2995760611'
    };
    try {
      const snap = await withTimeout(getDoc(doc(db, 'settings', 'domicilio_config')), 3000);
      if (snap.exists()) {
        const data = snap.data() as DomicilioConfig;
        const merged = { ...defaults, ...data };
        setLocalCache('lys_cache_domicilio_config', merged);
        return merged;
      }
    } catch (e) {
      console.warn('Error fetching domicilio config, using local:', e);
    }
    return getLocalCache<DomicilioConfig>('lys_cache_domicilio_config', defaults);
  },

  async saveDomicilioConfig(config: DomicilioConfig): Promise<void> {
    setLocalCache('lys_cache_domicilio_config', config);
    try {
      const clean = cleanFirestoreData(config);
      await withTimeout(setDoc(doc(db, 'settings', 'domicilio_config'), clean, { merge: true }), 4000);
    } catch (e) {
      console.warn('Error saving domicilio config to Firestore:', e);
    }
  },

  async importFromGoogleSheets(customUrl?: string): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const url = customUrl || 'https://docs.google.com/spreadsheets/d/1SDYaW0TBtLao-QJOC6TVlkoaRG7x6Ft4GcPudlGzbZc/export?format=csv';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('No se pudo acceder a la planilla de Google. Verificá que esté compartida para que cualquiera con el enlace pueda leerla.');
      }
      const csvText = await response.text();
      const lines = csvText.split('\n');
      let count = 0;
      
      const batchList: Booking[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // CSV parser to correctly handle quotes
        const r: string[] = [];
        let cur = '';
        let inQuotes = false;
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            r.push(cur);
            cur = '';
          } else {
            cur += char;
          }
        }
        r.push(cur);

        if (r.length < 5) continue; // Skip incomplete lines
        
        const id = r[0]?.trim();
        const fecha = r[1]?.trim();
        let hora = r[2]?.trim() || '';
        const servicio = r[3]?.trim() || 'MANUAL';
        const nombre = r[4]?.trim() || 'TURNO';
        const telefono = r[5]?.trim() || '00000000';
        const direccion = r[6]?.trim() || 'Venezuela 1659 (Domicilio)';
        let estado = (r[7]?.trim() || 'pendiente').toLowerCase();
        
        if (!id || !fecha || !hora) continue;

        // Ensure hora has length 5 (e.g., 9:00 -> 09:00)
        if (hora.length === 4) {
          hora = '0' + hora;
        }
        if (hora.length !== 5) {
          continue; // Skip invalid hour formats
        }

        if (!['pendiente', 'confirmado', 'hecho', 'cancelado'].includes(estado)) {
          estado = 'pendiente';
        }

        // Deduce vehicle type 'tipo' matching size rules
        let tipo = 'Auto';
        const servLower = servicio.toLowerCase();
        const nameLower = nombre.toLowerCase();
        if (servLower.includes('camioneta') || servLower.includes('suv')) {
          tipo = 'SUV / Camioneta Chica';
        } else if (servLower.includes('pickup') || servLower.includes('pick-up') || servLower.includes('utilitario')) {
          tipo = 'Pick-up / Utilitario';
        } else if (servLower.includes('manual') || nameLower.includes('bloqueado')) {
          tipo = 'MANUAL';
        }

        const b: Booking = {
          id,
          fecha,
          hora,
          tipo,
          servicio: servicio.substring(0, 150),
          nombre: nombre.substring(0, 150),
          telefono: telefono.substring(0, 50),
          direccion: direccion.substring(0, 500),
          estado: estado as Booking['estado']
        };

        batchList.push(b);
      }

      // Save each to Firestore
      for (const booking of batchList) {
        const isBlocked = booking.nombre.includes('BLOQUEADO') || booking.servicio.includes('MANUAL');
        await this.createBooking(booking, isBlocked);
        count++;
      }

      return { success: true, count };
    } catch (e: any) {
      console.error('Error importing from Google Sheets:', e);
      return { success: false, count: 0, error: e.message || String(e) };
    }
  },

  async importCajaFromGoogleSheets(customUrl?: string): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      // Construct the URL to target the "Caja" tab as CSV
      let url = 'https://docs.google.com/spreadsheets/d/1SDYaW0TBtLao-QJOC6TVlkoaRG7x6Ft4GcPudlGzbZc/gviz/tq?tqx=out:csv&sheet=Caja';
      if (customUrl) {
        let clean = customUrl.trim();
        if (clean.includes('/edit')) {
          url = clean.replace(/\/edit.*/, '/gviz/tq?tqx=out:csv&sheet=Caja');
        } else {
          url = clean;
        }
      }

      console.log('Fetching Google Sheet for Caja from:', url);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('No se pudo acceder a la pestaña "Caja" de la planilla de Google. Verificá que la planilla esté compartida públicamente.');
      }
      const csvText = await response.text();
      const lines = csvText.split('\n');
      if (lines.length <= 1) {
        return { success: true, count: 0 };
      }

      // Parse headers from the first line
      const firstLiner: string[] = [];
      let curHeader = '';
      let inHeaderQuotes = false;
      const firstLineStr = lines[0].trim();
      for (let j = 0; j < firstLineStr.length; j++) {
        const char = firstLineStr[j];
        if (char === '"') {
          inHeaderQuotes = !inHeaderQuotes;
        } else if (char === ',' && !inHeaderQuotes) {
          firstLiner.push(curHeader);
          curHeader = '';
        } else {
          curHeader += char;
        }
      }
      firstLiner.push(curHeader);

      const headers = firstLiner.map(h => 
        h.trim()
         .toLowerCase()
         .normalize("NFD")
         .replace(/[\u0300-\u036f]/g, "")
         .replace(/[^a-z0-9_]/g, '')
      );

      console.log('Caja Sheet headers found:', headers);

      // Find indices or fall back to default indexes (id, fecha, tipo, categoria, concepto, monto_ars, medio, estado, factura, turno_id, cliente, notas)
      let idxId = headers.findIndex(h => h === 'id');
      let idxFecha = headers.findIndex(h => h.includes('fecha') || h === 'dia' || h === 'date');
      let idxTipo = headers.findIndex(h => h.includes('tipo') || h === 'type');
      let idxCategoria = headers.findIndex(h => h.includes('categoria') || h === 'category');
      let idxConcepto = headers.findIndex(h => h.includes('concepto') || h.includes('descripcion') || h === 'concept' || h === 'description');
      let idxMonto = headers.findIndex(h => h.includes('monto') || h.includes('importe') || h === 'amount');
      let idxMedio = headers.findIndex(h => h.includes('medio') || h.includes('forma') || h === 'method' || h.includes('pago'));
      let idxEstado = headers.findIndex(h => h.includes('estado') || h === 'status');
      let idxFactura = headers.findIndex(h => h.includes('factura') || h === 'invoice');
      let idxCliente = headers.findIndex(h => h.includes('cliente') || h === 'client' || h === 'customer');
      let idxNotas = headers.findIndex(h => h.includes('notas') || h.includes('nota') || h === 'notes' || h.includes('obs'));

      // Fallback to sequential index design matching: id, fecha, tipo, categoria, concepto, monto_ars, medio, estado, factura, turno_id, cliente, notas
      if (idxId === -1) idxId = 0;
      if (idxFecha === -1) idxFecha = 1;
      if (idxTipo === -1) idxTipo = 2;
      if (idxCategoria === -1) idxCategoria = 3;
      if (idxConcepto === -1) idxConcepto = 4;
      if (idxMonto === -1) idxMonto = 5;
      if (idxMedio === -1) idxMedio = 6;
      if (idxEstado === -1) idxEstado = 7;
      if (idxFactura === -1) idxFactura = 8;
      // Index 9 is turno_id, skip it
      if (idxCliente === -1) idxCliente = 10;
      if (idxNotas === -1) idxNotas = 11;

      console.log('Resolved Caja column indices:', {
        idxId, idxFecha, idxTipo, idxCategoria, idxConcepto, idxMonto, idxMedio, idxEstado, idxFactura, idxCliente, idxNotas
      });

      let count = 0;
      const batchList: Movement[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // CSV parser to correctly handle quotes
        const r: string[] = [];
        let cur = '';
        let inQuotes = false;
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            r.push(cur);
            cur = '';
          } else {
            cur += char;
          }
        }
        r.push(cur);

        // Check if we have minimum columns needed for a record
        if (r.length < 5) continue;

        const rawFecha = r[idxFecha]?.trim();
        if (!rawFecha) continue;

        // Parse date
        let fecha = rawFecha;
        if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
          // Already YYYY-MM-DD
        } else {
          const parts = fecha.split(/[\/\-]/);
          if (parts.length === 3) {
            let p0 = parts[0].trim();
            let p1 = parts[1].trim();
            let p2 = parts[2].trim();
            if (p0.length === 4) {
              // YYYY-MM-DD or YYYY/MM/DD
              fecha = `${p0}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
            } else {
              // DD/MM/YYYY or D/M/YYYY
              let year = p2;
              if (year.length === 2) year = '20' + year;
              fecha = `${year}-${p1.padStart(2, '0')}-${p0.padStart(2, '0')}`;
            }
          }
        }

        // Validate size/format of date
        if (fecha.length !== 10) continue;

        // Parse tipo
        let tipoVal = (r[idxTipo]?.trim() || 'Ingreso').toLowerCase();
        let tipo: 'Ingreso' | 'Gasto' = 'Ingreso';
        if (tipoVal.includes('gasto') || tipoVal.includes('egreso') || tipoVal.includes('out') || tipoVal.includes('spend')) {
          tipo = 'Gasto';
        }

        // Parse category and concept
        const categoria = (r[idxCategoria]?.trim() || (tipo === 'Ingreso' ? 'Servicios' : 'Gastos Generales')).substring(0, 150);
        const concepto = (r[idxConcepto]?.trim() || 'Importado de planilla').substring(0, 500);

        // Parse amount
        let rawMonto = r[idxMonto]?.trim() || '0';
        rawMonto = rawMonto.replace(/[^0-9,\.\-]/g, '');
        if (rawMonto.includes(',') && rawMonto.includes('.')) {
          rawMonto = rawMonto.replace(/\./g, '').replace(/,/g, '.');
        } else if (rawMonto.includes(',')) {
          const parts = rawMonto.split(',');
          if (parts[parts.length - 1].length === 2) {
            rawMonto = rawMonto.replace(/,/g, '.');
          } else {
            rawMonto = rawMonto.replace(/,/g, '');
          }
        }
        const monto_ars = parseFloat(rawMonto) || 0;
        if (monto_ars <= 0) continue; // Skip zero/invalid entries

        const medio = (r[idxMedio]?.trim() || 'Efectivo').substring(0, 150);

        // Parse status
        let estadoVal = (r[idxEstado]?.trim() || 'Pagado').toLowerCase();
        let estado: 'Pagado' | 'Pendiente' = 'Pagado';
        if (estadoVal.includes('pend') || estadoVal.includes('debe')) {
          estado = 'Pendiente';
        }

        const factura = (r[idxFactura]?.trim() || '').substring(0, 200);
        const cliente = (r[idxCliente]?.trim() || '').substring(0, 200);
        const notas = (r[idxNotas]?.trim() || '').substring(0, 2000);

        // Deterministic ID or sequential fallback
        const id = (idxId !== -1 && r[idxId]?.trim()) 
          ? r[idxId]?.trim() 
          : `mov_${fecha}_${concepto.replace(/[^a-zA-Z0-9]/g, '')}_${monto_ars}_${i}`;

        const m: Movement = {
          id,
          fecha,
          tipo,
          categoria,
          concepto,
          monto_ars,
          medio,
          estado,
          factura,
          cliente,
          notas
        } as Movement;

        batchList.push(m);
      }

      console.log(`Parsed ${batchList.length} movements of Caja. Starting insertion...`);

      // Save each to Firestore and Local Cache
      for (const movement of batchList) {
        await this.saveMovement(movement);
        count++;
      }

      return { success: true, count };
    } catch (e: any) {
      console.error('Error importing caja from Google Sheets:', e);
      return { success: false, count: 0, error: e.message || String(e) };
    }
  },

  // ------------------ 8. FACTURACIÓN ELECTRÓNICA DIRECTA ARCA ------------------

  async getArcaConfig(): Promise<ArcaConfig> {
    const defaultConfig: ArcaConfig = {
      cuit: '20411564550',
      razonSocial: 'LyS Lavados',
      puntoVenta: 2,
      tipoComprobanteDefault: 11, // Factura C
      conceptoDefault: 2, // Servicios
      domicilioComercial: 'Venezuela 1659, Cipolletti, Río Negro',
      inicioActividades: '01/01/2024',
      condicionIva: 'Responsable Monotributo',
      production: true,
      apiHost: ''
    };

    try {
      const docRef = doc(db, 'config', 'arca');
      const snap = await withTimeout(getDoc(docRef), 3000);
      if (snap.exists()) {
        const data = snap.data() as Partial<ArcaConfig>;
        const merged = { ...defaultConfig, ...data };
        setLocalCache('lys_arca_config', merged);
        return merged;
      }
    } catch (e) {
      console.warn('Could not load arca config from firestore, using local cache:', e);
    }

    return getLocalCache<ArcaConfig>('lys_arca_config', defaultConfig);
  },

  async saveArcaConfig(config: ArcaConfig): Promise<void> {
    setLocalCache('lys_arca_config', config);
    try {
      const docRef = doc(db, 'config', 'arca');
      await withTimeout(setDoc(docRef, cleanFirestoreData(config), { merge: true }), 4000);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'config/arca');
    }
  },

  async getArcaFacturas(): Promise<ArcaFacturaRecord[]> {
    // 1. Fetch bundled static facturas (/facturas_arca.json)
    const staticFacturas: ArcaFacturaRecord[] = Array.isArray(bundledFacturasJson) ? [...(bundledFacturasJson as ArcaFacturaRecord[])] : [];
    try {
      const staticRes = await fetch('/facturas_arca.json').catch(() => null);
      if (staticRes && staticRes.ok) {
        const json = await staticRes.json().catch(() => null);
        if (Array.isArray(json)) {
          staticFacturas.push(...json);
        }
      }
    } catch (e) {}

    // 2. Fetch shared registry from Firestore settings (accessible to all devices)
    const sharedSettingsFacturas: ArcaFacturaRecord[] = [];
    try {
      const settingsRef = doc(db, 'settings', 'arca_facturas');
      const settingsSnap = await withTimeout(getDoc(settingsRef), 3000).catch(() => null);
      if (settingsSnap && settingsSnap.exists()) {
        const data = settingsSnap.data();
        if (Array.isArray(data?.facturas)) {
          sharedSettingsFacturas.push(...data.facturas);
        }
      }
    } catch (e) {}

    // 2b. Fetch individual factura docs from settings collection
    try {
      const settingsDocs = await withTimeout(getDocs(collection(db, 'settings')), 3000).catch(() => null);
      if (settingsDocs) {
        settingsDocs.forEach(d => {
          if (d.id.startsWith('factura_')) {
            const f = d.data() as ArcaFacturaRecord;
            if (f && f.id) sharedSettingsFacturas.push(f);
          }
        });
      }
    } catch (e) {}

    // 3. Fetch from dedicated facturas collection in Firestore
    const firestoreFacturas: ArcaFacturaRecord[] = [];
    try {
      const col = collection(db, 'facturas');
      const snap = await withTimeout(getDocs(col), 2500).catch(() => null);
      if (snap) {
        snap.forEach(d => {
          const item = d.data() as ArcaFacturaRecord;
          if (item && item.id) firestoreFacturas.push(item);
        });
      }
    } catch (e) {}

    // 4. Fetch from backend server
    const serverFacturas: ArcaFacturaRecord[] = [];
    try {
      const cfg = await this.getArcaConfig().catch(() => null);
      let base = cfg?.apiHost?.trim().replace(/\/$/, '') || '';
      if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        const isLocalOrRunApp = host.includes('localhost') || host === '127.0.0.1' || host.includes('run.app');
        if (isLocalOrRunApp) {
          base = '';
        } else if (!base) {
          base = 'https://nueva-pagina.onrender.com';
        }
      }
      const endpoint = base ? `${base}/api/arca/facturas` : '/api/arca/facturas';
      const res = await fetch(endpoint).catch(() => null);
      if (res && res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const json = await res.json().catch(() => null);
          if (json && json.success && Array.isArray(json.facturas)) {
            serverFacturas.push(...json.facturas);
          }
        }
      }
    } catch (e) {}

    // 5. Local cached and unsynced facturas
    const cachedFacturas = getLocalCache<ArcaFacturaRecord[]>('lys_arca_facturas', []);
    const unsyncedFacturas = getLocalCache<ArcaFacturaRecord[]>('lys_unsynced_facturas', []);

    // Merge and deduplicate by key (puntoVenta + cbteNro) and id
    const map = new Map<string, ArcaFacturaRecord>();
    for (const f of [
      ...staticFacturas, 
      ...serverFacturas, 
      ...firestoreFacturas, 
      ...sharedSettingsFacturas, 
      ...cachedFacturas,
      ...unsyncedFacturas
    ]) {
      if (f && f.cbteNro) {
        const key = `${f.puntoVenta || 2}_${f.cbteNro}`;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, f);
        } else {
          // Merge preserving QR and details
          map.set(key, {
            ...existing,
            ...f,
            qrBase64: f.qrBase64 || existing.qrBase64,
            qrUrl: f.qrUrl || existing.qrUrl
          });
        }
      }
    }

    const merged = Array.from(map.values()).sort((a, b) => Number(b.cbteNro) - Number(a.cbteNro));
    setLocalCache('lys_arca_facturas', merged);

    // If user is admin and the shared settings registry is missing entries, backfill it in background
    if (auth.currentUser && auth.currentUser.email?.toLowerCase() === 'leandro.saralegui@gmail.com') {
      if (merged.length > sharedSettingsFacturas.length) {
        const sRef = doc(db, 'settings', 'arca_facturas');
        const cleanPayload = cleanFirestoreData({ facturas: merged, lastUpdated: new Date().toISOString() });
        setDoc(sRef, cleanPayload, { merge: true }).catch(() => null);
      }
    }

    return merged;
  },

  async saveArcaFactura(factura: ArcaFacturaRecord): Promise<void> {
    // 1. Cache locally
    const cached = getLocalCache<ArcaFacturaRecord[]>('lys_arca_facturas', []);
    const updated = [factura, ...cached.filter(f => f.id !== factura.id && Number(f.cbteNro) !== Number(factura.cbteNro))];
    setLocalCache('lys_arca_facturas', updated);

    // Add to unsynced queue
    const unsynced = getLocalCache<ArcaFacturaRecord[]>('lys_unsynced_facturas', []);
    const updatedUnsynced = [factura, ...unsynced.filter(f => f.id !== factura.id)];
    setLocalCache('lys_unsynced_facturas', updatedUnsynced);

    let writeSucceeded = false;

    // 2. Persist to shared Firestore settings/arca_facturas (cross-device source of truth)
    try {
      const settingsRef = doc(db, 'settings', 'arca_facturas');
      const snap = await withTimeout(getDoc(settingsRef), 3000).catch(() => null);
      const currentList: ArcaFacturaRecord[] = snap?.exists() && Array.isArray(snap.data()?.facturas) ? snap.data().facturas : [];
      const mergedList = [factura, ...currentList.filter(f => f.id !== factura.id && Number(f.cbteNro) !== Number(factura.cbteNro))];
      const cleanPayload = cleanFirestoreData({ facturas: mergedList, lastUpdated: new Date().toISOString() });
      await withTimeout(setDoc(settingsRef, cleanPayload), 4000);
      writeSucceeded = true;
    } catch (err) {
      console.warn('Could not save to settings/arca_facturas:', err);
    }

    // 2b. Persist individual factura to settings/factura_{id}
    try {
      const cleanDoc = cleanFirestoreData(factura);
      await withTimeout(setDoc(doc(db, 'settings', `factura_${factura.id}`), cleanDoc), 3000);
      writeSucceeded = true;
    } catch (e) {}

    // 3. Persist to dedicated collection facturas/{id}
    try {
      const docRef = doc(db, 'facturas', factura.id);
      const cleanFactura = cleanFirestoreData(factura);
      await withTimeout(setDoc(docRef, cleanFactura), 3500);
      writeSucceeded = true;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `facturas/${factura.id}`);
    }

    // 4. Persist to Node backend server
    try {
      const cfg = await this.getArcaConfig().catch(() => null);
      let base = cfg?.apiHost?.trim().replace(/\/$/, '') || '';
      if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        const isLocalOrRunApp = host.includes('localhost') || host === '127.0.0.1' || host.includes('run.app');
        if (isLocalOrRunApp) {
          base = '';
        } else if (!base) {
          base = 'https://nueva-pagina.onrender.com';
        }
      }
      const endpoint = base ? `${base}/api/arca/facturas` : '/api/arca/facturas';
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(factura)
      }).catch(err => console.warn('Could not sync factura to backend:', err));
    } catch (e) {}

    // If successfully written remotely, remove from unsynced queue
    if (writeSucceeded) {
      const freshQueue = getLocalCache<ArcaFacturaRecord[]>('lys_unsynced_facturas', []);
      setLocalCache('lys_unsynced_facturas', freshQueue.filter(f => f.id !== factura.id));
    }

    // 5. Also synthesize and save the corresponding Movement in Caja
    const movId = factura.movementId || `mov_${factura.id}`;
    const movVal: Movement = {
      id: movId,
      fecha: factura.fechaIso || (factura.fechaEmision ? factura.fechaEmision.split('/').reverse().join('-') : new Date().toISOString().split('T')[0]),
      tipo: 'Ingreso',
      categoria: 'Lavado',
      concepto: factura.conceptoDescripcion || 'Servicio de Estética y Lavado Automotor',
      monto_ars: Number(factura.total) || 0,
      medio: 'Efectivo',
      estado: 'Pagado',
      factura: `${factura.tipoComprobanteNombre || 'FACTURA C'} Nº ${String(factura.puntoVenta).padStart(4, '0')}-${String(factura.cbteNro).padStart(8, '0')}`,
      cliente: factura.clienteNombre || 'Consumidor Final',
      facturado: true,
      cae: factura.cae,
      caeVto: factura.caeVto,
      facturaId: factura.id,
      notas: `Factura oficial ARCA emitida con CAE ${factura.cae}`
    };
    await this.saveMovement(movVal).catch(() => null);
  },

  /**
   * Real-time subscription to ARCA Facturas across devices
   */
  subscribeArcaFacturas(callback: (facturas: ArcaFacturaRecord[]) => void): () => void {
    try {
      const settingsRef = doc(db, 'settings', 'arca_facturas');
      return onSnapshot(settingsRef, (snap) => {
        if (snap.exists() && Array.isArray(snap.data()?.facturas)) {
          const remoteFacturas: ArcaFacturaRecord[] = snap.data().facturas;
          const cached = getLocalCache<ArcaFacturaRecord[]>('lys_arca_facturas', []);
          const map = new Map<string, ArcaFacturaRecord>();
          for (const f of [...remoteFacturas, ...cached]) {
            if (f && f.cbteNro) {
              const key = `${f.puntoVenta || 2}_${f.cbteNro}`;
              if (!map.has(key)) map.set(key, f);
            }
          }
          const merged = Array.from(map.values()).sort((a, b) => Number(b.cbteNro) - Number(a.cbteNro));
          setLocalCache('lys_arca_facturas', merged);
          callback(merged);
        }
      }, (err) => {
        console.warn('subscribeArcaFacturas notice:', err);
      });
    } catch (e) {
      return () => {};
    }
  },

  /**
   * Syncs any locally stored invoices that were created offline or before login
   */
  async syncUnsyncedFacturas(): Promise<number> {
    const unsynced = getLocalCache<ArcaFacturaRecord[]>('lys_unsynced_facturas', []);
    if (unsynced.length === 0) return 0;
    let count = 0;
    for (const f of unsynced) {
      try {
        await this.saveArcaFactura(f);
        count++;
        const current = getLocalCache<ArcaFacturaRecord[]>('lys_unsynced_facturas', []);
        setLocalCache('lys_unsynced_facturas', current.filter(x => x.id !== f.id));
      } catch (e) {
        console.warn('Could not sync factura to Firestore:', e);
      }
    }
    return count;
  }
};
