import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  Search, 
  Download, 
  Plus, 
  Trash2, 
  Edit3, 
  ChevronDown, 
  Info,
  Calendar,
  DollarSign,
  CreditCard,
  User,
  FileText,
  AlertCircle,
  CheckCircle2,
  X,
  LayoutDashboard,
  Wallet,
  BarChart3 as BarChartIcon,
  Activity,
  Sparkles,
  Loader2,
  ShieldCheck,
  Lock,
  AlertTriangle
} from 'lucide-react';
import AdminAgenda from './AdminAgenda.tsx';
import AdminRendimientos from './AdminRendimientos.tsx';
import AdminMetrics from './AdminMetrics.tsx';
import { firestoreService, Movement, Booking } from '../services/firestoreService.ts';
import { auth } from '../services/firebase.ts';
import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, User as FirebaseUser } from 'firebase/auth';

const CATS_INGRESO = ['Lavado', 'Extra', 'Propina', 'Otros'];
const CATS_GASTO = ['Insumos', 'Herramientas', 'Mantenimiento', 'Publicidad', 'Impuestos', 'Otros'];

export default function AdminCaja({ onBack }: { onBack: () => void }) {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [preferredMethod, setPreferredMethod] = useState<'popup' | 'redirect'>('popup');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isIframe, setIsIframe] = useState(false);
  const [submittingGoogleAuth, setSubmittingGoogleAuth] = useState(false);

  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [syncingNow, setSyncingNow] = useState(false);

  const isUserAdmin = (user: any) => {
    if (!user) return false;
    return user.email?.toLowerCase() === 'leandro.saralegui@gmail.com' || user.uid === 'AYbEVBVfFxcx9vgxAWb83cJvDV02';
  };

  const updateUnsyncedCount = () => {
    try {
      const unsynced = JSON.parse(localStorage.getItem('lys_unsynced_movements') || '[]');
      setUnsyncedCount(unsynced.length);
    } catch (e) {
      setUnsyncedCount(0);
    }
  };

  const [activeTab, setActiveTab] = useState<'agenda' | 'caja' | 'stats' | 'metrics' | 'catalog' | 'gallery'>('agenda');
  const [allMovements, setAllMovements] = useState<Movement[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const initialRange = useMemo(() => {
    const d = new Date();
    const ymd = (date: Date) => date.toISOString().split('T')[0];
    return {
      from: ymd(new Date(d.getFullYear(), d.getMonth(), 1)),
      to: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0))
    };
  }, []);

  const [filterFrom, setFilterFrom] = useState(initialRange.from);
  const [filterTo, setFilterTo] = useState(initialRange.to);
  const [filterTipo, setFilterTipo] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterMedio, setFilterMedio] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('');

  // Filtrado local para la tabla de Caja
  const filteredRows = useMemo(() => {
    return allMovements.filter(m => {
      if (filterFrom && m.fecha < filterFrom) return false;
      if (filterTo && m.fecha > filterTo) return false;
      if (filterTipo && m.tipo?.toLowerCase() !== filterTipo.toLowerCase()) return false;
      if (filterEstado && m.estado?.toLowerCase() !== filterEstado.toLowerCase()) return false;
      if (filterMedio && m.medio?.toLowerCase() !== filterMedio.toLowerCase()) return false;
      if (filterCategoria && m.categoria !== filterCategoria) return false;
      return true;
    });
  }, [allMovements, filterFrom, filterTo, filterTipo, filterEstado, filterMedio, filterCategoria]);

  // Totals - Ahora basados en las filas filtradas para la vista de Caja
  const totals = useMemo(() => {
    return filteredRows.reduce((acc, row) => {
      const monto = Number(row.monto_ars) || 0;
      if (row.tipo?.toLowerCase() === 'ingreso') {
        acc.ingresos += monto;
      } else if (row.tipo?.toLowerCase() === 'gasto') {
        acc.gastos += monto;
      }
      return acc;
    }, { ingresos: 0, gastos: 0 });
  }, [filteredRows]);

  const netTotal = totals.ingresos - totals.gastos;

  // Alta form
  const [newMovement, setNewMovement] = useState({
    fecha: new Date().toISOString().split('T')[0],
    tipo: 'Ingreso',
    categoria: 'Lavado',
    concepto: '',
    monto: '',
    medio: 'Efectivo',
    estado: 'Pagado',
    factura: '',
    cliente: '',
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [altaSuccess, setAltaSuccess] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);

  // Delete modal
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await firestoreService.getMovements();
      const sorted = data.sort((a, b) => b.fecha.localeCompare(a.fecha));
      setAllMovements(sorted);
    } catch (err: any) {
      console.error('Error loading movements:', err);
      setError('Error al acceder a Caja en Firestore. Verifique sus permisos de administrador.');
    } finally {
      updateUnsyncedCount();
      setLoading(false);
    }
  };

  const fetchBookings = async () => {
    try {
      const data = await firestoreService.getBookings();
      setBookings(data);
    } catch (e) {
      console.error('Error fetching bookings:', e);
    }
  };

  const handleAdd = async () => {
    if (!newMovement.concepto || !newMovement.monto) {
      setError('Complete concepto y monto');
      return;
    }
    setSubmitting(true);
    setAltaSuccess(false);
    setError(null);
    try {
      const movementId = `mov_${Date.now()}_generic`;
      const val: Movement = {
        id: movementId,
        fecha: newMovement.fecha,
        tipo: newMovement.tipo as 'Ingreso' | 'Gasto',
        categoria: newMovement.categoria,
        concepto: newMovement.concepto,
        monto_ars: Number(newMovement.monto) || 0,
        medio: newMovement.medio,
        estado: newMovement.estado as 'Pagado' | 'Pendiente',
        factura: newMovement.factura || '',
        cliente: newMovement.cliente || '',
        notas: newMovement.notes || ''
      };

      await firestoreService.saveMovement(val);
      
      setAltaSuccess(true);
      setNewMovement({
        ...newMovement,
        concepto: '',
        monto: '',
        factura: '',
        notes: ''
      });
      fetchRows();
    } catch (err: any) {
      setError(err.message || 'Error al guardar movimiento');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editForm) return;
    setLoading(true);
    setError(null);
    try {
      const val: Movement = {
        id: editingId!,
        fecha: editForm.fecha,
        tipo: editForm.tipo as 'Ingreso' | 'Gasto',
        categoria: editForm.categoria,
        concepto: editForm.concepto,
        monto_ars: Number(editForm.monto_ars) || 0,
        medio: editForm.medio,
        estado: editForm.estado as 'Pagado' | 'Pendiente',
        factura: editForm.factura || '',
        cliente: editForm.cliente || '',
        notas: editForm.notas || ''
      };

      await firestoreService.saveMovement(val);
      
      setEditingId(null);
      fetchRows();
    } catch (err: any) {
      setError(err.message || 'Error al actualizar movimiento');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setLoading(true);
    setError(null);
    try {
      await firestoreService.deleteMovement(deletingId);
      setDeletingId(null);
      fetchRows();
    } catch (err: any) {
      setError(err.message || 'Error al borrar movimiento');
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!filteredRows.length) return;
    const header = ['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Monto', 'Medio', 'Estado', 'Factura', 'Cliente', 'Notas'];
    const csvContent = [
      header.join(','),
      ...filteredRows.map(r => [
        r.fecha,
        r.tipo,
        r.categoria,
        `"${r.concepto.replace(/"/g, '""')}"`,
        r.monto_ars,
        r.medio,
        r.estado,
        r.factura,
        r.cliente,
        `"${(r.notas || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `caja_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fmt = (n: number) => `$ ${Number(n).toLocaleString('es-AR')}`;

  const setRange = (range: 'hoy' | 'ayer' | 'semana' | 'mes' | 'todo') => {
    const d = new Date();
    const ymd = (date: Date) => date.toISOString().split('T')[0];
    
    if (range === 'hoy') {
      setFilterFrom(ymd(d));
      setFilterTo(ymd(d));
    } else if (range === 'ayer') {
      d.setDate(d.getDate() - 1);
      setFilterFrom(ymd(d));
      setFilterTo(ymd(d));
    } else if (range === 'semana') {
      const curr = new Date();
      const first = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1);
      setFilterFrom(ymd(new Date(curr.setDate(first))));
      setFilterTo(ymd(new Date()));
    } else if (range === 'mes') {
      setFilterFrom(ymd(new Date(d.getFullYear(), d.getMonth(), 1)));
      setFilterTo(ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
    } else {
      setFilterFrom('');
      setFilterTo('');
    }
  };

  const customersMap = useMemo(() => {
    const map: Record<string, number> = {};
    bookings.forEach(b => {
      const tel = b.telefono.replace(/\D/g, '');
      if (tel) map[tel] = (map[tel] || 0) + 1;
    });
    return map;
  }, [bookings]);

  const [dbServices, setDbServices] = useState<any[]>([]);
  const [dbVehicles, setDbVehicles] = useState<any[]>([]);
  const [dbPhotos, setDbPhotos] = useState<any[]>([]);
  const [savingCatalog, setSavingCatalog] = useState(false);
  const [catalogSuccess, setCatalogSuccess] = useState(false);

  const [newPhoto, setNewPhoto] = useState({ url: '', title: '', description: '' });
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [compressingImage, setCompressingImage] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCompressingImage(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new globalThis.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Scale to max 800px while maintaining aspect ratio
        const maxDim = 800;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.65);
          setNewPhoto(prev => ({ ...prev, url: compressedBase64 }));
        }
        setCompressingImage(false);
      };
      img.onerror = () => {
        alert('Error al cargar la imagen. Intente con otra.');
        setCompressingImage(false);
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      alert('Error leyendo el archivo.');
      setCompressingImage(false);
    };
    reader.readAsDataURL(file);
  };

  const loadCatalogAndGallery = async () => {
    try {
      const srvs = await firestoreService.getServices();
      setDbServices(srvs);
      const vehs = await firestoreService.getVehicles();
      setDbVehicles(vehs);
      const phts = await firestoreService.getGallery();
      setDbPhotos(phts);
    } catch (e) {
      console.error('Error loading config/gallery:', e);
    }
  };

  useEffect(() => {
    updateUnsyncedCount();

    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      setAuthChecking(false);
      if (user && isUserAdmin(user)) {
        // Auto-synchronize any offline/local movements upon successful login
        firestoreService.syncUnsyncedMovements()
          .then((syncedCount) => {
            if (syncedCount > 0) {
              console.log(`Auto-sincronizados ${syncedCount} movimientos locales.`);
            }
            updateUnsyncedCount();
            fetchRows();
            fetchBookings();
            loadCatalogAndGallery();
          })
          .catch((err) => {
            console.error("Auto-sincronización fallida:", err);
            updateUnsyncedCount();
            fetchRows();
            fetchBookings();
            loadCatalogAndGallery();
          });
      }
    });

    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          setCurrentUser(result.user);
        }
      })
      .catch((err) => {
        console.error("Redirect sign-in error in AdminCaja:", err);
        setAuthError(err.code || err.message || "No se pudo completar el redireccionamiento para Google.");
      });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    setSubmittingGoogleAuth(true);
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      if (preferredMethod === 'redirect') {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (err: any) {
      console.error("Error signing in with Google:", err);
      setAuthError(err.code || err.message || "Error al conectar con Google");
    } finally {
      setSubmittingGoogleAuth(false);
    }
  };

  const handleLogout = async () => {
    setSubmittingGoogleAuth(true);
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Error logging out:", err);
    } finally {
      setSubmittingGoogleAuth(false);
    }
  };

  const handleManualSync = async () => {
    setSyncingNow(true);
    setError(null);
    try {
      const count = await firestoreService.syncUnsyncedMovements();
      if (count > 0) {
        setAltaSuccess(true);
        await fetchRows();
      } else {
        setError("No se encontraron movimientos locales adicionales para sincronizar.");
      }
    } catch (err: any) {
      console.error("Manual sync failed:", err);
      setError(err.message || "Error al sincronizar datos locales.");
    } finally {
      setSyncingNow(false);
      updateUnsyncedCount();
    }
  };

  const handleSaveCatalog = async () => {
    setSavingCatalog(true);
    setCatalogSuccess(false);
    setError(null);
    try {
      for (const srv of dbServices) {
        await firestoreService.saveService(srv);
      }
      for (const veh of dbVehicles) {
        await firestoreService.saveVehicle(veh);
      }
      setCatalogSuccess(true);
      setTimeout(() => setCatalogSuccess(false), 3000);
    } catch (e: any) {
      setError(e.message || 'Error al guardar catálogo');
    } finally {
      setSavingCatalog(false);
    }
  };

  const handleAddPhoto = async () => {
    if (!newPhoto.url) {
      setError('Complete la URL de la imagen');
      return;
    }
    setSavingPhoto(true);
    setError(null);
    try {
      const photoId = `photo_${Date.now()}`;
      const payload = {
        id: photoId,
        url: newPhoto.url,
        title: newPhoto.title || 'Trabajo Realizado',
        description: newPhoto.description || 'Resultado profesional en nuestro taller.',
        createdAt: new Date().toISOString()
      };
      await firestoreService.addGalleryPhoto(payload);
      setNewPhoto({ url: '', title: '', description: '' });
      // Update local state directly for instant feedback and to prevent public read overriding before sync completes
      setDbPhotos(prev => [payload, ...prev]);
    } catch (e: any) {
      setError(e.message || 'Error al guardar foto');
    } finally {
      setSavingPhoto(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!window.confirm('¿Seguro que quiere eliminar esta imagen de la galería?')) return;
    setLoading(true);
    setError(null);
    try {
      await firestoreService.deleteGalleryPhoto(photoId);
      // Filter out immediately for instant interactive response
      setDbPhotos(prev => prev.filter(p => p.id !== photoId));
    } catch (e: any) {
      setError(e.message || 'Error al eliminar foto');
    } finally {
      setLoading(false);
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="space-y-4 max-w-md">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mx-auto" />
          <h3 className="font-display font-black uppercase tracking-wider text-sm text-zinc-300">
            Verificando Acceso de Administrador
          </h3>
          <p className="text-zinc-500 text-xs italic">
            Conectando de forma segura con los servicios de Google Firebase...
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser || !isUserAdmin(currentUser)) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8 flex items-center justify-center font-sans">
        <div className="max-w-md w-full bg-zinc-900/50 border border-white/5 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl relative overflow-hidden">
          {/* Subtle glowing light or decorative element */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent blur-md"></div>
          
          <button 
            onClick={onBack} 
            className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-xs font-black uppercase tracking-widest"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al Inicio</span>
          </button>

          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400 mb-2">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-display font-black text-white uppercase tracking-tight md:text-2xl">
              Panel Administrativo Cerrado
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">
              Esta sección está restringida exclusivamente para los administradores de LyS Lavados. Se requiere autenticación segura con Google.
            </p>
          </div>

          {currentUser && !isUserAdmin(currentUser) && (
            <div className="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-4 text-xs space-y-2">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold uppercase tracking-wider text-[10px]">
                <AlertTriangle className="w-4 h-4" /> Cuenta Incorrecta Detectada
              </div>
              <p className="text-zinc-400 font-semibold leading-normal">
                Has iniciado sesión como <span className="text-white font-mono">{currentUser.email}</span>, pero este correo no está registrado como administrador.
              </p>
              <button 
                onClick={handleLogout}
                disabled={submittingGoogleAuth}
                className="w-full text-center text-[10px] font-black uppercase tracking-widest text-[#f87171] bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 py-2 rounded-xl transition-all"
              >
                Cerrar Sesión Actual
              </button>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block">
                Método de Conexión Google
              </label>
              <div className="flex bg-zinc-950 border border-white/5 p-1 rounded-xl text-[10px] uppercase font-black tracking-widest">
                <button
                  type="button"
                  onClick={() => setPreferredMethod('popup')}
                  className={`flex-1 text-center py-2 rounded-lg transition-all ${preferredMethod === 'popup' ? 'bg-emerald-500 text-night' : 'text-zinc-500 hover:text-zinc-200'}`}
                >
                  Popup (Emergente)
                </button>
                <button
                  type="button"
                  onClick={() => setPreferredMethod('redirect')}
                  className={`flex-1 text-center py-2 rounded-lg transition-all ${preferredMethod === 'redirect' ? 'bg-emerald-500 text-night' : 'text-zinc-500 hover:text-zinc-200'}`}
                >
                  Redirect (Redirección)
                </button>
              </div>
              {isIframe && (
                <p className="text-[10px] text-amber-400 leading-normal pt-1 flex items-center gap-1">
                  <span className="text-xs">⚠️</span> Se detectó visualizador (Iframe): usá Redirect o abrí en pestaña nueva.
                </p>
              )}
            </div>

            <button
              onClick={loginWithGoogle}
              disabled={submittingGoogleAuth}
              className="w-full flex items-center justify-center gap-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-night shadow-lg shadow-emerald-500/10 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest active:scale-98 transition-all"
            >
              {submittingGoogleAuth ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-night" />
                  <span>Conectando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 animate-pulse" />
                  <span>Iniciar Sesión con Google</span>
                </>
              )}
            </button>
          </div>

          {authError && (
            <div className="bg-red-500/5 border border-red-500/10 p-4 rounded-2xl text-[11px] leading-relaxed select-text space-y-1 text-red-300">
              <div className="font-bold uppercase tracking-wider text-[9px] text-red-400">
                Detalles del Error:
              </div>
              <p className="font-mono bg-zinc-950 p-2 rounded text-[10px] border border-white/5 truncate">
                {authError}
              </p>
            </div>
          )}

          {isIframe && (
            <div className="text-center pt-2">
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center justify-center gap-1.5 text-zinc-500 hover:text-white text-[10px] uppercase font-black tracking-widest transition-all"
              >
                Abrir en nueva pestaña ↗
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button onClick={onBack} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span>Salir del Panel</span>
            </button>
            <div className="hidden sm:block text-zinc-700 font-black">|</div>
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1.5 rounded-full select-none text-[10px] font-black uppercase tracking-widest text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5 animate-pulse" />
              <span>Sincronizado</span>
              <span className="hidden md:inline text-zinc-500 font-normal">({currentUser?.email})</span>
            </div>
          </div>
          
          <div className="flex bg-zinc-900/50 p-1 rounded-2xl border border-white/5 overflow-x-auto max-w-full">
            <button 
              onClick={() => setActiveTab('agenda')}
              className={`flex items-center gap-2 px-4 md:px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'agenda' ? 'bg-emerald-500 text-night shadow-lg' : 'text-zinc-500 hover:text-white'}`}
            >
              <LayoutDashboard className="w-4 h-4" /> Agenda
            </button>
            <button 
              onClick={() => setActiveTab('catalog')}
              className={`flex items-center gap-2 px-4 md:px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'catalog' ? 'bg-emerald-500 text-night shadow-lg' : 'text-zinc-500 hover:text-white'}`}
            >
              <Sparkles className="w-4 h-4" /> Precios
            </button>
            <button 
              onClick={() => setActiveTab('gallery')}
              className={`flex items-center gap-2 px-4 md:px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'gallery' ? 'bg-emerald-500 text-night shadow-lg' : 'text-zinc-500 hover:text-white'}`}
            >
              <Plus className="w-4 h-4" /> Galería
            </button>
            <button 
              onClick={() => setActiveTab('caja')}
              className={`flex items-center gap-2 px-4 md:px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'caja' ? 'bg-emerald-500 text-night shadow-lg' : 'text-zinc-500 hover:text-white'}`}
            >
              <Wallet className="w-4 h-4" /> Caja
            </button>
            <button 
              onClick={() => setActiveTab('stats')}
              className={`flex items-center gap-2 px-4 md:px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'stats' ? 'bg-emerald-500 text-night shadow-lg' : 'text-zinc-500 hover:text-white'}`}
            >
              <BarChartIcon className="w-4 h-4" /> Rendimientos
            </button>
            <button 
              onClick={() => setActiveTab('metrics')}
              className={`flex items-center gap-2 px-4 md:px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'metrics' ? 'bg-emerald-500 text-night shadow-lg' : 'text-zinc-500 hover:text-white'}`}
            >
              <Activity className="w-4 h-4" /> Métricas
            </button>
          </div>
          
          <h1 className="text-xl md:text-2xl font-display font-black italic tracking-tighter hidden md:block">LyS Lavados <span className="text-emerald-500">Admin</span></h1>
        </div>

        {activeTab === 'agenda' ? (
          <AdminAgenda 
            customerVisits={customersMap}
          />
        ) : activeTab === 'stats' ? (
          <AdminRendimientos bookings={bookings} movements={allMovements} />
        ) : activeTab === 'catalog' ? (
          <div className="bg-zinc-900 border border-white/5 rounded-[2.5rem] p-8 md:p-12 space-y-8 animate-fade-in">
            <div>
              <h2 className="text-2xl font-display font-black italic text-white tracking-tight flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-emerald-500" /> CATALOGO Y PRECIOS
              </h2>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mt-1">Configuración dinámica del sitio web</p>
            </div>

            {catalogSuccess && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl text-xs font-bold uppercase tracking-widest flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 animate-bounce" /> ¡Precios y servicios actualizados con éxito en la Nube!
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Services pricing modification */}
              <div className="space-y-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-emerald-500">Servicios Base</h3>
                <div className="space-y-4">
                  {dbServices.map((srv, idx) => (
                    <div key={srv.id} className="p-6 bg-slate-950 border border-white/10 rounded-2xl relative overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <div className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">{srv.label}</div>
                          <div className="font-display font-black italic text-lg text-white uppercase">{srv.name}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 font-bold">$</span>
                          <input 
                            type="number" 
                            value={srv.basePrice} 
                            onChange={(e) => {
                              const copy = [...dbServices];
                              copy[idx].basePrice = Number(e.target.value) || 0;
                              setDbServices(copy);
                            }}
                            className="bg-zinc-900 border border-white/10 text-emerald-400 font-display font-black italic text-lg rounded-xl p-3 w-31 outline-none focus:border-emerald-500 text-right font-black"
                          />
                        </div>
                      </div>
                      <div className="mt-4">
                        <label className="text-[8px] font-black uppercase text-zinc-650 block mb-1">Descripción corta</label>
                        <input 
                          type="text" 
                          value={srv.description} 
                          onChange={(e) => {
                            const copy = [...dbServices];
                            copy[idx].description = e.target.value;
                            setDbServices(copy);
                          }}
                          className="bg-zinc-900 border border-white/5 text-zinc-350 text-xs rounded-xl p-2.5 w-full outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Vehicles multiplier modifications */}
              <div className="space-y-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-emerald-500">Adicionales por Vehículo</h3>
                <div className="space-y-4">
                  {dbVehicles.map((veh, idx) => (
                    <div key={veh.id} className="p-6 bg-slate-950 border border-white/10 rounded-2xl flex items-center justify-between gap-4">
                      <div>
                        <div className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">Ejemplos: {veh.examples}</div>
                        <div className="font-display font-black italic text-lg text-white uppercase">{veh.name}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 font-bold">+$</span>
                        <input 
                          type="number" 
                          value={veh.extraPrice} 
                          onChange={(e) => {
                            const copy = [...dbVehicles];
                            copy[idx].extraPrice = Number(e.target.value) || 0;
                            setDbVehicles(copy);
                          }}
                          className="bg-zinc-900 border border-white/10 text-emerald-400 font-display font-black italic text-lg rounded-xl p-3 w-31 outline-none focus:border-emerald-500 text-right font-black"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                  <h4 className="flex items-center gap-2 text-emerald-500 mb-2 font-display text-sm font-black italic">¿CÓMO AFECTA ESTO?</h4>
                  <p className="text-zinc-500 text-xs leading-relaxed">
                    Al actualizar estos importes, el simulador de precio de la página de inicio recalculará automáticamente:
                    <br />
                    <span className="text-white font-bold">Precio Final = Precio Base de Lavado + Adicional según Tipo de Vehículo.</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-6 border-t border-white/[0.05]">
              <button 
                onClick={handleSaveCatalog}
                className="bg-emerald-500 text-night px-8 py-3.5 rounded-2xl font-display font-black italic text-sm hover:bg-emerald-400 transition-all flex items-center gap-3 shadow-[0_0_30px_rgba(16,185,129,0.3)] disabled:opacity-50 font-black cursor-pointer"
                disabled={savingCatalog}
              >
                {savingCatalog ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} 
                {savingCatalog ? 'GUARDANDO...' : 'GUARDAR CAMBIOS EN LA NUBE'}
              </button>
            </div>
          </div>
        ) : activeTab === 'gallery' ? (
          <div className="bg-zinc-900 border border-white/5 rounded-[2.5rem] p-8 md:p-12 space-y-8 animate-fade-in">
            <div>
              <h2 className="text-2xl font-display font-black italic text-white tracking-tight flex items-center gap-3">
                <Plus className="w-6 h-6 text-emerald-500" /> GALERÍA DE RESULTADOS
              </h2>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mt-1">Sube fotos reales para motivar a tus clientes</p>
            </div>

            {/* Upload form */}
            <div className="bg-slate-950 border border-white/10 p-6 rounded-3xl space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-2">Agregar Nueva Foto</h3>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-4">
                  <label className="text-[8px] font-black uppercase text-zinc-500 mb-1 block">Título</label>
                  <input 
                    type="text" 
                    placeholder="Ej. Pulido Ópticas" 
                    value={newPhoto.title} 
                    onChange={e => setNewPhoto({...newPhoto, title: e.target.value})}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                  />
                </div>
                <div className="md:col-span-8 flex flex-col justify-end">
                  <span className="text-[8px] font-black uppercase text-zinc-500 mb-1 block">Imagen del Trabajo (Elegir Archivo o URL)</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Native File Selector for Mobile Gallery */}
                    <div>
                      <input 
                        type="file" 
                        id="phone-image-upload" 
                        accept="image/*" 
                        onChange={handleFileChange} 
                        className="hidden" 
                      />
                      <label 
                        htmlFor="phone-image-upload"
                        className="w-full bg-zinc-900 hover:bg-zinc-800 border-2 border-dashed border-emerald-500/20 hover:border-emerald-500/40 rounded-xl p-3 text-xs font-black text-center text-emerald-400 uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer select-none transition-all active:scale-[0.98] h-full min-h-[46px]"
                      >
                        {compressingImage ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                            PROCESANDO...
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4 text-emerald-400" />
                            SUBIR DESDE CELULAR
                          </>
                        )}
                      </label>
                    </div>

                    {/* Fallback to Paste a Web URL directly */}
                    <div>
                      <input 
                        type="text" 
                        placeholder="O pegar URL de imagen..." 
                        value={newPhoto.url.startsWith('data:') ? 'Imagen Cargada ✓' : newPhoto.url} 
                        onChange={e => setNewPhoto({...newPhoto, url: e.target.value})}
                        disabled={newPhoto.url.startsWith('data:')}
                        className="w-full bg-zinc-900 border border-white/10 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none placeholder:text-zinc-600 disabled:opacity-50 disabled:bg-black/30"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Show selected image preview */}
              {newPhoto.url && (
                <div className="bg-black/50 border border-white/5 rounded-2xl p-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 border border-white/10 flex-shrink-0">
                      <img 
                        src={newPhoto.url} 
                        alt="Preview" 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase text-emerald-400 tracking-wider">Imagen Lista para Subir</p>
                      <p className="text-zinc-400 text-xs truncate max-w-[200px] sm:max-w-xs">{newPhoto.url.startsWith('data:') ? 'Archivo comprimido localmente (JPEG)' : newPhoto.url}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setNewPhoto(prev => ({ ...prev, url: '' }))}
                    className="text-red-400 hover:text-red-300 transition-colors p-2 text-xs font-bold uppercase tracking-wider cursor-pointer flex-shrink-0"
                  >
                    Borrar
                  </button>
                </div>
              )}

              <div>
                <label className="text-[8px] font-black uppercase text-zinc-500 mb-1 block">Descripción del Trabajo</label>
                <textarea 
                  rows={2}
                  placeholder="Detalles de la limpieza, ceras aplicadas, etc." 
                  value={newPhoto.description} 
                  onChange={e => setNewPhoto({...newPhoto, description: e.target.value})}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                />
              </div>
              <div className="flex justify-end pt-2">
                <button 
                  onClick={handleAddPhoto}
                  className="bg-emerald-500 text-night px-6 py-3 rounded-xl font-display font-black italic text-sm hover:bg-emerald-400 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  disabled={savingPhoto || compressingImage || !newPhoto.url}
                >
                  {savingPhoto ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  {savingPhoto ? 'SUBIENDO...' : 'SUBIR FOTO'}
                </button>
              </div>
            </div>

            {/* Photo List Grid */}
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Imágenes Actuales ({dbPhotos.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {dbPhotos.map(photo => (
                  <div key={photo.id} className="bg-slate-950 border border-white/5 rounded-2xl overflow-hidden group flex flex-col h-full hover:border-white/10 transition-colors">
                    <div className="h-44 relative bg-zinc-900 overflow-hidden">
                      <img 
                        src={photo.url} 
                        alt={photo.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                      />
                      <button 
                        onClick={() => handleDeletePhoto(photo.id)}
                        className="absolute top-3 right-3 p-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors shadow-lg cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-4 flex flex-col flex-1 pb-5">
                      <h4 className="font-display font-black italic text-base mb-1 truncate text-white">{photo.title}</h4>
                      <p className="text-zinc-500 text-xs line-clamp-2 leading-relaxed flex-1">{photo.description}</p>
                    </div>
                  </div>
                ))}
                {dbPhotos.length === 0 && (
                  <div className="col-span-3 text-center py-12 text-zinc-500 italic">No hay imágenes en la galería. Agrégalas arriba.</div>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'stats' ? (
          <AdminRendimientos bookings={bookings} movements={allMovements} />
        ) : activeTab === 'metrics' ? (
          <AdminMetrics />
        ) : (
          <>
            {unsyncedCount > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 p-5 rounded-3xl text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div className="space-y-1">
                  <p className="font-bold uppercase tracking-wider text-[10px] text-amber-400 flex items-center gap-1.5">
                    <span className="inline-block w-2 bg-amber-500 rounded-full h-2 animate-ping" /> Sincronización Pendiente
                  </p>
                  <p className="text-zinc-300 font-semibold leading-relaxed">
                    Hay <strong className="text-white font-black font-mono">{unsyncedCount}</strong> movimientos de caja guardados localmente. Al iniciar sesión, podés subirlos todos de golpe para que se consoliden en Firestore.
                  </p>
                </div>
                <button
                  onClick={handleManualSync}
                  disabled={syncingNow}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 px-5 py-2.5 rounded-2xl font-display font-black text-[11px] uppercase tracking-widest transition-all self-start sm:self-auto cursor-pointer flex items-center gap-2"
                >
                  {syncingNow && <Loader2 className="w-4 h-4 animate-spin text-slate-950" />}
                  <span>{syncingNow ? 'SINCRONIZANDO...' : 'SUBIR A LA NUBE'}</span>
                </button>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-zinc-900 border border-white/5 p-6 rounded-2xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Ingresos</p>
            <p className="text-2xl font-display font-black text-emerald-500">{fmt(totals.ingresos)}</p>
          </div>
          <div className="bg-zinc-900 border border-white/5 p-6 rounded-2xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Gastos</p>
            <p className="text-2xl font-display font-black text-red-500">{fmt(totals.gastos)}</p>
          </div>
          <div className="bg-zinc-900 border border-white/5 p-6 rounded-2xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Neto</p>
            <p className="text-2xl font-display font-black text-white">{fmt(netTotal)}</p>
          </div>
        </div>

        {/* Quick Filters */}
        <div className="bg-zinc-900 border border-white/5 p-6 rounded-3xl mb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-2">Desde</label>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-2">Hasta</label>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-2">Tipo</label>
              <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none">
                <option value="">Todos</option>
                <option value="Ingreso">Ingreso</option>
                <option value="Gasto">Gasto</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-2">Estado</label>
              <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none">
                <option value="">Todos</option>
                <option value="Pagado">Pagado</option>
                <option value="Pendiente">Pendiente</option>
              </select>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {['Hoy', 'Ayer', 'Semana', 'Mes', 'Todo'].map(r => (
                <button 
                  key={r}
                  onClick={() => setRange(r.toLowerCase() as any)}
                  className="px-4 py-2 rounded-xl bg-slate-950 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:border-emerald-500 transition-colors"
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={fetchRows} className="flex items-center gap-2 bg-emerald-500 text-night px-6 py-2 rounded-xl font-display font-black italic text-sm hover:bg-emerald-400 transition-all">
                <Search className="w-4 h-4" /> BUSCAR
              </button>
              <button onClick={exportCSV} className="flex items-center gap-2 bg-zinc-800 text-white px-4 py-2 rounded-xl font-display font-black italic text-sm hover:bg-zinc-700 transition-all">
                <Download className="w-4 h-4" /> CSV
              </button>
            </div>
          </div>
        </div>

        {/* Alta Form */}
        <div className="bg-emerald-500/5 border border-emerald-500/20 p-8 rounded-[2.5rem] mb-12">
          <h2 className="text-xl font-display font-black italic text-emerald-400 mb-6 flex items-center gap-3">
            <Plus className="w-6 h-6" /> AGREGAR MOVIMIENTO
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Fecha</label>
              <input type="date" value={newMovement.fecha} onChange={e => setNewMovement({...newMovement, fecha: e.target.value})} className="w-full bg-slate-950 border border-emerald-500/10 rounded-xl p-3 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Tipo</label>
              <select value={newMovement.tipo} onChange={e => setNewMovement({...newMovement, tipo: e.target.value, categoria: e.target.value === 'Ingreso' ? 'Lavado' : 'Insumos'})} className="w-full bg-slate-950 border border-emerald-500/10 rounded-xl p-3 text-sm">
                <option value="Ingreso">Ingreso</option>
                <option value="Gasto">Gasto</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Categoría</label>
              <select value={newMovement.categoria} onChange={e => setNewMovement({...newMovement, categoria: e.target.value})} className="w-full bg-slate-950 border border-emerald-500/10 rounded-xl p-3 text-sm">
                {(newMovement.tipo === 'Ingreso' ? CATS_INGRESO : CATS_GASTO).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Concepto</label>
              <input value={newMovement.concepto} onChange={e => setNewMovement({...newMovement, concepto: e.target.value})} placeholder="Detalle..." className="w-full bg-slate-950 border border-emerald-500/10 rounded-xl p-3 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Monto (ARS)</label>
              <input value={newMovement.monto} onChange={e => setNewMovement({...newMovement, monto: e.target.value})} placeholder="25000" inputMode="decimal" className="w-full bg-slate-950 border border-emerald-500/10 rounded-xl p-3 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Medio</label>
              <select value={newMovement.medio} onChange={e => setNewMovement({...newMovement, medio: e.target.value})} className="w-full bg-slate-950 border border-emerald-500/10 rounded-xl p-3 text-sm">
                <option value="Efectivo">Efectivo</option>
                <option value="Transferencia">Transferencia</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Estado</label>
              <select value={newMovement.estado} onChange={e => setNewMovement({...newMovement, estado: e.target.value})} className="w-full bg-slate-950 border border-emerald-500/10 rounded-xl p-3 text-sm">
                <option value="Pagado">Pagado</option>
                <option value="Pendiente">Pendiente</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Cliente / Factura</label>
              <input value={newMovement.cliente} onChange={e => setNewMovement({...newMovement, cliente: e.target.value})} placeholder="Cliente opcional" className="w-full bg-slate-950 border border-emerald-500/10 rounded-xl p-3 text-sm" />
            </div>
          </div>
          <div className="mt-8 flex items-center justify-end gap-6">
            {altaSuccess && <p className="text-emerald-500 font-black text-xs uppercase tracking-widest animate-fade-in">¡Agregado con éxito!</p>}
            <button 
              disabled={submitting}
              onClick={handleAdd}
              className="bg-emerald-500 text-night px-12 py-4 rounded-2xl font-display font-black italic text-lg hover:bg-emerald-400 transition-all disabled:opacity-50"
            >
              {submitting ? 'CARGANDO...' : 'CARGAR MOVIMIENTO'}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="bg-zinc-900 border border-white/5 rounded-[2.5rem] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  <th className="px-6 py-5">Fecha</th>
                  <th className="px-6 py-5">Tipo</th>
                  <th className="px-6 py-5">Cat.</th>
                  <th className="px-6 py-5">Concepto</th>
                  <th className="px-6 py-5">Monto</th>
                  <th className="px-6 py-5">Medio</th>
                  <th className="px-6 py-5">Estado</th>
                  <th className="px-6 py-5">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => (
                  <React.Fragment key={r.id}>
                    <tr className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-medium">{r.fecha}</td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-black uppercase tracking-tighter px-2 py-1 rounded-md ${r.tipo?.toLowerCase() === 'ingreso' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                          {r.tipo}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-zinc-400">{r.categoria}</td>
                      <td className="px-6 py-4 font-display font-black italic truncate max-w-[150px]">{r.concepto}</td>
                      <td className="px-6 py-4 font-display font-black">{fmt(r.monto_ars)}</td>
                      <td className="px-6 py-4 text-zinc-400 text-xs">{r.medio}</td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-black uppercase tracking-tighter ${r.estado?.toLowerCase() === 'pagado' ? 'text-emerald-500' : 'text-amber-500 animate-pulse'}`}>
                          {r.estado}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setEditingId(editingId === r.id ? null : r.id);
                              setEditForm(r);
                            }}
                            className="p-2 bg-white/5 rounded-lg hover:bg-emerald-500 hover:text-night transition-all"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setDeletingId(r.id)}
                            className="p-2 bg-white/5 rounded-lg hover:bg-red-500 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editingId === r.id && (
                      <tr className="bg-white/[0.03]">
                        <td colSpan={8} className="p-8">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                            <div>
                              <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1 block">Fecha</label>
                              <input type="date" value={editForm.fecha} onChange={e => setEditForm({...editForm, fecha: e.target.value})} className="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-sm" />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1 block">Monto</label>
                              <input value={editForm.monto_ars} onChange={e => setEditForm({...editForm, monto_ars: e.target.value})} className="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-sm" />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1 block">Estado</label>
                              <select value={editForm.estado} onChange={e => setEditForm({...editForm, estado: e.target.value})} className="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-sm">
                                <option value="Pagado">Pagado</option>
                                <option value="Pendiente">Pendiente</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1 block">Concepto</label>
                              <input value={editForm.concepto} onChange={e => setEditForm({...editForm, concepto: e.target.value})} className="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-sm" />
                            </div>
                          </div>
                          <div className="flex justify-end gap-3">
                            <button onClick={() => setEditingId(null)} className="px-6 py-2 rounded-xl text-xs font-black uppercase text-zinc-500 hover:text-white">Cancelar</button>
                            <button onClick={handleUpdate} className="px-8 py-2 rounded-xl bg-emerald-500 text-night text-xs font-black uppercase italic tracking-tighter">Guardar Cambios</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {!filteredRows.length && !loading && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-zinc-500 italic">No se encontraron movimientos para este periodo</td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-zinc-500 italic">Cargando datos...</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )}
      </div>

      {/* Delete Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-night/80 backdrop-blur-md p-6">
          <div className="bg-zinc-900 border border-white/10 p-8 rounded-[2.5rem] max-w-sm w-full">
            <h3 className="text-xl font-display font-black italic text-white mb-4">¿Confirmar borrado?</h3>
            <p className="text-zinc-500 text-sm mb-8 font-medium">Esta acción no se puede deshacer y el movimiento será eliminado permanentemente.</p>
            <div className="flex gap-4">
              <button onClick={() => setDeletingId(null)} className="flex-1 px-4 py-3 rounded-xl bg-white/5 font-black uppercase text-[10px] hover:bg-white/10 transition-all">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 px-4 py-3 rounded-xl bg-red-500 text-white font-black uppercase text-[10px] hover:bg-red-400 transition-all">Borrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
