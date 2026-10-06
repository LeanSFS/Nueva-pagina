import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  AlertTriangle,
  Link2,
  Clock,
  Eye,
  EyeOff,
  Tag,
  Image,
  Printer,
  Send,
  ExternalLink,
  Receipt
} from 'lucide-react';
import AdminAgenda from './AdminAgenda.tsx';
import AdminRendimientos from './AdminRendimientos.tsx';
import AdminMetrics from './AdminMetrics.tsx';
import AdminAssistant from './AdminAssistant.tsx';
import AdminArcaFacturacion from './AdminArcaFacturacion.tsx';
import { firestoreService, Movement, Booking, sanitizeImageUrl, DomicilioConfig } from '../services/firestoreService.ts';
import { ArcaConfig, ArcaFacturaRecord } from '../types.ts';
import { auth } from '../services/firebase.ts';
import { SERVICES } from '../constants.ts';
import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, User as FirebaseUser } from 'firebase/auth';

const CATS_INGRESO = ['Lavado', 'Extra', 'Propina', 'Otros'];
const CATS_GASTO = ['Insumos', 'Herramientas', 'Mantenimiento', 'Publicidad', 'Impuestos', 'Otros'];

const formatDurationHours = (mins: number) => {
  if (!mins || mins <= 0) return '0min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
};

