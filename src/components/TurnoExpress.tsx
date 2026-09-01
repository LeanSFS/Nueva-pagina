import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Zap, 
  Car, 
  Truck, 
  ShieldCheck, 
  Calendar, 
  Clock, 
  User, 
  Phone, 
  MapPin, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  Sparkles, 
  AlertTriangle, 
  MessageCircle,
  ExternalLink,
  ChevronRight,
  HelpCircle,
  Clock3
} from 'lucide-react';
import { VehicleType, ServiceKey } from '../types.ts';
import { SERVICES, VEHICLES } from '../constants.ts';
import { 
  firestoreService, 
  CatalogService, 
  CatalogVehicle 
} from '../services/firestoreService.ts';
import { 
  fetchSlots, 
  createBooking,
  TimeSlot, 
  getArgentinaDate 
} from '../services/availabilityService.ts';
import { telegramService } from '../services/telegramService.ts';
import { metricsService } from '../services/metricsService.ts';

interface TurnoExpressProps {
  onBackToHome: () => void;
  dbServices?: CatalogService[];
  dbVehicles?: CatalogVehicle[];
}

export default function TurnoExpress({ 
  onBackToHome, 
  dbServices = [], 
  dbVehicles = [] 
}: TurnoExpressProps) {
  // 1. Vehicle & Services state
  const [vehicle, setVehicle] = useState<VehicleType>('auto');
  const [selectedServices, setSelectedServices] = useState<string[]>(['lavado_exterior', 'detallado_interior']); // Default to Pack Full
  
  // 2. Availability state
  const [slotsData, setSlotsData] = useState<TimeSlot[]>([]);
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(true);
  
  // 3. Client info state
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientConfirmedLocation, setClientConfirmedLocation] = useState(true);
  
  // 4. Submission & UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [weatherData, setWeatherData] = useState<Record<string, { isRainy: boolean; code: number }>>({});

  // Active services list
  const activeServices = useMemo(() => {
    const cleanDb = dbServices.filter(s => s.id !== 'Exterior' && s.id !== 'Interior' && s.id !== 'Full');
    const list = [...cleanDb];
    SERVICES.forEach(staticSrv => {
      if (!list.some(item => item.id === staticSrv.id)) {
        list.push(staticSrv as unknown as CatalogService);
      }
    });
    const visibleList = list.filter(s => !s.isHidden);
    const order = ['lavado_exterior', 'detallado_interior', 'tapizados_tela', 'tapizados_cuero', 'limpieza_techo', 'tratamiento_vidrios'];
    return visibleList.sort((a, b) => {
      const idxA = order.indexOf(a.id);
      const idxB = order.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [dbServices]);

  const activeVehicles = useMemo(() => {
    const list = dbVehicles.length > 0 ? [...dbVehicles] : [...VEHICLES];
    const order = ['auto', 'suv', 'pickup'];
    return list.sort((a, b) => {
      const idxA = order.indexOf(a.id);
      const idxB = order.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [dbVehicles]);

  // Load weather
  useEffect(() => {
    async function fetchWeather() {
      try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-38.9333&longitude=-67.9833&daily=weather_code&timezone=auto');
        const data = await res.json();
        if (data && data.daily && data.daily.time) {
          const map: Record<string, { isRainy: boolean; code: number }> = {};
          data.daily.time.forEach((time: string, i: number) => {
            const code = data.daily.weather_code[i];
            const isRainy = [61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code);
            map[time] = { isRainy, code };
          });
          setWeatherData(map);
        }
      } catch (e) {
        console.log('Unable to fetch weather for express:', e);
      }
    }
    fetchWeather();
  }, []);

  // Quick packs
  const quickPacks = [
    {
      id: 'pack_full',
      name: 'PACK FULL 💫',
      badge: 'MÁS ELEGIDO',
      desc: 'Lavado Exterior + Detallado Interior completo',
      services: ['lavado_exterior', 'detallado_interior'],
    },
    {
      id: 'solo_exterior',
      name: 'Lavado Exterior 🧼',
      badge: 'RÁPIDO',
      desc: 'Espuma activa, llantas, pasaruedas y cera rápida',
      services: ['lavado_exterior'],
    },
    {
      id: 'solo_interior',
      name: 'Detallado Interior ✨',
      badge: 'PROFUNDO',
      desc: 'Aspirado exhaustivo, plásticos UV y acondicionador',
      services: ['detallado_interior'],
    },
    {
      id: 'tapizados_tela_pack',
      name: 'Interior + Tapizados Tela 💺',
      badge: 'DESINFECCIÓN',
      desc: 'Detallado interior + Extracción química de butacas',
      services: ['detallado_interior', 'tapizados_tela'],
    },
  ];

  // Refresh slots
  const refreshSlots = useCallback(async () => {
    setIsLoadingSlots(true);
    try {
      const data = await fetchSlots(true);
      if (data && data.length > 0) {
        setSlotsData(data);
        // Auto select first available day with slots
        if (!selectedDateStr) {
          const firstWithSlots = data.find(d => d.slots && d.slots.length > 0);
          if (firstWithSlots) {
            setSelectedDateStr(firstWithSlots.fecha);
          }
        }
      }
    } catch (e) {
      console.error('Error fetching express slots:', e);
    } finally {
      setIsLoadingSlots(false);
    }
  }, [selectedDateStr]);

  useEffect(() => {
    refreshSlots();
    metricsService.logAction('inicio_reserva');
  }, [refreshSlots]);

  // Duration & Price Calculations
  const calculatePrice = (srvIds: string[], vType: VehicleType) => {
    return srvIds.reduce((total, id) => {
      const srv = activeServices.find(s => s.id === id);
      if (!srv) return total;
      if (srv.prices && srv.prices[vType] !== undefined) {
        return total + srv.prices[vType];
      }
      const base = srv.basePrice || 15000;
      const extra = vType === 'pickup' ? 15000 : (vType === 'suv' ? 5000 : 0);
      return total + base + extra;
    }, 0);
  };

  const currentPrice = useMemo(() => {
    return calculatePrice(selectedServices, vehicle);
  }, [selectedServices, vehicle, activeServices]);

  const totalDuration = useMemo(() => {
    if (selectedServices.length === 0) return 60;
    return selectedServices.reduce((total, sId) => {
      const srv = activeServices.find(s => s.id === sId);
      const defaultDuration = SERVICES.find(st => st.id === sId)?.duration || 60;
      return total + (srv?.duration || defaultDuration);
    }, 0);
  }, [selectedServices, activeServices]);

  const formatDurationHours = (mins: number) => {
    if (!mins || mins <= 0) return '0min';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}min`;
    if (h > 0) return `${h}h`;
    return `${m}min`;
  };

  // Slot validity in Argentina Timezone
  const isSlotInPast = (fechaStr: string, slotTimeStr: string) => {
    const now = getArgentinaDate();
    const [slotYear, slotMonth, slotDay] = fechaStr.split('-').map(Number);
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hour = now.getHours();
    const minute = now.getMinutes();

    if (slotYear < year) return true;
    if (slotYear > year) return false;
    if (slotMonth < month) return true;
    if (slotMonth > month) return false;
    if (slotDay < day) return true;
    if (slotDay > day) return false;

    const [slotHour, slotMinute] = slotTimeStr.split(':').map(Number);
    if (slotHour < hour) return true;
    if (slotHour === hour && slotMinute <= minute) return true;
    return false;
  };

  const getBlockedSlotsList = useCallback((startHour: string, durationMinutes: number) => {
    const [h, m] = startHour.split(':').map(Number);
    const startMins = h * 60 + (m || 0);
    const endMins = startMins + (durationMinutes || 60);
    const blocked: string[] = [];

    for (let mins = 7 * 60; mins <= 18 * 60; mins += 60) {
      if (mins >= startMins && mins < endMins) {
        const slotH = Math.floor(mins / 60);
        const slotM = mins % 60;
        blocked.push(`${String(slotH).padStart(2, '0')}:${String(slotM).padStart(2, '0')}`);
      }
    }
    return blocked.length > 0 ? blocked : [startHour];
  }, []);

  const isStartSlotAvailableForDuration = useCallback((startStr: string, freeSlots: string[], durationMinutes: number) => {
    const [h, m] = startStr.split(':').map(Number);
    const startMins = h * 60 + (m || 0);
    const endMins = startMins + durationMinutes;

    if (endMins > 19 * 60 + 30) return false;
    const neededSlots = getBlockedSlotsList(startStr, durationMinutes);
    return neededSlots.every(slot => freeSlots.includes(slot));
  }, [getBlockedSlotsList]);

  // Filtered available slots & dates
  const filteredSlotsData = useMemo(() => {
    return slotsData.map(s => {
      if (!s) return null;
      const originalSlots = s.slots || [];
      const futureSlots = originalSlots.filter(slotTime => !isSlotInPast(s.fecha, slotTime));
      return {
        ...s,
        slots: futureSlots,
        count: futureSlots.length
      };
    }).filter(Boolean) as TimeSlot[];
  }, [slotsData]);

  const availableDates = useMemo(() => {
    return filteredSlotsData
      .filter(s => s && s.fecha && s.fecha.includes('-'))
      .map(s => {
        const [y, m, d] = s.fecha.split('-').map(Number);
        const freeSlots = s.slots || [];
        const validStartSlotsCount = freeSlots.filter(startStr => 
          isStartSlotAvailableForDuration(startStr, freeSlots, totalDuration)
        ).length;

        return {
          str: s.fecha,
          date: new Date(y, m - 1, d),
          slotsCount: validStartSlotsCount
        };
      })
      .filter(d => d.date.getDay() !== 0); // Exclude Sundays
  }, [filteredSlotsData, totalDuration, isStartSlotAvailableForDuration]);

  const availableTimesForSelectedDate = useMemo(() => {
    if (!selectedDateStr) return [];
    const dayData = filteredSlotsData.find(s => s.fecha === selectedDateStr);
    if (!dayData) return [];
    const allFreeSlots = dayData.slots || [];
    return allFreeSlots.filter((startStr: string) => 
      isStartSlotAvailableForDuration(startStr, allFreeSlots, totalDuration)
    );
  }, [selectedDateStr, filteredSlotsData, totalDuration, isStartSlotAvailableForDuration]);

  // Handlers
  const handleToggleService = (serviceId: string) => {
    let next = [...selectedServices];
    if (next.includes(serviceId)) {
      if (next.length === 1) return; // Must have at least 1 service
      next = next.filter(id => id !== serviceId);
    } else {
      if (serviceId === 'tapizados_tela') {
        next = next.filter(id => id !== 'tapizados_cuero');
      } else if (serviceId === 'tapizados_cuero') {
        next = next.filter(id => id !== 'tapizados_tela');
      }
      next.push(serviceId);
    }
    setSelectedServices(next);
    setSelectedTime(null);
  };

  const handleSelectPack = (packServices: string[]) => {
    setSelectedServices(packServices);
    setSelectedTime(null);
  };

  const handleCopyExpressLink = () => {
    const url = `${window.location.origin}/turnoexpress`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Submit Turno Express
  const handleConfirmExpressBooking = async () => {
    if (!selectedDateStr || !selectedTime || !vehicle || selectedServices.length === 0 || !clientName.trim() || !clientPhone.trim() || !clientConfirmedLocation) {
      return;
    }

    setIsSubmitting(true);
    const serviceName = selectedServices.map(sId => activeServices.find(s => s.id === sId)?.name || sId).join(' + ');
    const vehicleName = activeVehicles.find(v => v.id === vehicle)?.name || vehicle;
    const blocked = getBlockedSlotsList(selectedTime, totalDuration);

    try {
      const result = await createBooking({
        fecha: selectedDateStr,
        hora: selectedTime,
        tipo: vehicleName,
        servicio: `${serviceName} – $${currentPrice}`,
        nombre: clientName.trim(),
        telefono: clientPhone.trim(),
        direccion: "Venezuela 1659 (Domicilio)",
        blockedSlots: blocked
      });

      if (result.ok) {
        metricsService.logAction('reserva_completada');

        // Send Telegram notification in background
        telegramService.sendBookingNotification({
          nombre: clientName.trim(),
          telefono: clientPhone.trim(),
          tipo: vehicleName,
          servicio: `${serviceName} ($${currentPrice.toLocaleString('es-AR')}) [TURNO EXPRESS ⚡]`,
          fecha: selectedDateStr,
          hora: selectedTime,
          direccion: "Venezuela 1659 (Cipolletti, Domicilio)"
        }).catch(err => console.error('Silent error triggering Telegram notify:', err));

        // Format Date for WhatsApp
        const [y, m, d] = selectedDateStr.split('-');
        const formattedDate = `${d}/${m}/${y}`;

        const text = `*⚡ Nueva Reserva Turno Express - LyS Lavados*%0A%0A` +
          `*Servicio:* ${serviceName}%0A` +
          `*Vehículo:* ${vehicleName}%0A` +
          `*Fecha:* ${formattedDate}%0A` +
          `*Hora:* ${selectedTime} hs%0A` +
          `*Total:* $${currentPrice.toLocaleString('es-AR')}%0A%0A` +
          `*Cliente:* ${clientName.trim()}%0A` +
          `*Teléfono:* ${clientPhone.trim()}%0A` +
          `*Ubicación:* Venezuela 1659 (Cipolletti)%0A%0A` +
          `_¿Podrían confirmarme el turno express?_`;

        window.open(`https://wa.me/2995760611?text=${text}`, '_blank');
        setShowSuccessModal(true);
      } else {
        alert('Hubo un inconveniente al registrar el turno: ' + (result.error || 'Por favor intente nuevamente'));
      }
    } catch (e: any) {
      alert('Error en la conexión: ' + (e?.message || 'Intente nuevamente'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const weatherForSelected = selectedDateStr ? weatherData[selectedDateStr] : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-emerald-500 selection:text-black antialiased pb-16">
      {/* Top Bar / Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-white/10 px-4 py-3.5 sm:px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onBackToHome}
              className="w-9 h-9 rounded-xl bg-zinc-900 border border-white/10 hover:border-white/20 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              title="Volver a la página principal"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-black italic tracking-tighter text-white text-base">
                  LyS <span className="text-emerald-400">LAVADOS</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-black tracking-wider uppercase">
                  <Zap className="w-3 h-3 fill-emerald-400 text-emerald-400" />
                  Turno Express
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">Agendá en 30 segundos sin vueltas</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyExpressLink}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
              title="Copiar link para enviar por WhatsApp"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
              <span>{copiedLink ? '¡Link Copiado!' : 'Copiar Link'}</span>
            </button>

            <button
              onClick={onBackToHome}
              className="text-xs text-zinc-400 hover:text-emerald-400 font-bold transition-colors cursor-pointer"
            >
              Ver Web Completa
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
        
        {/* Intro Card */}
        <div className="bg-gradient-to-br from-zinc-900/90 via-zinc-900/50 to-zinc-950 border border-emerald-500/30 rounded-3xl p-5 sm:p-6 mb-6 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-44 h-44 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-widest mb-1.5">
                <Sparkles className="w-4 h-4" />
                <span>Reserva Inmediata</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-display font-black italic uppercase tracking-tight text-white">
                Sacá tu turno para lavado o detailing
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                Elegí vehículo, servicio y horario disponible en tiempo real.
              </p>
            </div>
            <div className="bg-zinc-950/80 border border-white/10 rounded-2xl p-3 sm:text-right shrink-0">
              <span className="text-[10px] uppercase font-bold text-zinc-500 block">Ubicación del Taller</span>
              <span className="text-xs font-bold text-zinc-200 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Venezuela 1659, Cipolletti
              </span>
            </div>
          </div>
        </div>

        {/* PASO 1: VEHÍCULO */}
        <section className="mb-7">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-display font-black uppercase italic tracking-wider text-zinc-300 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-xs font-black">1</span>
              <span>¿Qué vehículo tenés?</span>
            </h2>
            <span className="text-[11px] text-emerald-400 font-bold uppercase">
              {activeVehicles.find(v => v.id === vehicle)?.name || vehicle}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
            {activeVehicles.map((v) => {
              const isSelected = vehicle === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVehicle(v.id as VehicleType)}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all text-center flex flex-col items-center justify-center gap-2 cursor-pointer select-none relative ${
                    isSelected
                      ? 'bg-zinc-900 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500 scale-[1.02]'
                      : 'bg-zinc-900/40 border-white/10 hover:border-white/20 hover:bg-zinc-900/70 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  )}
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-950 text-zinc-400'
                  }`}>
                    {v.id === 'pickup' ? (
                      <Truck className="w-6 h-6 sm:w-7 sm:h-7" />
                    ) : (
                      <Car className="w-6 h-6 sm:w-7 sm:h-7" />
                    )}
                  </div>
                  <div className="text-center">
                    <span className={`text-xs sm:text-sm font-display font-black italic uppercase block ${
                      isSelected ? 'text-white' : 'text-zinc-300'
                    }`}>
                      {v.name}
                    </span>
                    <span className="text-[10px] text-zinc-500 block leading-tight">
                      {v.id === 'auto' ? 'Sedán / Hatch' : v.id === 'suv' ? 'SUV / Utilitario' : 'Camioneta / 4x4'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* PASO 2: SERVICIOS Y PACKS */}
        <section className="mb-7">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-display font-black uppercase italic tracking-wider text-zinc-300 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-xs font-black">2</span>
              <span>Elegí tu servicio o pack</span>
            </h2>
            <span className="text-xs font-bold text-zinc-400">
              Duración: <strong className="text-emerald-400">{formatDurationHours(totalDuration)}</strong>
            </span>
          </div>

          {/* Quick Packs Carousel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
            {quickPacks.map((pack) => {
              const isPackActive = pack.services.length === selectedServices.length && 
                pack.services.every(sId => selectedServices.includes(sId));
              const packPrice = calculatePrice(pack.services, vehicle);

              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => handleSelectPack(pack.services)}
                  className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all cursor-pointer select-none flex flex-col justify-between ${
                    isPackActive
                      ? 'bg-zinc-900 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.12)] ring-1 ring-emerald-500'
                      : 'bg-zinc-900/40 border-white/10 hover:border-white/20 hover:bg-zinc-900/70'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {pack.badge}
                      </span>
                      <span className="text-sm sm:text-base font-display font-black text-emerald-400">
                        ${packPrice.toLocaleString('es-AR')}
                      </span>
                    </div>
                    <h3 className="text-sm font-display font-black italic uppercase text-white mt-1">
                      {pack.name}
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                      {pack.desc}
                    </p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">
                      {pack.services.length} {pack.services.length === 1 ? 'servicio' : 'servicios'}
                    </span>
                    <span className={`font-bold flex items-center gap-1 ${isPackActive ? 'text-emerald-400' : 'text-zinc-400'}`}>
                      {isPackActive ? '✓ Seleccionado' : 'Elegir pack →'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Individual Toggle List */}
          <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-3.5 sm:p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-2.5">
              O personalizá sumando servicios individuales:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activeServices.map((srv) => {
                const isSelected = selectedServices.includes(srv.id);
                const srvPrice = calculatePrice([srv.id], vehicle);
                return (
                  <button
                    key={srv.id}
                    type="button"
                    onClick={() => handleToggleService(srv.id)}
                    className={`px-3 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500/60 text-white'
                        : 'bg-zinc-950/60 border-white/10 hover:border-white/20 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-emerald-500 border-emerald-400 text-black font-bold' : 'border-zinc-700 bg-zinc-900'
                      }`}>
                        {isSelected && '✓'}
                      </div>
                      <div className="truncate">
                        <span className="text-xs font-bold block truncate text-zinc-200">{srv.name}</span>
                        <span className="text-[10px] text-zinc-500">{srv.duration || 60} min</span>
                      </div>
                    </div>
                    <span className="text-xs font-bold font-mono text-emerald-400 shrink-0">
                      +${srvPrice.toLocaleString('es-AR')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* PASO 3: DÍA Y HORARIO */}
        <section className="mb-7">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-display font-black uppercase italic tracking-wider text-zinc-300 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-xs font-black">3</span>
              <span>Elegí el día y horario</span>
            </h2>
            {isLoadingSlots && (
              <span className="text-[11px] text-emerald-400 font-bold animate-pulse">
                Actualizando disponibilidad...
              </span>
            )}
          </div>

          {/* Weather Alert if rain is forecast */}
          {weatherForSelected && weatherForSelected.isRainy && (
            <div className="mb-3.5 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Pronóstico de lluvia/tormenta</strong> para este día. Si llueve reprogramamos sin costo o podés elegir otro día seco.
              </span>
            </div>
          )}

          {/* Dates Horizontal Scroll */}
          <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none">
            {availableDates.length === 0 ? (
              <div className="text-xs text-zinc-500 italic p-3">
                No hay turnos disponibles para los próximos 14 días.
              </div>
            ) : (
              availableDates.map((item) => {
                const isSelected = selectedDateStr === item.str;
                const options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
                const label = item.date.toLocaleDateString('es-AR', options);
                const [weekday, dayAndMonth] = label.split(',');

                return (
                  <button
                    key={item.str}
                    type="button"
                    onClick={() => {
                      setSelectedDateStr(item.str);
                      setSelectedTime(null);
                    }}
                    className={`shrink-0 min-w-[90px] p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                      isSelected
                        ? 'bg-zinc-900 border-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500 scale-[1.02]'
                        : item.slotsCount === 0
                          ? 'bg-zinc-950/40 border-white/5 opacity-40 cursor-not-allowed text-zinc-600'
                          : 'bg-zinc-900/40 border-white/10 hover:border-white/20 hover:bg-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <span className="text-[11px] font-black uppercase tracking-wider block text-emerald-400">
                      {weekday || label}
                    </span>
                    <span className="text-sm font-display font-black text-white block">
                      {dayAndMonth || item.str.split('-')[2]}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                      item.slotsCount > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {item.slotsCount > 0 ? `${item.slotsCount} libres` : 'Lleno'}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Time Slots Grid */}
          <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-3">
              Horarios de inicio disponibles:
            </span>

            {availableTimesForSelectedDate.length === 0 ? (
              <div className="text-center py-6 text-zinc-500 text-xs">
                {selectedDateStr ? 'No hay horarios disponibles para esta duración en la fecha seleccionada. Elegí otro día.' : 'Seleccioná un día arriba para ver los horarios.'}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {availableTimesForSelectedDate.map((timeStr) => {
                  const isSelected = selectedTime === timeStr;
                  return (
                    <button
                      key={timeStr}
                      type="button"
                      onClick={() => setSelectedTime(timeStr)}
                      className={`py-2.5 px-3 rounded-xl border text-center font-display font-black italic text-xs tracking-wider transition-all cursor-pointer select-none ${
                        isSelected
                          ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.3)] scale-[1.03]'
                          : 'bg-zinc-950 border-white/10 hover:border-emerald-500/40 text-zinc-200 hover:text-white hover:bg-zinc-900'
                      }`}
                    >
                      {timeStr} hs
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* PASO 4: DATOS RÁPIDOS Y CONFIRMACIÓN */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-display font-black uppercase italic tracking-wider text-zinc-300 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-xs font-black">4</span>
              <span>Tus datos para confirmar</span>
            </h2>
          </div>

          <div className="bg-zinc-900/70 border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-zinc-400 block mb-1.5">
                  Nombre y Apellido *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ej: Leandro Saralegui"
                    className="w-full bg-zinc-950 border border-white/15 focus:border-emerald-500 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 block mb-1.5">
                  Teléfono / WhatsApp *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="Ej: 299 1234567"
                    className="w-full bg-zinc-950 border border-white/15 focus:border-emerald-500 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Checkbox Ubicación */}
            <div className="pt-2 border-t border-white/10">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={clientConfirmedLocation}
                  onChange={(e) => setClientConfirmedLocation(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-emerald-500 accent-emerald-500"
                />
                <span className="text-xs text-zinc-400">
                  Entiendo que el taller está ubicado en <strong className="text-zinc-200">Venezuela 1659, Cipolletti</strong> y me comprometo a llevar el vehículo en el horario agendado.
                </span>
              </label>
            </div>

            {/* Total Summary Card */}
            <div className="bg-zinc-950/90 border border-emerald-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-500 block">Resumen del Turno</span>
                <p className="text-xs text-zinc-200 font-medium mt-0.5">
                  {activeVehicles.find(v => v.id === vehicle)?.name} • {selectedDateStr ? `${selectedDateStr.split('-')[2]}/${selectedDateStr.split('-')[1]}` : 'Fecha a elegir'} • {selectedTime ? `${selectedTime} hs` : 'Hora a elegir'}
                </p>
              </div>
              <div className="sm:text-right">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block">Total a Pagar</span>
                <span className="text-xl sm:text-2xl font-display font-black text-white">
                  ${currentPrice.toLocaleString('es-AR')}
                </span>
              </div>
            </div>

            {/* Main Submit Button */}
            <button
              type="button"
              onClick={handleConfirmExpressBooking}
              disabled={isSubmitting || !selectedDateStr || !selectedTime || !clientName.trim() || !clientPhone.trim() || !clientConfirmedLocation}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-display font-black italic uppercase tracking-wider py-4 px-6 rounded-2xl text-sm sm:text-base flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20 transition-all cursor-pointer active:scale-[0.99]"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Agendando Turno Express...</span>
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 fill-slate-950" />
                  <span>CONFIRMAR TURNO EXPRESS ⚡</span>
                </>
              )}
            </button>
          </div>
        </section>

      </main>

      {/* SUCCESS MODAL */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-emerald-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl relative overflow-hidden">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <span className="text-xs font-black uppercase text-emerald-400 tracking-widest block mb-1">
              ¡Turno Registrado con Éxito!
            </span>
            <h3 className="text-xl font-display font-black italic uppercase text-white mb-2">
              ¡Te esperamos en LyS Lavados!
            </h3>
            <p className="text-xs text-zinc-300 mb-5 leading-relaxed">
              Tu turno para el <strong className="text-white">{selectedDateStr} a las {selectedTime} hs</strong> quedó agendado. Abrimos WhatsApp para enviarte la confirmación.
            </p>

            <div className="bg-zinc-950 p-4 rounded-2xl border border-white/10 text-left mb-6 space-y-1 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Cliente:</span>
                <strong className="text-white">{clientName}</strong>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Vehículo:</span>
                <strong className="text-white">{activeVehicles.find(v => v.id === vehicle)?.name}</strong>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Total:</span>
                <strong className="text-emerald-400">${currentPrice.toLocaleString('es-AR')}</strong>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Ubicación:</span>
                <strong className="text-white">Venezuela 1659</strong>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowSuccessModal(false);
                  onBackToHome();
                }}
                className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black italic uppercase text-xs tracking-wider transition-all cursor-pointer"
              >
                Listo, Volver al Inicio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
