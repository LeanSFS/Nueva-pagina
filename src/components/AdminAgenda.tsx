import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Unlock,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ListFilter,
  Zap,
  ExternalLink,
  Search,
  DollarSign,
  Car,
  Check,
  RotateCcw,
  SlidersHorizontal,
  ArrowRight,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  firestoreService, 
  Booking, 
  calculateDurationFromServiceName, 
  calculateBlockedSlotsForStart,
  CatalogService,
  CatalogVehicle 
} from '../services/firestoreService.ts';
import { fetchSlots, clearCache, getArgentinaDate } from '../services/availabilityService.ts';
import { SERVICES, VEHICLES } from '../constants.ts';

interface AdminAgendaProps {
  customerVisits?: Record<string, number>;
  dbServices?: CatalogService[];
  dbVehicles?: CatalogVehicle[];
}

export default function AdminAgenda({ 
  customerVisits = {},
  dbServices = [],
  dbVehicles = []
}: AdminAgendaProps) {
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Date state initialized to Argentina local date (YYYY-MM-DD)
  const [filterDate, setFilterDate] = useState<string>(() => {
    const d = getArgentinaDate();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });

  const [viewMode, setViewMode] = useState<'timeline' | 'semana' | 'buscar'>('timeline');
  const [actionError, setActionError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [copiedExpressLink, setCopiedExpressLink] = useState(false);

  // Modals
  const [showManualBookingModal, setShowManualBookingModal] = useState(false);
  const [manualSlotPreselect, setManualSlotPreselect] = useState<string | null>(null);
  const [showBlockModal, setShowBlockModal] = useState(false);

  // Manual booking form state
  const [mbName, setMbName] = useState('');
  const [mbPhone, setMbPhone] = useState('');
  const [mbVehicle, setMbVehicle] = useState('auto');
  const [mbService, setMbService] = useState('Lavado Exterior Artesanal');
  const [mbDate, setMbDate] = useState(filterDate);
  const [mbTime, setMbTime] = useState('09:00');
  const [mbDurationHours, setMbDurationHours] = useState('1.5');
  const [mbPrice, setMbPrice] = useState('');
  const [mbNotes, setMbNotes] = useState('');
  const [isSavingManual, setIsSavingManual] = useState(false);

  // Search tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendiente' | 'confirmado' | 'hecho' | 'cancelado' | 'bloqueo'>('todos');

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const copyExpressLink = () => {
    const url = `${window.location.origin}/turnoexpress`;
    navigator.clipboard.writeText(url);
    setCopiedExpressLink(true);
    showToast('¡Link de Turno Express copiado!');
    setTimeout(() => setCopiedExpressLink(false), 2500);
  };

  const loadBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await firestoreService.getBookings();
      // Ensure all bookings have blockedSlots populated
      const normalized = data.map(b => {
        if (!b.blockedSlots || b.blockedSlots.length === 0) {
          const dur = calculateDurationFromServiceName(b.servicio);
          return {
            ...b,
            blockedSlots: calculateBlockedSlotsForStart(b.hora, dur)
          };
        }
        return b;
      });
      // Sort bookings chronologically by hour
      const sorted = normalized.sort((a, b) => a.hora.localeCompare(b.hora));
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

    const todayArgentina = getArgentinaDate();
    const tYear = todayArgentina.getFullYear();
    const tMonth = String(todayArgentina.getMonth() + 1).padStart(2, '0');
    const tDay = String(todayArgentina.getDate()).padStart(2, '0');
    const todayIso = `${tYear}-${tMonth}-${tDay}`;

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
        isToday: isoStr === todayIso
      });
    }
    return days;
  }, [filterDate]);

  const shiftDay = (days: number) => {
    const parts = filterDate.split('-').map(Number);
    const curr = new Date(parts[0], parts[1] - 1, parts[2]);
    curr.setDate(curr.getDate() + days);
    const isoYear = curr.getFullYear();
    const isoMonth = String(curr.getMonth() + 1).padStart(2, '0');
    const isoDay = String(curr.getDate()).padStart(2, '0');
    setFilterDate(`${isoYear}-${isoMonth}-${isoDay}`);
  };

  const setDateToToday = () => {
    const d = getArgentinaDate();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setFilterDate(`${y}-${m}-${day}`);
  };

  const setDateToTomorrow = () => {
    const d = getArgentinaDate();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setFilterDate(`${y}-${m}-${day}`);
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

  const possibleTimes = useMemo(() => getPossibleTimesForDate(filterDate), [filterDate]);

  // Bookings of current day
  const dayBookings = useMemo(() => {
    return allBookings.filter(b => b.fecha === filterDate);
  }, [allBookings, filterDate]);

  const activeDayBookings = useMemo(() => {
    return dayBookings.filter(b => b.estado !== 'cancelado');
  }, [dayBookings]);

  // Daily Statistics
  const dayStats = useMemo(() => {
    const total = activeDayBookings.length;
    const realBookings = activeDayBookings.filter(b => !b.nombre.includes('BLOQUEADO'));
    const blocks = activeDayBookings.filter(b => b.nombre.includes('BLOQUEADO'));
    const pending = realBookings.filter(b => b.estado === 'pendiente').length;
    const confirmed = realBookings.filter(b => b.estado === 'confirmado').length;
    const done = realBookings.filter(b => b.estado === 'hecho').length;

    // Calculate occupied hours
    const occupiedHoursSet = new Set<string>();
    activeDayBookings.forEach(b => {
      const slots = b.blockedSlots && b.blockedSlots.length > 0
        ? b.blockedSlots
        : calculateBlockedSlotsForStart(b.hora, calculateDurationFromServiceName(b.servicio));
      slots.forEach(s => occupiedHoursSet.add(s));
    });

    // Estimate daily revenue (extract $ amount from service description if present)
    let estimatedRevenue = 0;
    realBookings.forEach(b => {
      const match = b.servicio.match(/\$\s?([0-9.]+)/);
      if (match && match[1]) {
        const num = parseFloat(match[1].replace(/\./g, ''));
        if (!isNaN(num)) estimatedRevenue += num;
      }
    });

    const totalPossibleSlots = possibleTimes.length;
    const occupancyRate = totalPossibleSlots > 0 
      ? Math.round((occupiedHoursSet.size / totalPossibleSlots) * 100) 
      : 0;

    return {
      totalReal: realBookings.length,
      totalBlocks: blocks.length,
      pending,
      confirmed,
      done,
      occupiedHoursCount: occupiedHoursSet.size,
      totalPossibleSlots,
      occupancyRate,
      estimatedRevenue
    };
  }, [activeDayBookings, possibleTimes]);

  // Helper to map slot to what's happening at that hour
  const getSlotDetails = useCallback((slotTime: string) => {
    // 1. Is this the start hour of a booking?
    const primaryBooking = activeDayBookings.find(b => b.hora === slotTime);
    if (primaryBooking) {
      const isManualBlock = primaryBooking.nombre.includes('BLOQUEADO');
      const durationMins = calculateDurationFromServiceName(primaryBooking.servicio);
      const blocked = primaryBooking.blockedSlots || calculateBlockedSlotsForStart(primaryBooking.hora, durationMins);
      
      return {
        type: isManualBlock ? 'block' : 'primary_booking',
        booking: primaryBooking,
        durationMins,
        blockedSlots: blocked,
        isFirstSlot: true
      };
    }

    // 2. Is this slot covered as an ongoing hour of a previous booking?
    const parentBooking = activeDayBookings.find(b => {
      const slots = b.blockedSlots || calculateBlockedSlotsForStart(b.hora, calculateDurationFromServiceName(b.servicio));
      return slots.includes(slotTime);
    });

    if (parentBooking) {
      const isManualBlock = parentBooking.nombre.includes('BLOQUEADO');
      const durationMins = calculateDurationFromServiceName(parentBooking.servicio);
      const blocked = parentBooking.blockedSlots || calculateBlockedSlotsForStart(parentBooking.hora, durationMins);
      
      return {
        type: isManualBlock ? 'block_ongoing' : 'ongoing_booking',
        booking: parentBooking,
        durationMins,
        blockedSlots: blocked,
        isFirstSlot: false
      };
    }

    // 3. Slot is free
    return {
      type: 'free',
      booking: null,
      durationMins: 0,
      blockedSlots: [],
      isFirstSlot: false
    };
  }, [activeDayBookings]);

  // Status updates
  const handleUpdateStatus = async (id: string, newStatus: Booking['estado']) => {
    const booking = allBookings.find(b => b.id === id);
    if (!booking) return;

    setLoading(true);
    setActionError(null);
    try {
      await firestoreService.updateBookingStatus(id, booking, newStatus);
      clearCache();
      await loadBookings();
      showToast(`Turno actualizado a "${newStatus.toUpperCase()}"`);
    } catch (e) {
      setActionError('Error al actualizar el estado en Firestore.');
    } finally {
      setLoading(false);
    }
  };

  // Block single slot or custom range
  const handleBlockSlot = async (time: string, durationHours = 1) => {
    setLoading(true);
    setActionError(null);
    try {
      const durationMins = durationHours * 60;
      const blocked = calculateBlockedSlotsForStart(time, durationMins);
      const blockId = `block_${Date.now()}_${time.replace(':', '')}`;
      
      const blockBooking: Booking = {
        id: blockId,
        fecha: filterDate,
        hora: time,
        nombre: 'TURNO BLOQUEADO',
        telefono: '00000000',
        tipo: 'BLOQUEO',
        servicio: durationHours > 1 ? `BLOQUEO (${durationHours} hs)` : 'BLOQUEO MANUAL',
        direccion: 'ADMIN',
        estado: 'confirmado',
        blockedSlots: blocked
      };

      await firestoreService.createBooking(blockBooking, true);
      clearCache();
      await loadBookings();
      showToast(`Horario ${time}hs bloqueado exitosamente`);
    } catch (e) {
      setActionError('Error de Firestore al intentar bloquear el horario.');
    } finally {
      setLoading(false);
    }
  };

  // Block full day
  const handleBlockFullDay = async () => {
    if (possibleTimes.length === 0) return;
    setLoading(true);
    setActionError(null);
    try {
      const firstHour = possibleTimes[0];
      const blockId = `block_fullday_${Date.now()}`;
      
      const blockBooking: Booking = {
        id: blockId,
        fecha: filterDate,
        hora: firstHour,
        nombre: 'DÍA COMPLETO BLOQUEADO',
        telefono: '00000000',
        tipo: 'BLOQUEO',
        servicio: 'BLOQUEO DÍA COMPLETO',
        direccion: 'ADMIN',
        estado: 'confirmado',
        blockedSlots: [...possibleTimes]
      };

      await firestoreService.createBooking(blockBooking, true);
      clearCache();
      await loadBookings();
      setShowBlockModal(false);
      showToast('Día completo bloqueado con éxito');
    } catch (e) {
      setActionError('Error de Firestore al bloquear el día.');
    } finally {
      setLoading(false);
    }
  };

  // Delete booking or unlock
  const handleDeleteBooking = async (book: Booking) => {
    setLoading(true);
    setActionError(null);
    try {
      await firestoreService.deleteBooking(book.id, book.fecha, book.hora);
      clearCache();
      await loadBookings();
      setDeleteConfirmId(null);
      showToast(book.nombre.includes('BLOQUEADO') ? 'Horario desbloqueado' : 'Turno eliminado');
    } catch (e) {
      setActionError('Error de Firestore al eliminar el turno.');
    } finally {
      setLoading(false);
    }
  };

  // Create manual booking
  const handleCreateManualBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mbName.trim() || !mbDate || !mbTime) {
      setActionError('Por favor completa el nombre del cliente, fecha y hora.');
      return;
    }

    setIsSavingManual(true);
    setActionError(null);

    try {
      const durationMins = parseFloat(mbDurationHours) * 60;
      const blocked = calculateBlockedSlotsForStart(mbTime, durationMins);
      const vehicleObj = dbVehicles.find(v => v.id === mbVehicle) || VEHICLES.find(v => v.id === mbVehicle);
      const vehicleName = vehicleObj?.name || 'Auto';
      
      const bookingId = `manual_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const priceText = mbPrice ? ` – $${Number(mbPrice).toLocaleString('es-AR')}` : '';

      const newBooking: Booking = {
        id: bookingId,
        fecha: mbDate,
        hora: mbTime,
        nombre: mbName.trim(),
        telefono: mbPhone.trim() || 'No informado',
        tipo: vehicleName,
        servicio: `${mbService}${priceText}`,
        direccion: mbNotes ? `Venezuela 1659 (${mbNotes})` : 'Venezuela 1659 (Domicilio)',
        estado: 'confirmado',
        blockedSlots: blocked
      };

      await firestoreService.createBooking(newBooking, false);
      clearCache();
      await loadBookings();
      
      setShowManualBookingModal(false);
      setMbName('');
      setMbPhone('');
      setMbNotes('');
      setMbPrice('');
      showToast('¡Turno manual registrado y sincronizado en Firestore!');
    } catch (e: any) {
      setActionError('Error al crear el turno: ' + (e?.message || 'Error de conexión'));
    } finally {
      setIsSavingManual(false);
    }
  };

  const getStatusBadge = (status: string, isBlocked: boolean) => {
    if (isBlocked) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700">
          <Lock className="w-3 h-3 text-zinc-400" />
          <span>Bloqueado</span>
        </span>
      );
    }

    switch (status?.toLowerCase()) {
      case 'confirmado':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <Check className="w-3 h-3 text-blue-400" />
            <span>Confirmado</span>
          </span>
        );
      case 'hecho':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>Finalizado</span>
          </span>
        );
      case 'cancelado':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <X className="w-3 h-3 text-rose-400" />
            <span>Cancelado</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>Pendiente</span>
          </span>
        );
    }
  };

  // Filtered bookings for the search tab
  const filteredSearchBookings = useMemo(() => {
    return allBookings.filter(b => {
      const matchesQuery = 
        !searchQuery.trim() ||
        b.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.telefono.includes(searchQuery) ||
        b.servicio.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.tipo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.fecha.includes(searchQuery);

      if (!matchesQuery) return false;

      if (statusFilter === 'todos') return true;
      if (statusFilter === 'bloqueo') return b.nombre.includes('BLOQUEADO');
      return b.estado === statusFilter && !b.nombre.includes('BLOQUEADO');
    }).sort((a, b) => {
      const dateCmp = b.fecha.localeCompare(a.fecha);
      if (dateCmp !== 0) return dateCmp;
      return a.hora.localeCompare(b.hora);
    });
  }, [allBookings, searchQuery, statusFilter]);

  // Formatted date string for header
  const formattedDayTitle = useMemo(() => {
    if (!filterDate) return '';
    const parts = filterDate.split('-').map(Number);
    if (parts.length !== 3) return filterDate;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const str = d.toLocaleDateString('es-AR', options);
    return str.charAt(0).toUpperCase() + str.slice(1);
  }, [filterDate]);

  const isSundaySelected = useMemo(() => {
    if (!filterDate) return false;
    const parts = filterDate.split('-').map(Number);
    if (parts.length !== 3) return false;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.getDay() === 0;
  }, [filterDate]);

  return (
    <div className="space-y-6 animate-fade-in font-sans pb-16">
      
      {/* Toast Notification */}
      <AnimatePresence>
        {successToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-50 bg-emerald-500 text-slate-950 font-bold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs uppercase tracking-wider"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{successToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Agenda Header */}
      <div className="bg-zinc-900 border border-white/10 rounded-3xl p-5 md:p-7 shadow-2xl space-y-6">
        
        {/* Top Title & Quick Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/5 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl md:text-2xl font-display font-black italic text-white tracking-tight">
                  AGENDA & CONTROL DE TURNOS
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-[10px] font-black tracking-wider uppercase border border-emerald-500/30">
                  En Vivo
                </span>
              </div>
              <p className="text-zinc-400 text-xs mt-0.5">
                Bloqueo automático de módulos continuos y sincronización directa con Firestore
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button 
              onClick={() => {
                setMbDate(filterDate);
                setMbTime('09:00');
                setShowManualBookingModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Turno Manual</span>
            </button>

            <button 
              onClick={() => setShowBlockModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-zinc-300 hover:text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              title="Bloquear un horario o el día completo"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Bloquear Horas / Día</span>
            </button>

            <button 
              onClick={copyExpressLink}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
              title="Copiar enlace de Turno Express para WhatsApp"
            >
              <Zap className="w-3.5 h-3.5 fill-emerald-400" />
              <span>{copiedExpressLink ? '¡Link Copiado!' : 'Link Express'}</span>
            </button>

            <button 
              onClick={loadBookings}
              className="p-2.5 bg-zinc-800 rounded-xl hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Actualizar Agenda"
            >
              <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* View Mode Navigation Pills */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex p-1 bg-slate-950 rounded-2xl border border-white/10 w-full sm:w-auto">
            <button 
              onClick={() => setViewMode('timeline')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === 'timeline' 
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-md' 
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Timeline Diario</span>
            </button>
            <button 
              onClick={() => setViewMode('semana')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === 'semana' 
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-md' 
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              <span>Semana Completa</span>
            </button>
            <button 
              onClick={() => setViewMode('buscar')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === 'buscar' 
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-md' 
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Buscador ({allBookings.length})</span>
            </button>
          </div>

          {/* Date Selector & Day Stepper */}
          {viewMode !== 'buscar' && (
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-white/10">
                <button 
                  onClick={() => shiftDay(-1)}
                  className="p-2 hover:bg-white/10 rounded-xl text-zinc-300 transition-colors cursor-pointer"
                  title="Día Anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button 
                  onClick={setDateToToday}
                  className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-colors cursor-pointer"
                >
                  Hoy
                </button>
                <button 
                  onClick={setDateToTomorrow}
                  className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                >
                  Mañana
                </button>
                <button 
                  onClick={() => shiftDay(1)}
                  className="p-2 hover:bg-white/10 rounded-xl text-zinc-300 transition-colors cursor-pointer"
                  title="Día Siguiente"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <input 
                type="date" 
                value={filterDate} 
                onChange={(e) => setFilterDate(e.target.value)}
                className="bg-slate-950 border border-white/10 rounded-2xl px-3.5 py-2 text-xs text-white font-medium outline-none focus:border-emerald-500 transition-colors cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Date Title Banner & Daily Stats Bar */}
        {viewMode !== 'buscar' && (
          <div className="pt-2">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-950/80 border border-white/5">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                  Día Seleccionado
                </span>
                <h3 className="text-lg md:text-xl font-display font-black italic text-white">
                  {formattedDayTitle}
                </h3>
              </div>

              {/* Day KPIs */}
              <div className="flex flex-wrap items-center gap-3 md:gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <div>
                    <div className="text-[10px] uppercase font-bold text-zinc-500">Turnos</div>
                    <div className="text-sm font-black text-white">{dayStats.totalReal} agendados</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                  <div>
                    <div className="text-[10px] uppercase font-bold text-zinc-500">Taller Ocupado</div>
                    <div className="text-sm font-black text-white">
                      {dayStats.occupiedHoursCount} / {dayStats.totalPossibleSlots} hs ({dayStats.occupancyRate}%)
                    </div>
                  </div>
                </div>

                {dayStats.estimatedRevenue > 0 && (
                  <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="text-[9px] uppercase font-black tracking-wider text-emerald-400">Est. Facturación</div>
                      <div className="text-xs font-black text-emerald-300">
                        ${dayStats.estimatedRevenue.toLocaleString('es-AR')}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Banner */}
      <AnimatePresence>
        {actionError && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-xs font-bold">{actionError}</span>
            </div>
            <button onClick={() => setActionError(null)} className="p-1 hover:bg-white/5 rounded-full text-zinc-400 hover:text-white cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------- */}
      {/* 1. TIMELINE DIARIO INTERACTIVO (HORA POR HORA)                 */}
      {/* ------------------------------------------------------------- */}
      {viewMode === 'timeline' && (
        <div className="space-y-4">
          
          {isSundaySelected ? (
            <div className="bg-zinc-900 border border-white/10 rounded-3xl p-12 text-center max-w-xl mx-auto shadow-xl">
              <Lock className="w-12 h-12 text-zinc-600 mx-auto mb-3 opacity-60" />
              <h4 className="text-lg font-display font-black italic text-white mb-1">
                Domingo de Descanso
              </h4>
              <p className="text-xs text-zinc-400 mb-6">
                El taller permanece cerrado los domingos. Los clientes no pueden reservar en este día a través de la web.
              </p>
              <button 
                onClick={() => shiftDay(1)}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                Ver Lunes Siguiente
              </button>
            </div>
          ) : possibleTimes.length === 0 ? (
            <div className="bg-zinc-900 border border-white/10 rounded-3xl p-12 text-center">
              <AlertCircle className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
              <p className="text-zinc-400 text-sm">No hay horarios configurados para esta fecha.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {possibleTimes.map((timeSlot) => {
                const details = getSlotDetails(timeSlot);

                // A) SLOT LIBRE
                if (details.type === 'free') {
                  return (
                    <div 
                      key={timeSlot}
                      className="bg-zinc-900/60 hover:bg-zinc-900 border border-white/5 hover:border-emerald-500/30 rounded-2xl p-4 md:px-6 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                        <div>
                          <div className="font-display font-black italic text-lg text-white group-hover:text-emerald-400 transition-colors">
                            {timeSlot} hs
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400/80">
                            Disponible / Libre
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto opacity-90 sm:opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setMbDate(filterDate);
                            setMbTime(timeSlot);
                            setShowManualBookingModal(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 border border-emerald-500/20 text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Agendar Turno</span>
                        </button>

                        <button
                          onClick={() => handleBlockSlot(timeSlot, 1)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-white/5 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                          title="Bloquear 1 hora"
                        >
                          <Lock className="w-3 h-3 text-amber-400" />
                          <span>Bloquear</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                // B) SLOT DE INICIO DE TURNO PRINCIPAL (O BLOQUEO MANUAL PRINCIPAL)
                if (details.type === 'primary_booking' && details.booking) {
                  const book = details.booking;
                  const isBlocked = book.nombre.includes('BLOQUEADO');
                  const telClean = book.telefono.replace(/\D/g, '');
                  const isRecurrent = (customerVisits[telClean] || 0) > 1;
                  const blockedSlots = details.blockedSlots;
                  const durationHours = Math.round((details.durationMins / 60) * 10) / 10;
                  const lastSlot = blockedSlots[blockedSlots.length - 1];

                  return (
                    <div 
                      key={timeSlot}
                      className={`rounded-2xl p-5 border transition-all shadow-xl relative overflow-hidden ${
                        isBlocked
                          ? 'bg-zinc-900 border-zinc-700/60'
                          : book.estado === 'hecho'
                            ? 'bg-emerald-950/20 border-emerald-500/30'
                            : book.estado === 'confirmado'
                              ? 'bg-blue-950/20 border-blue-500/30'
                              : 'bg-amber-950/20 border-amber-500/30'
                      }`}
                    >
                      {/* Left color bar */}
                      <div className={`absolute top-0 left-0 bottom-0 w-2 ${
                        isBlocked 
                          ? 'bg-zinc-600' 
                          : book.estado === 'hecho' 
                            ? 'bg-emerald-500' 
                            : book.estado === 'confirmado' 
                              ? 'bg-blue-500' 
                              : 'bg-amber-500'
                      }`} />

                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pl-2">
                        
                        {/* Booking Info */}
                        <div className="space-y-2.5">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="font-display font-black italic text-2xl text-white">
                              {timeSlot} hs
                            </div>

                            {getStatusBadge(book.estado, isBlocked)}

                            {isRecurrent && !isBlocked && (
                              <span className="bg-emerald-500/15 text-emerald-400 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border border-emerald-500/30">
                                ⭐ Cliente Recurrente
                              </span>
                            )}

                            {/* Duration & Occupied slots pill */}
                            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 border border-white/10 flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-emerald-400" />
                              <span>
                                {blockedSlots.length > 1 
                                  ? `Duración: ${durationHours} hs (${timeSlot} a ${lastSlot ? `${parseInt(lastSlot.split(':')[0]) + 1}:00` : ''})` 
                                  : 'Duración: 1 hora'}
                              </span>
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                            <div className="flex items-center gap-2 text-white font-bold text-base">
                              {isBlocked ? <Lock className="w-4 h-4 text-zinc-400" /> : <User className="w-4 h-4 text-emerald-400" />}
                              <span>{book.nombre}</span>
                            </div>

                            {!isBlocked && book.telefono !== '00000000' && (
                              <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-semibold">
                                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                                <span>{book.telefono}</span>
                              </div>
                            )}

                            {!isBlocked && (
                              <div className="flex items-center gap-1.5 text-zinc-300 text-xs font-semibold">
                                <Car className="w-3.5 h-3.5 text-emerald-400" />
                                <span>{book.tipo}</span>
                              </div>
                            )}

                            <div className="flex items-center gap-1.5 text-emerald-300 text-xs font-black">
                              <Package className="w-3.5 h-3.5 text-emerald-400" />
                              <span>{book.servicio}</span>
                            </div>
                          </div>

                          {/* Blocked slots visual chain */}
                          {blockedSlots.length > 1 && (
                            <div className="flex items-center gap-1.5 pt-1 text-[11px] text-zinc-400">
                              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Módulos bloqueados:</span>
                              <div className="flex items-center gap-1">
                                {blockedSlots.map((bs, idx) => (
                                  <span 
                                    key={bs} 
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                      idx === 0 
                                        ? 'bg-emerald-500 text-slate-950 font-black' 
                                        : 'bg-zinc-800 text-zinc-300 border border-white/5'
                                    }`}
                                  >
                                    {bs}hs
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {book.direccion && book.direccion !== 'ADMIN' && (
                            <p className="text-xs text-zinc-400 italic">
                              📍 {book.direccion}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
                          
                          {/* WhatsApp button */}
                          {!isBlocked && telClean.length >= 8 && (
                            <a 
                              href={`https://wa.me/${telClean.startsWith('54') ? telClean : `549${telClean}`}?text=Hola%20${encodeURIComponent(book.nombre)},%20te%20escribimos%20de%20LyS%20Lavados%20por%20tu%20turno%20del%20${filterDate}%20a%20las%20${book.hora}hs.`} 
                              target="_blank" 
                              rel="noreferrer"
                              className="flex items-center gap-1.5 px-3 py-2 bg-[#25D366]/15 hover:bg-[#25D366] text-[#25D366] hover:text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                              title="Abrir chat en WhatsApp"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>WhatsApp</span>
                            </a>
                          )}

                          {/* Fast Status Toggles */}
                          {!isBlocked && (
                            <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-white/5">
                              {book.estado !== 'confirmado' && (
                                <button 
                                  onClick={() => handleUpdateStatus(book.id, 'confirmado')}
                                  className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors cursor-pointer"
                                  title="Marcar como Confirmado"
                                >
                                  Confirmar
                                </button>
                              )}

                              {book.estado !== 'hecho' && (
                                <button 
                                  onClick={() => handleUpdateStatus(book.id, 'hecho')}
                                  className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors cursor-pointer"
                                  title="Marcar como Finalizado"
                                >
                                  Finalizar
                                </button>
                              )}

                              {book.estado !== 'cancelado' && (
                                <button 
                                  onClick={() => handleUpdateStatus(book.id, 'cancelado')}
                                  className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                                  title="Cancelar turno"
                                >
                                  Cancelar
                                </button>
                              )}
                            </div>
                          )}

                          {/* Delete / Unlock button */}
                          {deleteConfirmId === book.id ? (
                            <div className="flex items-center gap-1 bg-red-950/60 p-1 rounded-xl border border-red-500/40">
                              <button 
                                onClick={() => handleDeleteBooking(book)}
                                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                              >
                                ELIMINAR
                              </button>
                              <button 
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                              >
                                NO
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setDeleteConfirmId(book.id)}
                              className="p-2.5 bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-white/5 rounded-xl transition-all cursor-pointer"
                              title={isBlocked ? "Desbloquear Horario" : "Eliminar Turno"}
                            >
                              {isBlocked ? <Unlock className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                // C) SLOT DE CONTINUACIÓN / TRABAJO EN CURSO (Horas 2da o 3ra de un turno)
                if (details.type === 'ongoing_booking' && details.booking) {
                  const parent = details.booking;
                  const isBlocked = parent.nombre.includes('BLOQUEADO');

                  return (
                    <div 
                      key={timeSlot}
                      className="bg-zinc-950 border border-dashed border-emerald-500/30 rounded-2xl p-3.5 md:px-6 flex items-center justify-between gap-4 text-xs"
                    >
                      <div className="flex items-center gap-4">
                        <div className="font-display font-black italic text-base text-zinc-400">
                          {timeSlot} hs
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-zinc-300 font-bold">
                            ⏳ En curso: <span className="text-white font-black">{parent.nombre}</span> ({parent.tipo} – {parent.servicio})
                          </span>
                        </div>
                      </div>

                      <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                        Inició {parent.hora}hs
                      </div>
                    </div>
                  );
                }

                // D) CONTINUACIÓN DE BLOQUEO MANUAL
                if (details.type === 'block_ongoing') {
                  return (
                    <div 
                      key={timeSlot}
                      className="bg-zinc-950 border border-dashed border-zinc-700 rounded-2xl p-3.5 md:px-6 flex items-center justify-between gap-4 text-xs text-zinc-500"
                    >
                      <div className="flex items-center gap-4">
                        <div className="font-display font-black italic text-base text-zinc-500">
                          {timeSlot} hs
                        </div>
                        <div className="flex items-center gap-2">
                          <Lock className="w-3.5 h-3.5 text-zinc-600" />
                          <span>Bloqueado por rango extendido de horario</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                return null;
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. ESQUEMA SEMANAL (7 DÍAS)                                     */}
      {/* ------------------------------------------------------------- */}
      {viewMode === 'semana' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-emerald-500" />
              Semana del {weekDays[0]?.dayNumber} de {weekDays[0]?.monthShort} al {weekDays[6]?.dayNumber} de {weekDays[6]?.monthShort}
            </span>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              Haz clic en cualquier día para ingresar al Timeline
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
            {weekDays.map((day) => {
              const dayActiveBookings = allBookings.filter(b => b.fecha === day.dateStr && b.estado !== 'cancelado');
              const sortedDayBookings = [...dayActiveBookings].sort((a, b) => a.hora.localeCompare(b.hora));
              const realTurns = sortedDayBookings.filter(b => !b.nombre.includes('BLOQUEADO'));
              const isSelectedDay = day.dateStr === filterDate;

              return (
                <div 
                  key={day.dateStr}
                  onClick={() => {
                    setFilterDate(day.dateStr);
                    setViewMode('timeline');
                  }}
                  className={`bg-zinc-900 border rounded-2xl p-4 flex flex-col justify-between min-h-[300px] transition-all duration-200 cursor-pointer ${
                    day.isToday 
                      ? 'border-emerald-500/60 bg-emerald-950/10 shadow-lg shadow-emerald-500/5' 
                      : isSelectedDay
                        ? 'border-white/40 bg-zinc-850'
                        : 'border-white/5 hover:border-emerald-500/30 hover:bg-zinc-850/60'
                  }`}
                >
                  <div>
                    {/* Header del Día */}
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5">
                      <div>
                        <span className={`text-[11px] font-black uppercase tracking-wider block ${day.isToday ? 'text-emerald-400' : 'text-zinc-400'}`}>
                          {day.shortName}
                        </span>
                        <span className="font-display font-black text-xl italic text-white">
                          {day.dayNumber} {day.monthShort}
                        </span>
                      </div>

                      {day.isSunday ? (
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-zinc-800 text-zinc-500">
                          CERRADO
                        </span>
                      ) : (
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-lg ${
                          realTurns.length > 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-500'
                        }`}>
                          {realTurns.length} {realTurns.length === 1 ? 'turno' : 'turnos'}
                        </span>
                      )}
                    </div>

                    {/* Lista de Turnos del Día */}
                    {day.isSunday ? (
                      <div className="py-10 text-center text-zinc-600">
                        <Lock className="w-6 h-6 mx-auto mb-1 opacity-50" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">Domingo Libre</p>
                      </div>
                    ) : sortedDayBookings.length === 0 ? (
                      <div className="py-10 text-center text-zinc-600">
                        <Clock className="w-6 h-6 mx-auto mb-1 opacity-40" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Sin Reservas</p>
                        <p className="text-[9px] text-zinc-600 mt-1">Día 100% disponible</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 scrollbar-thin">
                        {sortedDayBookings.map((bk) => (
                          <div 
                            key={bk.id}
                            className="bg-slate-950 p-2.5 rounded-xl border border-white/5 text-xs hover:border-emerald-500/30 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-display font-black italic text-emerald-400 text-xs">
                                {bk.hora} hs
                              </span>
                              <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                bk.nombre.includes('BLOQUEADO') ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-500/20 text-blue-400'
                              }`}>
                                {bk.nombre.includes('BLOQUEADO') ? 'BLOQUEO' : (bk.estado || 'CONFIRMADO')}
                              </span>
                            </div>
                            <p className="font-bold text-white truncate text-[11px]">
                              {bk.nombre}
                            </p>
                            <p className="text-[9px] text-zinc-400 truncate">
                              {bk.tipo} – {bk.servicio}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-emerald-400">
                    <span>Abrir Timeline</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. BUSCADOR & HISTORIAL DE TURNOS                               */}
      {/* ------------------------------------------------------------- */}
      {viewMode === 'buscar' && (
        <div className="space-y-4">
          
          {/* Search Bar & Filters */}
          <div className="bg-zinc-900 border border-white/10 rounded-3xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, teléfono, auto, fecha o servicio..."
                  className="w-full bg-slate-950 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-emerald-500 transition-colors"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Status Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mr-2 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Estado:
              </span>
              {(['todos', 'pendiente', 'confirmado', 'hecho', 'cancelado', 'bloqueo'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    statusFilter === st
                      ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                      : 'bg-slate-950 text-zinc-400 hover:text-white border border-white/5'
                  }`}
                >
                  {st === 'todos' ? 'Todos' : st === 'bloqueo' ? 'Bloqueos' : st}
                </button>
              ))}
            </div>
          </div>

          {/* Results List */}
          <div className="space-y-3">
            {filteredSearchBookings.length === 0 ? (
              <div className="bg-zinc-900 border border-white/10 rounded-3xl p-12 text-center text-zinc-500">
                <Search className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-bold">No se encontraron turnos que coincidan con la búsqueda.</p>
              </div>
            ) : (
              filteredSearchBookings.map((book) => {
                const isBlocked = book.nombre.includes('BLOQUEADO');
                const telClean = book.telefono.replace(/\D/g, '');

                return (
                  <div 
                    key={book.id}
                    className="bg-zinc-900 border border-white/10 rounded-2xl p-5 hover:border-emerald-500/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-display font-black italic text-lg text-emerald-400">
                          {book.fecha} • {book.hora} hs
                        </span>
                        {getStatusBadge(book.estado, isBlocked)}
                        <span className="text-xs font-black text-zinc-300">
                          {book.tipo}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-white font-bold text-base">
                        <span>{book.nombre}</span>
                        {book.telefono !== '00000000' && (
                          <span className="text-xs text-zinc-400 font-normal">({book.telefono})</span>
                        )}
                      </div>

                      <p className="text-xs text-zinc-400">
                        {book.servicio}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => {
                          setFilterDate(book.fecha);
                          setViewMode('timeline');
                        }}
                        className="px-3 py-1.5 bg-white/5 hover:bg-emerald-500 hover:text-slate-950 text-zinc-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                      >
                        Ver en Día
                      </button>

                      {!isBlocked && telClean.length >= 8 && (
                        <a 
                          href={`https://wa.me/${telClean.startsWith('54') ? telClean : `549${telClean}`}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-slate-950 rounded-xl transition-all"
                          title="WhatsApp"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: NUEVO TURNO MANUAL                                      */}
      {/* ------------------------------------------------------------- */}
      <AnimatePresence>
        {showManualBookingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-black italic text-white">
                      AGENDAR TURNO MANUAL
                    </h3>
                    <p className="text-[11px] text-zinc-400">Para clientes que reservan en persona o por llamada</p>
                  </div>
                </div>

                <button 
                  onClick={() => setShowManualBookingModal(false)}
                  className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateManualBooking} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-1">
                    Nombre del Cliente *
                  </label>
                  <input 
                    type="text" 
                    required
                    value={mbName}
                    onChange={(e) => setMbName(e.target.value)}
                    placeholder="Ej: Carlos Gómez"
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-1">
                    Teléfono / WhatsApp
                  </label>
                  <input 
                    type="tel" 
                    value={mbPhone}
                    onChange={(e) => setMbPhone(e.target.value)}
                    placeholder="Ej: 2995123456"
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-1">
                      Fecha
                    </label>
                    <input 
                      type="date" 
                      required
                      value={mbDate}
                      onChange={(e) => setMbDate(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-1">
                      Hora de Inicio
                    </label>
                    <select 
                      value={mbTime}
                      onChange={(e) => setMbTime(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                    >
                      {['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'].map(h => (
                        <option key={h} value={h}>{h} hs</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-1">
                      Vehículo
                    </label>
                    <select 
                      value={mbVehicle}
                      onChange={(e) => setMbVehicle(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                    >
                      <option value="auto">Auto / Hatchback</option>
                      <option value="suv">SUV / Utilitario</option>
                      <option value="pickup">Pickup / Camioneta</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-1">
                      Duración Estimada
                    </label>
                    <select 
                      value={mbDurationHours}
                      onChange={(e) => setMbDurationHours(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                    >
                      <option value="1">1 hora (1 módulo)</option>
                      <option value="1.5">1.5 horas (2 módulos)</option>
                      <option value="2">2 horas (2 módulos)</option>
                      <option value="3">3 horas (3 módulos - Combo Full)</option>
                      <option value="4">4 horas (4 módulos - Detallado)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-1">
                    Servicio
                  </label>
                  <select 
                    value={mbService}
                    onChange={(e) => setMbService(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  >
                    <option value="Lavado Exterior Artesanal">Lavado Exterior Artesanal</option>
                    <option value="Detallado Interior Profundo">Detallado Interior Profundo</option>
                    <option value="Pack Full (Exterior + Interior)">Pack Full (Exterior + Interior)</option>
                    <option value="Limpieza de Tapizados de Tela">Limpieza de Tapizados de Tela</option>
                    <option value="Limpieza y Nutrición de Cuero">Limpieza y Nutrición de Cuero</option>
                    <option value="Limpieza de Techo">Limpieza de Techo</option>
                    <option value="Tratamiento Acrílico / Cerámico">Tratamiento Acrílico / Cerámico</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-1">
                    Precio Acordado ($ ARS) - Opcional
                  </label>
                  <input 
                    type="number" 
                    value={mbPrice}
                    onChange={(e) => setMbPrice(e.target.value)}
                    placeholder="Ej: 35000"
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-600 outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-1">
                    Notas adicionales (Opcional)
                  </label>
                  <input 
                    type="text" 
                    value={mbNotes}
                    onChange={(e) => setMbNotes(e.target.value)}
                    placeholder="Ej: Viene con el auto embarrado, cobrar recargo"
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-600 outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="pt-3 flex items-center justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowManualBookingModal(false)}
                    className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white"
                  >
                    Cancelar
                  </button>

                  <button 
                    type="submit"
                    disabled={isSavingManual}
                    className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {isSavingManual && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>Guardar Turno</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: BLOQUEAR HORARIOS / DÍA COMPLETO                       */}
      {/* ------------------------------------------------------------- */}
      <AnimatePresence>
        {showBlockModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-black italic text-white">
                      BLOQUEAR DISPONIBILIDAD
                    </h3>
                    <p className="text-[11px] text-zinc-400">Fecha: {filterDate}</p>
                  </div>
                </div>

                <button 
                  onClick={() => setShowBlockModal(false)}
                  className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Al bloquear horarios, la web ocultará inmediatamente esos cupos para que ningún cliente pueda reservarlos.
                </p>

                <div className="space-y-3">
                  <button 
                    onClick={handleBlockFullDay}
                    className="w-full p-4 bg-zinc-800 hover:bg-zinc-700 border border-white/5 rounded-2xl flex items-center justify-between text-left transition-all group cursor-pointer"
                  >
                    <div>
                      <div className="text-sm font-black text-white group-hover:text-amber-400 transition-colors">
                        🚫 Bloquear Todo el Día ({filterDate})
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Ideal para feriados, días no laborables o mantenimiento
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-amber-400" />
                  </button>

                  <div className="p-4 bg-slate-950 rounded-2xl border border-white/5 space-y-3">
                    <div className="text-xs font-black uppercase tracking-wider text-zinc-400">
                      O bloquear horario individual en Timeline:
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      En la vista Timeline Diario podés hacer clic en el botón <strong>"Bloquear"</strong> al lado de cada horario específico.
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button 
                    onClick={() => setShowBlockModal(false)}
                    className="px-5 py-2 text-xs font-bold text-zinc-400 hover:text-white"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
