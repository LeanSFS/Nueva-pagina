import React, { useState } from 'react';
import { Sparkles, Send, Mic, MicOff, CheckCircle2, RotateCcw, AlertCircle, Bot, Wallet, Calendar, ArrowRight, Tag } from 'lucide-react';
import { firestoreService, Movement, Booking, CatalogService } from '../services/firestoreService.ts';

interface AdminAssistantProps {
  onRefreshMovements: () => Promise<void> | void;
  onRefreshBookings: () => Promise<void> | void;
  onNavigateTab: (tab: 'agenda' | 'caja' | 'stats' | 'metrics' | 'catalog' | 'gallery') => void;
  allMovements: Movement[];
  bookings: Booking[];
  services?: CatalogService[];
}

interface ActionResult {
  id: string;
  type: 'ADD_MOVEMENT' | 'BLOCK_SLOT' | 'UNBLOCK_SLOT' | 'NAVIGATE_TAB' | 'QUERY_SUMMARY' | 'UPDATE_SERVICE_PRICE' | 'UNKNOWN';
  title: string;
  details: string;
  timestamp: string;
  payload?: any;
  undoData?: {
    type: 'delete_movement' | 'delete_booking' | 'restore_slot';
    id: string;
    fecha?: string;
    hora?: string;
  };
}