export default function AdminCaja({ 
  onBack, 
  isPasswordAuthenticated, 
  onLogout 
}: { 
  onBack: () => void; 
  isPasswordAuthenticated?: boolean; 
  onLogout?: () => void; 
}) {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [preferredMethod, setPreferredMethod] = useState<'popup' | 'redirect'>('popup');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isIframe, setIsIframe] = useState(false);
  const [submittingGoogleAuth, setSubmittingGoogleAuth] = useState(false);

  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [syncingNow, setSyncingNow] = useState(false);

  const [manualAuth, setManualAuth] = useState(false);
  const [lockedPassword, setLockedPassword] = useState('');
  const [lockedPasswordError, setLockedPasswordError] = useState(false);
  const [showLockedPasswordText, setShowLockedPasswordText] = useState(false);

  const handleUnlockWithPassword = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = lockedPassword.trim().toLowerCase();
    if (clean === 'lys' || clean === 'lys lavados' || clean === 'admin') {
      try {
        localStorage.setItem('lys_admin_auth', 'true');
        sessionStorage.setItem('lys_admin_auth', 'true');
      } catch (err) {}
      setManualAuth(true);
      setLockedPasswordError(false);
      setLockedPassword('');
    } else {
      setLockedPasswordError(true);
    }
  };

  const isUserAdmin = (user: any) => {
    if (!user) return false;
    return user.email?.toLowerCase() === 'leandro.saralegui@gmail.com' || user.uid === 'AYbEVBVfFxcx9vgxAWb83cJvDV02';
  };

  const isAuthorized = useMemo(() => {
    if (manualAuth) return true;
    if (isPasswordAuthenticated) return true;
    if (currentUser && isUserAdmin(currentUser)) return true;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lys_admin_auth') === 'true' || sessionStorage.getItem('lys_admin_auth') === 'true';
    }
    return false;
  }, [manualAuth, isPasswordAuthenticated, currentUser]);

  const updateUnsyncedCount = () => {
    try {
      const unsynced = JSON.parse(localStorage.getItem('lys_unsynced_movements') || '[]');
      setUnsyncedCount(unsynced.length);
    } catch (e) {
      setUnsyncedCount(0);
    }
  };

  const [activeTab, setActiveTab] = useState<'agenda' | 'caja' | 'facturacion' | 'stats' | 'metrics' | 'catalog' | 'gallery'>('agenda');
  const [allMovements, setAllMovements] = useState<Movement[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters - Apertura por defecto en modo Mes Actual
  const initialMonthRange = useMemo(() => {
    const d = new Date();
    const ymd = (date: Date) => date.toISOString().split('T')[0];
    return {
      from: ymd(new Date(d.getFullYear(), d.getMonth(), 1)),
      to: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0))
    };
  }, []);

  const [selectedRange, setSelectedRange] = useState<'hoy' | 'ayer' | 'semana' | 'mes' | 'todo'>('mes');
  const [filterFrom, setFilterFrom] = useState(initialMonthRange.from);
  const [filterTo, setFilterTo] = useState(initialMonthRange.to);
  const [filterTipo, setFilterTipo] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterMedio, setFilterMedio] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [filterFacturado, setFilterFacturado] = useState<'todos' | 'facturados' | 'sin_facturar'>('todos');

  // Facturas y Configuración ARCA
  const [arcaFacturas, setArcaFacturas] = useState<ArcaFacturaRecord[]>([]);
  const [arcaConfig, setArcaConfig] = useState<ArcaConfig | null>(null);

  // Modal para facturar movimiento puntual
  const [facturarTarget, setFacturarTarget] = useState<Movement | null>(null);
  const [facturarForm, setFacturarForm] = useState({
    clienteNombre: '',
    clienteDocTipo: '99', // 99: CF, 96: DNI, 80: CUIT
    clienteDocNro: '',
    clienteTelefono: '',
    montoTotal: '',
    concepto: '',
    tipoComprobante: 11, // Factura C
    puntoVenta: 2
  });
  const [isSubmittingFactura, setIsSubmittingFactura] = useState(false);
  const [facturaError, setFacturaError] = useState<string | null>(null);

  // Modal para ver comprobante oficial / imprimir / enviar WhatsApp
  const [selectedFacturaRecord, setSelectedFacturaRecord] = useState<ArcaFacturaRecord | null>(null);

  // Cola secuencial de facturación en segundo plano
  interface FacturaQueueItem {
    movement: Movement;
    form: {
      puntoVenta: number;
      tipoComprobante: number;
      clienteDocTipo: string;
      clienteDocNro: string;
      clienteNombre: string;
      clienteTelefono: string;
      montoTotal: number;
      concepto: string;
    };
  }

  interface CajaToastNotification {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
  }

  const [pendingFacturaIds, setPendingFacturaIds] = useState<Set<string>>(new Set());
  const [queueStatus, setQueueStatus] = useState<{ isProcessing: boolean; currentClient?: string; remaining: number }>({
    isProcessing: false,
    remaining: 0
  });
  const [toasts, setToasts] = useState<CajaToastNotification[]>([]);

  const facturaQueueRef = useRef<FacturaQueueItem[]>([]);
  const isProcessingQueueRef = useRef<boolean>(false);

  const addToast = (type: 'success' | 'error' | 'info', message: string, durationMs = 6000) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, durationMs);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Helper para saber si un movimiento ya fue facturado
  const isMovementFacturado = (m: Movement) => {
    if (m.facturado) return true;
    if (m.cae && m.cae.trim()) return true;
    if (m.factura && m.factura.trim() && m.factura !== '-' && m.factura.toLowerCase() !== 'sin factura' && m.factura.toLowerCase() !== 'no') return true;
    if (arcaFacturas.some(f => f.movementId === m.id)) return true;
    return false;
  };

  // Helper para obtener el comprobante asociado a un movimiento
  const getMovementFacturaRecord = (m: Movement): ArcaFacturaRecord | null => {
    const byId = arcaFacturas.find(f => f.movementId === m.id);
    if (byId) return byId;
    if (m.factura) {
      const cleanDigits = m.factura.replace(/\D/g, '');
      const byNro = arcaFacturas.find(f => {
        const fullNro = `FC-${String(f.puntoVenta).padStart(4, '0')}-${String(f.cbteNro).padStart(8, '0')}`;
        return fullNro === m.factura || (cleanDigits && String(f.cbteNro) === cleanDigits.slice(-8));
      });
      if (byNro) return byNro;
    }
    return null;
  };

  // Abrir modal de facturar para un movimiento
  const handleOpenFacturar = (m: Movement) => {
    setFacturaError(null);
    setFacturarTarget(m);
    setFacturarForm({
      clienteNombre: m.cliente?.trim() || 'Consumidor Final',
      clienteDocTipo: '99',
      clienteDocNro: '',
      clienteTelefono: '',
      montoTotal: String(m.monto_ars || ''),
      concepto: m.concepto || 'Servicio de Estética y Lavado Automotor',
      tipoComprobante: arcaConfig?.tipoComprobanteDefault || 11,
      puntoVenta: arcaConfig?.puntoVenta || 2
    });
  };

  // Procesador secuencial de la cola de facturación en segundo plano
  const processNextQueueItem = async () => {
    if (isProcessingQueueRef.current) return;
    if (facturaQueueRef.current.length === 0) {
      setQueueStatus({ isProcessing: false, remaining: 0 });
      return;
    }

    isProcessingQueueRef.current = true;
    const currentItem = facturaQueueRef.current.shift()!;
    setQueueStatus({
      isProcessing: true,
      currentClient: currentItem.form.clienteNombre,
      remaining: facturaQueueRef.current.length
    });

    try {
      const cfg = arcaConfig || await firestoreService.getArcaConfig();
      let base = cfg.apiHost?.trim().replace(/\/$/, '') || '';
      if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        const isLocalOrRunApp = host.includes('localhost') || host === '127.0.0.1' || host.includes('run.app');
        if (isLocalOrRunApp) {
          base = '';
        } else if (!base) {
          base = 'https://nueva-pagina.onrender.com';
        }
      }
      const endpoint = base ? `${base}/api/arca/emitir` : '/api/arca/emitir';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuit: cfg.cuit || '20411564550',
          puntoVenta: currentItem.form.puntoVenta,
          tipoComprobante: currentItem.form.tipoComprobante,
          concepto: 2, // Servicios
          docTipo: Number(currentItem.form.clienteDocTipo),
          docNro: currentItem.form.clienteDocTipo === '99' ? '0' : currentItem.form.clienteDocNro,
          total: currentItem.form.montoTotal,
          clienteNombre: currentItem.form.clienteNombre,
          clienteTelefono: currentItem.form.clienteTelefono,
          descripcionServicio: currentItem.form.concepto,
          production: cfg.production !== false
        })
      });

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        const txt = await res.text();
        throw new Error(txt.includes('<html') 
          ? 'El servidor backend de ARCA no respondió en formato JSON.' 
          : `Respuesta de ARCA: ${txt.slice(0, 100)}`
        );
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo emitir la factura en ARCA.');
      }

      const facturaNro = `FC-${String(data.puntoVenta).padStart(4, '0')}-${String(data.cbteNro).padStart(8, '0')}`;
      const facturaId = `arca_${data.puntoVenta}_${data.tipoComprobante}_${data.cbteNro}`;

      const newFactura: ArcaFacturaRecord = {
        id: facturaId,
        cae: String(data.cae || ''),
        caeVto: String(data.caeVto || ''),
        cbteNro: Number(data.cbteNro),
        puntoVenta: Number(data.puntoVenta),
        tipoComprobante: Number(data.tipoComprobante),
        tipoComprobanteNombre: data.tipoComprobanteNombre || (Number(data.tipoComprobante) === 11 ? 'FACTURA C' : Number(data.tipoComprobante) === 6 ? 'FACTURA B' : 'FACTURA A'),
        fechaEmision: data.fechaEmision || new Date().toLocaleDateString('es-AR'),
        fechaIso: currentItem.movement.fecha || new Date().toISOString().split('T')[0],
        total: currentItem.form.montoTotal,
        clienteNombre: currentItem.form.clienteNombre,
        clienteDocTipo: currentItem.form.clienteDocTipo === '96' ? 'DNI' : currentItem.form.clienteDocTipo === '80' ? 'CUIT' : 'Consumidor Final',
        clienteDocNro: currentItem.form.clienteDocNro || '0',
        clienteTelefono: currentItem.form.clienteTelefono || '',
        conceptoDescripcion: currentItem.form.concepto,
        qrUrl: data.qrUrl || '',
        qrBase64: data.qrBase64 || '',
        createdAt: new Date().toISOString(),
        movementId: currentItem.movement.id
      };

      // 1. Guardar factura en colección Firestore y caché
      await firestoreService.saveArcaFactura(newFactura);

      // 2. Actualizar movimiento en Firestore
      const updatedMovement: Movement = {
        ...currentItem.movement,
        factura: facturaNro,
        facturado: true,
        cae: data.cae,
        caeVto: data.caeVto,
        facturaId: facturaId,
        cliente: currentItem.form.clienteNombre || currentItem.movement.cliente
      };
      await firestoreService.saveMovement(updatedMovement);

      // 3. Actualizar estados locales reactivos
      setAllMovements(prev => prev.map(m => m.id === currentItem.movement.id ? updatedMovement : m));
      setArcaFacturas(prev => [newFactura, ...prev.filter(f => f.id !== newFactura.id)]);

      // 4. Notificar éxito en pantalla
      addToast('success', `✅ Factura ${facturaNro} autorizada con éxito para ${currentItem.form.clienteNombre} (CAE: ${data.cae})`, 7000);
    } catch (err: any) {
      console.error('Error emitiendo factura en segundo plano:', err);
      addToast('error', `❌ Error emitiendo factura de ${currentItem.form.clienteNombre}: ${err.message || 'Error en ARCA'}`, 9000);
    } finally {
      // Remover de pendingFacturaIds
      setPendingFacturaIds(prev => {
        const next = new Set(prev);
        next.delete(currentItem.movement.id);
        return next;
      });

      isProcessingQueueRef.current = false;
      setQueueStatus({
        isProcessing: false,
        remaining: facturaQueueRef.current.length
      });

      // Pausa de seguridad de 400ms para no solapar llamadas con AFIP
      setTimeout(() => {
        processNextQueueItem();
      }, 400);
    }
  };

  // Emitir Factura Electrónica ARCA para el movimiento (se cierra inmediatamente y se ejecuta en segundo plano)
  const handleEmitirFacturaMovimiento = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!facturarTarget) return;

    const montoNum = Number(facturarForm.montoTotal);
    if (!montoNum || montoNum <= 0) {
      setFacturaError('El monto debe ser mayor a $0.');
      return;
    }

    if (facturarForm.clienteDocTipo !== '99' && !facturarForm.clienteDocNro.trim()) {
      setFacturaError('Por favor ingrese el número de documento del cliente.');
      return;
    }

    const queueItem: FacturaQueueItem = {
      movement: { ...facturarTarget },
      form: {
        puntoVenta: facturarForm.puntoVenta,
        tipoComprobante: facturarForm.tipoComprobante,
        clienteDocTipo: facturarForm.clienteDocTipo,
        clienteDocNro: facturarForm.clienteDocNro.trim(),
        clienteNombre: facturarForm.clienteNombre.trim() || 'Consumidor Final',
        clienteTelefono: facturarForm.clienteTelefono.trim(),
        montoTotal: montoNum,
        concepto: facturarForm.concepto
      }
    };

    const targetMovementId = facturarTarget.id;
    const clientName = queueItem.form.clienteNombre;

    // 1. CERRAR EL POPUP INMEDIATAMENTE
    setFacturarTarget(null);
    setFacturaError(null);
    setIsSubmittingFactura(false);

    // 2. Marcar el movimiento en la tabla como "facturando en segundo plano"
    setPendingFacturaIds(prev => new Set(prev).add(targetMovementId));

    // 3. Encolar
    facturaQueueRef.current.push(queueItem);
    setQueueStatus(prev => ({
      ...prev,
      remaining: facturaQueueRef.current.length
    }));

    // 4. Notificar al usuario que quedó encolado
    addToast('info', `⚡ Factura de ${clientName} ($${montoNum.toLocaleString('es-AR')}) agregada a la cola en segundo plano.`);

    // 5. Procesar cola
    processNextQueueItem();
  };

  // Abrir comprobante
  const handleViewReceipt = (m: Movement) => {
    const rec = getMovementFacturaRecord(m);
    if (rec) {
      setSelectedFacturaRecord(rec);
    } else {
      const nroParts = (m.factura || '').match(/\d+/g) || ['2', '1'];
      const cbteNum = Number(nroParts[nroParts.length - 1]) || 1;
      const ptVenta = Number(nroParts[0]) || 2;
      const synth: ArcaFacturaRecord = {
        id: m.facturaId || `factura_${m.id}`,
        cae: m.cae || 'Autorizado por AFIP',
        caeVto: m.caeVto || m.fecha,
        cbteNro: cbteNum,
        puntoVenta: ptVenta,
        tipoComprobante: 11,
        tipoComprobanteNombre: 'FACTURA C',
        fechaEmision: m.fecha ? m.fecha.split('-').reverse().join('/') : new Date().toLocaleDateString('es-AR'),
        fechaIso: m.fecha,
        total: m.monto_ars,
        clienteNombre: m.cliente || 'Consumidor Final',
        clienteDocTipo: 'Consumidor Final',
        clienteDocNro: '0',
        conceptoDescripcion: m.concepto,
        createdAt: m.fecha,
        movementId: m.id
      };
      setSelectedFacturaRecord(synth);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const handleSendWhatsApp = (factura: ArcaFacturaRecord) => {
    let cleanPhone = (factura.clienteTelefono || '').replace(/\D/g, '');
    if (cleanPhone && !cleanPhone.startsWith('549') && !cleanPhone.startsWith('54')) {
      cleanPhone = `549${cleanPhone}`;
    }
    const msg = `¡Hola ${factura.clienteNombre}! Te adjuntamos el comprobante fiscal oficial de tu servicio en LyS Lavados.
📄 ${factura.tipoComprobanteNombre || 'Factura C'} Nº ${String(factura.puntoVenta).padStart(4, '0')}-${String(factura.cbteNro).padStart(8, '0')}
💰 Total: $${Number(factura.total).toLocaleString('es-AR')}
🔒 CAE Oficial: ${factura.cae} (Vto: ${factura.caeVto})
${factura.qrUrl ? `🔗 Validar en ARCA/AFIP: ${factura.qrUrl}` : ''}
¡Muchas gracias por confiar en LyS Lavados! 🚗✨`;
    const url = cleanPhone 
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // Filtrado local para la tabla de Caja
  const filteredRows = useMemo(() => {
    return allMovements.filter(m => {
      if (filterFrom && m.fecha < filterFrom) return false;
      if (filterTo && m.fecha > filterTo) return false;
      if (filterTipo && m.tipo?.toLowerCase() !== filterTipo.toLowerCase()) return false;
      if (filterEstado && m.estado?.toLowerCase() !== filterEstado.toLowerCase()) return false;
      if (filterMedio && m.medio?.toLowerCase() !== filterMedio.toLowerCase()) return false;
      if (filterCategoria && m.categoria !== filterCategoria) return false;
      if (filterFacturado === 'facturados' && !isMovementFacturado(m)) return false;
      if (filterFacturado === 'sin_facturar' && isMovementFacturado(m)) return false;
      return true;
    });
  }, [allMovements, filterFrom, filterTo, filterTipo, filterEstado, filterMedio, filterCategoria, filterFacturado, arcaFacturas]);

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
  const [emitirFacturaArca, setEmitirFacturaArca] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [altaSuccess, setAltaSuccess] = useState(false);
  const [arcaSuccessMessage, setArcaSuccessMessage] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);

  // Delete modal
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, facturasData, configData] = await Promise.all([
        firestoreService.getMovements(),
        firestoreService.getArcaFacturas().catch(() => []),
        firestoreService.getArcaConfig().catch(() => null)
      ]);
      const sorted = data.sort((a, b) => b.fecha.localeCompare(a.fecha));
      setAllMovements(sorted);
      if (facturasData) setArcaFacturas(facturasData);
      if (configData) setArcaConfig(configData);
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
    setArcaSuccessMessage(null);
    setError(null);
    try {
      const movementId = `mov_${Date.now()}_generic`;
      let facturaNro = newMovement.factura || '';
      let isFacturado = false;
      let facturaCae: string | undefined;
      let facturaCaeVto: string | undefined;
      let facturaId: string | undefined;

      // Si tiene activado emitir Factura Electrónica ARCA
      if (emitirFacturaArca && newMovement.tipo?.toLowerCase() === 'ingreso') {
        const arcaConfig = await firestoreService.getArcaConfig().catch(() => null) || {} as ArcaConfig;
        let base = arcaConfig.apiHost?.trim().replace(/\/$/, '') || '';
        if (typeof window !== 'undefined') {
          const host = window.location.hostname;
          const isLocalOrRunApp = host.includes('localhost') || host === '127.0.0.1' || host.includes('run.app');
          if (isLocalOrRunApp) {
            base = '';
          } else if (!base) {
            base = 'https://nueva-pagina.onrender.com';
          }
        }
        const endpoint = base ? `${base}/api/arca/emitir` : '/api/arca/emitir';

        const arcaRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cuit: arcaConfig.cuit || '20411564550',
            puntoVenta: arcaConfig.puntoVenta || 2,
            tipoComprobante: arcaConfig.tipoComprobanteDefault || 11, // Factura C
            concepto: 2, // Servicios
            docTipo: 99, // Consumidor Final
            docNro: '0',
            total: Number(newMovement.monto) || 0,
            clienteNombre: newMovement.cliente?.trim() || 'Consumidor Final',
            descripcionServicio: newMovement.concepto || 'Servicio de Estética y Lavado Automotor',
            production: arcaConfig.production !== false
          })
        });

        const ct = arcaRes.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          const txt = await arcaRes.text();
          throw new Error(txt.includes('<html') 
            ? 'El servidor backend de ARCA no respondió en formato JSON. Verifica la conexión a ARCA.'
            : `Respuesta de ARCA: ${txt.slice(0, 100)}`
          );
        }

        const arcaData = await arcaRes.json();
        if (!arcaRes.ok || !arcaData.success) {
          throw new Error(arcaData.error || 'No se pudo emitir la factura en ARCA.');
        }

        facturaNro = `FC-${String(arcaData.puntoVenta).padStart(4, '0')}-${String(arcaData.cbteNro).padStart(8, '0')}`;
        facturaCae = String(arcaData.cae || '');
        facturaCaeVto = String(arcaData.caeVto || '');
        facturaId = `arca_${arcaData.puntoVenta}_${arcaData.tipoComprobante}_${arcaData.cbteNro}`;
        isFacturado = true;

        const newFacturaRecord: ArcaFacturaRecord = {
          id: facturaId,
          cae: facturaCae,
          caeVto: facturaCaeVto,
          cbteNro: Number(arcaData.cbteNro),
          puntoVenta: Number(arcaData.puntoVenta),
          tipoComprobante: Number(arcaData.tipoComprobante),
          tipoComprobanteNombre: arcaData.tipoComprobanteNombre || 'FACTURA C',
          fechaEmision: arcaData.fechaEmision || new Date().toLocaleDateString('es-AR'),
          fechaIso: newMovement.fecha,
          total: Number(newMovement.monto) || 0,
          clienteNombre: newMovement.cliente?.trim() || 'Consumidor Final',
          clienteDocTipo: 'Consumidor Final',
          clienteDocNro: '0',
          conceptoDescripcion: newMovement.concepto,
          qrUrl: arcaData.qrUrl,
          qrBase64: arcaData.qrBase64,
          createdAt: new Date().toISOString(),
          movementId: movementId
        };

        // Guardar factura en colección facturas y en estado local reactivo
        await firestoreService.saveArcaFactura(newFacturaRecord);
        setArcaFacturas(prev => [newFacturaRecord, ...prev.filter(f => f.id !== facturaId)]);
        setArcaSuccessMessage(`¡Factura Electrónica emitida con éxito en ARCA! ${facturaNro} (CAE: ${arcaData.cae})`);
      }

      const val: Movement = {
        id: movementId,
        fecha: newMovement.fecha,
        tipo: newMovement.tipo as 'Ingreso' | 'Gasto',
        categoria: newMovement.categoria,
        concepto: newMovement.concepto,
        monto_ars: Number(newMovement.monto) || 0,
        medio: newMovement.medio,
        estado: newMovement.estado as 'Pagado' | 'Pendiente',
        factura: facturaNro,
        cliente: newMovement.cliente || '',
        notas: newMovement.notes || '',
        facturado: isFacturado,
        cae: facturaCae,
        caeVto: facturaCaeVto,
        facturaId: facturaId
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
      console.error('Error in handleAdd:', err);
      setError(err.message || 'Error al guardar movimiento o emitir factura');
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
    setSelectedRange(range);
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
  const [domicilioConfig, setDomicilioConfig] = useState<DomicilioConfig>({
    enabled: true,
    extraPrice: 5000,
    bufferMinutes: 45,
    city: 'Cipolletti',
    whatsappHelpPhone: '2995760611'
  });

  const [newPhoto, setNewPhoto] = useState({ url: '', title: '', description: '' });
  const [imageInputMethod, setImageInputMethod] = useState<'url' | 'file'>('file');
  const [previewImageError, setPreviewImageError] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [compressingImage, setCompressingImage] = useState(false);
  const [deleteConfirmPhotoId, setDeleteConfirmPhotoId] = useState<string | null>(null);

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

        // Scale to max 1080px (Full HD) maintaining aspect ratio for optimal clarity on all screens
        const maxDim = 1080;
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
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.80);
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
      // Ensure all 6 new highly detailed services from constants are included
      const cleanDb = srvs.filter(s => s.id !== 'Exterior' && s.id !== 'Interior' && s.id !== 'Full');
      const list = [...cleanDb];
      SERVICES.forEach(staticSrv => {
        const exists = list.some(item => item.id === staticSrv.id);
        if (!exists) {
          list.push({
            id: staticSrv.id,
            name: staticSrv.name,
            label: staticSrv.label,
            description: staticSrv.description,
            features: staticSrv.features,
            isFeatured: staticSrv.isFeatured ?? false,
            isHidden: (staticSrv as any).isHidden ?? false,
            basePrice: staticSrv.basePrice || 15000,
            prices: staticSrv.prices || { auto: 15000, suv: 20000, pickup: 30000 },
            duration: staticSrv.duration || 60
          });
        }
      });
      // Sort in precisely the requested order:
      // lavado exterior - detallado interior - tapizados de tela - tapizados de cuero - limpieza de techo - tratamiento de vidrios
      const order = ['lavado_exterior', 'detallado_interior', 'tapizados_tela', 'tapizados_cuero', 'limpieza_techo', 'tratamiento_vidrios'];
      list.sort((a, b) => {
        const idxA = order.indexOf(a.id);
        const idxB = order.indexOf(b.id);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
      setDbServices(list);
      const vehs = await firestoreService.getVehicles();
      setDbVehicles(vehs);
      const phts = await firestoreService.getGallery();
      setDbPhotos(phts);
      const domCfg = await firestoreService.getDomicilioConfig();
      if (domCfg) setDomicilioConfig(domCfg);
    } catch (e) {
      console.error('Error loading config/gallery:', e);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      updateUnsyncedCount();
      fetchRows();
      fetchBookings();
      loadCatalogAndGallery();
    }
  }, [isAuthorized]);

  useEffect(() => {
    updateUnsyncedCount();

    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      setAuthChecking(false);
      if (user && isUserAdmin(user)) {
        // Auto-synchronize any offline/local movements and facturas upon successful login
        Promise.all([
          firestoreService.syncUnsyncedMovements(),
          firestoreService.syncUnsyncedFacturas()
        ])
          .then(([syncedMovements, syncedFacturas]) => {
            if (syncedMovements > 0 || syncedFacturas > 0) {
              console.log(`Auto-sincronizados ${syncedMovements} movimientos y ${syncedFacturas} facturas.`);
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

    // Real-time listener for ARCA facturas across devices
    const unsubFacturas = firestoreService.subscribeArcaFacturas((updatedFacturas) => {
      setArcaFacturas(updatedFacturas);
      fetchRows();
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

    return () => {
      unsubscribe();
      unsubFacturas();
    };
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
      if (typeof window !== 'undefined') {
        localStorage.removeItem('lys_admin_auth');
        sessionStorage.removeItem('lys_admin_auth');
      }
      if (auth.currentUser) {
        await signOut(auth);
      }
      if (onLogout) {
        onLogout();
      } else {
        onBack();
      }
    } catch (err) {
      console.error("Error logging out:", err);
      if (onLogout) onLogout();
      else onBack();
    } finally {
      setSubmittingGoogleAuth(false);
    }
  };

  const handleManualSync = async () => {
    setSyncingNow(true);
    setError(null);
    try {
      const count = await firestoreService.syncUnsyncedMovements();
      await firestoreService.syncUnsyncedFacturas().catch(() => 0);
      
      // Clear the local unsynced queue
      try {
        localStorage.removeItem('lys_unsynced_movements');
      } catch (e) {}
      setUnsyncedCount(0);

      addToast('success', count > 0 
        ? `✅ ¡${count} movimiento${count > 1 ? 's' : ''} sincronizado${count > 1 ? 's' : ''} y consolidado${count > 1 ? 's' : ''} en la nube!`
        : `✅ Todos los movimientos locales ya están consolidados y sincronizados en Firestore.`
      );
      setAltaSuccess(true);
      await fetchRows();
    } catch (err: any) {
      console.error("Manual sync failed:", err);
      addToast('error', `Error al sincronizar datos locales: ${err.message || 'Error de conexión'}`);
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
      await firestoreService.saveDomicilioConfig(domicilioConfig);
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
      setError('Seleccione una imagen o pegue una URL válida.');
      return;
    }
    setSavingPhoto(true);
    setError(null);
    try {
      const sanitizedUrl = sanitizeImageUrl(newPhoto.url);
      const photoId = `photo_${Date.now()}`;
      const payload = {
        id: photoId,
        url: sanitizedUrl,
        title: newPhoto.title || 'Trabajo Realizado',
        description: newPhoto.description || 'Resultado profesional en nuestro taller.',
        createdAt: new Date().toISOString()
      };
      await firestoreService.addGalleryPhoto(payload);
      setNewPhoto({ url: '', title: '', description: '' });
      setPreviewImageError(false);
      // Update local state directly for instant feedback
      setDbPhotos(prev => [payload, ...prev.filter(p => p.id !== photoId)]);
    } catch (e: any) {
      setError(e.message || 'Error al guardar foto');
    } finally {
      setSavingPhoto(false);
    }
  };

  const handleRestoreGallery = async () => {
    setLoading(true);
    setError(null);
    try {
      const reset = await firestoreService.restoreDefaultGallery();
      setDbPhotos(reset);
    } catch (e: any) {
      setError('Error al restaurar galería de ejemplo');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    setLoading(true);
    setError(null);
    try {
      await firestoreService.deleteGalleryPhoto(photoId);
      // Filter out immediately for instant interactive response
      setDbPhotos(prev => prev.filter(p => p.id !== photoId));
      setDeleteConfirmPhotoId(null);
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

  if (!isAuthorized) {
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
              Esta sección está restringida exclusivamente para los administradores de LyS Lavados.
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

          {/* Password Login Option */}
          <form onSubmit={handleUnlockWithPassword} className="space-y-3 bg-slate-950/80 p-4 rounded-2xl border border-white/5">
            <label className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block flex items-center justify-between">
              <span>Ingresar con Contraseña del Taller</span>
            </label>
            <div className="relative">
              <input
                type={showLockedPasswordText ? "text" : "password"}
                value={lockedPassword}
                onChange={e => {
                  setLockedPassword(e.target.value);
                  if (lockedPasswordError) setLockedPasswordError(false);
                }}
                placeholder="Contraseña del taller..."
                className={`w-full bg-zinc-900 border ${lockedPasswordError ? 'border-rose-500' : 'border-white/10'} rounded-xl py-3 pl-4 pr-10 text-sm text-white focus:outline-none focus:border-emerald-500`}
              />
              <button
                type="button"
                onClick={() => setShowLockedPasswordText(!showLockedPasswordText)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1 cursor-pointer"
              >
                {showLockedPasswordText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {lockedPasswordError && (
              <p className="text-rose-400 text-[11px] font-bold">Contraseña incorrecta.</p>
            )}
            <button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black italic py-3 rounded-xl uppercase tracking-wider text-xs shadow-lg shadow-emerald-500/10 cursor-pointer transition-all active:scale-98"
            >
              DESBLOQUEAR PANEL ADMIN
            </button>
          </form>

          <div className="flex items-center gap-3">
            <div className="h-px bg-white/10 flex-1" />
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">o autenticar con Google</span>
            <div className="h-px bg-white/10 flex-1" />
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block">
                Conectar con Google (Opcional)
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
        {/* Header Superior */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 pb-6 border-b border-white/5">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <button 
              onClick={onBack} 
              className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-xs font-bold uppercase tracking-wider py-1.5 px-3 rounded-lg hover:bg-white/5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a la Web</span>
            </button>
            <div className="hidden sm:block text-zinc-700 font-black">|</div>
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full select-none text-[10px] font-black uppercase tracking-widest text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5 animate-pulse" />
              <span>{currentUser ? 'Google Admin' : 'Sesión Activa (Taller)'}</span>
              {currentUser?.email && (
                <span className="hidden lg:inline text-zinc-400 font-normal">({currentUser.email})</span>
              )}
            </div>
            {!currentUser && (
              <button
                type="button"
                onClick={loginWithGoogle}
                disabled={submittingGoogleAuth}
                className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] uppercase tracking-wider px-3 py-1 rounded-lg transition-all shadow-md shadow-emerald-500/10 cursor-pointer active:scale-95"
                title="Vincular con tu cuenta de Google leandro.saralegui@gmail.com para habilitar permisos de Firestore en este dispositivo"
              >
                <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                <span>{submittingGoogleAuth ? 'Conectando...' : 'Vincular Google Admin'}</span>
              </button>
            )}
            <button
              onClick={handleLogout}
              className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-red-400 px-2.5 py-1 rounded-lg border border-white/5 hover:border-red-500/20 hover:bg-red-500/5 transition-all cursor-pointer"
              title="Cerrar sesión de Administrador"
            >
              Cerrar Sesión
            </button>
          </div>
          
          <h1 className="text-xl md:text-2xl font-display font-black italic tracking-tighter">
            LyS Lavados <span className="text-emerald-500">Admin</span>
          </h1>
        </div>

        {/* Banner de Sincronización para Incógnito / Dispositivos Nuevos */}
        {!currentUser && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 sm:p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Dispositivo Nuevo o Modo Incógnito Detectado</span>
              </div>
              <p className="text-zinc-300 text-xs leading-relaxed max-w-2xl">
                Estás dentro del panel con la contraseña del taller. Para que la base de datos en la nube (Firestore) te descargue la <strong className="text-white">Caja</strong> y la <strong className="text-white">Agenda</strong> en vivo, vinculá tu cuenta de Google autorizada (<strong className="text-emerald-400 font-mono">leandro.saralegui@gmail.com</strong>).
              </p>
            </div>
            <button
              type="button"
              onClick={loginWithGoogle}
              disabled={submittingGoogleAuth}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black italic text-xs px-5 py-3 rounded-xl uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 shrink-0 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              {submittingGoogleAuth ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : <Sparkles className="w-4 h-4 fill-slate-950" />}
              <span>VINCULAR GOOGLE AHORA</span>
            </button>
          </div>
        )}

        {/* ASISTENTE DE IA ADMIN */}
        <AdminAssistant
          onRefreshMovements={fetchRows}
          onRefreshBookings={fetchBookings}
          onNavigateTab={(tab) => setActiveTab(tab)}
          allMovements={allMovements}
          bookings={bookings}
          services={dbServices}
        />

        {/* NAVEGACIÓN PRINCIPAL DE PESTAÑAS (Orden: Agenda, Caja, Precios, Galería, Rendimientos, Métricas) */}
        <nav className="bg-zinc-900/90 p-1.5 rounded-2xl border border-white/10 shadow-2xl flex items-center justify-start lg:justify-between gap-1 overflow-x-auto max-w-full mb-8 scrollbar-none">
          {/* 1. Agenda */}
          <button 
            onClick={() => setActiveTab('agenda')}
            className={`flex-1 min-w-[110px] sm:min-w-0 flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'agenda' ? 'bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/20' : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span>Agenda</span>
          </button>

          {/* 2. Caja */}
          <button 
            onClick={() => setActiveTab('caja')}
            className={`flex-1 min-w-[110px] sm:min-w-0 flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'caja' ? 'bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/20' : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Wallet className="w-4 h-4 shrink-0" />
            <span>Caja</span>
          </button>

          {/* 3. Facturación ARCA */}
          <button 
            onClick={() => setActiveTab('facturacion')}
            className={`flex-1 min-w-[110px] sm:min-w-0 flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'facturacion' ? 'bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/20' : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>Facturación ARCA</span>
          </button>

          {/* 3. Precios */}
          <button 
            onClick={() => setActiveTab('catalog')}
            className={`flex-1 min-w-[110px] sm:min-w-0 flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'catalog' ? 'bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/20' : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Tag className="w-4 h-4 shrink-0" />
            <span>Precios</span>
          </button>

          {/* 4. Galería */}
          <button 
            onClick={() => setActiveTab('gallery')}
            className={`flex-1 min-w-[110px] sm:min-w-0 flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'gallery' ? 'bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/20' : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Image className="w-4 h-4 shrink-0" />
            <span>Galería</span>
          </button>

          {/* 5. Rendimientos */}
          <button 
            onClick={() => setActiveTab('stats')}
            className={`flex-1 min-w-[110px] sm:min-w-0 flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'stats' ? 'bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/20' : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <BarChartIcon className="w-4 h-4 shrink-0" />
            <span>Rendimientos</span>
          </button>

          {/* 6. Métricas */}
          <button 
            onClick={() => setActiveTab('metrics')}
            className={`flex-1 min-w-[110px] sm:min-w-0 flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'metrics' ? 'bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/20' : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Activity className="w-4 h-4 shrink-0" />
            <span>Métricas</span>
          </button>
        </nav>

        {activeTab === 'agenda' ? (
          <AdminAgenda 
            customerVisits={customersMap}
          />
        ) : activeTab === 'facturacion' ? (
          <AdminArcaFacturacion 
            movements={allMovements} 
            bookings={bookings} 
            onRefreshMovements={fetchRows} 
          />
        ) : activeTab === 'stats' ? (
          <AdminRendimientos bookings={bookings} movements={allMovements} />
        ) : activeTab === 'catalog' ? (
          <div className="bg-zinc-900 border border-white/5 rounded-2xl md:rounded-[2.5rem] p-4 md:p-12 space-y-6 md:space-y-8 animate-fade-in">
            <div>
              <h2 className="text-xl md:text-2xl font-display font-black italic text-white tracking-tight flex items-center gap-2.5 md:gap-3">
                <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-emerald-500" /> CATÁLOGO Y PRECIOS
              </h2>
              <p className="text-zinc-500 text-[9px] md:text-[10px] font-black uppercase tracking-widest mt-1">Configuración dinámica del sitio web</p>
            </div>

            {catalogSuccess && (
              <div className="p-3.5 md:p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl md:rounded-2xl text-[10px] md:text-xs font-bold uppercase tracking-widest flex items-center gap-2.5 md:gap-3">
                <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 animate-bounce shrink-0" /> ¡Precios y servicios actualizados con éxito en la Nube!
              </div>
            )}

            <div className="space-y-4 md:space-y-6">
              <h3 className="text-xs md:text-sm font-black uppercase tracking-widest text-emerald-500">Configuración Detallada del Menú de Servicios</h3>
              <p className="text-zinc-400 text-[10.5px] md:text-xs font-medium leading-relaxed">
                Aquí puedes ajustar las descripciones, las duraciones estimadas (importantes para bloquear consecutivamente los turnos del calendario) y los precios exactos para cada tipo de vehículo. El simulador de turnos adoptará estos cambios al instante.
              </p>
              
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
                {dbServices.map((srv, idx) => (
                  <div key={srv.id} className={`p-4 md:p-6 bg-slate-950 border rounded-2xl relative overflow-hidden space-y-4 transition-all duration-300 ${
                    srv.isHidden 
                      ? 'border-red-500/20 opacity-70 shadow-[inset_0_0_20px_rgba(239,68,68,0.02)]' 
                      : 'border-white/10'
                  }`}>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
                      <div>
                        <div className="text-[8.5px] font-black uppercase text-zinc-500 tracking-widest flex items-center gap-1.5">
                          {srv.label || 'Servicio'}
                          {srv.isHidden ? (
                            <span className="bg-red-500/10 text-red-400 px-2 py-0.5 rounded-md font-sans text-[8px] font-black tracking-widest uppercase border border-red-500/20">Oculto</span>
                          ) : (
                            <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md font-sans text-[8px] font-black tracking-widest uppercase border border-emerald-500/20">Visible</span>
                          )}
                        </div>
                        <div className={`font-display font-black italic text-base md:text-lg text-white uppercase transition-all duration-300 ${srv.isHidden ? 'text-zinc-500 line-through' : ''}`}>
                          {srv.name}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {/* Show/Hide Toggle Button */}
                        <button
                          type="button"
                          onClick={() => {
                            const copy = [...dbServices];
                            copy[idx].isHidden = !copy[idx].isHidden;
                            setDbServices(copy);
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            srv.isHidden
                              ? 'bg-red-500/10 border-red-500/35 text-red-400 hover:bg-red-500/25 active:scale-95'
                              : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-white hover:border-white/20 active:scale-95'
                          }`}
                        >
                          {srv.isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          {srv.isHidden ? 'MOSTRAR' : 'OCULTAR'}
                        </button>

                        <div className="flex items-center gap-2 bg-zinc-900 border border-white/10 px-3 py-1.5 rounded-xl">
                          <Clock className="w-4 h-4 text-emerald-500 shrink-0" />
                          <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              step="15"
                              value={srv.duration || 60} 
                              onChange={(e) => {
                                const copy = [...dbServices];
                                copy[idx].duration = Number(e.target.value) || 0;
                                setDbServices(copy);
                              }}
                              className="bg-transparent text-emerald-400 font-display font-black italic text-xs md:text-sm w-10 md:w-12 text-center outline-none"
                            />
                            <span className="text-[8.5px] text-zinc-500 font-black">MIN</span>
                          </div>
                          <span className="text-zinc-700 font-bold">|</span>
                          <span className="text-[10px] md:text-xs text-white font-display font-black italic bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md text-emerald-400 shrink-0">
                            {formatDurationHours(srv.duration || 60)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[7.5px] md:text-[8px] font-black uppercase text-zinc-400 block mb-1">Descripción del Servicio</label>
                      <textarea 
                        rows={2}
                        value={srv.description || ''} 
                        onChange={(e) => {
                          const copy = [...dbServices];
                          copy[idx].description = e.target.value;
                          setDbServices(copy);
                        }}
                        className="bg-zinc-900 border border-white/5 text-zinc-300 text-xs rounded-xl p-2.5 w-full outline-none focus:border-emerald-500 resize-none whitespace-normal break-words"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] md:text-xs font-black uppercase text-zinc-400 block mb-2 md:mb-3">Precios por Tipo de Vehículo</label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                        {/* Auto */}
                        <div className="bg-zinc-900/80 border border-white/10 p-2.5 sm:p-3 rounded-xl hover:border-emerald-500/20 transition-all flex sm:flex-col items-center sm:items-stretch justify-between gap-3 sm:gap-2">
                          <div className="text-xs sm:text-[10px] font-black text-zinc-300 uppercase tracking-wider font-sans flex items-center gap-1.5">
                            <span className="text-sm">🚗</span> Auto
                          </div>
                          <div className="relative flex-1 sm:w-full max-w-[140px] sm:max-w-none">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs md:text-sm text-zinc-500 font-bold">$</span>
                            <input 
                              type="number"
                              value={srv.prices?.auto ?? srv.basePrice}
                              onChange={(e) => {
                                const copy = [...dbServices];
                                if (!copy[idx].prices) {
                                  copy[idx].prices = { auto: srv.basePrice || 15000, suv: (srv.basePrice || 15000) + 5000, pickup: (srv.basePrice || 15000) + 15000 };
                                }
                                copy[idx].prices.auto = Number(e.target.value) || 0;
                                copy[idx].basePrice = Number(e.target.value) || 0; // maintain fallback
                                setDbServices(copy);
                              }}
                              className="w-full bg-zinc-950/60 border border-white/5 focus:border-emerald-500/40 rounded-lg py-1.5 pl-7 pr-3 text-emerald-400 font-display font-black italic text-xs md:text-sm text-right outline-none transition-all"
                            />
                          </div>
                        </div>

                        {/* SUV */}
                        <div className="bg-zinc-900/80 border border-white/10 p-2.5 sm:p-3 rounded-xl hover:border-emerald-500/20 transition-all flex sm:flex-col items-center sm:items-stretch justify-between gap-3 sm:gap-2">
                          <div className="text-xs sm:text-[10px] font-black text-zinc-300 uppercase tracking-wider font-sans flex items-center gap-1.5">
                            <span className="text-sm">🚙</span> SUV
                          </div>
                          <div className="relative flex-1 sm:w-full max-w-[140px] sm:max-w-none">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs md:text-sm text-zinc-500 font-bold">$</span>
                            <input 
                              type="number"
                              value={srv.prices?.suv ?? (srv.basePrice + 5000)}
                              onChange={(e) => {
                                const copy = [...dbServices];
                                if (!copy[idx].prices) {
                                  copy[idx].prices = { auto: srv.basePrice || 15000, suv: (srv.basePrice || 15000) + 5000, pickup: (srv.basePrice || 15000) + 15000 };
                                }
                                copy[idx].prices.suv = Number(e.target.value) || 0;
                                setDbServices(copy);
                              }}
                              className="w-full bg-zinc-950/60 border border-white/5 focus:border-emerald-500/40 rounded-lg py-1.5 pl-7 pr-3 text-emerald-400 font-display font-black italic text-xs md:text-sm text-right outline-none transition-all"
                            />
                          </div>
                        </div>

                        {/* Pickup */}
                        <div className="bg-zinc-900/80 border border-white/10 p-2.5 sm:p-3 rounded-xl hover:border-emerald-500/20 transition-all flex sm:flex-col items-center sm:items-stretch justify-between gap-3 sm:gap-2">
                          <div className="text-xs sm:text-[10px] font-black text-zinc-300 uppercase tracking-wider font-sans flex items-center gap-1.5">
                            <span className="text-sm">🛻</span> Pickup
                          </div>
                          <div className="relative flex-1 sm:w-full max-w-[140px] sm:max-w-none">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs md:text-sm text-zinc-500 font-bold">$</span>
                            <input 
                              type="number"
                              value={srv.prices?.pickup ?? (srv.basePrice + 15000)}
                              onChange={(e) => {
                                const copy = [...dbServices];
                                if (!copy[idx].prices) {
                                  copy[idx].prices = { auto: srv.basePrice || 15000, suv: (srv.basePrice || 15000) + 5000, pickup: (srv.basePrice || 15000) + 15000 };
                                }
                                copy[idx].prices.pickup = Number(e.target.value) || 0;
                                setDbServices(copy);
                              }}
                              className="w-full bg-zinc-950/60 border border-white/5 focus:border-emerald-500/40 rounded-lg py-1.5 pl-7 pr-3 text-emerald-400 font-display font-black italic text-xs md:text-sm text-right outline-none transition-all"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Configuración de Servicio a Domicilio */}
            <div className="p-5 md:p-8 bg-slate-950 border border-purple-500/30 rounded-3xl space-y-6 relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                    🏠
                  </div>
                  <div>
                    <h3 className="text-sm md:text-base font-display font-black text-white italic tracking-tight flex items-center gap-2">
                      SERVICIO A DOMICILIO (CIPOLLETTI)
                      <span className="text-[9px] font-sans font-black uppercase px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        {domicilioConfig.enabled ? 'Activo' : 'Pausado'}
                      </span>
                    </h3>
                    <p className="text-zinc-400 text-xs">
                      Permite que los clientes soliciten servicio en su casa o cochera con recargo de traslado
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDomicilioConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    domicilioConfig.enabled 
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30' 
                      : 'bg-zinc-800 text-zinc-400 border border-white/5 hover:text-white'
                  }`}
                >
                  {domicilioConfig.enabled ? '✓ Domicilio Activado' : '✕ Domicilio Pausado'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Recargo por traslado */}
                <div className="bg-zinc-900/90 border border-white/10 rounded-2xl p-4 space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                    Recargo Traslado ($)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500 font-bold">$</span>
                    <input
                      type="number"
                      value={domicilioConfig.extraPrice}
                      onChange={e => setDomicilioConfig(prev => ({ ...prev, extraPrice: Number(e.target.value) || 0 }))}
                      className="w-full bg-zinc-950 border border-white/10 focus:border-purple-500 rounded-xl py-2 pl-7 pr-3 text-sm text-purple-300 font-bold font-mono outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500">Monto fijo que se suma al valor del servicio</p>
                </div>

                {/* Margen de viaje / armado */}
                <div className="bg-zinc-900/90 border border-white/10 rounded-2xl p-4 space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                    Margen Logístico (Minutos)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={domicilioConfig.bufferMinutes}
                      onChange={e => setDomicilioConfig(prev => ({ ...prev, bufferMinutes: Number(e.target.value) || 0 }))}
                      className="w-full bg-zinc-950 border border-white/10 focus:border-purple-500 rounded-xl py-2 px-3 text-sm text-white font-bold font-mono outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500">Tiempo extra bloqueado para viaje y armado (ej: 45 min)</p>
                </div>

                {/* Zona de cobertura */}
                <div className="bg-zinc-900/90 border border-white/10 rounded-2xl p-4 space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                    Ciudad de Cobertura
                  </label>
                  <input
                    type="text"
                    value={domicilioConfig.city}
                    onChange={e => setDomicilioConfig(prev => ({ ...prev, city: e.target.value }))}
                    className="w-full bg-zinc-950 border border-white/10 focus:border-purple-500 rounded-xl py-2 px-3 text-sm text-white font-bold outline-none"
                  />
                  <p className="text-[10px] text-zinc-500">Se muestra en la web para evitar reservas fuera de zona</p>
                </div>

                {/* Teléfono WhatsApp de consultas */}
                <div className="bg-zinc-900/90 border border-white/10 rounded-2xl p-4 space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                    WhatsApp para Consultas
                  </label>
                  <input
                    type="text"
                    value={domicilioConfig.whatsappHelpPhone}
                    onChange={e => setDomicilioConfig(prev => ({ ...prev, whatsappHelpPhone: e.target.value }))}
                    className="w-full bg-zinc-950 border border-white/10 focus:border-purple-500 rounded-xl py-2 px-3 text-sm text-white font-mono outline-none"
                  />
                  <p className="text-[10px] text-zinc-500">Número al que escriben clientes de otras localidades</p>
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-display font-black italic text-white tracking-tight flex items-center gap-3">
                  <Plus className="w-6 h-6 text-emerald-500" /> GALERÍA DE RESULTADOS
                </h2>
                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mt-1">Sube fotos reales para motivar a tus clientes</p>
              </div>
              <button
                onClick={handleRestoreGallery}
                disabled={loading}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto"
                title="Restaurar imágenes de ejemplo por defecto"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Restaurar Fotos Demo
              </button>
            </div>

            {/* Upload form */}
            <div className="bg-slate-950 border border-white/10 p-6 rounded-3xl space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-2">Agregar Nueva Foto</h3>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-4">
                  <label className="text-[8px] font-black uppercase text-zinc-500 mb-1 block">Título</label>
                  <input 
                    type="text" 
                    placeholder="Ej. Pulido Ópticas / Limpieza Tapizados" 
                    value={newPhoto.title} 
                    onChange={e => setNewPhoto({...newPhoto, title: e.target.value})}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                  />
                </div>
                <div className="md:col-span-8 flex flex-col justify-end">
                  <span className="text-[8px] font-black uppercase text-zinc-500 mb-2 block">Origen de la Imagen (Elegí opción)</span>
                  
                  {/* Selector de Método */}
                  <div className="flex bg-zinc-900 p-1 rounded-xl border border-white/5 mb-3 select-none">
                    <button
                      type="button"
                      onClick={() => {
                        setImageInputMethod('file');
                        setPreviewImageError(false);
                      }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        imageInputMethod === 'file'
                          ? 'bg-emerald-500 text-night shadow-lg font-black'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" /> 📱 Subir Desde Dispositivo / Galería
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImageInputMethod('url');
                        setPreviewImageError(false);
                      }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        imageInputMethod === 'url'
                          ? 'bg-emerald-500 text-night shadow-lg font-black'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Link2 className="w-3.5 h-3.5" /> 🔗 Pegar Enlace (URL Directo)
                    </button>
                  </div>

                  <div>
                    {imageInputMethod === 'file' ? (
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
                          className="w-full bg-zinc-900 hover:bg-zinc-800 border-2 border-dashed border-emerald-500/30 hover:border-emerald-500/60 rounded-xl p-4 text-xs font-black text-center text-emerald-400 uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer select-none transition-all active:scale-[0.98] min-h-[50px]"
                        >
                          {compressingImage ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                              PROCESANDO IMAGEN...
                            </>
                          ) : (
                            <>
                              <Plus className="w-4 h-4 text-emerald-400" />
                              SELECCIONAR O ARRASTRAR FOTO DE TU CELULAR / PC
                            </>
                          )}
                        </label>
                        <span className="text-[9px] text-zinc-500 mt-1.5 block leading-relaxed">
                          ✓ Las fotos subidas desde tu dispositivo se procesan y optimizan automáticamente para almacenarse de forma permanente y segura en la aplicación.
                        </span>
                      </div>
                    ) : (
                      <div>
                        <input 
                          type="text" 
                          placeholder="Pegar enlace de imagen (ej. https://i.imgur.com/..., Google Drive o Dropbox)" 
                          value={newPhoto.url.startsWith('data:') ? '' : newPhoto.url} 
                          onChange={e => {
                            const raw = e.target.value;
                            const sanitized = sanitizeImageUrl(raw);
                            setNewPhoto({...newPhoto, url: sanitized});
                            setPreviewImageError(false);
                          }}
                          className="w-full bg-zinc-900 border border-white/10 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none placeholder:text-zinc-600 text-white"
                        />
                        <span className="text-[9px] text-zinc-500 mt-1.5 block leading-relaxed">
                          💡 Se convierten automáticamente enlaces de Google Drive, Imgur o Dropbox en formato visible directo.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Show selected image preview */}
              {newPhoto.url && (
                <div className="bg-black/50 border border-white/10 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-zinc-800 border border-white/10 flex-shrink-0 relative">
                      <img 
                        src={newPhoto.url} 
                        alt="Preview" 
                        className="w-full h-full object-cover" 
                        onError={() => setPreviewImageError(true)}
                        onLoad={() => setPreviewImageError(false)}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Imagen Lista para Agregar
                      </p>
                      <p className="text-zinc-400 text-xs truncate max-w-[220px] sm:max-w-md">
                        {newPhoto.url.startsWith('data:') ? 'Foto local optimizada (JPEG)' : newPhoto.url}
                      </p>
                      {previewImageError && (
                        <p className="text-amber-400 text-[10px] font-bold mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          No se pudo cargar la vista previa. Si usas URL, te sugerimos subir el archivo directo desde tu celular.
                        </p>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setNewPhoto(prev => ({ ...prev, url: '' }));
                      setPreviewImageError(false);
                    }}
                    className="text-red-400 hover:text-red-300 transition-colors p-2 text-xs font-bold uppercase tracking-wider cursor-pointer self-end sm:self-auto"
                  >
                    Quitar
                  </button>
                </div>
              )}

              <div>
                <label className="text-[8px] font-black uppercase text-zinc-500 mb-1 block">Descripción del Trabajo</label>
                <textarea 
                  rows={2}
                  placeholder="Detalles del tratamiento realizado, productos aplicados, etc." 
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
                  {savingPhoto ? 'SUBIENDO...' : 'PUBLICAR EN GALERÍA'}
                </button>
              </div>
            </div>

            {/* Photo List Grid */}
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Imágenes Publicadas ({dbPhotos.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {dbPhotos.map(photo => (
                  <div key={photo.id} className="bg-slate-950 border border-white/5 rounded-2xl overflow-hidden group flex flex-col h-full hover:border-white/10 transition-colors">
                    <div className="h-44 relative bg-zinc-900 overflow-hidden">
                      <img 
                        src={photo.url} 
                        alt={photo.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.onerror = null;
                          target.src = 'https://images.unsplash.com/photo-1601362840469-51e4d8d59085?auto=format&fit=crop&q=80&w=600';
                        }}
                      />
                      {deleteConfirmPhotoId === photo.id ? (
                        <div className="absolute top-3 right-3 flex items-center gap-1 bg-zinc-950 p-1.5 rounded-xl border border-red-500/30 shadow-2xl z-20">
                          <button 
                            onClick={() => handleDeletePhoto(photo.id)}
                            className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                          >
                            SÍ, ELIMINAR
                          </button>
                          <button 
                            onClick={() => setDeleteConfirmPhotoId(null)}
                            className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                          >
                            NO
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setDeleteConfirmPhotoId(photo.id)}
                          className="absolute top-3 right-3 p-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors shadow-lg cursor-pointer z-10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="p-4 flex flex-col flex-1 pb-5">
                      <h4 className="font-display font-black italic text-base mb-1 truncate text-white">{photo.title}</h4>
                      <p className="text-zinc-500 text-xs line-clamp-2 leading-relaxed flex-1">{photo.description}</p>
                    </div>
                  </div>
                ))}
                {dbPhotos.length === 0 && (
                  <div className="col-span-3 text-center py-12 text-zinc-500 italic space-y-3">
                    <p>No hay imágenes publicadas en la galería.</p>
                    <button
                      onClick={handleRestoreGallery}
                      className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-emerald-500/20 transition-all cursor-pointer"
                    >
                      Restaurar Galería Demo Inicial
                    </button>
                  </div>
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

        <div className="bg-zinc-900 border border-white/5 p-6 rounded-3xl mb-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-2">Desde</label>
              <input 
                type="date" 
                value={filterFrom} 
                onChange={e => { setFilterFrom(e.target.value); setSelectedRange('' as any); }} 
                className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none text-white" 
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-2">Hasta</label>
              <input 
                type="date" 
                value={filterTo} 
                onChange={e => { setFilterTo(e.target.value); setSelectedRange('' as any); }} 
                className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none text-white" 
              />
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
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-2">Facturación ARCA</label>
              <select value={filterFacturado} onChange={e => setFilterFacturado(e.target.value as any)} className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none">
                <option value="todos">Todos</option>
                <option value="facturados">✓ Facturados</option>
                <option value="sin_facturar">Sin facturar</option>
              </select>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'mes', label: 'Este Mes' },
                { id: 'hoy', label: 'Hoy' },
                { id: 'ayer', label: 'Ayer' },
                { id: 'semana', label: 'Semana' },
                { id: 'todo', label: 'Todo' }
              ].map(r => {
                const isActive = selectedRange === r.id;
                return (
                  <button 
                    key={r.id}
                    type="button"
                    onClick={() => setRange(r.id as any)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                      isActive 
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black' 
                        : 'bg-slate-950 border border-white/10 text-zinc-400 hover:text-white hover:border-emerald-500'
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={fetchRows} className="flex items-center gap-2 bg-emerald-500 text-night px-6 py-2 rounded-xl font-display font-black italic text-sm hover:bg-emerald-400 transition-all cursor-pointer">
                <Search className="w-4 h-4" /> BUSCAR
              </button>
              <button onClick={exportCSV} className="flex items-center gap-2 bg-zinc-800 text-white px-4 py-2 rounded-xl font-display font-black italic text-sm hover:bg-zinc-700 transition-all cursor-pointer">
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
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Cliente (Opcional)</label>
              <input value={newMovement.cliente} onChange={e => setNewMovement({...newMovement, cliente: e.target.value})} placeholder="Cliente opcional" className="w-full bg-slate-950 border border-emerald-500/10 rounded-xl p-3 text-sm" />
            </div>
          </div>

          {/* Switch de Facturación Electrónica ARCA */}
          {newMovement.tipo === 'Ingreso' && (
            <div className="mt-6 pt-5 border-t border-emerald-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-emerald-950/20 p-4 rounded-2xl border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Emitir Factura Electrónica ARCA Automática</span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Factura C</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">Genera el comprobante oficial en AFIP con CAE y código QR al presionar Guardar.</p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input 
                  type="checkbox" 
                  checked={emitirFacturaArca} 
                  onChange={(e) => setEmitirFacturaArca(e.target.checked)} 
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                <span className="ml-3 text-xs font-bold uppercase tracking-wider text-emerald-400">
                  {emitirFacturaArca ? 'ACTIVADA' : 'DESACTIVADA'}
                </span>
              </label>
            </div>
          )}

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-end gap-6">
            {error && (
              <p className="text-rose-400 font-bold text-xs flex items-center gap-1.5 animate-fade-in bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                {error}
              </p>
            )}
            {arcaSuccessMessage && (
              <p className="text-emerald-400 font-bold text-xs flex items-center gap-1.5 animate-fade-in bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                {arcaSuccessMessage}
              </p>
            )}
            {altaSuccess && !arcaSuccessMessage && (
              <p className="text-emerald-500 font-black text-xs uppercase tracking-widest animate-fade-in">¡Agregado con éxito!</p>
            )}
            <button 
              disabled={submitting}
              onClick={handleAdd}
              className="w-full sm:w-auto bg-emerald-500 text-night px-12 py-4 rounded-2xl font-display font-black italic text-lg hover:bg-emerald-400 transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-500/10"
            >
              {submitting ? 'PROCESANDO...' : emitirFacturaArca && newMovement.tipo === 'Ingreso' ? 'CARGAR Y EMITIR FACTURA' : 'CARGAR MOVIMIENTO'}
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
                  <th className="px-6 py-5">Facturación ARCA</th>
                  <th className="px-6 py-5">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => (
                  <React.Fragment key={r.id}>
                    <tr className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-medium whitespace-nowrap">{r.fecha}</td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-black uppercase tracking-tighter px-2 py-1 rounded-md ${r.tipo?.toLowerCase() === 'ingreso' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                          {r.tipo}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-zinc-400">{r.categoria}</td>
                      <td className="px-6 py-4 font-display font-black italic truncate max-w-[150px]">{r.concepto}</td>
                      <td className="px-6 py-4 font-display font-black whitespace-nowrap">{fmt(r.monto_ars)}</td>
                      <td className="px-6 py-4 text-zinc-400 text-xs">{r.medio}</td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-black uppercase tracking-tighter ${r.estado?.toLowerCase() === 'pagado' ? 'text-emerald-500' : 'text-amber-500 animate-pulse'}`}>
                          {r.estado}
                        </span>
                      </td>
                      {/* Facturación ARCA */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isMovementFacturado(r) ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>Facturado</span>
                            </span>
                            {r.factura && (
                              <span className="font-mono text-[11px] text-zinc-300 font-bold bg-white/5 border border-white/5 px-2 py-0.5 rounded">
                                {r.factura}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleViewReceipt(r)}
                              title="Ver Comprobante Oficial AFIP / Imprimir / WhatsApp"
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-emerald-500 hover:text-slate-950 text-zinc-400 transition-all cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : pendingFacturaIds.has(r.id) ? (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold animate-pulse">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
                            <span>Facturando en 2º plano...</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 border border-white/5">
                              Sin facturar
                            </span>
                            {r.tipo === 'Ingreso' ? (
                              <button
                                type="button"
                                onClick={() => handleOpenFacturar(r)}
                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-500/10 cursor-pointer active:scale-95"
                                title="Emitir Factura Electrónica ARCA (AFIP) oficial para este cobro"
                              >
                                <FileText className="w-3 h-3 text-slate-950 shrink-0" />
                                <span>Facturar</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenFacturar(r)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                                title="Generar comprobante para este gasto"
                              >
                                <span>Facturar</span>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setEditingId(editingId === r.id ? null : r.id);
                              setEditForm(r);
                            }}
                            className="p-2 bg-white/5 rounded-lg hover:bg-emerald-500 hover:text-night transition-all cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setDeletingId(r.id)}
                            className="p-2 bg-white/5 rounded-lg hover:bg-red-500 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editingId === r.id && (
                      <tr className="bg-white/[0.03]">
                        <td colSpan={9} className="p-8">
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
                            <button onClick={() => setEditingId(null)} className="px-6 py-2 rounded-xl text-xs font-black uppercase text-zinc-500 hover:text-white cursor-pointer">Cancelar</button>
                            <button onClick={handleUpdate} className="px-8 py-2 rounded-xl bg-emerald-500 text-night text-xs font-black uppercase italic tracking-tighter cursor-pointer">Guardar Cambios</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {!filteredRows.length && !loading && (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-zinc-400">
                      {allMovements.length > 0 ? (
                        <div className="max-w-md mx-auto space-y-3 py-2">
                          <p className="text-zinc-300 font-bold text-sm">
                            No hay movimientos en el filtro seleccionado {filterFrom ? `(${filterFrom} a ${filterTo || 'hoy'})` : ''}.
                          </p>
                          <p className="text-xs text-zinc-400">
                            Tenés <strong className="text-emerald-400 font-black">{allMovements.length} movimientos</strong> guardados en otros meses.
                          </p>
                          <button
                            type="button"
                            onClick={() => setRange('todo')}
                            className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-lg shadow-emerald-500/20 active:scale-95 transition-all inline-flex items-center gap-2"
                          >
                            <Calendar className="w-4 h-4 text-slate-950" />
                            <span>MOSTRAR TODOS ({allMovements.length})</span>
                          </button>
                        </div>
                      ) : (
                        <span className="italic text-zinc-500">No hay movimientos registrados en la caja aún.</span>
                      )}
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-zinc-500 italic">Cargando datos...</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )}
      </div>

      {/* MODAL: FACTURAR MOVIMIENTO DIRECTO EN ARCA */}
      {facturarTarget && (
        <div className="fixed inset-0 z-[450] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-zinc-950 border border-emerald-500/30 rounded-3xl max-w-xl w-full p-6 md:p-8 space-y-6 shadow-2xl relative my-8 animate-fade-in">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                    ARCA / AFIP OFICIAL
                  </span>
                  <span className="text-zinc-500 text-xs font-mono">P.V. {String(facturarForm.puntoVenta).padStart(4, '0')}</span>
                </div>
                <h3 className="text-lg md:text-xl font-display font-black italic text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-400" />
                  EMITIR FACTURA ELECTRÓNICA
                </h3>
                <p className="text-zinc-400 text-xs mt-0.5">
                  Movimiento de Caja ({facturarTarget.fecha}) · {facturarTarget.tipo} ({facturarTarget.categoria})
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setFacturarTarget(null)}
                disabled={isSubmittingFactura}
                className="text-zinc-500 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {facturaError && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl text-xs flex items-center gap-2.5 animate-fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{facturaError}</span>
              </div>
            )}

            <form onSubmit={handleEmitirFacturaMovimiento} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">Tipo de Factura</label>
                  <select
                    value={facturarForm.tipoComprobante}
                    onChange={e => setFacturarForm({ ...facturarForm, tipoComprobante: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value={11}>Factura C (Monotributo)</option>
                    <option value={6}>Factura B (Resp. Inscripto a Consumidor Final)</option>
                    <option value={1}>Factura A (Resp. Inscripto a Empresa)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">Monto a Facturar ($ ARS)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-zinc-500 font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={facturarForm.montoTotal}
                      onChange={e => setFacturarForm({ ...facturarForm, montoTotal: e.target.value })}
                      placeholder="0.00"
                      className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 pl-8 text-sm font-bold text-emerald-400 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">Descripción del Servicio / Concepto</label>
                <input
                  type="text"
                  required
                  value={facturarForm.concepto}
                  onChange={e => setFacturarForm({ ...facturarForm, concepto: e.target.value })}
                  placeholder="Detalle del trabajo..."
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">Cliente / Receptor</label>
                  <input
                    type="text"
                    value={facturarForm.clienteNombre}
                    onChange={e => setFacturarForm({ ...facturarForm, clienteNombre: e.target.value })}
                    placeholder="Consumidor Final"
                    className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">Documento Fiscal</label>
                  <div className="flex gap-2">
                    <select
                      value={facturarForm.clienteDocTipo}
                      onChange={e => setFacturarForm({ ...facturarForm, clienteDocTipo: e.target.value })}
                      className="w-1/3 bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500 text-xs"
                    >
                      <option value="99">CF (Sin Doc)</option>
                      <option value="96">DNI</option>
                      <option value="80">CUIT</option>
                    </select>
                    <input
                      type="text"
                      disabled={facturarForm.clienteDocTipo === '99'}
                      value={facturarForm.clienteDocNro}
                      onChange={e => setFacturarForm({ ...facturarForm, clienteDocNro: e.target.value })}
                      placeholder={facturarForm.clienteDocTipo === '99' ? 'Consumidor Final' : 'Nº de Documento'}
                      className="w-2/3 bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500 disabled:opacity-40"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">Teléfono WhatsApp del Cliente (Opcional)</label>
                <input
                  type="tel"
                  value={facturarForm.clienteTelefono}
                  onChange={e => setFacturarForm({ ...facturarForm, clienteTelefono: e.target.value })}
                  placeholder="299 1234567"
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="bg-emerald-950/20 border border-emerald-500/20 p-3.5 rounded-2xl text-[11px] text-zinc-300 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Al hacer clic en emitir, el sistema solicitará en tiempo real el <strong className="text-white">CAE oficial a ARCA</strong> y asociará la factura directamente a este movimiento de caja.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setFacturarTarget(null)}
                  disabled={isSubmittingFactura}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFactura}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-display font-black italic text-sm px-7 py-3 rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                >
                  {isSubmittingFactura ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                      <span>AUTORIZANDO CON ARCA...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      <span>AUTORIZAR Y EMITIR FACTURA</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VER COMPROBANTE OFICIAL ARCA CON QR / IMPRIMIR / WHATSAPP */}
      {selectedFacturaRecord && (
        <div className="fixed inset-0 z-[500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-950 border border-white/10 rounded-2xl md:rounded-3xl max-w-2xl w-full p-6 md:p-8 space-y-6 shadow-2xl relative my-8 animate-fade-in">
            {/* Modal actions bar */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4 print:hidden">
              <div className="flex items-center gap-2">
                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase px-2.5 py-1 rounded-full border border-emerald-500/30 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Comprobante Autorizado por ARCA
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintReceipt}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/10"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendWhatsApp(selectedFacturaRecord)}
                  className="bg-white/10 hover:bg-white/20 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-emerald-400" />
                  <span>WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFacturaRecord(null)}
                  className="text-zinc-400 hover:text-white p-1 rounded cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* PRINTABLE RECEIPT TEMPLATE */}
            <div id="printable-caja-receipt" className="bg-white text-black p-6 md:p-8 rounded-xl font-sans text-xs space-y-6 border border-zinc-200">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 border-b-2 border-black pb-4 relative">
                <div className="col-span-5 space-y-1">
                  <h1 className="text-xl font-black tracking-tight">{arcaConfig?.razonSocial || 'LyS Lavados'}</h1>
                  <p className="text-[10px] text-zinc-600">Estética Automotriz y Lavado Artesanal</p>
                  <p className="text-[10px] text-zinc-700">{arcaConfig?.domicilioComercial || 'Venezuela 1659, Cipolletti, Río Negro'}</p>
                  <p className="text-[10px] font-bold">Condición IVA: {arcaConfig?.condicionIva || 'Responsable Monotributo'}</p>
                </div>

                {/* Center Badge "C" */}
                <div className="col-span-2 flex flex-col items-center justify-center border border-black rounded p-1">
                  <span className="text-3xl font-black">C</span>
                  <span className="text-[8px] font-bold uppercase tracking-wider">CÓD. 011</span>
                </div>

                <div className="col-span-5 text-right space-y-1">
                  <h2 className="text-base font-black uppercase">{selectedFacturaRecord.tipoComprobanteNombre || 'FACTURA C'}</h2>
                  <p className="font-mono text-xs font-bold">
                    Punto de Venta: {String(selectedFacturaRecord.puntoVenta).padStart(4, '0')} Comp. Nro: {String(selectedFacturaRecord.cbteNro).padStart(8, '0')}
                  </p>
                  <p className="text-[10px]">Fecha de Emisión: <strong>{selectedFacturaRecord.fechaEmision}</strong></p>
                  <p className="text-[10px] font-mono">CUIT Emisor: <strong>20-41156455-0</strong></p>
                </div>
              </div>

              {/* Client details */}
              <div className="bg-zinc-100 p-3 rounded space-y-1 border border-zinc-200 text-[11px]">
                <div className="grid grid-cols-2 gap-2">
                  <div><strong>Cliente / Razón Social:</strong> {selectedFacturaRecord.clienteNombre}</div>
                  <div><strong>Condición IVA:</strong> Consumidor Final</div>
                  <div><strong>Documento:</strong> {selectedFacturaRecord.clienteDocTipo}: {selectedFacturaRecord.clienteDocNro}</div>
                  <div><strong>Condición de Venta:</strong> Contado / Efectivo / Transferencia</div>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <table className="w-full text-left text-xs border border-zinc-300">
                  <thead className="bg-zinc-100 border-b border-zinc-300 font-bold text-[10px] uppercase">
                    <tr>
                      <th className="p-2">Descripción del Servicio</th>
                      <th className="p-2 text-center">Cant.</th>
                      <th className="p-2 text-right">Precio Unit.</th>
                      <th className="p-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-zinc-200">
                      <td className="p-2 font-medium">{selectedFacturaRecord.conceptoDescripcion}</td>
                      <td className="p-2 text-center">1</td>
                      <td className="p-2 text-right font-mono">${selectedFacturaRecord.total.toLocaleString('es-AR')}</td>
                      <td className="p-2 text-right font-mono font-bold">${selectedFacturaRecord.total.toLocaleString('es-AR')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Total */}
              <div className="flex justify-end border-t border-black pt-2">
                <div className="text-right space-y-1">
                  <div className="text-sm font-black flex items-center gap-6 justify-between">
                    <span>TOTAL A PAGAR:</span>
                    <span className="font-mono text-base font-bold">${selectedFacturaRecord.total.toLocaleString('es-AR')}</span>
                  </div>
                </div>
              </div>

              {/* ARCA Official Footer with QR and CAE */}
              <div className="border-t-2 border-black pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {selectedFacturaRecord.qrBase64 && (
                    <img 
                      src={selectedFacturaRecord.qrBase64} 
                      alt="Código QR ARCA" 
                      className="w-24 h-24 border border-zinc-300 p-1 rounded" 
                    />
                  )}
                  <div className="space-y-1 text-[10px]">
                    <div className="font-black text-xs text-zinc-900 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 inline" /> Comprobante Autorizado por ARCA
                    </div>
                    <p className="text-zinc-600">Escanea el código QR con cualquier celular para validar la autenticidad fiscal de este comprobante en AFIP.</p>
                  </div>
                </div>

                <div className="text-right space-y-1 font-mono text-[11px] bg-zinc-50 p-2.5 rounded border border-zinc-200">
                  <div><strong>CAE Oficial:</strong> <span className="text-black font-black text-xs">{selectedFacturaRecord.cae}</span></div>
                  <div><strong>Fecha de Vto. CAE:</strong> {selectedFacturaRecord.caeVto}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* WIDGET FLOTANTE: COLA DE FACTURACIÓN EN SEGUNDO PLANO */}
      {queueStatus.isProcessing && (
        <aside aria-label="Estado de facturación en segundo plano" className="fixed bottom-6 right-6 z-[600] bg-zinc-950/95 border border-emerald-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-xl flex items-center gap-3.5 max-w-sm animate-fade-in border-l-4 border-l-emerald-500">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shrink-0">
            <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">ARCA En Segundo Plano</span>
              {queueStatus.remaining > 0 && (
                <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full text-zinc-300 font-mono">
                  +{queueStatus.remaining} en espera
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-white truncate">
              {queueStatus.currentClient ? `Emitiendo para ${queueStatus.currentClient}` : 'Autorizando con AFIP...'}
            </p>
            <p className="text-[10px] text-zinc-400">Podés seguir facturando otros cobros sin esperar.</p>
          </div>
        </aside>
      )}

      {/* NOTIFICACIONES TOAST FLOTANTES */}
      {toasts.length > 0 && (
        <div className="fixed top-6 right-6 z-[700] space-y-2.5 max-w-md w-full pointer-events-none p-4">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border shadow-2xl backdrop-blur-xl animate-fade-in ${
                t.type === 'success'
                  ? 'bg-zinc-950/95 border-emerald-500/40 text-emerald-300 border-l-4 border-l-emerald-500'
                  : t.type === 'error'
                  ? 'bg-zinc-950/95 border-rose-500/40 text-rose-300 border-l-4 border-l-rose-500'
                  : 'bg-zinc-950/95 border-white/20 text-zinc-200 border-l-4 border-l-cyan-500'
              }`}
            >
              {t.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : t.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <Loader2 className="w-5 h-5 text-cyan-400 animate-spin shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-xs font-medium leading-relaxed">
                {t.message}
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="text-zinc-500 hover:text-white p-1 rounded-lg cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
