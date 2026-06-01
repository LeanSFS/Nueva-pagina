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
  throw new Error(JSON.stringify(errInfo));
}

// --- Validate Connection on boot ---
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration: Client is offline.");
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
      const snap = await getDocs(q);
      const rows: Booking[] = [];
      snap.forEach(docSnap => {
        rows.push(docSnap.data() as Booking);
      });
      return rows;
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, colPath);
      return [];
    }
  },

  async createBooking(booking: Booking, isBlocked = false): Promise<void> {
    const bach = writeBatch(db);
    const bookingRef = doc(db, 'bookings', booking.id);
    const slotId = `${booking.fecha}_${booking.hora}`;
    const slotRef = doc(db, 'taken_slots', slotId);

    bach.set(bookingRef, booking);
    bach.set(slotRef, {
      id: slotId,
      fecha: booking.fecha,
      hora: booking.hora,
      isBlocked: isBlocked
    });

    try {
      await bach.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `bookings_and_slots/${booking.id}`);
    }
  },

  async deleteBooking(bookingId: string, fecha: string, hora: string): Promise<void> {
    const bach = writeBatch(db);
    const bookingRef = doc(db, 'bookings', bookingId);
    const slotId = `${fecha}_${hora}`;
    const slotRef = doc(db, 'taken_slots', slotId);

    bach.delete(bookingRef);
    bach.delete(slotRef);

    try {
      await bach.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `bookings_and_slots/${bookingId}`);
    }
  },

  async updateBookingStatus(bookingId: string, booking: Booking, newStatus: Booking['estado']): Promise<void> {
    const bookingRef = doc(db, 'bookings', bookingId);
    const slotId = `${booking.fecha}_${booking.hora}`;
    const slotRef = doc(db, 'taken_slots', slotId);

    const bach = writeBatch(db);
    bach.update(bookingRef, { estado: newStatus });

    if (newStatus === 'cancelado') {
      // If cancelled, open the spot by deleting the public occupied slot
      bach.delete(slotRef);
    } else {
      // Re-add slot if reactivated
      bach.set(slotRef, {
        id: slotId,
        fecha: booking.fecha,
        hora: booking.hora,
        isBlocked: booking.nombre.includes('BLOQUEADO')
      });
    }

    try {
      await bach.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `bookings_and_slots/${bookingId}`);
    }
  },

  // ------------------ 2. PUBLIC AVAILABILITY ------------------

  async getPublicTakenSlots(): Promise<TakenSlot[]> {
    const colPath = 'taken_slots';
    try {
      const snap = await getDocs(collection(db, colPath));
      const res: TakenSlot[] = [];
      snap.forEach(docSnap => {
        res.push(docSnap.data() as TakenSlot);
      });
      return res;
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, colPath);
      return [];
    }
  },

  // ------------------ 3. CAJA (MOVEMENTS) ------------------

  async getMovements(): Promise<Movement[]> {
    const colPath = 'movements';
    try {
      const snap = await getDocs(collection(db, colPath));
      const list: Movement[] = [];
      snap.forEach(d => {
        list.push(d.data() as Movement);
      });
      return list;
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, colPath);
      return [];
    }
  },

  async saveMovement(movement: Movement): Promise<void> {
    const colPath = 'movements';
    try {
      await setDoc(doc(db, colPath, movement.id), movement);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `${colPath}/${movement.id}`);
    }
  },

  async deleteMovement(id: string): Promise<void> {
    const colPath = 'movements';
    try {
      await deleteDoc(doc(db, colPath, id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${colPath}/${id}`);
    }
  },

  // ------------------ 4. SERVICES CATALOG ------------------

  async getServices(): Promise<CatalogService[]> {
    const colPath = 'services';
    try {
      const snap = await getDocs(collection(db, colPath));
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
        await batch.commit();
        return initialServices;
      }

      const list: CatalogService[] = [];
      snap.forEach(d => {
        list.push(d.data() as CatalogService);
      });
      return list;
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, colPath);
      return [];
    }
  },

  async saveService(service: CatalogService): Promise<void> {
    const colPath = 'services';
    try {
      await setDoc(doc(db, colPath, service.id), {
        ...service,
        isFeatured: service.isFeatured ?? false
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `${colPath}/${service.id}`);
    }
  },

  async deleteService(serviceId: string): Promise<void> {
    const colPath = 'services';
    try {
      await deleteDoc(doc(db, colPath, serviceId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${colPath}/${serviceId}`);
    }
  },

  // ------------------ 5. VEHICLES CONFIG ------------------

  async getVehicles(): Promise<CatalogVehicle[]> {
    const colPath = 'vehicles';
    try {
      const snap = await getDocs(collection(db, colPath));
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
        await batch.commit();
        return initialVehicles;
      }

      const list: CatalogVehicle[] = [];
      snap.forEach(d => {
        list.push(d.data() as CatalogVehicle);
      });
      return list;
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, colPath);
      return [];
    }
  },

  async saveVehicle(vehicle: CatalogVehicle): Promise<void> {
    const colPath = 'vehicles';
    try {
      await setDoc(doc(db, colPath, vehicle.id), vehicle);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `${colPath}/${vehicle.id}`);
    }
  },

  // ------------------ 6. DYNAMIC GALLERY PHOTOS ------------------

  async getGallery(): Promise<GalleryPhoto[]> {
    const colPath = 'gallery';
    try {
      const snap = await getDocs(collection(db, colPath));
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
        await batch.commit();
        return defaultPhotos;
      }

      const list: GalleryPhoto[] = [];
      snap.forEach(d => {
        list.push(d.data() as GalleryPhoto);
      });
      // Sort new ones first
      return list.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, colPath);
      return [];
    }
  },

  async addGalleryPhoto(photo: GalleryPhoto): Promise<void> {
    const colPath = 'gallery';
    try {
      await setDoc(doc(db, colPath, photo.id), photo);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `${colPath}/${photo.id}`);
    }
  },

  async deleteGalleryPhoto(photoId: string): Promise<void> {
    const colPath = 'gallery';
    try {
      await deleteDoc(doc(db, colPath, photoId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${colPath}/${photoId}`);
    }
  }
};
