import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, 
  Clock, 
  User, 
  Phone, 
  Package, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  X,
  Plus,
  Loader2,
  Lock,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Grid,
  ListFilter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { firestoreService, Booking } from '../services/firestoreService.ts';
import { fetchSlots, clearCache } from '../services/availabilityService.ts';

export default function AdminAgenda({ customerVisits = {} }: { customerVisits?: Record<string, number> }) {
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<'dia' | 'semana'>('semana');
  const [blockingTime, setBlockingTime] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const loadBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await firestoreService.getBookings();
      // Sort bookings chronologically by hour
      const sorted = data.sort((a, b) => a.hora.localeCompare(b.hora));
      setAllBookings(sorted);
    } catch (err) {
      console.error('Error loading agenda from Firestore:', err);
      setError('No tienes permisos suficientes de Firestore o hay un error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  // Compute week range (Monday to Sunday) based on filterDate
  const weekDays = useMemo(() => {
    if (!filterDate) return [];
    const parts = filterDate.split('-').map(Number);
    if (parts.length !== 3) return [];
    const curr = new Date(parts[0], parts[1] - 1, parts[2]);
    const dayOfWeek = curr.getDay(); // 0 is Sunday, 1 is Monday...
    const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(curr);
    monday.setDate(curr.getDate() + distanceToMonday);

    const days = [];
    const dayLabels = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const shortLabels = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(monday);
      dayDate.setDate(monday.getDate() + i);
      const isoYear = dayDate.getFullYear();
      const isoMonth = String(dayDate.getMonth() + 1).padStart(2, '0');
      const isoDay = String(dayDate.getDate()).padStart(2, '0');
      const isoStr = `${isoYear}-${isoMonth}-${isoDay}`;

      days.push({
        date: dayDate,
        dateStr: isoStr,
        dayName: dayLabels[i],
        shortName: shortLabels[i],
        dayNumber: dayDate.getDate(),
        monthShort: dayDate.toLocaleDateString('es-AR', { month: 'short' }),
        isSunday: i === 6,
        isToday: isoStr === new Date().toISOString().split('T')[0]
      });
    }
    return days;
  }, [filterDate]);

  const shiftWeek = (weeks: number) => {
    const parts = filterDate.split('-').map(Number);
    const curr = new Date(parts[0], parts[1] - 1, parts[2]);
    curr.setDate(curr.getDate() + (weeks * 7));
    const isoYear = curr.getFullYear();
    const isoMonth = String(curr.getMonth() + 1).padStart(2, '0');
    const isoDay = String(curr.getDate()).padStart(2, '0');
    setFilterDate(`${isoYear}-${isoMonth}-${isoDay}`);
  };

  const dayBookings = allBookings.filter(b => b.fecha === filterDate);

  const handleUpdateStatus = async (id: string, newStatus: Booking['estado']) => {
    const booking = allBookings.find(b => b.id === id);
    if (!booking) return;

    setLoading(true);
    setActionError(null);
    try {
      await firestoreService.updateBookingStatus(id, booking, newStatus);
      clearCache();
      await loadBookings();
    } catch (e) {
      setActionError('Error de permisos o conexión al actualizar el estado.');
    } finally {
      setLoading(false);
    }
  };

  const handleBlockSlot = async (time: string) => {
    setLoading(true);
    setActionError(null);
    try {
      const blockId = `block_${Date.now()}_generic`;
      const blockBooking: Booking = {
        id: blockId,
        fecha: filterDate,
        hora: time,
        nombre: 'TURNO BLOQUEADO',
        telefono: '00000000',
        tipo: 'BLOQUEO',
        servicio: 'MANUAL',
        direccion: 'ADMIN',
        estado: 'confirmado'
      };

      await firestoreService.createBooking(blockBooking, true);
      clearCache();
      await loadBookings();
      setBlockingTime(null);
    } catch (e) {
      setActionError('Error de Firestore al intentar bloquear el horario.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBooking = async (book: Booking) => {
    setLoading(true);
    setActionError(null);
    try {
      await firestoreService.deleteBooking(book.id, book.fecha, book.hora);
      clearCache();
      await loadBookings();
      setDeleteConfirmId(null);
    } catch (e) {
      setActionError('Error de Firestore al eliminar el turno.');
    } finally {
      setLoading(false);
    }
  };

  const getPossibleTimesForDate = (dateStr: string) => {
    if (!dateStr) return [];
    const parts = dateStr.split('-');
    if (parts.length !== 3) return [];
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0) {
      return []; // Domingo cerrado
    }
    if (dayOfWeek === 6) {
      return ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
    }
    return ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
  };

  const possibleTimes = getPossibleTimesForDate(filterDate);

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'confirmado': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'hecho': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'cancelado': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header y Controles de Vista */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6 bg-zinc-900 p-6 rounded-3xl border border-white/5 shadow-2xl">
        <div>
          <h2 className="text-2xl font-display font-black italic text-white tracking-tight flex items-center gap-3">
            <Calendar className="w-6 h-6 text-emerald-500" /> AGENDA DE TURNOS
          </h2>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mt-1">Sincronizado con Cloud Firestore</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Toggle Vista Diaria / Semanal */}
          <div className="flex bg-slate-950 p-1 rounded-2xl border border-white/10">
            <button 
              onClick={() => setViewMode('semana')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === 'semana' ? 'bg-emerald-500 text-slate-950 shadow-md font-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <CalendarDays className="w-4 h-4" /> Esquema Semanal
            </button>
            <button 
              onClick={() => setViewMode('dia')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === 'dia' ? 'bg-emerald-500 text-slate-950 shadow-md font-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <ListFilter className="w-4 h-4" /> Vista Diaria
            </button>
          </div>

          {/* Navegación de Semana si estamos en semana */}
          {viewMode === 'semana' ? (
            <div className="flex items-center gap-2 bg-slate-950 border border-white/10 rounded-2xl p-1">
              <button 
                onClick={() => shiftWeek(-1)}
                className="p-2 hover:bg-white/10 rounded-xl text-zinc-300 transition-colors cursor-pointer"
                title="Semana Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setFilterDate(new Date().toISOString().split('T')[0])}
                className="px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-colors cursor-pointer"
              >
                Hoy
              </button>
              <button 
                onClick={() => shiftWeek(1)}
                className="p-2 hover:bg-white/10 rounded-xl text-zinc-300 transition-colors cursor-pointer"
                title="Semana Siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <input 
              type="date" 
              value={filterDate} 
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-slate-950 border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none text-white font-medium"
            />
          )}

          <button 
            onClick={loadBookings}
            className="p-2.5 bg-zinc-800 rounded-xl hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer"
            title="Actualizar Agenda"
          >
            <Loader2 className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {actionError && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 text-red-500">
              <AlertCircle className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-widest">{actionError}</span>
            </div>
            <button onClick={() => setActionError(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors cursor-pointer">
              <X className="w-4 h-4 text-zinc-500" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* VISTA ESQUEMA SEMANAL (LUNES A DOMINGO) */}
      {viewMode === 'semana' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-emerald-500" />
              Semana del {weekDays[0]?.dayNumber} de {weekDays[0]?.monthShort} al {weekDays[6]?.dayNumber} de {weekDays[6]?.monthShort}
            </span>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              Haz clic en cualquier día para ingresar a la vista detallada
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
            {weekDays.map((day) => {
              const dayActiveBookings = allBookings.filter(b => b.fecha === day.dateStr && b.estado !== 'cancelado');
              const sortedDayBookings = [...dayActiveBookings].sort((a, b) => a.hora.localeCompare(b.hora));
              
              return (
                <div 
                  key={day.dateStr}
                  className={`bg-zinc-900 border rounded-2xl p-3 flex flex-col justify-between min-h-[320px] transition-all duration-200 ${
                    day.isToday 
                      ? 'border-emerald-500/50 bg-emerald-950/10 shadow-lg shadow-emerald-500/5' 
                      : day.dateStr === filterDate
                        ? 'border-white/30 bg-zinc-900/90'
                        : 'border-white/5 hover:border-white/20'
                  }`}
                >
                  <div>
                    {/* Header del Día */}
                    <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/5">
                      <div>
                        <span className={`text-[11px] font-black uppercase tracking-wider block ${day.isToday ? 'text-emerald-400' : 'text-zinc-400'}`}>
                          {day.shortName}
                        </span>
                        <span className="font-display font-black text-lg italic text-white">
                          {day.dayNumber} {day.monthShort}
                        </span>
                      </div>

                      {day.isSunday ? (
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-zinc-800 text-zinc-500">
                          CERRADO
                        </span>
                      ) : (
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                          sortedDayBookings.length > 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-500'
                        }`}>
                          {sortedDayBookings.length} {sortedDayBookings.length === 1 ? 'turno' : 'turnos'}
                        </span>
                      )}
                    </div>

                    {/* Lista de Turnos del Día */}
                    {day.isSunday ? (
                      <div className="py-8 text-center text-zinc-600">
                        <Lock className="w-5 h-5 mx-auto mb-1 opacity-50" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">Domingo Libre</p>
                      </div>
                    ) : sortedDayBookings.length === 0 ? (
                      <div className="py-8 text-center text-zinc-600">
                        <Clock className="w-5 h-5 mx-auto mb-1 opacity-40" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Sin Reservas</p>
                        <p className="text-[9px] text-zinc-600 mt-1">Horarios disponibles</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
                        {sortedDayBookings.map((bk) => (
                          <div 
                            key={bk.id}
                            className="bg-slate-950 p-2.5 rounded-xl border border-white/5 text-xs hover:border-emerald-500/30 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-display font-black italic text-emerald-400 text-xs">
                                {bk.hora}hs
                              </span>
                              <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.2 rounded border ${getStatusColor(bk.estado || '')}`}>
                                {bk.nombre.includes('BLOQUEADO') ? 'BLOQUEADO' : (bk.estado || 'CONFIRMADO')}
                              </span>
                            </div>
                            <p className="font-bold text-white truncate text-[11px]">
                              {bk.nombre}
                            </p>
                            <p className="text-[9px] text-zinc-400 truncate">
                              {bk.servicio}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Botón Ver Día */}
                  <button
                    onClick={() => {
                      setFilterDate(day.dateStr);
                      setViewMode('dia');
                    }}
                    className="mt-3 w-full py-1.5 px-2 bg-white/5 hover:bg-emerald-500 hover:text-slate-950 text-zinc-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>Administrar Día</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VISTA DIARIA DETALLADA */}
      {viewMode === 'dia' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-4 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 px-2">Estado del Día ({filterDate})</h3>
              <button 
                onClick={() => setViewMode('semana')}
                className="text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3 h-3" /> Ver Esquema Semanal
              </button>
            </div>

            <div className="bg-zinc-900 border border-white/5 rounded-3xl overflow-hidden shadow-xl">
               {possibleTimes.length === 0 ? (
                 <div className="p-8 text-center text-zinc-500">
                   <AlertCircle className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                   <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Domingo Cerrado</p>
                   <p className="text-[10px] mt-1 text-zinc-500 font-semibold leading-relaxed">No se programan ni muestran turnos para los días domingo.</p>
                 </div>
               ) : possibleTimes.map(time => {
                  const booking = dayBookings.find(b => b.hora === time && b.estado !== 'cancelado');
                  return (
                    <div key={time} className="flex items-center justify-between p-4 border-b border-white/[0.02] last:border-0 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${booking ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        <span className="font-display font-black italic text-lg">{time}hs</span>
                      </div>
                      {booking ? (
                        <span className={`text-[8px] font-black uppercase tracking-tighter px-2 py-0.5 rounded border ${getStatusColor(booking.estado || '')}`}>
                          {booking.nombre.includes('BLOQUEADO') ? 'BLOQUEADO' : (booking.estado || 'OCUPADO')}
                        </span>
                      ) : blockingTime === time ? (
                        <button 
                          onClick={() => handleBlockSlot(time)}
                          className="text-[10px] font-black uppercase tracking-tighter text-white bg-emerald-600 px-3 py-1 rounded shadow-lg animate-pulse cursor-pointer"
                        >
                          CONFIRMAR
                        </button>
                      ) : (
                        <button 
                          onClick={() => setBlockingTime(time)}
                          className="text-[10px] font-black uppercase tracking-tighter text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded flex items-center gap-1 group cursor-pointer"
                        >
                          <Lock className="w-3 h-3" /> BLOQUEAR
                        </button>
                      )}
                    </div>
                  );
               })}
            </div>
            <div className="p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
               <div className="flex items-center gap-2 text-emerald-500 mb-2">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Consejo Admin</span>
               </div>
               <p className="text-zinc-500 text-xs font-medium leading-relaxed">
                  Los turnos bloqueados se guardan en Firestore y ocultan la disponibilidad inmediatamente para todos los clientes en la web.
               </p>
            </div>
          </div>

          <div className="md:col-span-8">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-4 px-2">Detalle de Reservas ({dayBookings.length})</h3>
              
              {loading && allBookings.length === 0 ? (
                <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-12 flex flex-col items-center justify-center gap-4">
                   <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                   <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Sincronizando con Cloud Firestore...</p>
                </div>
              ) : error ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-12 text-center">
                   <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                   <p className="text-red-500 font-bold mb-2 uppercase tracking-widest text-xs">Acceso Denegado / Error</p>
                   <p className="text-zinc-400 text-sm mb-6">{error}</p>
                   <p className="text-zinc-500 text-xs mb-6">Asegúrate de estar autenticado como el Administrador "leandro.saralegui@gmail.com".</p>
                   <button onClick={loadBookings} className="px-6 py-2 bg-zinc-800 rounded-xl text-[10px] font-black text-white hover:bg-zinc-700 cursor-pointer">REINTENTAR</button>
                </div>
              ) : dayBookings.length === 0 ? (
                <div className="bg-zinc-900 border border-white/5 rounded-3xl p-12 text-center">
                   <Calendar className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                   <p className="text-zinc-400 font-medium italic">Sin turnos agendados para este día.</p>
                </div>
              ) : (
                <div className="space-y-4">
                   {dayBookings.map(book => {
                     const telClean = book.telefono.replace(/\D/g, '');
                     const isRecurrent = (customerVisits[telClean] || 0) > 1;

                     return (
                       <div key={book.id} className="bg-zinc-900 border border-white/5 rounded-3xl p-6 relative overflow-hidden group shadow-xl">
                          {book.nombre.includes('BLOQUEADO') && (
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-zinc-700" />
                          )}
                          
                          <div className="flex flex-col gap-6">
                             <div className="flex flex-wrap items-start justify-between gap-4">
                               <div className="flex gap-4">
                                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${book.nombre.includes('BLOQUEADO') ? 'bg-white/5 text-zinc-600' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                     {book.nombre.includes('BLOQUEADO') ? <Lock className="w-6 h-6" /> : <User className="w-6 h-6" />}
                                  </div>
                                  <div>
                                     <div className="flex items-center gap-3 mb-1 flex-wrap">
                                        <div className="font-display font-black italic text-xl text-white uppercase tracking-tight">
                                          {book.nombre}
                                        </div>
                                        {isRecurrent && (
                                          <span className="bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-emerald-500/20">
                                             ⭐ Recurrente
                                          </span>
                                        )}
                                        <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${getStatusColor(book.estado || '')}`}>
                                           {book.estado || 'PENDIENTE'}
                                        </span>
                                     </div>
                                     <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
                                        <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-emerald-500" /> {book.hora}hs</span>
                                        {book.telefono !== '00000000' && <span className="flex items-center gap-2"><Phone className="w-4 h-4 text-emerald-500" /> {book.telefono}</span>}
                                        <span className="flex items-center gap-2"><Package className="w-4 h-4 text-emerald-500" /> {book.servicio}</span>
                                     </div>
                                  </div>
                               </div>
                               
                               <div className="flex gap-2 items-center">
                                  {book.telefono !== '00000000' && (
                                    <a 
                                      href={`https://wa.me/${book.telefono.replace(/\D/g, '')}`} 
                                      target="_blank" rel="noreferrer"
                                      className="p-3 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white rounded-xl transition-all"
                                    >
                                      <Phone className="w-5 h-5" />
                                    </a>
                                  )}
                                  {deleteConfirmId === book.id ? (
                                    <div className="flex items-center gap-1.5 bg-red-950/40 p-1.5 rounded-xl border border-red-500/30">
                                      <button 
                                        onClick={() => handleDeleteBooking(book)}
                                        className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                      >
                                        ELIMINAR
                                      </button>
                                      <button 
                                        onClick={() => setDeleteConfirmId(null)}
                                        className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                      >
                                        NO
                                      </button>
                                    </div>
                                  ) : (
                                    <button 
                                      onClick={() => setDeleteConfirmId(book.id)}
                                      className="p-3 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all cursor-pointer"
                                      title="Eliminar turno"
                                    >
                                      <Trash2 className="w-5 h-5" />
                                    </button>
                                  )}
                               </div>
                            </div>

                            {book.direccion && book.direccion !== 'ADMIN' && (
                              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                 <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Dirección / Detalles</p>
                                 <p className="text-zinc-300 text-sm italic">{book.direccion}</p>
                              </div>
                            )}

                            {!book.nombre.includes('BLOQUEADO') && (
                              <div className="flex flex-wrap gap-2 pt-2">
                                 <button onClick={() => handleUpdateStatus(book.id, 'confirmado')} className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500 text-blue-500 hover:text-white border border-blue-500/20 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer">Confirmar</button>
                                 <button onClick={() => handleUpdateStatus(book.id, 'hecho')} className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white border border-emerald-500/20 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer">Finalizado</button>
                                 <button onClick={() => handleUpdateStatus(book.id, 'cancelado')} className="px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer">Cancelar</button>
                              </div>
                            )}
                         </div>
                       </div>
                     );
                   })}
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
