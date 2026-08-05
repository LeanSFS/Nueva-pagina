// Web Visitor Tracker and Firebase Firestore Metrics Service for LyS Premium Detailing
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  getDoc,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from './firebase.ts';

export interface SectionTrace {
  id: string;
  type: 'visita' | 'click_servicios' | 'inicio_reserva' | 'reserva_completada' | 'click_galeria' | 'click_faq';
  timestamp: string; // ISO string
  device: 'Mobile' | 'Desktop' | 'Tablet';
  path: string;
}

const LOCAL_STORAGE_KEY = 'lys_web_metrics_v2';

enum OperationType {
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

// Hardened Firestore Error handler according to strict metadata guidelines
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Detect Device Type helper
const getDeviceType = (): 'Mobile' | 'Desktop' | 'Tablet' => {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'Tablet';
  }
  if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/i.test(ua)) {
    return 'Mobile';
  }
  return 'Desktop';
};

// Generates high-fidelity mock historical log data for the last 7 days
export const generateHistoricalData = (): SectionTrace[] => {
  const traces: SectionTrace[] = [];
  const now = new Date();
  
  // Last 7 days
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    
    // Random number of visits per day (higher on Fridays and Saturdays)
    const dayOfWeek = day.getDay(); // 0 = Sun, 6 = Sat
    const multiplier = (dayOfWeek === 5 || dayOfWeek === 6) ? 1.4 : (dayOfWeek === 0) ? 0.7 : 1.0;
    const baseVisits = Math.floor((15 + Math.random() * 20) * multiplier); // Bounded slightly to preserve write load
    
    for (let v = 0; v < baseVisits; v++) {
      let hour = 9;
      const r = Math.random();
      if (r < 0.1) {
        hour = Math.floor(Math.random() * 8);
      } else if (r < 0.45) {
        hour = 11 + Math.floor(Math.random() * 4);
      } else if (r < 0.8) {
        hour = 17 + Math.floor(Math.random() * 5);
      } else {
        hour = 8 + Math.floor(Math.random() * 10);
      }
      
      const minute = Math.floor(Math.random() * 60);
      const second = Math.floor(Math.random() * 60);
      const traceTime = new Date(day);
      traceTime.setHours(hour, minute, second);
      
      if (traceTime > now) continue;
      
      const sessionDevice: 'Mobile' | 'Desktop' | 'Tablet' = Math.random() < 0.75 ? 'Mobile' : Math.random() < 0.92 ? 'Desktop' : 'Tablet';
      const visitId = Math.random().toString(36).substring(2, 11);
      
      traces.push({
        id: `m-${visitId}-1`,
        type: 'visita',
        timestamp: traceTime.toISOString(),
        device: sessionDevice,
        path: '/'
      });
      
      if (Math.random() < 0.60) {
        const t2 = new Date(traceTime);
        t2.setMinutes(t2.getMinutes() + Math.floor(Math.random() * 3) + 1);
        traces.push({
          id: `m-${visitId}-2`,
          type: 'click_servicios',
          timestamp: t2.toISOString(),
          device: sessionDevice,
          path: '/#servicios'
        });
        
        if (Math.random() < 0.35) {
          const t3 = new Date(t2);
          t3.setMinutes(t3.getMinutes() + Math.floor(Math.random() * 2) + 1);
          traces.push({
            id: `m-${visitId}-3`,
            type: 'click_galeria',
            timestamp: t3.toISOString(),
            device: sessionDevice,
            path: '/#galeria'
          });
        }
        
        if (Math.random() < 0.25) {
          const t4 = new Date(t2);
          t4.setMinutes(t4.getMinutes() + Math.floor(Math.random() * 4) + 1);
          traces.push({
            id: `m-${visitId}-4`,
            type: 'inicio_reserva',
            timestamp: t4.toISOString(),
            device: sessionDevice,
            path: '/#reservar'
          });
          
          if (Math.random() < 0.45) {
            const t5 = new Date(t4);
            t5.setMinutes(t5.getMinutes() + Math.floor(Math.random() * 5) + 2);
            traces.push({
              id: `m-${visitId}-5`,
              type: 'reserva_completada',
              timestamp: t5.toISOString(),
              device: sessionDevice,
              path: '/#reserva-exitosa'
            });
          }
        }
      }
    }
  }
  
  return traces.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
};

// Test initial connection
async function testConnection() {
  try {
    await getDoc(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error) {
      console.warn("Firestore client notice:", error.message);
    }
  }
}
testConnection();

export const metricsService = {
  // Try retrieving traces from cloud Firestore (falls back to local storage)
  async getTracesFromCloud(): Promise<SectionTrace[]> {
    const pathRef = 'traces';
    try {
      const qSnapshot = await getDocs(collection(db, pathRef));
      const firestoreTraces: SectionTrace[] = [];
      qSnapshot.forEach((docSnap) => {
        firestoreTraces.push(docSnap.data() as SectionTrace);
      });
      
      // If Firestore is empty, seed it to have data
      if (firestoreTraces.length === 0) {
        const seedData = generateHistoricalData();
        await this.batchWriteTraces(seedData);
        return seedData;
      }

      return firestoreTraces.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } catch (error) {
      console.warn("Could not load metrics from cloud, using local storage fallback:", error);
      return this.getLocalTraces();
    }
  },

  // Batch insert historical data (helps with initial seeding / tests)
  async batchWriteTraces(traces: SectionTrace[]): Promise<void> {
    const pathRef = 'traces';
    try {
      // Chunk batch into groups of 100 to avoid Firestore transaction size limits
      const chunkSize = 100;
      for (let i = 0; i < traces.length; i += chunkSize) {
        const chunk = traces.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach(trace => {
          const docRef = doc(db, 'traces', trace.id);
          batch.set(docRef, trace);
        });
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, pathRef);
    }
  },

  // Get local storage traces
  getLocalTraces(): SectionTrace[] {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
      const initialData = generateHistoricalData();
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(initialData));
      return initialData;
    } catch (e) {
      console.error('Error fetching metrics from localStorage:', e);
      return [];
    }
  },

  // Log trace simultaneously to local storage and active Firestore collection
  logAction(type: SectionTrace['type']): void {
    const traceId = `r-${Math.random().toString(36).substring(2, 11)}`;
    const newTrace: SectionTrace = {
      id: traceId,
      type,
      timestamp: new Date().toISOString(),
      device: getDeviceType(),
      path: window.location.pathname + window.location.hash
    };

    // 1. Write local state immediately for high performance and fallback safety
    try {
      const localTraces = this.getLocalTraces();
      localTraces.push(newTrace);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localTraces));
    } catch (e) {
      console.error('Error writing metric to localStorage:', e);
    }

    // 2. Transmit to secure Cloud Firestore asynchronously in the background
    const docRef = doc(db, 'traces', traceId);
    setDoc(docRef, newTrace).catch((err) => {
      // Log silent warning so page navigation / client click actions are NEVER blocked by network/auth failures
      console.warn('Silent Firestore write warning (expected if user is unauthenticated or offline):', err);
    });
  },

  // Reset tracking metrics
  async clearCloudMetrics(): Promise<void> {
    try {
      // For safety, clear local logs
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      const freshData = generateHistoricalData();
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(freshData));
      
      // Seed Firestore with new baseline
      await this.batchWriteTraces(freshData);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'traces');
    }
  }
};
