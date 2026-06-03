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
  getDocFromServer,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from './firebase.ts';
import { SERVICES, VEHICLES } from '../constants.ts';

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
  console.error('Firestore Error Detailed: ', JSON.stringify(errInfo));
  throw error instanceof Error ? error : new Error(String(error));
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

function isUserAdmin(): boolean {
  const user = auth.currentUser;
  if (!user) return false;
  const email = user.email?.toLowerCase();
  return email === 'leandro.saralegui@gmail.com' || user.uid === 'AYbEVBVfFxcx9vgxAWb83cJvDV02';
}

// --- Validate Connection on boot ---
async function testConnection() {
  try {
    await withTimeout(getDocFromServer(doc(db, 'test', 'connection')), 5000);
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
}

export interface CatalogService {
  id: string;
  name: string;
  label: string;
  description: string;
  features: string[];
  isFeatured?: boolean;
  basePrice: number;
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

export const firestoreService = {
  // ------------------ 1. BOOKINGS (TURNOS) ------------------
  
  async getBookings(): Promise<Booking[]> {
    const colPath = 'bookings';
    try {
      const q = collection(db, colPath);
      const snap = await withTimeout(getDocs(q), 3000);
      const rows: Booking[] = [];
      snap.forEach(docSnap => {
        rows.push(docSnap.data() as Booking);
      });
      setLocalCache('lys_cache_bookings', rows);
      return rows;
    } catch (e) {
      console.warn("Firestore getBookings error/timeout, using local cache:", e);
      return getLocalCache<Booking[]>('lys_cache_bookings', []);
    }
  },

  async createBooking(booking: Booking, isBlocked = false): Promise<void> {
    const slotId = `${booking.fecha}_${booking.hora}`;
    
    // Save to local cache first
    const localBookings = getLocalCache<Booking[]>('lys_cache_bookings', []);
    if (!localBookings.some(b => b.id === booking.id)) {
      localBookings.push(booking);
      setLocalCache('lys_cache_bookings', localBookings);
    }

    const localTaken = getLocalCache<TakenSlot[]>('lys_cache_taken_slots', []);
    if (!localTaken.some(ts => ts.id === slotId)) {
      localTaken.push({ id: slotId, fecha: booking.fecha, hora: booking.hora, isBlocked });
      setLocalCache('lys_cache_taken_slots', localTaken);
    }

    try {
      const bach = writeBatch(db);
      const bookingRef = doc(db, 'bookings', booking.id);
      const slotRef = doc(db, 'taken_slots', slotId);

      bach.set(bookingRef, booking);
      bach.set(slotRef, {
        id: slotId,
        fecha: booking.fecha,
        hora: booking.hora,
        isBlocked: isBlocked
      });

      await withTimeout(bach.commit(), 10000);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `bookings_and_slots/${booking.id}`);
    }
  },

  async deleteBooking(bookingId: string, fecha: string, hora: string): Promise<void> {
    const slotId = `${fecha}_${hora}`;

    // Update local cache
    const localBookings = getLocalCache<Booking[]>('lys_cache_bookings', []);
    const filteredBookings = localBookings.filter(b => b.id !== bookingId);
    setLocalCache('lys_cache_bookings', filteredBookings);

    const localTaken = getLocalCache<TakenSlot[]>('lys_cache_taken_slots', []);
    const filteredTaken = localTaken.filter(ts => ts.id !== slotId);
    setLocalCache('lys_cache_taken_slots', filteredTaken);

    try {
      const bach = writeBatch(db);
      const bookingRef = doc(db, 'bookings', bookingId);
      const slotRef = doc(db, 'taken_slots', slotId);

      bach.delete(bookingRef);
      bach.delete(slotRef);

      await withTimeout(bach.commit(), 10000);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `bookings_and_slots/${bookingId}`);
    }
  },

  async updateBookingStatus(bookingId: string, booking: Booking, newStatus: Booking['estado']): Promise<void> {
    const slotId = `${booking.fecha}_${booking.hora}`;

    // Update local cache
    const localBookings = getLocalCache<Booking[]>('lys_cache_bookings', []);
    const updatedBookings = localBookings.map(b => b.id === bookingId ? { ...b, estado: newStatus } : b);
    setLocalCache('lys_cache_bookings', updatedBookings);

    const localTaken = getLocalCache<TakenSlot[]>('lys_cache_taken_slots', []);
    let updatedTaken = localTaken;
    if (newStatus === 'cancelado') {
      updatedTaken = localTaken.filter(ts => ts.id !== slotId);
    } else {
      if (!localTaken.some(ts => ts.id === slotId)) {
        updatedTaken.push({ id: slotId, fecha: booking.fecha, hora: booking.hora, isBlocked: booking.nombre.includes('BLOQUEADO') });
      }
    }
    setLocalCache('lys_cache_taken_slots', updatedTaken);

    try {
      const bookingRef = doc(db, 'bookings', bookingId);
      const slotRef = doc(db, 'taken_slots', slotId);
      const bach = writeBatch(db);
      
      bach.update(bookingRef, { estado: newStatus });

      if (newStatus === 'cancelado') {
        bach.delete(slotRef);
      } else {
        bach.set(slotRef, {
          id: slotId,
          fecha: booking.fecha,
          hora: booking.hora,
          isBlocked: booking.nombre.includes('BLOQUEADO')
        });
      }

      await withTimeout(bach.commit(), 10000);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `bookings_and_slots/${bookingId}`);
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

      // Query only slots starting from today onwards
      const q = query(
        collection(db, colPath), 
        where('fecha', '>=', todayStr)
      );
      
      const snap = await withTimeout(getDocs(q), 3000);
      const res: TakenSlot[] = [];
      snap.forEach(docSnap => {
        res.push(docSnap.data() as TakenSlot);
      });
      setLocalCache('lys_cache_taken_slots', res);
      return res;
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
    try {
      const snap = await withTimeout(getDocs(collection(db, colPath)), 3000);
      const list: Movement[] = [];
      snap.forEach(d => {
        list.push(d.data() as Movement);
      });

      // If remote list is empty, but cache has items, salvage them into unsynced
      if (list.length === 0) {
        const locals = getLocalCache<Movement[]>('lys_cache_movements', []);
        if (locals.length > 0) {
          const unsynced = getLocalCache<Movement[]>('lys_unsynced_movements', []);
          const merged = [...unsynced];
          locals.forEach(l => {
            if (!merged.some(m => m.id === l.id)) {
              merged.push(l);
            }
          });
          setLocalCache('lys_unsynced_movements', merged);
        }
      }

      // Merge remote list with local unsynced so they don't disappear from the UI
      const unsynced = getLocalCache<Movement[]>('lys_unsynced_movements', []);
      const mergedList = [...list];
      unsynced.forEach(u => {
        if (!mergedList.some(m => m.id === u.id)) {
          mergedList.push(u);
        }
      });

      setLocalCache('lys_cache_movements', mergedList);
      return mergedList;
    } catch (e) {
      console.warn("Firestore getMovements error/timeout, using local cache:", e);
      return getLocalCache<Movement[]>('lys_cache_movements', []);
    }
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
      await withTimeout(setDoc(doc(db, colPath, movement.id), movement), 2500);
      
      // Successfully saved to Firestore! Remove from unsynced queue
      const updatedUnsynced = getLocalCache<Movement[]>('lys_unsynced_movements', []).filter(m => m.id !== movement.id);
      setLocalCache('lys_unsynced_movements', updatedUnsynced);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `${colPath}/${movement.id}`);
    }
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
      try {
        await withTimeout(setDoc(doc(db, colPath, m.id), m), 2500);
        count++;
        // Remove from queue
        const current = getLocalCache<Movement[]>('lys_unsynced_movements', []);
        setLocalCache('lys_unsynced_movements', current.filter(x => x.id !== m.id));
      } catch (err) {
        console.warn(`Could not sync movement ${m.id} to Firestore:`, err);
      }
    }
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
          let basePrice = 20000;
          if (s.id === 'Interior') basePrice = 25000;
          if (s.id === 'Full') basePrice = 40000;
          return {
            id: s.id,
            name: s.name,
            label: s.label,
            description: s.description,
            features: s.features,
            isFeatured: s.isFeatured ?? false,
            basePrice
          };
        });
        
        // Only write defaults if signed in as admin
        if (isUserAdmin()) {
          try {
            const batch = writeBatch(db);
            initialServices.forEach(srv => {
              batch.set(doc(db, colPath, srv.id), srv);
            });
            await withTimeout(batch.commit(), 3000);
          } catch (writeErr) {
            console.warn("Bootstrap services write skipped/failed:", writeErr);
          }
        }
        
        setLocalCache('lys_cache_services', initialServices);
        return initialServices;
      }

      const list: CatalogService[] = [];
      snap.forEach(d => {
        list.push(d.data() as CatalogService);
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
        basePrice: s.id === 'Interior' ? 25000 : (s.id === 'Full' ? 40000 : 20000)
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

        // Only write defaults if signed in as admin
        if (isUserAdmin()) {
          try {
            const batch = writeBatch(db);
            initialVehicles.forEach(veh => {
              batch.set(doc(db, colPath, veh.id), veh);
            });
            await withTimeout(batch.commit(), 3000);
          } catch (writeErr) {
            console.warn("Bootstrap vehicles write skipped/failed:", writeErr);
          }
        }
        
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

        // Only write defaults if signed in as admin
        if (isUserAdmin()) {
          try {
            const batch = writeBatch(db);
            defaultPhotos.forEach(p => {
              batch.set(doc(db, colPath, p.id), p);
            });
            await withTimeout(batch.commit(), 3000);
          } catch (writeErr) {
            console.warn("Bootstrap gallery write skipped/failed:", writeErr);
          }
        }
        
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

    // Save locally
    const localGallery = getLocalCache<GalleryPhoto[]>('lys_cache_gallery', []);
    const filtered = localGallery.filter(p => p.id !== photo.id);
    filtered.push(photo);
    setLocalCache('lys_cache_gallery', filtered);

    try {
      await withTimeout(setDoc(doc(db, colPath, photo.id), photo), 2500);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `${colPath}/${photo.id}`);
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
  }
};
