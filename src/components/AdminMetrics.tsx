import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { 
  Users, 
  TrendingUp, 
  Clock, 
  Smartphone, 
  Monitor, 
  BookOpen, 
  Compass, 
  HelpCircle, 
  CheckCircle2, 
  ArrowRightLeft, 
  RefreshCw,
  Search,
  BookMarked,
  Layers,
  Database,
  CloudLightning,
  LogOut,
  Sparkles,
  AlertTriangle,
  Settings
} from 'lucide-react';
import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { auth } from '../services/firebase.ts';
import { metricsService, SectionTrace } from '../services/metricsService.ts';
import { telegramService } from '../services/telegramService.ts';
import { firestoreService } from '../services/firestoreService.ts';
import firebaseConfig from '../../firebase-applet-config.json';
import { Send } from 'lucide-react';

export default function AdminMetrics() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [traces, setTraces] = useState<SectionTrace[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [logPage, setLogPage] = useState(0);
  const itemsPerPage = 8;
  const [authError, setAuthError] = useState<string | null>(null);
  const [isIframe, setIsIframe] = useState(false);
  const [preferredMethod, setPreferredMethod] = useState<'popup' | 'redirect'>('popup');

  const isUserAdmin = (user: any) => {
    if (!user) return false;
    return user.email?.toLowerCase() === 'leandro.saralegui@gmail.com' || user.uid === 'AYbEVBVfFxcx9vgxAWb83cJvDV02';
  };

  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [testStatus, setTestStatus] = useState<{ type: 'idle' | 'success' | 'error', message?: string }>({ type: 'idle' });

  // Google Sheets import state
  const [importingSheets, setImportingSheets] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('https://docs.google.com/spreadsheets/d/1SDYaW0TBtLao-QJOC6TVlkoaRG7x6Ft4GcPudlGzbZc/edit?usp=sharing');
  const [importResult, setImportResult] = useState<{ type: 'idle' | 'success' | 'error', message?: string }>({ type: 'idle' });
  const [showIntegrationSettings, setShowIntegrationSettings] = useState(false);

  const handleImportSheets = async () => {
    setImportingSheets(true);
    setImportResult({ type: 'idle' });
    try {
      let targetUrl = sheetUrl.trim();
      if (targetUrl.includes('/edit')) {
        targetUrl = targetUrl.replace(/\/edit.*/, '/export?format=csv');
      }
      
      const res = await firestoreService.importFromGoogleSheets(targetUrl);
      if (res.success) {
        setImportResult({ 
          type: 'success', 
          message: `¡Sincronización exitosa! Se procesaron e insertaron ${res.count} turnos correctamente en Firestore.` 
        });
      } else {
        setImportResult({ 
          type: 'error', 
          message: `Ocurrió un error al importar: ${res.error || 'error desconocido'}` 
        });
      }
    } catch (err: any) {
      setImportResult({ 
        type: 'error', 
        message: `Fallo inesperado de conexión o procesamiento: ${err.message || err}` 
      });
    } finally {
      setImportingSheets(false);
    }
  };

  const handleImportCaja = async () => {
    setImportingSheets(true);
    setImportResult({ type: 'idle' });
    try {
      let targetUrl = sheetUrl.trim();
      const res = await firestoreService.importCajaFromGoogleSheets(targetUrl);
      if (res.success) {
        setImportResult({ 
          type: 'success', 
          message: `¡Sincronización exitosa! Se procesaron e insertaron ${res.count} movimientos de caja correctamente en Firestore.` 
        });
      } else {
        setImportResult({ 
          type: 'error', 
          message: `Ocurrió un error al importar caja: ${res.error || 'error desconocido'}` 
        });
      }
    } catch (err: any) {
      setImportResult({ 
        type: 'error', 
        message: `Fallo inesperado de conexión o procesamiento de caja: ${err.message || err}` 
      });
    } finally {
      setImportingSheets(false);
    }
  };

  useEffect(() => {
    async function loadTelegramSettings() {
      try {
        const settings = await telegramService.getSettings();
        setTelegramEnabled(settings.enabled);
        setTelegramToken(settings.botToken || '');
        setTelegramChatId(settings.chatId || '');
      } catch (e) {
        console.error('Error loading Telegram settings in component:', e);
      }
    }
    loadTelegramSettings();
  }, []);

  const handleSaveTelegram = async () => {
    setSavingTelegram(true);
    try {
      await telegramService.saveSettings({
        enabled: telegramEnabled,
        botToken: telegramToken.trim(),
        chatId: telegramChatId.trim()
      });
      alert('¡Configuración de Telegram guardada correctamente!');
    } catch (e) {
      alert('Error al guardar la configuración de Telegram');
    } finally {
      setSavingTelegram(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestStatus({ type: 'idle' });
    if (!telegramToken.trim() || !telegramChatId.trim()) {
      setTestStatus({ type: 'error', message: 'Por favor, ingresá el Token de Bot y el ID de Chat antes de enviar una prueba.' });
      return;
    }
    try {
      const url = `https://api.telegram.org/bot${telegramToken.trim()}/sendMessage`;
      const text = `🔔 *PRUEBA DE CONEXIÓN EXITOSA*\n\n` +
        `¡Felicidades! Tu bot de Telegram quedó configurado perfectamente para recibir alertas de turnos de *LyS Lavados*.\n\n` +
        `📱 _ID de Chat:_ \`${telegramChatId.trim()}\`\n` +
        `🧼 _Web:_ https://lyslavados.com`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramChatId.trim(),
          text: text,
          parse_mode: 'Markdown'
        })
      });
      if (res.ok) {
        setTestStatus({ type: 'success', message: '¡Mensaje de prueba enviado! Revisá tu celular.' });
      } else {
        const err = await res.text();
        setTestStatus({ type: 'error', message: `Error de Telegram: ${err}` });
      }
    } catch (e) {
      setTestStatus({ type: 'error', message: 'No se pudo conectar con los servidores de Telegram. Verificá tu token o conexión.' });
    }
  };

  // Detect iframe environments
  useEffect(() => {
    try {
      setIsIframe(window.self !== window.top);
    } catch (e) {
      setIsIframe(true);
    }

    // Set mobile default to redirect, desktop to popup, but allow switching
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      setPreferredMethod('redirect');
    }
  }, []);

  // Monitor auth state of the admin
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });

    // Check Google Redirect sign-in result when component mounts
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          setCurrentUser(result.user);
        }
      })
      .catch((err) => {
        console.error("Redirect sign-in error:", err);
        setAuthError(err.code || err.message || "No se pudo completar el redireccionamiento para Google.");
      });

    return () => unsubscribe();
  }, []);

  // Fetch from Cloud or Local, depending on admin permissions
  useEffect(() => {
    if (currentUser && isUserAdmin(currentUser)) {
      setLoadingCloud(true);
      metricsService.getTracesFromCloud()
        .then((cloudTraces) => {
          setTraces(cloudTraces);
        })
        .catch((err) => {
          console.error("Failed fetching traces from cloud:", err);
          // Fallback to local on error
          setTraces(metricsService.getLocalTraces());
        })
        .finally(() => {
          setLoadingCloud(false);
        });
    } else {
      setTraces(metricsService.getLocalTraces());
    }
  }, [currentUser]);

  const loginWithGoogle = async () => {
    setLoadingCloud(true);
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      // Force prompt so users can pick accounts easily
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
      setLoadingCloud(false);
    }
  };

  const handleLogout = async () => {
    setLoadingCloud(true);
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Error logging out:", err);
    } finally {
      setLoadingCloud(false);
    }
  };

  const refreshMetrics = async () => {
    if (currentUser && isUserAdmin(currentUser)) {
      setLoadingCloud(true);
      try {
        const cloudTraces = await metricsService.getTracesFromCloud();
        setTraces(cloudTraces);
      } catch (err) {
        console.error("Failed manual cloud refresh:", err);
      } finally {
        setLoadingCloud(false);
      }
    } else {
      setTraces(metricsService.getLocalTraces());
    }
  };

  const clearAllMetrics = async () => {
    const isCloud = currentUser && isUserAdmin(currentUser);
    const confirmation = window.confirm(
      isCloud
        ? '¿Seguro que querés reiniciar todas las métricas en la NUBE (Firestore)? Se generará un nuevo historial limpio de 7 días.'
        : '¿Seguro que querés reiniciar todas las métricas de la web? Se generará un nuevo historial local de prueba.'
    );

    if (confirmation) {
      if (isCloud) {
        setLoadingCloud(true);
        try {
          await metricsService.clearCloudMetrics();
          const fresh = await metricsService.getTracesFromCloud();
          setTraces(fresh);
        } catch (err) {
          console.error("Failed clearing cloud metrics:", err);
        } finally {
          setLoadingCloud(false);
        }
      } else {
        localStorage.removeItem('lys_web_metrics_v2');
        setTraces(metricsService.getLocalTraces());
      }
    }
  };

  // -------------------- DATA COMPUTATIONS --------------------
  
  // Format dates elegantly for Argentina locale
  const formatDateLabel = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  };

  const formatWithTime = (isoString: string) => {
    const d = new Date(isoString);
    return {
      dateStr: d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
      timeStr: d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
  };

  // 1. Core KPIs
  const kpis = useMemo(() => {
    const sortedTraces = [...traces];
    const totalVisits = sortedTraces.filter(t => t.type === 'visita').length;
    const bookingStarters = sortedTraces.filter(t => t.type === 'inicio_reserva').length;
    const bookingCompleters = sortedTraces.filter(t => t.type === 'reserva_completada').length;
    
    // Conversion rate (Reserva Completada / Visitas Totales %)
    const convRate = totalVisits > 0 ? ((bookingCompleters / totalVisits) * 100).toFixed(1) : '0';
    
    // Devices counting
    let mobile = 0;
    let desktop = 0;
    let tablet = 0;
    sortedTraces.forEach(t => {
      if (t.type === 'visita') {
        if (t.device === 'Mobile') mobile++;
        else if (t.device === 'Desktop') desktop++;
        else if (t.device === 'Tablet') tablet++;
      }
    });

    const dominantDev = mobile >= desktop && mobile >= tablet ? 'Celulares' : (desktop >= tablet ? 'Computadora' : 'Tablets');
    
    // Busy Hour calculation
    const hourCounts = Array(24).fill(0);
    sortedTraces.forEach(t => {
      if (t.type === 'visita') {
        const hr = new Date(t.timestamp).getHours();
        hourCounts[hr]++;
      }
    });
    let maxHour = 0;
    let maxCount = 0;
    hourCounts.forEach((count, hr) => {
      if (count > maxCount) {
        maxCount = count;
        maxHour = hr;
      }
    });

    // Today's stats
    const todayStr = new Date().toISOString().split('T')[0];
    const visitsToday = sortedTraces.filter(t => t.type === 'visita' && t.timestamp.startsWith(todayStr)).length;

    return {
      totalVisits,
      bookingCompleters,
      convRate,
      deviceBreakdown: { mobile, desktop, tablet },
      dominantDevice: dominantDev,
      visitsToday,
      busyHour: `${maxHour}:00 - ${maxHour + 1}:00 hs`
    };
  }, [traces]);

  // 2. Traffic Over Last 7 Days (Area Chart)
  const last7DaysChartData = useMemo(() => {
    const daysData: Record<string, { label: string; visitas: number; reservas: number }> = {};
    const now = new Date();
    
    // Fill the keys first
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().split('T')[0];
      daysData[key] = {
        label: formatDateLabel(key),
        visitas: 0,
        reservas: 0
      };
    }

    traces.forEach(t => {
      const dateKey = t.timestamp.split('T')[0];
      if (daysData[dateKey]) {
        if (t.type === 'visita') {
          daysData[dateKey].visitas++;
        } else if (t.type === 'reserva_completada') {
          daysData[dateKey].reservas++;
        }
      }
    });

    return Object.values(daysData);
  }, [traces]);

  // 3. Hourly Traffic Distribution (Bar Chart)
  const hourlyChartData = useMemo(() => {
    const hours = Array(24).fill(0).map((_, i) => ({
      hourLabel: `${i}hs`,
      visitas: 0
    }));

    traces.forEach(t => {
      if (t.type === 'visita') {
        const h = new Date(t.timestamp).getHours();
        if (hours[h]) {
          hours[h].visitas++;
        }
      }
    });

    return hours;
  }, [traces]);

  // 4. Conversion Funnel (Bar Chart)
  const funnelChartData = useMemo(() => {
    const visits = traces.filter(t => t.type === 'visita').length;
    const serviceClicks = traces.filter(t => t.type === 'click_servicios').length;
    const bookingStarts = traces.filter(t => t.type === 'inicio_reserva').length;
    const bookingCompletes = traces.filter(t => t.type === 'reserva_completada').length;

    return [
      { name: '1. Visitas', valor: visits, rate: '100%', fill: '#3f3f46' },
      { name: '2. Vieron Servicios', valor: serviceClicks, rate: visits > 0 ? `${Math.round((serviceClicks / visits) * 100)}%` : '0%', fill: '#64748b' },
      { name: '3. Iniciaron Reserva', valor: bookingStarts, rate: visits > 0 ? `${Math.round((bookingStarts / visits) * 100)}%` : '0%', fill: '#10b981' },
      { name: '4. Reservaron Full', valor: bookingCompletes, rate: visits > 0 ? `${Math.round((bookingCompletes / visits) * 100)}%` : '0%', fill: '#34d399' }
    ];
  }, [traces]);

  // 5. Active search in chronological log table
  const filteredTracesLog = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    const sorted = [...traces].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    if (!searchTerm) return sorted;

    return sorted.filter(t => {
      const { dateStr, timeStr } = formatWithTime(t.timestamp);
      return (
        t.type.toLowerCase().includes(searchLower) ||
        t.device.toLowerCase().includes(searchLower) ||
        dateStr.includes(searchLower) ||
        timeStr.includes(searchLower) ||
        t.id.toLowerCase().includes(searchLower)
      );
    });
  }, [traces, searchTerm]);

  const paginatedLogs = useMemo(() => {
    const start = logPage * itemsPerPage;
    return filteredTracesLog.slice(start, start + itemsPerPage);
  }, [filteredTracesLog, logPage]);

  const maxLogPages = Math.ceil(filteredTracesLog.length / itemsPerPage);

  const getActionStyles = (type: SectionTrace['type']) => {
    switch (type) {
      case 'visita':
        return { bg: 'bg-zinc-800/80 text-zinc-300 border border-zinc-700/50', label: 'Ingreso Web', icon: Users };
      case 'click_servicios':
        return { bg: 'bg-blue-500/10 text-blue-400 border border-blue-500/20', label: 'Ver Servicios', icon: BookOpen };
      case 'inicio_reserva':
        return { bg: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20', label: 'Inició Cotizador', icon: ArrowRightLeft };
      case 'reserva_completada':
        return { bg: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse', label: 'Reserva Realizada!', icon: CheckCircle2 };
      case 'click_galeria':
        return { bg: 'bg-amber-500/10 text-amber-400 border border-amber-500/20', label: 'Ver Galería', icon: Compass };
      case 'click_faq':
        return { bg: 'bg-purple-500/10 text-purple-400 border border-purple-500/20', label: 'Consultó FAQs', icon: HelpCircle };
    }
  };

  const isVerifiedAdmin = currentUser && isUserAdmin(currentUser);

  return (
    <div className="space-y-8 animate-fade-in relative">
      {/* Absolute Loading Bar Overlay */}
      {loadingCloud && (
        <div className="fixed top-0 left-0 w-full h-1 bg-emerald-500/20 z-[999]">
          <div className="h-full bg-emerald-500 animate-[pulse_1s_infinite] w-1/3 rounded-full" />
        </div>
      )}

      {/* Cloud Synchronisation Management Banner */}
      <div className="bg-zinc-900 border border-white/5 rounded-3xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 blur-3xl rounded-full" />
        <div className="flex items-start gap-4 z-10">
          <div className={`p-3 rounded-2xl ${isVerifiedAdmin ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'} border border-white/5`}>
            {isVerifiedAdmin ? (
              <Database className="w-6 h-6 animate-pulse" />
            ) : (
              <CloudLightning className="w-6 h-6" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display font-black text-sm italic uppercase tracking-wider text-white">
                {isVerifiedAdmin ? '🟢 Telemetría en la Nube Activada' : '🔵 Base de Datos en Modo Vista Local'}
              </h3>
              <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${isVerifiedAdmin ? 'bg-emerald-500 text-night' : 'bg-zinc-800 text-zinc-400'}`}>
                {isVerifiedAdmin ? 'Firestore' : 'Offline'}
              </span>
            </div>
            <p className="text-zinc-500 text-xs font-medium max-w-xl mt-1">
              {isVerifiedAdmin 
                ? `¡Hola, leandro.saralegui@gmail.com! Estás conectado al proyecto "${firebaseConfig.projectId}" con Firebase Firestore en tiempo real.` 
                : 'Mostrando métricas simuladas del navegador. Iniciá sesión con tu cuenta de Administrador registrada para sincronizar con Cloud Firestore.'
              }
            </p>
          </div>
        </div>

        <div className="flex gap-2 w-full md:w-auto shrink-0 z-10">
          {currentUser && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
              {!isVerifiedAdmin && (
                <span className="text-[9px] font-black text-red-400 uppercase tracking-widest self-center text-center">
                  ⚠️ "{currentUser.email}" sin permisos
                </span>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center justify-center gap-2 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 border border-white/5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest active:scale-95 transition-all"
              >
                <LogOut className="w-4 h-4" /> Desconectarse
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Auth Assistant for Offline / Non-authenticated admins */}
      {!currentUser && (
        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 space-y-4">
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
            <div className="space-y-1">
              <h4 className="font-display font-black text-xs uppercase tracking-wider text-zinc-300">
                Opciones de Acceso de Administrador
              </h4>
              <p className="text-[11px] text-zinc-500 font-medium max-w-xl leading-relaxed">
                Seleccioná el método de autenticación preferido para conectar con tu panel. Si estás en Safari móvil u otro entorno de seguridad estricta, te recomendamos probar ambos métodos o abrir la app de forma independiente.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
              <div className="flex bg-zinc-950 border border-white/5 p-1 rounded-xl text-[10px] uppercase font-black tracking-widest">
                <button
                  type="button"
                  onClick={() => setPreferredMethod('popup')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${preferredMethod === 'popup' ? 'bg-emerald-500 text-night' : 'text-zinc-500 hover:text-zinc-200'}`}
                >
                  Popup
                </button>
                <button
                  type="button"
                  onClick={() => setPreferredMethod('redirect')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${preferredMethod === 'redirect' ? 'bg-emerald-500 text-night' : 'text-zinc-500 hover:text-zinc-200'}`}
                >
                  Redirect
                </button>
              </div>

              <button
                onClick={loginWithGoogle}
                disabled={loadingCloud}
                className="flex-1 xl:flex-none flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-night shadow-lg shadow-emerald-500/10 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest active:scale-95 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5 animate-bounce" /> Conectar con Google
              </button>
            </div>
          </div>

          {/* Iframe environmental caution warning */}
          {isIframe && (
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-amber-400 font-black uppercase tracking-wider text-[10px]">
                  <AlertTriangle className="w-4 h-4" /> Entorno de Visor Detectado (Iframe)
                </div>
                <p className="text-zinc-400 leading-relaxed font-semibold text-[11px]">
                  Estás visualizando el sistema dentro de un frame o simulador de AI Studio. Los navegadores móviles bloquean el inicio de sesión de Google por seguridad dentro de iframes.
                </p>
              </div>
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-night px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-center"
              >
                Abrir en Pestaña Independiente ↗
              </a>
            </div>
          )}

          {/* Error Diagnostics Assistant */}
          {authError && (
            <div className="bg-red-500/5 border border-red-500/10 p-5 rounded-2xl text-left space-y-3 text-xs leading-relaxed">
              <div className="flex items-center gap-2 font-black uppercase tracking-widest text-[10px] text-red-400">
                <AlertTriangle className="w-4 h-4" /> Asistente de Diagnóstico de Error
              </div>
              <p className="font-semibold text-zinc-300">
                Error de Firebase: <code className="bg-zinc-950 px-2 py-1 rounded text-red-400 text-xs font-mono">{authError}</code>
              </p>
              
              <div className="text-zinc-400 space-y-3 pt-3 border-t border-white/[0.04]">
                <div>
                  <p className="font-black text-[10px] text-zinc-300 uppercase tracking-wider mb-1">🔗 Dominio Actual del Navegador:</p>
                  <p className="font-semibold text-white bg-zinc-950 p-2 rounded border border-white/5 inline-block font-mono">
                    {window.location.hostname}
                  </p>
                </div>

                <div className="space-y-2 mt-2">
                  <p className="font-bold text-zinc-300">💡 ¿Cómo solucionar este error de forma inmediata y automática?</p>
                  {authError.includes('auth/unauthorized-domain') || authError.includes('unauthorized') ? (
                    <div className="space-y-3.5 pl-3 border-l-2 border-emerald-500/35 text-zinc-400">
                      <p>
                        <strong>¡Buenas noticias!</strong> Como configuramos tu propio proyecto de Firebase (<strong className="text-emerald-400 font-mono">lyslavados-41b48</strong>), tenés control absoluto para autorizar los dominios que quieras desde tu consola.
                      </p>
                      <div className="bg-zinc-950 p-4 rounded-xl border border-white/5 space-y-3">
                        <p className="text-[11px] font-bold text-white uppercase tracking-wider">🛠️ Pasos para solucionarlo en 1 minuto:</p>
                        <ol className="list-decimal pl-4 space-y-2 text-[11px]">
                          <li>
                            Entrá a la configuración de Authentication de tu proyecto: <br/>
                            <a 
                              href="https://console.firebase.google.com/project/lyslavados-41b48/authentication/settings"
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-emerald-400 underline hover:text-emerald-300 font-semibold"
                            >
                              Ir a Firebase Console ➔
                            </a>
                          </li>
                          <li>
                            Buscá la sección de <strong>"Dominios autorizados"</strong> (Authorized domains) abajo del todo.
                          </li>
                          <li>
                            Hacé clic en **"Agregar dominio"** e ingresá exactamente estos dominios uno por uno:
                            <ul className="list-disc pl-4 mt-1.5 space-y-1 text-zinc-400 font-mono text-[10px]">
                              <li><strong className="text-white bg-zinc-900 px-1.5 py-0.5 rounded">{window.location.hostname}</strong> (Dominio donde estás ahora)</li>
                              <li><strong className="text-white bg-zinc-900 px-1.5 py-0.5 rounded">lyslavados.com</strong> (Tu web oficial)</li>
                              <li><strong className="text-white bg-zinc-900 px-1.5 py-0.5 rounded">ais-pre-xhi2yqr5a2veqlnfganuuf-12804574784.us-east1.run.app</strong> (Vista compartida de AI Studio)</li>
                            </ul>
                          </li>
                        </ol>
                        <p className="text-[10px] text-zinc-500 italic font-medium leading-relaxed pt-1 border-t border-white/[0.03]">
                          Una vez guardado en Firebase, el botón de "Iniciar sesión con Google" va a funcionar de forma inmediata en todos estos sitios.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5 pl-3 border-l-2 border-amber-500/30">
                      <p>• Si estás en tu celular y al tocar el botón abre una pestaña que se cierra al instante, cambiá el método a <strong className="text-white">"Redirect"</strong> arriba.</p>
                      <p>• Si estás dentro de AI Studio, tocá el botón superior de <strong className="text-amber-400">"Abrir en Pestaña Independiente"</strong> de arriba para salir del visor iframe y loguearte de manera normal.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 🔮 Expanded/Collapsed Integration & Sync settings */}
      {isVerifiedAdmin && (
        <div className="mb-8">
          <button
            type="button"
            onClick={() => setShowIntegrationSettings(!showIntegrationSettings)}
            className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 bg-zinc-950 border border-white/5 px-6 py-4 rounded-[2rem] hover:bg-zinc-900 transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/10 shrink-0">
                <Settings className={`w-5 h-5 ${showIntegrationSettings ? 'rotate-45' : ''} transition-transform duration-500`} />
              </div>
              <div className="text-left">
                <h4 className="font-display font-black text-xs italic uppercase tracking-wider text-white">
                  Vinculación e Integraciones Avanzadas
                </h4>
                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-wider mt-0.5">
                  Telegram Bot, Google Sheets, etc. (Ocultos para mayor comodidad)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/5 group-hover:bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl transition-all">
              {showIntegrationSettings ? 'Ocultar Opciones ▲' : 'Mostrar Opciones ▼'}
            </div>
          </button>

          {showIntegrationSettings && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 p-4 bg-black/20 rounded-[2.5rem] border border-white/[0.02]">
              {/* Telegram Panel */}
              <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 blur-2xl rounded-full" />
                <div className="flex flex-col gap-5 z-10 relative">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20 shrink-0">
                        <Send className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="font-display font-black text-sm italic uppercase tracking-wider text-white">
                          Alertas por Telegram
                        </h4>
                        <p className="text-zinc-500 text-[11px] font-semibold mt-0.5">
                          Notificaciones instantáneas directamente en tu celular.
                        </p>
                      </div>
                    </div>

                    <label className="inline-flex items-center gap-3 cursor-pointer self-start sm:self-auto bg-zinc-950 px-4 py-2 rounded-2xl border border-white/5 shrink-0">
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                        {telegramEnabled ? '🔔 ON' : '🔕 OFF'}
                      </span>
                      <input 
                        type="checkbox" 
                        checked={telegramEnabled}
                        onChange={(e) => setTelegramEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="relative w-9 h-5 bg-zinc-850 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-zinc-500 after:border-zinc-400 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-night peer-checked:after:border-emerald-400"></div>
                    </label>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                        Token del Bot
                      </label>
                      <input 
                        type="text" 
                        placeholder="ej. 6849928192:AAHs8W..."
                        value={telegramToken}
                        onChange={(e) => setTelegramToken(e.target.value)}
                        className="w-full bg-zinc-950 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white font-mono placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                        ID de Chat o Grupo
                      </label>
                      <input 
                        type="text" 
                        placeholder="ej. -10023456789"
                        value={telegramChatId}
                        onChange={(e) => setTelegramChatId(e.target.value)}
                        className="w-full bg-zinc-950 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white font-mono placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-all"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 pt-2 border-t border-white/[0.03]">
                    <div className="text-[10px] text-zinc-500 font-semibold leading-relaxed">
                      💡 Buscá a <strong className="text-zinc-300">@BotFather</strong>, mandale <code className="bg-zinc-950 px-1 py-0.5 rounded text-white font-mono">/newbot</code> y copiá el Token.
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleTestTelegram}
                        className="flex-1 flex items-center justify-center gap-2 bg-zinc-950 hover:bg-zinc-900 border border-white/5 active:scale-95 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                        Prueba
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveTelegram}
                        disabled={savingTelegram}
                        className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-night font-bold shadow-lg shadow-emerald-500/10 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                      >
                        {savingTelegram ? '...' : 'Guardar'}
                      </button>
                    </div>
                  </div>

                  {testStatus.type !== 'idle' && (
                    <div className={`p-2.5 rounded-xl border text-[10px] font-semibold leading-relaxed ${
                      testStatus.type === 'success' 
                        ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400' 
                        : 'bg-red-500/5 border-red-500/10 text-red-400'
                    }`}>
                      {testStatus.message}
                    </div>
                  )}
                </div>
              </div>

              {/* Google Sheets Panel */}
              <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-2xl rounded-full" />
                <div className="flex flex-col gap-5 z-10 relative">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shrink-0">
                      <Database className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="font-display font-black text-sm italic uppercase tracking-wider text-white">
                        Sincronizador Google Sheets
                      </h4>
                      <p className="text-zinc-500 text-[11px] font-semibold mt-0.5">
                        Sincronizá tus listados de Excel/Sheets hacia la base de datos Firestore.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                        Enlace de Google Sheets (Público)
                      </label>
                      <input 
                        type="text" 
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        value={sheetUrl}
                        onChange={(e) => setSheetUrl(e.target.value)}
                        className="w-full bg-zinc-950 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white font-mono placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-all font-semibold"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 pt-2 border-t border-white/[0.03]">
                    <div className="text-[10px] text-zinc-500 font-semibold leading-relaxed">
                      💡 Compartí tu archivo como "Cualquier persona con el enlace puede leer".
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleImportSheets}
                        disabled={importingSheets || !sheetUrl.trim()}
                        className="flex-1 flex items-center justify-center p-2.5 rounded-xl bg-zinc-950 border border-white/5 hover:bg-zinc-900 text-zinc-200 text-[10px] font-black uppercase tracking-widest"
                      >
                        Sinc. Turnos
                      </button>
                      <button
                        type="button"
                        onClick={handleImportCaja}
                        disabled={importingSheets || !sheetUrl.trim()}
                        className="flex-1 flex items-center justify-center p-2.5 rounded-xl bg-emerald-500 text-night text-[10px] font-black uppercase tracking-widest hover:bg-emerald-400"
                      >
                        Sinc. Caja
                      </button>
                    </div>
                  </div>

                  {importResult.type !== 'idle' && (
                    <div className={`p-2.5 rounded-xl border text-[10px] font-semibold leading-relaxed ${
                      importResult.type === 'success' 
                        ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400' 
                        : 'bg-red-500/5 border-red-500/10 text-red-400'
                    }`}>
                      {importResult.message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.05] pb-6">
        <div>
          <h2 className="text-xl md:text-2xl font-display font-black italic tracking-tighter flex items-center gap-3">
            📍 MONITOREO DE <span className="text-emerald-500">MÉTRICAS</span>
          </h2>
          <p className="text-zinc-500 text-xs font-black uppercase tracking-widest mt-1">
            Análisis de visitas y conversión web en el último período
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button 
            onClick={refreshMetrics}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-white/5 active:scale-95 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
          >
            <RefreshCw className="w-4 h-4" /> Actualizar
          </button>
          <button 
            onClick={clearAllMetrics}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-500/10 active:scale-95 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
          >
            Reiniciar Historial
          </button>
        </div>
      </div>

      {/* KPI Dashboard Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-white/5 p-5 md:p-6 rounded-[2rem] relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 w-24 h-24 bg-emerald-500/5 blur-2xl rounded-full group-hover:scale-150 transition-transform duration-500" />
          <div className="flex justify-between items-start">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Visitas Totales</p>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl md:text-3xl font-display font-black italic text-white mt-2">
            {kpis.totalVisits.toLocaleString('es-AR')}
          </p>
          <p className="text-[9px] font-black uppercase tracking-widest text-[#10b981] mt-1 flex items-center gap-1">
            <span>+{kpis.visitsToday} hoy mismo</span>
          </p>
        </div>

        <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-white/5 p-5 md:p-6 rounded-[2rem] relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 w-24 h-24 bg-emerald-500/5 blur-2xl rounded-full group-hover:scale-150 transition-transform duration-500" />
          <div className="flex justify-between items-start">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Conversión Final</p>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl md:text-3xl font-display font-black italic text-emerald-500 mt-2">
            {kpis.convRate}%
          </p>
          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mt-1">
            visita a reserva exitosa
          </p>
        </div>

        <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-white/5 p-5 md:p-6 rounded-[2rem] relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 w-24 h-24 bg-emerald-500/5 blur-2xl rounded-full group-hover:scale-150 transition-transform duration-500" />
          <div className="flex justify-between items-start">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Hora de Mayor Tránsito</p>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl md:text-2xl font-display font-black italic text-white mt-3 truncate">
            {kpis.busyHour}
          </p>
          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mt-1">
            momento de más visitas
          </p>
        </div>

        <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-white/5 p-5 md:p-6 rounded-[2rem] relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 w-24 h-24 bg-emerald-500/5 blur-2xl rounded-full group-hover:scale-150 transition-transform duration-500" />
          <div className="flex justify-between items-start">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Dispositivo Principal</p>
            <Smartphone className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl md:text-3xl font-display font-black italic text-white mt-2">
            {kpis.dominantDevice}
          </p>
          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mt-1">
            {Math.round((kpis.deviceBreakdown.mobile / (kpis.totalVisits || 1)) * 100)}% de accesos móviles
          </p>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Visitors Evolution Graph (Area) */}
        <div className="bg-zinc-900 border border-white/5 p-6 rounded-[2.5rem] lg:col-span-8 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-display font-black italic text-white uppercase tracking-tight flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" /> Flujo de Tránsito por Día
            </h3>
            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Tráfico comparativo entre accesos básicos y reservas de turnos</p>
          </div>
          <div className="h-[260px] w-full mt-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={last7DaysChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVisitas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorReservas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="label" 
                  stroke="#52525b" 
                  fontSize={9} 
                  fontWeight="bold" 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#52525b" 
                  fontSize={9} 
                  fontWeight="bold" 
                  tickLine={false} 
                  axisLine={false} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
                  labelStyle={{ color: '#fff', fontFamily: 'sans-serif', fontWeight: 'bold', fontSize: '12px' }}
                />
                <Area 
                  type="monotone" 
                  name="Visitas" 
                  dataKey="visitas" 
                  stroke="#10b981" 
                  strokeWidth={2} 
                  fillOpacity={1} 
                  fill="url(#colorVisitas)" 
                />
                <Area 
                  type="monotone" 
                  name="Reservas Hechas" 
                  dataKey="reservas" 
                  stroke="#34d399" 
                  strokeWidth={3} 
                  fillOpacity={1} 
                  fill="url(#colorReservas)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Device Breakdown stats (Progress bar based styling) */}
        <div className="bg-zinc-900 border border-white/5 p-6 rounded-[2.5rem] lg:col-span-4 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-display font-black italic text-white uppercase tracking-tight flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-500" /> Dispositivos de Acceso
            </h3>
            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Desde dónde entran los clientes</p>
          </div>

          <div className="space-y-6 my-6">
            <div>
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="flex items-center gap-2 font-black text-white"><Smartphone className="w-3.5 h-3.5 text-emerald-400" /> CELULARES</span>
                <span className="font-display font-black italic text-emerald-400">
                  {kpis.deviceBreakdown.mobile} (
                  {kpis.totalVisits > 0 ? Math.round((kpis.deviceBreakdown.mobile / kpis.totalVisits) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-3 bg-black/40 rounded-full border border-white/[0.05] overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-1000" 
                  style={{ width: `${kpis.totalVisits > 0 ? (kpis.deviceBreakdown.mobile / kpis.totalVisits) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="flex items-center gap-2 font-black text-zinc-300"><Monitor className="w-3.5 h-3.5 text-blue-400" /> COMPUTADORAS</span>
                <span className="font-display font-black italic text-blue-400">
                  {kpis.deviceBreakdown.desktop} (
                  {kpis.totalVisits > 0 ? Math.round((kpis.deviceBreakdown.desktop / kpis.totalVisits) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-3 bg-black/40 rounded-full border border-white/[0.05] overflow-hidden">
                <div 
                  className="bg-blue-500 h-full rounded-full transition-all duration-1000" 
                  style={{ width: `${kpis.totalVisits > 0 ? (kpis.deviceBreakdown.desktop / kpis.totalVisits) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="flex items-center gap-2 font-black text-zinc-300"><Monitor className="w-3.5 h-3.5 text-purple-400 rotate-90" /> TABLETS</span>
                <span className="font-display font-black italic text-purple-400">
                  {kpis.deviceBreakdown.tablet} (
                  {kpis.totalVisits > 0 ? Math.round((kpis.deviceBreakdown.tablet / kpis.totalVisits) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-3 bg-black/40 rounded-full border border-white/[0.05] overflow-hidden">
                <div 
                  className="bg-purple-500 h-full rounded-full transition-all duration-1000" 
                  style={{ width: `${kpis.totalVisits > 0 ? (kpis.deviceBreakdown.tablet / kpis.totalVisits) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.03] pt-4 text-center text-zinc-500 text-[10px] font-black uppercase tracking-widest">
            Ajustado automáticamente al tipo de dispositivo del cliente
          </div>
        </div>
      </div>

      {/* Hourly distribution and Conversion Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Hourly peaks (BarChart) */}
        <div className="bg-zinc-900 border border-white/5 p-6 rounded-[2.5rem] lg:col-span-6">
          <h3 className="text-base font-display font-black italic text-white uppercase tracking-tight flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-emerald-500" /> Tránsito por hora detallada
          </h3>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-6">Identifica las horas de mayor concentración de interesados</p>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyChartData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                <XAxis 
                  dataKey="hourLabel" 
                  stroke="#52525b" 
                  fontSize={8} 
                  fontWeight="bold" 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#52525b" 
                  fontSize={9} 
                  fontWeight="bold" 
                  tickLine={false} 
                  axisLine={false} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
                  labelStyle={{ color: '#fff', fontFamily: 'sans-serif', fontWeight: 'bold' }}
                  cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }}
                />
                <Bar dataKey="visitas" fill="#10b981" radius={[4, 4, 0, 0]}>
                  {hourlyChartData.map((entry, index) => {
                    const isBusiest = entry.visitas === Math.max(...hourlyChartData.map(h => h.visitas));
                    return (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={isBusiest ? '#34d399' : '#10b981'} 
                        fillOpacity={isBusiest ? 1 : 0.6}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Funnel chart (Horizontal Custom Bars) */}
        <div className="bg-zinc-900 border border-white/5 p-6 rounded-[2.5rem] lg:col-span-6 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-display font-black italic text-white uppercase tracking-tight flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-emerald-500" /> Embudo de Conversión
            </h3>
            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-6">Eficiencia de retención del usuario desde el home hasta contratar</p>
          </div>

          <div className="space-y-4">
            {funnelChartData.map((item, index) => (
              <div key={item.name} className="flex flex-col">
                <div className="flex justify-between items-center text-xs mb-1 font-bold">
                  <span className="text-zinc-300">{item.name}</span>
                  <div className="flex gap-4">
                    <span className="text-zinc-500">{item.valor} pasos</span>
                    <span className="text-emerald-400 font-display font-black italic">{item.rate}</span>
                  </div>
                </div>
                <div className="w-full h-2 rounded-full bg-black/40 border border-white/[0.05] overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ 
                      width: item.rate,
                      backgroundColor: item.fill 
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-white/[0.03] pt-4 mt-6 text-center text-zinc-500 text-[9px] font-black uppercase tracking-widest">
            Apunta a un embudo sano aumentando el click rate con promociones o FAQs claras.
          </div>
        </div>
      </div>

      {/* Chronological Visits detail (Day, Hour, Minute tracker) */}
      <div className="bg-zinc-900 border border-white/5 rounded-[2.5rem] overflow-hidden">
        <div className="p-6 border-b border-white/[0.04] bg-zinc-900/40 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-display font-black italic text-white uppercase tracking-tight flex items-center gap-2">
              <BookMarked className="w-4 h-4 text-emerald-500" /> Registro de Actividades en Vivo (Día, hora y minuto)
            </h3>
            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mt-0.5">Seguimiento detallado en tiempo real de cada interacción en la web</p>
          </div>

          {/* Quick Search Log */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Buscar por dispositivo, fecha..." 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setLogPage(0); // reset page
              }}
              className="bg-black/40 border border-white/10 rounded-full pl-10 pr-6 py-2 text-xs text-white max-w-xs focus:border-emerald-500 outline-none transition-all placeholder:text-zinc-600 font-bold"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/5 text-[9px] font-black uppercase tracking-widest text-zinc-500 bg-black/10">
                <th className="px-6 py-4">Fecha y Hora</th>
                <th className="px-6 py-4">Evento / Interacción</th>
                <th className="px-6 py-4">Dispositivo</th>
                <th className="px-6 py-4">Sección de la Web</th>
                <th className="px-6 py-4">Identificador de Sesión</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLogs.map((log) => {
                const style = getActionStyles(log.type);
                const { dateStr, timeStr } = formatWithTime(log.timestamp);
                const LogIcon = style?.icon || Users;

                return (
                  <tr key={log.id} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-white">{dateStr}</span>
                        <span className="text-zinc-500 font-mono text-[10px] mt-0.5">{timeStr}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${style?.bg}`}>
                        <LogIcon className="w-3 h-3 shrink-0" />
                        {style?.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-zinc-300 font-bold flex items-center gap-1">
                        {log.device === 'Mobile' ? <Smartphone className="w-3 h-3 text-emerald-400" /> : <Monitor className="w-3 h-3 text-zinc-500" />}
                        {log.device}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-[10px] text-zinc-400">
                      {log.path || '/'}
                    </td>
                    <td className="px-6 py-4 font-mono text-[10px] text-zinc-600">
                      {log.id}
                    </td>
                  </tr>
                );
              })}

              {paginatedLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center p-12 text-zinc-500 italic">
                    Sin eventos registrados que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginated Log Controls */}
        {maxLogPages > 1 && (
          <div className="p-4 bg-black/10 border-t border-white/[0.03] flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Registros {logPage * itemsPerPage + 1} - {Math.min((logPage + 1) * itemsPerPage, filteredTracesLog.length)} de {filteredTracesLog.length}
            </span>
            <div className="flex gap-1">
              <button 
                disabled={logPage === 0}
                onClick={() => setLogPage(prev => Math.max(0, prev - 1))}
                className="px-3 py-1.5 bg-zinc-800 text-white rounded-lg hover:bg-zinc-750 disabled:opacity-30 disabled:hover:bg-zinc-840 text-[10px] font-black uppercase tracking-widest transition-all"
              >
                Anterior
              </button>
              <button 
                disabled={logPage >= maxLogPages - 1}
                onClick={() => setLogPage(prev => Math.min(maxLogPages - 1, prev + 1))}
                className="px-3 py-1.5 bg-emerald-500 text-night rounded-lg hover:bg-emerald-400 disabled:opacity-30 disabled:hover:bg-emerald-620 text-[10px] font-black uppercase tracking-widest transition-all"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