export default function AdminAssistant({
  onRefreshMovements,
  onRefreshBookings,
  onNavigateTab,
  allMovements,
  bookings,
  services = []
}: AdminAssistantProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [recentResult, setRecentResult] = useState<ActionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [queryTextResult, setQueryTextResult] = useState<string | null>(null);

  // Local Fast Parser for Instant zero-latency execution
  const parseLocally = (text: string): { action: string; payload: any; message: string; suggestedTab?: string } | null => {
    const lower = text.toLowerCase().trim();

    // 1. ADD MOVEMENT (Caja)
    // Matches patterns like "añadí un lavado full por 40mil hoy", "agrega ingreso 25000", "gasto 15000 insumos"
    const isAdd = lower.includes('añad') || lower.includes('agreg') || lower.includes('registr') || lower.includes('ingres') || lower.includes('gasto') || lower.includes('+') || lower.includes('-');
    if (isAdd) {
      // Determine type
      const isGasto = lower.includes('gasto') || lower.includes('compra') || lower.includes('pago') || lower.includes('-');
      const tipo: 'Ingreso' | 'Gasto' = isGasto ? 'Gasto' : 'Ingreso';

      // Parse amount (40mil, 40k, $40.000, 40000)
      let monto = 0;
      const kMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:mil|k)/);
      if (kMatch) {
        monto = Math.round(parseFloat(kMatch[1].replace(',', '.')) * 1000);
      } else {
        const numMatch = lower.match(/\$?\s*(\d{1,3}(?:\.\d{3})*|\d+)/);
        if (numMatch) {
          const rawNum = numMatch[1].replace(/\./g, '');
          monto = parseInt(rawNum, 10);
        }
      }

      if (monto > 0) {
        // Date parsing
        const today = new Date();
        let targetDate = today.toISOString().split('T')[0];
        if (lower.includes('ayer')) {
          const d = new Date(today);
          d.setDate(d.getDate() - 1);
          targetDate = d.toISOString().split('T')[0];
        } else if (lower.includes('mañana')) {
          const d = new Date(today);
          d.setDate(d.getDate() + 1);
          targetDate = d.toISOString().split('T')[0];
        }

        // Category & Concept parsing
        let categoria = isGasto ? 'Insumos' : 'Lavado';
        if (lower.includes('detailing') || lower.includes('acrílico') || lower.includes('cerámico') || lower.includes('pulido')) {
          categoria = 'Detailing';
        } else if (lower.includes('servicio') || lower.includes('luz') || lower.includes('alquiler')) {
          categoria = 'Servicios Fijos';
        }

        let concepto = isGasto ? 'Compra de Insumos' : 'Lavado Automotriz';
        if (lower.includes('lavado full')) concepto = 'Lavado Full';
        else if (lower.includes('lavado exterior')) concepto = 'Lavado Exterior';
        else if (lower.includes('interior') && lower.includes('exterior')) concepto = 'Lavado Full';
        else if (lower.includes('tapizado')) concepto = 'Limpieza de Tapizados';
        else if (lower.includes('vidrio')) concepto = 'Tratamiento de Vidrios';
        else if (lower.includes('insumo') || lower.includes('shampoo') || lower.includes('microfibra')) concepto = 'Insumos de Detailing';

        // Payment method
        let medio = 'Efectivo';
        if (lower.includes('transferencia') || lower.includes('transf')) medio = 'Transferencia';
        else if (lower.includes('mercado pago') || lower.includes('mp')) medio = 'Mercado Pago';
        else if (lower.includes('tarjeta')) medio = 'Tarjeta';

        // Status
        const estado = lower.includes('pendiente') || lower.includes('debe') ? 'Pendiente' : 'Pagado';

        return {
          action: 'ADD_MOVEMENT',
          payload: {
            tipo,
            concepto,
            monto_ars: monto,
            categoria,
            medio,
            estado,
            fecha: targetDate
          },
          message: `✅ ${tipo} registrado: ${concepto} por $${monto.toLocaleString('es-AR')} en Caja.`,
          suggestedTab: 'caja'
        };
      }
    }

    // 2. BLOCK / UNBLOCK AGENDA
    if (lower.includes('bloque') || lower.includes('liber') || lower.includes('desbloque')) {
      const isUnblock = lower.includes('liber') || lower.includes('desbloque');
      const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(?:hs|hrs|h)?/);
      let hora = '14:00';
      if (timeMatch) {
        const h = parseInt(timeMatch[1], 10);
        hora = `${String(h).padStart(2, '0')}:00`;
      }

      const today = new Date();
      let fecha = today.toISOString().split('T')[0];
      if (lower.includes('mañana')) {
        const d = new Date(today);
        d.setDate(d.getDate() + 1);
        fecha = d.toISOString().split('T')[0];
      }

      return {
        action: isUnblock ? 'UNBLOCK_SLOT' : 'BLOCK_SLOT',
        payload: { fecha, hora, motivo: 'Bloqueado por asistente Admin' },
        message: isUnblock ? `🔓 Horario ${hora} liberado para la fecha ${fecha}.` : `🔒 Turno de las ${hora} del ${fecha} bloqueado exitosamente.`,
        suggestedTab: 'agenda'
      };
    }

    // 3. NAVIGATION
    if (lower.includes('ir a') || lower.includes('abrir') || lower.includes('ver')) {
      if (lower.includes('caja') || lower.includes('movimiento') || lower.includes('dinero')) {
        return { action: 'NAVIGATE_TAB', payload: { tab: 'caja' }, message: 'Navegando a la pestaña Caja...' };
      }
      if (lower.includes('agenda') || lower.includes('turno') || lower.includes('horario')) {
        return { action: 'NAVIGATE_TAB', payload: { tab: 'agenda' }, message: 'Navegando a la Agenda...' };
      }
      if (lower.includes('precio') || lower.includes('catálogo') || lower.includes('catalogo')) {
        return { action: 'NAVIGATE_TAB', payload: { tab: 'catalog' }, message: 'Navegando a Precios...' };
      }
      if (lower.includes('estadística') || lower.includes('métrica') || lower.includes('rendimiento')) {
        return { action: 'NAVIGATE_TAB', payload: { tab: 'stats' }, message: 'Navegando a Métricas...' };
      }
    }

    // 4. QUERY TOTALS / SUMMARY
    if (lower.includes('cuanto') || lower.includes('cuánto') || lower.includes('total') || lower.includes('saldo')) {
      const todayStr = new Date().toISOString().split('T')[0];
      const todayMovements = allMovements.filter(m => m.fecha === todayStr);
      const ingresosHoy = todayMovements.filter(m => m.tipo === 'Ingreso').reduce((a, b) => a + (Number(b.monto_ars) || 0), 0);
      const gastosHoy = todayMovements.filter(m => m.tipo === 'Gasto').reduce((a, b) => a + (Number(b.monto_ars) || 0), 0);
      const netHoy = ingresosHoy - gastosHoy;

      return {
        action: 'QUERY_SUMMARY',
        payload: {
          text: `📊 Resumen de Caja de Hoy (${todayStr}):\n• Ingresos: $${ingresosHoy.toLocaleString('es-AR')}\n• Gastos: $${gastosHoy.toLocaleString('es-AR')}\n• Saldo Neto: $${netHoy.toLocaleString('es-AR')} (${todayMovements.length} movimientos registrados)`
        },
        message: 'Resumen de caja generado.',
        suggestedTab: 'caja'
      };
    }

    return null;
  };

  const handleExecuteCommand = async (cmdToRun?: string) => {
    const text = (cmdToRun || prompt).trim();
    if (!text) return;

    setLoading(true);
    setErrorMsg(null);
    setQueryTextResult(null);

    try {
      // 1. Try local parser first for instant response
      let parsed = parseLocally(text);

      // 2. If local parser couldn't parse, call AI Server endpoint
      if (!parsed) {
        try {
          const todayStr = new Date().toISOString().split('T')[0];
          const res = await fetch('/api/admin/assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: text,
              context: {
                today: todayStr,
                movementsCount: allMovements.length,
                bookingsCount: bookings.length,
                services: services.map(s => ({ name: s.name, price: s.basePrice }))
              }
            })
          });

          if (res.ok) {
            parsed = await res.json();
          }
        } catch (apiErr) {
          console.warn('API call fallback error, using query fallback:', apiErr);
        }
      }

      if (!parsed || parsed.action === 'UNKNOWN') {
        const textResp = parsed?.payload?.text || `Recibí la instrucción: "${text}". ¿Podrías ser más específico? Por ejemplo: "Añadí un lavado full por 40mil hoy" o "Bloqueá las 14hs hoy".`;
        setQueryTextResult(textResp);
        setLoading(false);
        return;
      }

      // Execute Action
      const timestamp = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

      if (parsed.action === 'ADD_MOVEMENT') {
        const payload = parsed.payload;
        const movId = `mov_${Date.now()}_ai`;
        const newMov: Movement = {
          id: movId,
          fecha: payload.fecha || new Date().toISOString().split('T')[0],
          tipo: payload.tipo || 'Ingreso',
          categoria: payload.categoria || 'Lavado',
          concepto: payload.concepto || 'Lavado Automotriz',
          monto_ars: Number(payload.monto_ars) || 0,
          medio: payload.medio || 'Efectivo',
          estado: payload.estado || 'Pagado',
          factura: '',
          cliente: payload.cliente || '',
          notas: 'Registrado por Asistente IA'
        };

        await firestoreService.saveMovement(newMov);
        await onRefreshMovements();

        setRecentResult({
          id: movId,
          type: 'ADD_MOVEMENT',
          title: `Movimiento Registrado (${newMov.tipo})`,
          details: `${newMov.concepto} - $${newMov.monto_ars.toLocaleString('es-AR')} (${newMov.medio}) - Fecha: ${newMov.fecha}`,
          timestamp,
          payload: newMov,
          undoData: { type: 'delete_movement', id: movId }
        });

        if (parsed.suggestedTab) {
          onNavigateTab(parsed.suggestedTab as any);
        }
      } else if (parsed.action === 'BLOCK_SLOT') {
        const { fecha, hora, motivo } = parsed.payload;
        const bookingId = `block_${Date.now()}`;
        const newBooking: Booking = {
          id: bookingId,
          fecha,
          hora,
          nombre: `🔒 BLOQUEADO (${motivo || 'Admin'})`,
          telefono: '0000000000',
          tipo: 'Auto',
          servicio: 'Bloqueo Admin',
          estado: 'confirmado',
          direccion: 'Taller',
          blockedSlots: [hora]
        };

        await firestoreService.createBooking(newBooking, true);
        await onRefreshBookings();

        setRecentResult({
          id: bookingId,
          type: 'BLOCK_SLOT',
          title: 'Horario Bloqueado',
          details: `Fecha: ${fecha} - Hora: ${hora} hs`,
          timestamp,
          undoData: { type: 'delete_booking', id: bookingId, fecha, hora }
        });

        if (parsed.suggestedTab) {
          onNavigateTab(parsed.suggestedTab as any);
        }
      } else if (parsed.action === 'UNBLOCK_SLOT') {
        const { fecha, hora } = parsed.payload;
        // Find blocked booking
        const existing = bookings.find(b => b.fecha === fecha && b.hora === hora && (b.nombre.includes('BLOQUEADO') || b.estado === 'cancelado'));
        if (existing) {
          await firestoreService.deleteBooking(existing.id, fecha, hora);
          await onRefreshBookings();
        }

        setRecentResult({
          id: `unblock_${Date.now()}`,
          type: 'UNBLOCK_SLOT',
          title: 'Horario Liberado',
          details: `Fecha: ${fecha} - Hora: ${hora} hs`,
          timestamp
        });

        if (parsed.suggestedTab) {
          onNavigateTab(parsed.suggestedTab as any);
        }
      } else if (parsed.action === 'NAVIGATE_TAB') {
        const tab = parsed.payload.tab;
        onNavigateTab(tab);
        setRecentResult({
          id: `nav_${Date.now()}`,
          type: 'NAVIGATE_TAB',
          title: 'Pestaña Cambiada',
          details: `Se abrió la vista: ${tab.toUpperCase()}`,
          timestamp
        });
      } else if (parsed.action === 'QUERY_SUMMARY') {
        setQueryTextResult(parsed.payload.text || parsed.message);
        if (parsed.suggestedTab) {
          onNavigateTab(parsed.suggestedTab as any);
        }
      }

      setPrompt('');
    } catch (err: any) {
      console.error('Error executing assistant command:', err);
      setErrorMsg(err.message || 'Error al ejecutar el comando con el asistente.');
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async () => {
    if (!recentResult || !recentResult.undoData) return;
    const { type, id, fecha, hora } = recentResult.undoData;
    setLoading(true);

    try {
      if (type === 'delete_movement') {
        await firestoreService.deleteMovement(id);
        await onRefreshMovements();
      } else if (type === 'delete_booking' && fecha && hora) {
        await firestoreService.deleteBooking(id, fecha, hora);
        await onRefreshBookings();
      }
      setRecentResult(null);
    } catch (e: any) {
      setErrorMsg('Error al deshacer la acción: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMsg('Tu navegador no soporta el reconocimiento de voz directo. Podés escribir el comando.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'es-AR';
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setPrompt(transcript);
          handleExecuteCommand(transcript);
        }
      };

      recognition.start();
    } catch (e) {
      setIsListening(false);
    }
  };

  return (
    <div className="bg-zinc-900/90 border border-emerald-500/30 rounded-3xl p-5 md:p-7 shadow-2xl backdrop-blur-xl mb-8 relative overflow-hidden group transition-all duration-300">
      {/* Background ambient lighting */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10 shrink-0">
            <Bot className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg md:text-xl font-display font-black italic tracking-tight text-white uppercase">
                Asistente de IA <span className="text-emerald-400">Admin</span>
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                ACTIVO 🤖
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-medium">
              Escribí o dictá comandos rápidos para la <strong className="text-zinc-200">Caja</strong>, <strong className="text-zinc-200">Agenda</strong> o consultas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-zinc-400">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>Control Inteligente</span>
        </div>
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleExecuteCommand();
        }}
        className="flex items-center gap-2.5 relative"
      >
        <div className="relative flex-1">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder='Ej: "añadí un lavado full por 40mil hoy", "bloqueá las 14hs hoy", "resumen de caja"'
            disabled={loading}
            className="w-full bg-zinc-950/80 border border-white/20 focus:border-emerald-500/60 rounded-2xl py-3.5 pl-4 pr-12 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium"
          />
          <button
            type="button"
            onClick={toggleVoiceInput}
            title="Dictar comando por voz"
            className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all ${
              isListening ? 'bg-red-500 text-white animate-bounce' : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        </div>

        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-display font-black italic px-5 py-3.5 rounded-2xl text-xs uppercase tracking-wider flex items-center gap-2 shrink-0 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span>Ejecutar</span>
              <Send className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Error display */}
      {errorMsg && (
        <div className="mt-4 p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Text Result Display (Queries / Answers) */}
      {queryTextResult && (
        <div className="mt-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-zinc-100 text-xs font-medium leading-relaxed whitespace-pre-line relative">
          <div className="flex items-center justify-between mb-1 text-emerald-400 font-bold uppercase tracking-wider text-[10px]">
            <span>💡 Respuesta del Asistente:</span>
            <button
              onClick={() => setQueryTextResult(null)}
              className="text-zinc-400 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>
          <p className="text-sm font-semibold text-emerald-100">{queryTextResult}</p>
        </div>
      )}

      {/* Execution Result Banner / Undo Card */}
      {recentResult && (
        <div className="mt-4 p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-white text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-black italic uppercase text-emerald-400 text-xs">
                  {recentResult.title}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">[{recentResult.timestamp}]</span>
              </div>
              <p className="text-zinc-200 font-medium text-xs mt-0.5">{recentResult.details}</p>
            </div>
          </div>

          {recentResult.undoData && (
            <button
              onClick={handleUndo}
              disabled={loading}
              className="self-end sm:self-center px-3 py-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-white/20 text-zinc-300 hover:text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0 transition-all cursor-pointer active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Deshacer</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
