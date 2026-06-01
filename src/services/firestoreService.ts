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
}

// --- Timeout Promise Wrapper ---
async function withTimeout<T>(promise: Promise<T>, timeoutMs = 2500): Promise<T> {
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

// --- Validate Connection on boot ---
async function testConnection() {
  try {
    await withTimeout(getDocFromServer(doc(db, 'test', 'connection')), 1500);
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

      await withTimeout(bach.commit(), 3000);
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

      await withTimeout(bach.commit(), 3000);
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

      await withTimeout(bach.commit(), 3000);
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
      setLocalCache('lys_cache_movements', list);
      return list;
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

    try {
      await withTimeout(setDoc(doc(db, colPath, movement.id), movement), 2500);
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

    try {
      await withTimeout(deleteDoc(doc(db, colPath, id)), 2500);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${colPath}/${id}`);
    }
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
        
        // Write defaults to cloud
        const batch = writeBatch(db);
        initialServices.forEach(srv => {
          batch.set(doc(db, colPath, srv.id), srv);
        });
        await withTimeout(batch.commit(), 3000);
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

        // Write defaults
        const batch = writeBatch(db);
        initialVehicles.forEach(veh => {
          batch.set(doc(db, colPath, veh.id), veh);
        });
        await withTimeout(batch.commit(), 3000);
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

        // Seed
        const batch = writeBatch(db);
        defaultPhotos.forEach(p => {
          batch.set(doc(db, colPath, p.id), p);
        });
        await withTimeout(batch.commit(), 3000);
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
  }
};
