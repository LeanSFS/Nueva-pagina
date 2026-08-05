import React, { useState, useEffect } from 'react';
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
  ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { firestoreService, Booking } from '../services/firestoreService.ts';
import { fetchSlots, clearCache } from '../services/availabilityService.ts';

export default function AdminAgenda({ customerVisits = {} }: { customerVisits?: Record<string, number> }) {
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
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
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-zinc-900 p-6 rounded-3xl border border-white/5">
        <div>
          <h2 className="text-2xl font-display font-black italic text-white tracking-tight flex items-center gap-3">
            <Calendar className="w-6 h-6 text-emerald-500" /> AGENDA DE TURNOS
          </h2>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mt-1">Sincronizado con Cloud Firestore</p>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <input 
            type="date" 
            value={filterDate} 
            onChange={(e) => setFilterDate(e.target.value)}
            className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 outline-none flex-1 md:w-48"
          />
          <button 
            onClick={loadBookings}
            className="p-3 bg-zinc-800 rounded-xl hover:bg-zinc-700 transition-colors"
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
            <button onClick={() => setActionError(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
              <X className="w-4 h-4 text-zinc-500" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-4 space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-4 px-2">Estado del Día</h3>
          <div className="bg-zinc-900 border border-white/5 rounded-3xl overflow-hidden">
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
                        className="text-[10px] font-black uppercase tracking-tighter text-white bg-emerald-600 px-3 py-1 rounded shadow-lg animate-pulse"
                      >
                        CONFIRMAR
                      </button>
                    ) : (
                      <button 
                        onClick={() => setBlockingTime(time)}
                        className="text-[10px] font-black uppercase tracking-tighter text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded flex items-center gap-1 group"
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
                 <button onClick={loadBookings} className="px-6 py-2 bg-zinc-800 rounded-xl text-[10px] font-black text-white hover:bg-zinc-700">REINTENTAR</button>
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
                     <div key={book.id} className="bg-zinc-900 border border-white/5 rounded-3xl p-6 relative overflow-hidden group">
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
                                <button onClick={() => handleUpdateStatus(book.id, 'confirmado')} className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500 text-blue-500 hover:text-white border border-blue-500/20 rounded-xl text-[10px] font-black uppercase transition-all">Confirmar</button>
                                <button onClick={() => handleUpdateStatus(book.id, 'hecho')} className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white border border-emerald-500/20 rounded-xl text-[10px] font-black uppercase transition-all">Finalizado</button>
                                <button onClick={() => handleUpdateStatus(book.id, 'cancelado')} className="px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 rounded-xl text-[10px] font-black uppercase transition-all">Cancelar</button>
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
    </div>
  );
}
