/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  Droplets, 
  Sparkles, 
  Instagram, 
  Facebook, 
  ArrowRight, 
  CheckCircle2, 
  Smartphone,
  ChevronLeft,
  ChevronRight,
  Info,
  CalendarDays,
  User,
  Navigation as MapIcon,
  X,
  Loader2,
  Clock,
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  Star,
  ChevronDown,
  HelpCircle
} from 'lucide-react';
import { SERVICES, VEHICLES, BASE_PRICES, TYPE_EXTRA } from './constants.ts';
import { VehicleType, ServiceKey } from './types.ts';
import { fetchSlots, createBooking, TimeSlot } from './services/availabilityService.ts';
import AdminCaja from './components/AdminCaja.tsx';
import { metricsService } from './services/metricsService.ts';
import { firestoreService, CatalogService, CatalogVehicle, GalleryPhoto } from './services/firestoreService.ts';
import { telegramService } from './services/telegramService.ts';

// --- Internal Components ---

const FAQ_ITEMS = [
  {
    id: 1,
    question: "📍 ¿Dónde realizan el servicio? ¿Hacen a domicilio?",
    answer: "No realizo servicios a domicilio. Todos los trabajos los hago de forma profesional en mi domicilio particular en Venezuela 1659, Cipolletti. Al tener todas mis herramientas acá, puedo asegurarte un nivel de detalle y acabado que sería imposible lograr de otra manera."
  },
  {
    id: 2,
    question: "⏱️ ¿Cuánto tiempo demora el servicio?",
    answer: "El tiempo de trabajo varía según la opción que elijas para cuidar tu vehículo: el Lavado Exterior (Opción 1) demora aproximadamente 1 hora; la limpieza de Cabina Premium (Opción 2) tiene un tiempo estimado de 1 hora y media; y el tratamiento Completo Full (Opción 3) requiere entre 2.5 y 3 horas para una dedicación total. Te avisamos ni bien el vehículo esté listo para que lo retires impecable."
  },
  {
    id: 3,
    question: "🌧️ ¿Qué pasa si llueve el día de mi turno?",
    answer: "¡No te preocupes por el clima! Si el pronóstico anuncia tormenta o llueve durante el día de tu turno, nos comunicamos con vos para reprogramar el servicio para el día de sol o asfalto seco más cercano disponible, asegurando que tu auto ruede impecable y no se arruine el lavado."
  },
  {
    id: 4,
    question: "💳 ¿Cuáles son los medios de pago disponibles?",
    answer: "Para tu total comodidad aceptamos efectivo, transferencias bancarias y Mercado Pago. El pago se efectúa únicamente al momento de retirar tu vehículo una vez que lo revisas y quedas 100% conforme con el resultado final."
  },
  {
    id: 5,
    question: "📅 ¿Cómo cancelo o modifico mi reserva?",
    answer: "Si te surge un imprevisto, te pedimos que nos avises con al menos 24 horas de anticipación a través de WhatsApp. Así nos das la oportunidad de liberar ese horario para otro cliente que lo necesite y reprogramar tu turno con calma para otro momento oportuno."
  }
];

const SectionHeader = ({ kicker, title, number }: { kicker: string, title: string, number: string }) => (
  <div className="flex items-end justify-between gap-6 mb-6 md:mb-16">
    <div className="max-w-xl">
      <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
        <div className="w-1 md:w-1.5 h-1 md:h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-emerald-500/80 font-display font-bold text-[9px] md:text-xs uppercase tracking-[0.3em] block">{kicker}</span>
      </div>
      <h2 className="text-2xl md:text-6xl font-display font-black leading-[1.1] text-balance" dangerouslySetInnerHTML={{ __html: title }} />
    </div>
    <span className="hidden md:block font-display text-[12rem] font-black text-white/[0.02] leading-none select-none tracking-tighter pr-4">{number}</span>
  </div>
);

const Navigation = ({ setView, view }: { setView: (v: 'home' | 'booking') => void, view: string }) => (
  <nav className="absolute top-0 left-0 right-0 z-50 py-8 md:py-12 px-6 md:px-12 flex justify-between items-center transition-all duration-300">
      <div 
        onClick={() => {
          setView('home');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        className="flex items-center group cursor-pointer"
      >
        <img 
          src="./logo.png" 
          className="h-10 md:h-14 w-auto object-contain transition-transform group-hover:scale-105 duration-300" 
          alt="LyS Premium Detailing Logo" 
          referrerPolicy="no-referrer"
        />
      </div>

    <div className="flex items-center gap-4 md:gap-16">
      <div className="flex items-center gap-6 md:gap-12 text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-zinc-500">
        <button 
          onClick={() => {
            metricsService.logAction('click_servicios');
            if (view !== 'home') {
              setView('home');
              setTimeout(() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' }), 100);
            } else {
              document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' });
            }
          }}
          className="hover:text-emerald-500 transition-colors"
        >
          Servicios
        </button>
        <button 
          onClick={() => {
            if (view !== 'home') setView('home');
            setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100);
          }}
          className="hover:text-emerald-500 transition-colors"
        >
          Nosotros
        </button>
      </div>
    </div>
  </nav>
);

// --- Support Components ---

const SummaryItem = ({ label, value }: { label: string, value: string | undefined }) => (
  <div className="flex justify-between items-center py-1 group/row">
    <span className="text-[10px] font-black uppercase tracking-widest opacity-50">{label}</span>
    <span className="text-sm font-display font-black italic tracking-tighter text-right group-hover/row:scale-105 transition-transform origin-right">{value || '---'}</span>
  </div>
);

// --- Main App ---

export default function App() {
  const [view, setView] = useState<'home' | 'booking' | 'admin'>('home');
  const [dbServices, setDbServices] = useState<CatalogService[]>([]);
  const [dbVehicles, setDbVehicles] = useState<CatalogVehicle[]>([]);
  const [dbPhotos, setDbPhotos] = useState<GalleryPhoto[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const handleNextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % dbPhotos.length);
  };

  const handlePrevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + dbPhotos.length) % dbPhotos.length);
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const srvs = await firestoreService.getServices();
        setDbServices(srvs);
        const vehs = await firestoreService.getVehicles();
        setDbVehicles(vehs);
        const phts = await firestoreService.getGallery();
        setDbPhotos(phts);
      } catch (e) {
        console.error("Error loading db catalog in client:", e);
      }
    };
    loadData();
  }, [view]);

  const activeServices = useMemo(() => {
    return dbServices.length > 0 ? dbServices : SERVICES;
  }, [dbServices]);

  const activeVehicles = useMemo(() => {
    return dbVehicles.length > 0 ? dbVehicles : VEHICLES;
  }, [dbVehicles]);
  
  // Track Page Landing Visita
  useEffect(() => {
    metricsService.logAction('visita');
    telegramService.sendAccessNotification().catch(err => {
      console.warn('Access telegram notification delay or off:', err);
    });
  }, []);

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleType | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceKey | null>(null);
  
  // Availability state
  const [slotsData, setSlotsData] = useState<TimeSlot[]>(() => {
    try {
      const cached = sessionStorage.getItem('lys_slots_cache');
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 120000) return data;
      }
    } catch (e) {
      console.error('Error reading initial cache:', e);
    }
    return [];
  });
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null); // YYYY-MM-DD
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(() => {
    try {
      const cached = sessionStorage.getItem('lys_slots_cache');
      if (cached) {
        const { timestamp } = JSON.parse(cached);
        return (Date.now() - timestamp > 120000);
      }
    } catch (e) {}
    return true;
  });

  // Client data
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientConfirmedLocation, setClientConfirmedLocation] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const clientAddress = "Venezuela 1659, Cipolletti";

  // Refs for auto-scroll
  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);
  const step4Ref = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    if (ref.current) {
      ref.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start'
      });
    }
  };

  useEffect(() => {
    if (view === 'booking') {
      setTimeout(() => scrollToSection(step1Ref), 600);
    }
  }, [view]);

  // Handle selections with explicit scroll triggers
  const handleVehicleSelect = (type: VehicleType) => {
    setVehicle(type);
    setSelectedService(null);
    setSelectedDateStr(null);
    setSelectedTime(null);
    setTimeout(() => scrollToSection(step2Ref), 600);
  };

  const handleServiceSelect = (service: ServiceKey) => {
    setSelectedService(service);
    setSelectedDateStr(null);
    setSelectedTime(null);
    metricsService.logAction('click_servicios');
    setTimeout(() => scrollToSection(step3Ref), 600);
  };

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    setTimeout(() => scrollToSection(step4Ref), 600);
  };

  // Navigation handles
  const handleStartBooking = () => {
    // Reset all selection state to ensure we start at Step 1
    setVehicle(null);
    setSelectedService(null);
    setSelectedDateStr(null);
    setSelectedTime(null);
    setView('booking');
    metricsService.logAction('inicio_reserva');
  };

  // Confirmation state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      // If we don't have data yet, show loading
      if (slotsData.length === 0) {
        setIsLoadingSlots(true);
      }
      
      // Always fetch fresh data in background
      const data = await fetchSlots(true);
      
      if (data && data.length > 0) {
        setSlotsData(data);
      }
      setIsLoadingSlots(false);
    }
    load();
  }, []);

  // Helper to get current Date/Time in Argentina time (UTC-3)
  const getArgentinaDateTime = () => {
    try {
      const options = {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
      } as const;
      const formatter = new Intl.DateTimeFormat('en-US', options);
      const parts = formatter.formatToParts(new Date());
      const partMap: Record<string, string> = {};
      for (const part of parts) {
        partMap[part.type] = part.value;
      }
      
      const year = parseInt(partMap.year, 10);
      const month = parseInt(partMap.month, 10);
      const day = parseInt(partMap.day, 10);
      const hour = parseInt(partMap.hour, 10);
      const minute = parseInt(partMap.minute, 10);
      
      if (!isNaN(year) && !isNaN(month) && !isNaN(day) && !isNaN(hour) && !isNaN(minute)) {
        return { year, month, day, hour, minute };
      }
    } catch (e) {
      console.error('Error getting Argentina timezone date, falling back to local browser time:', e);
    }
    
    // Fallback to local system time
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes()
    };
  };

  const isSlotInPast = (fechaStr: string, slotTimeStr: string) => {
    const { year, month, day, hour, minute } = getArgentinaDateTime();
    const [slotYear, slotMonth, slotDay] = fechaStr.split('-').map(Number);
    
    if (slotYear < year) return true;
    if (slotYear > year) return false;
    
    if (slotMonth < month) return true;
    if (slotMonth > month) return false;
    
    if (slotDay < day) return true;
    if (slotDay > day) return false;
    
    // Same day, check hour and minutes
    const [slotHour, slotMinute] = slotTimeStr.split(':').map(Number);
    if (slotHour < hour) return true;
    if (slotHour === hour && slotMinute <= minute) return true;
    
    return false;
  };

  const filteredSlotsData = useMemo(() => {
    return slotsData.map(s => {
      if (!s) return null;
      const originalSlots = s.slots || [];
      const futureSlots = originalSlots.filter(slotTime => {
        return !isSlotInPast(s.fecha, slotTime);
      });
      return {
        ...s,
        slots: futureSlots,
        count: futureSlots.length
      };
    }).filter(Boolean) as typeof slotsData;
  }, [slotsData]);

  const availableDates = useMemo(() => {
    return filteredSlotsData
      .filter(s => s && s.fecha && s.fecha.includes('-'))
      .map(s => {
        const [y, m, d] = s.fecha.split('-').map(Number);
        return {
          str: s.fecha,
          date: new Date(y, m - 1, d),
          slotsCount: s.slots ? s.slots.length : (s.count || 0)
        };
      })
      .filter(item => item.date.getDay() !== 0); // 0 is Sunday
  }, [filteredSlotsData]);

  const availableTimes = useMemo(() => {
    if (!selectedDateStr) return [];
    const dayData = filteredSlotsData.find(s => s && s.fecha === selectedDateStr);
    return dayData ? (dayData.slots || []) : [];
  }, [selectedDateStr, filteredSlotsData]);

  // --- Weather Logic ---
  const [weatherData, setWeatherData] = useState<Record<string, { isRainy: boolean, code: number }>>({});
  
  useEffect(() => {
    async function fetchWeather() {
      try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-38.9333&longitude=-67.9833&daily=weather_code&timezone=auto');
        const data = await res.json();
        if (data.daily) {
          const map: Record<string, { isRainy: boolean, code: number }> = {};
          data.daily.time.forEach((time: string, i: number) => {
            const code = data.daily.weather_code[i];
            // Codes for rain/showers/drizzle: 51, 53, 55, 61, 63, 65, 80, 81, 82
            const isRainy = [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code);
            map[time] = { isRainy, code };
          });
          setWeatherData(map);
        }
      } catch (e) {
        console.log('Unable to fetch weather (offline or blocked):', e);
      }
    }
    fetchWeather();
  }, []);

  const weatherForSelected = selectedDateStr ? weatherData[selectedDateStr] : null;

  // --- Support Components ---
  
  const calculatePrice = (service: ServiceKey | null, vType: VehicleType | null) => {
    if (!service || !vType) return 0;

    const dbS = activeServices.find(s => s.id === service);
    const dbV = activeVehicles.find(v => v.id === vType);

    if (dbServices.length > 0 && dbVehicles.length > 0) {
      const basePrice = dbS ? dbS.basePrice : 0;
      const extraPrice = dbV ? dbV.extraPrice : 0;
      return basePrice + extraPrice;
    }
    
    // Exact overrides per user request (Updated with +$5k across all services)
    if (vType === 'pickup') {
      if (service === 'Exterior') return 30000;
      if (service === 'Interior') return 30000;
      if (service === 'Full') return 55000;
    }
    
    if (vType === 'suv') {
      if (service === 'Interior') return 25000;
      // Exterior SUV is 20000 + 5000 = 25000 based on constants
      // Full SUV is 40000 + 5000 = 45000 based on constants
    }

    const base = BASE_PRICES[service] || 0;
    const extra = TYPE_EXTRA[vType] || 0;
    return base + extra;
  };
  
  const currentPrice = useMemo(() => {
    return calculatePrice(selectedService, vehicle);
  }, [vehicle, selectedService]);

  const firstAvailableInfo = useMemo(() => {
    if (isLoadingSlots) return { day: 'Cargando...', times: 'Buscando horarios disponibles...' };
    const firstDay = availableDates.find(d => d.slotsCount > 0);
    if (firstDay) {
      try {
        const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
        const formatted = firstDay.date.toLocaleDateString('es-AR', options);
        
        // Find slot times for this date from filteredSlotsData
        const dayData = filteredSlotsData.find(s => s && s.fecha === firstDay.str);
        const times = dayData && dayData.slots ? dayData.slots.join(' / ') : '';
        
        return {
          day: formatted.charAt(0).toUpperCase() + formatted.slice(1),
          times: times
        };
      } catch (e) {
        console.error('Error formatting date:', e);
      }
    }
    return { day: 'Próximamente', times: '' };
  }, [availableDates, filteredSlotsData, isLoadingSlots]);

  const handleFinalBooking = async () => {
    if (!selectedDateStr || !selectedTime || !vehicle || !selectedService || !clientName || !clientPhone || !clientConfirmedLocation) return;

    setIsSubmitting(true);
    const serviceName = activeServices.find(s => s.id === selectedService)?.name || selectedService;
    const vehicleName = activeVehicles.find(v => v.id === vehicle)?.name || vehicle;

    const result = await createBooking({
      fecha: selectedDateStr,
      hora: selectedTime,
      tipo: vehicleName,
      servicio: `${serviceName} – $${currentPrice}`,
      nombre: clientName,
      telefono: clientPhone,
      direccion: "Venezuela 1659 (Domicilio)"
    });

    if (result.ok) {
      metricsService.logAction('reserva_completada');
      
      // Send Telegram notification in background
      telegramService.sendBookingNotification({
        nombre: clientName,
        telefono: clientPhone,
        tipo: vehicleName,
        servicio: `${serviceName} ($${currentPrice})`,
        fecha: selectedDateStr,
        hora: selectedTime,
        direccion: "Venezuela 1659 (Cipolletti, Domicilio)"
      }).catch(err => console.error('Silent error triggering Telegram notify:', err));

      // Generate WhatsApp msg
      const [y, m, d] = selectedDateStr.split('-');
      const formattedDate = `${d}/${m}/${y}`;

      const text = `*Nueva Reserva LyS Lavados*%0A%0A` +
        `*Servicio:* ${serviceName}%0A` +
        `*Vehículo:* ${vehicleName}%0A` +
        `*Fecha:* ${formattedDate}%0A` +
        `*Hora:* ${selectedTime}hs%0A%0A` +
        `*Cliente:* ${clientName}%0A` +
        `*Teléfono:* ${clientPhone}%0A` +
        `*Ubicación:* Venezuela 1659 (Domicilio)%0A%0A` +
        `_¿Podrían confirmarme el turno?_`;

      window.open(`https://wa.me/2995760611?text=${text}`, '_blank');
      
      // Reset view or show success
      setShowSuccessModal(true);
      setShowConfirmation(false);
    } else {
      alert('Error en la reserva: ' + (result.error || 'Intente nuevamente'));
    }
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen pt-24 md:pt-32 pb-24 overflow-x-hidden">
      <Navigation setView={setView} view={view} />
      
      <AnimatePresence mode="wait">
        {view === 'admin' ? (
          <motion.div
            key="admin"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.4 }}
          >
            <AdminCaja onBack={() => setView('home')} />
          </motion.div>
        ) : view === 'home' ? (
          <motion.div
            key="home"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.5 }}
          >
            {/* Hero Section */}
            <section className="relative px-6 md:px-12 pt-16 md:pt-48 pb-12 overflow-hidden min-h-[90vh] flex items-center">
              {/* Background Image for Mobile and Desktop Overlay */}
              <div className="absolute inset-0 -z-10 overflow-hidden">
                <img 
                  src="https://images.unsplash.com/photo-1552519507-da3b142c6e3d?q=80&w=2000&auto=format&fit=crop" 
                  alt="Background Car" 
                  className="w-full h-full object-cover object-[center_10%] opacity-[0.18] md:hidden"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-night via-transparent to-night md:hidden" />
              </div>

              {/* Ambient Lights */}
              <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[150px] -z-10 rounded-full animate-pulse md:block hidden" />
              <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[180px] -z-10 rounded-full animate-float md:block hidden" style={{ animationDelay: '-3s' }} />
              
              <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 md:gap-16 items-center relative z-10">
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="relative z-20"
                >
                  <h1 className="text-5xl md:text-8xl font-display font-black leading-[0.9] tracking-tighter mb-8 bg-gradient-to-b from-white via-white to-zinc-500 bg-clip-text text-transparent">
                    Estética <br /> <span className="text-emerald-500 italic">Vehicular</span> <br /> de Autor.
                  </h1>
                  
                  <p className="text-zinc-400 text-sm md:text-xl leading-relaxed max-w-xl mb-10 text-balance font-medium">
                    Tratamientos de detailing con enfoque artesanal. Cuidado meticuloso y terminaciones de exhibición, ahora exclusivamente en mi domicilio particular en Cipolletti.
                  </p>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-6 mb-12">
                    <button 
                      onClick={handleStartBooking}
                      className="w-full sm:w-auto bg-emerald-500 text-night px-12 py-5 rounded-2xl font-display font-black text-xl italic tracking-tighter hover:bg-emerald-400 hover:shadow-[0_0_50px_rgba(16,185,129,0.3)] hover:scale-[1.02] active:scale-95 transition-all shadow-2xl shadow-emerald-500/20 flex items-center justify-center gap-3 group"
                    >
                      COTIZAR Y RESERVAR <ChevronRight className="w-7 h-7 group-hover:translate-x-1 transition-transform" />
                    </button>
                    
                    <div className="flex items-center gap-4">
                      <a href="https://instagram.com/lys.lavados" target="_blank" rel="noreferrer" className="w-14 h-14 bg-zinc-900 border-2 border-white/[0.1] rounded-2xl flex items-center justify-center text-white hover:text-emerald-500 hover:border-emerald-500 transition-all group shadow-xl">
                        <Instagram className="w-7 h-7 group-hover:scale-110 transition-transform" />
                      </a>
                      <a href="https://facebook.com/lys.lavados" target="_blank" rel="noreferrer" className="w-14 h-14 bg-zinc-900 border-2 border-white/[0.1] rounded-2xl flex items-center justify-center text-white hover:text-emerald-500 hover:border-emerald-500 transition-all group shadow-xl">
                        <Facebook className="w-7 h-7 group-hover:scale-110 transition-transform" />
                      </a>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {[
                      { icon: <ShieldCheck className="w-4 h-4" />, label: "Preservación de Materiales" },
                      { icon: <Sparkles className="w-4 h-4" />, label: "Restauración de Tonos" },
                      { icon: <Droplets className="w-4 h-4" />, label: "Sin Químicos Agresivos" }
                    ].map((attr, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-[10px] text-zinc-100 bg-white/[0.03] border border-white/[0.05] px-4 py-2.5 rounded-xl uppercase tracking-[0.1em] font-black">
                        <span className="text-emerald-500">{attr.icon}</span>
                        {attr.label}
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* Luxury Visual */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, x: 20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  transition={{ duration: 1.2, delay: 0.2, ease: "circOut" }}
                  className="relative hidden md:block"
                >
                  <div className="w-full h-full md:aspect-[4/5] md:glass-card overflow-hidden relative md:shadow-[0_0_120px_rgba(0,0,0,0.8)] md:border-white/[0.1] md:rounded-[3rem] group">
                    <img 
                      src="https://images.unsplash.com/photo-1552519507-da3b142c6e3d?q=80&w=2000&auto=format&fit=crop" 
                      alt="Luxury Car Detail" 
                      className="w-full h-full object-cover opacity-40 transition-all duration-[5s] grayscale group-hover:grayscale-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-night via-night/60 to-transparent" />
                    
                    <div className="absolute inset-x-12 bottom-12">
                      <div className="flex items-center gap-2 mb-6">
                        <div className="w-8 h-[1px] bg-emerald-500" />
                        <span className="text-[9px] font-black uppercase tracking-[0.5em] text-emerald-500">Premium Detailing</span>
                      </div>
                      
                      <h3 className="text-6xl font-display font-black italic tracking-tighter mb-6 leading-[0.85] text-white uppercase">
                        Estética y <br /> <span className="text-emerald-500 underline decoration-white/20 underline-offset-8 font-light">Protección.</span>
                      </h3>
                      
                      <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest leading-relaxed">
                        Cuidamos cada detalle para que <br /> tu auto luzca impecable.
                      </p>
                    </div>

                    {/* Decorative technical line */}
                    <div className="absolute top-12 left-1/2 -translate-x-1/2 w-px h-12 bg-gradient-to-b from-emerald-500 to-transparent opacity-50 hidden md:block" />
                  </div>
                </motion.div>
              </div>
            </section>

            {/* Availability Banner */}
            <div className="px-5 md:px-12 mb-12">
              <div 
                onClick={handleStartBooking}
                className="max-w-6xl mx-auto group relative p-6 md:p-10 rounded-[2rem] border border-white/[0.05] bg-zinc-900/40 backdrop-blur-3xl flex flex-col md:flex-row items-center justify-between cursor-pointer overflow-hidden transition-all hover:bg-zinc-800/60"
              >
                <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left mb-6 md:mb-0">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <CalendarDays className="w-8 h-8" />
                  </div>
                  <div>
                    <div className="inline-block px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-500 text-[8px] font-black uppercase tracking-[0.2em] mb-2">
                      {isLoadingSlots ? 'Verificando Agenda...' : 'Próxima Disponibilidad'}
                    </div>
                    <h3 className={`text-2xl md:text-4xl font-display font-black italic tracking-tighter text-white ${isLoadingSlots ? 'animate-pulse' : ''}`}>
                      {firstAvailableInfo.day}
                    </h3>
                    <p className={`text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1 ${isLoadingSlots ? 'animate-pulse' : ''}`}>
                      {firstAvailableInfo.times ? `Horarios: ${firstAvailableInfo.times}` : (isLoadingSlots ? 'Por favor aguarde...' : 'Consultar disponibilidad por WhatsApp')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-emerald-500 font-display font-black italic text-lg tracking-tighter group-hover:translate-x-2 transition-transform">
                  RESERVAR TURNO <ArrowRight className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Featured Service Details */}
            <section id="services" className="px-5 md:px-12 py-16 max-w-6xl mx-auto">
              <SectionHeader kicker="Servicios" title="Lavado <span class='text-emerald-500'>Full</span>" number="02" />
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12 pb-24">
                <div className="space-y-6">
                  <div className="p-8 rounded-[2.5rem] bg-zinc-900 shadow-2xl border border-white/[0.05] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                      <Sparkles className="w-24 h-24 text-emerald-500" />
                    </div>
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-emerald-500">
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <h3 className="text-2xl font-display font-black italic text-white tracking-tight">Interior Detallado</h3>
                    </div>
                    <p className="text-zinc-400 leading-relaxed font-medium text-lg">
                      Aspirado profundo y detallado de plásticos, vidrios, rejillas y juntas para llegar a cada rincón. Uso productos y herramientas de detailing para dejar todo lo más limpio posible.
                    </p>
                  </div>
                  
                  <div className="p-8 rounded-[2.5rem] bg-zinc-900 shadow-2xl border border-white/[0.05] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                      <Droplets className="w-24 h-24 text-emerald-500" />
                    </div>
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-emerald-500">
                        <Droplets className="w-6 h-6" />
                      </div>
                      <h3 className="text-2xl font-display font-black italic text-white tracking-tight">Exterior Profundo</h3>
                    </div>
                    <p className="text-zinc-400 leading-relaxed font-medium text-lg">
                      Limpieza profunda de ruedas, llantas y pasaruedas, más lavado completo de carrocería. Se aplica sellante hidrofóbico Koch Chemie Protector Wax con protección de hasta 3 meses para dar brillo y protección ligera, y acondicionador profesional sin silicona Koch Chemie PSS Plast Star en cubiertas.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col justify-between space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-start gap-4 p-8 bg-zinc-900 border border-white/[0.05] rounded-[2rem]">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 flex-shrink-0">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-display font-black text-white italic text-lg mb-1 tracking-tight">Protección UV</h4>
                        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">En plásticos interiores</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4 p-8 bg-zinc-900 border border-white/[0.05] rounded-[2rem]">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 flex-shrink-0">
                        <Droplets className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-display font-black text-white italic text-lg mb-1 tracking-tight">Acabado Natural</h4>
                        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Sin sensación grasa</p>
                      </div>
                    </div>
                  </div>

                  <div className="relative p-10 rounded-[3rem] bg-emerald-500 text-night overflow-hidden group shadow-[0_0_80px_rgba(16,185,129,0.15)]">
                    <div className="relative z-10">
                      <div className="text-[10px] font-black uppercase tracking-[0.4em] mb-4 opacity-70">Nuestro Compromiso</div>
                      <h4 className="text-3xl md:text-5xl font-display font-black italic leading-[0.9] mb-8 tracking-tighter">MÁXIMA LIMPIEZA SIN ENGAÑOS.</h4>
                      <button 
                        onClick={handleStartBooking}
                        className="group/btn w-full bg-night text-white py-6 rounded-2xl font-display font-black italic text-xl tracking-tighter hover:scale-[1.02] flex items-center justify-center gap-4 transition-all"
                      >
                        RESERVAR EL LAVADO FULL <ArrowRight className="w-6 h-6 group-hover/btn:translate-x-2 transition-transform" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Products We Use Section */}
              <div className="mt-24 pb-12">
                <SectionHeader kicker="Detailing" title="Productos que <span class='text-emerald-500'>usamos</span>" number="03" />
                <div className="space-y-10 mt-12">
                  
                  {/* Brand 1: Koch Chemie */}
                  <div className="bg-zinc-900 shadow-2xl border border-white/5 rounded-[3rem] p-8 md:p-12 relative overflow-hidden group hover:border-emerald-500/10 transition-all duration-300">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none select-none text-[8rem] font-sans font-black italic tracking-tighter text-white">
                      KC
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-white/5 pb-8">
                      <div>
                        <div className="flex items-center gap-3.5 mb-2 flex-wrap">
                          <h3 className="text-3xl md:text-4xl font-display font-black text-white tracking-tight uppercase italic">Koch Chemie</h3>
                          <div className="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full">
                            <div className="flex flex-col w-5 h-3.5 rounded-sm overflow-hidden shadow-sm border border-white/10 select-none">
                              <div className="bg-black h-1/3 w-full"></div>
                              <div className="bg-red-600 h-1/3 w-full"></div>
                              <div className="bg-amber-500 h-1/3 w-full"></div>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Alemania 🇩🇪</span>
                          </div>
                        </div>
                        <p className="text-zinc-400 font-medium text-base md:text-lg max-w-4xl leading-relaxed">
                          Marca alemana con más de 50 años de historia, homologada y utilizada como proveedor oficial por Mercedes-Benz, BMW, Volkswagen y Audi.
                        </p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {[
                        {
                          name: 'Gentle Snow Foam',
                          desc: 'Shampoo de pH neutro para lavado de contacto. Limpia en profundidad sin dañar la pintura ni los tratamientos previos.'
                        },
                        {
                          name: 'PSS Plast Star',
                          desc: 'Acondicionador profesional sin silicona para neumáticos y plásticos exteriores. Renueva el aspecto, protege contra los rayos UV y no atrae tierra ni polvo.'
                        },
                        {
                          name: 'Top Star',
                          desc: 'Acondicionador de plásticos interiores con efecto antiestático que repele el polvo y protección UV de larga duración.'
                        },
                        {
                          name: 'Protector Wax',
                          desc: 'Sellante hidrofóbico para carrocería con efecto lotus. Protege hasta 3 meses, repele el agua y facilita la limpieza futura.'
                        }
                      ].map((prod, idx) => (
                        <div key={idx} className="p-6 rounded-[2rem] bg-white/[0.015] border border-white/[0.04] hover:border-emerald-500/20 hover:bg-white/[0.03] transition-all duration-300">
                          <h4 className="font-display font-black text-emerald-400 italic text-lg md:text-xl mb-2 tracking-tight">{prod.name}</h4>
                          <p className="text-zinc-400 text-sm leading-relaxed">{prod.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Brand 2: Vonixx */}
                  <div className="bg-zinc-900 shadow-2xl border border-white/5 rounded-[3rem] p-8 md:p-12 relative overflow-hidden group hover:border-emerald-500/10 transition-all duration-300">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none select-none text-[8rem] font-sans font-black italic tracking-tighter text-white">
                      VX
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-white/5 pb-8">
                      <div>
                        <div className="flex items-center gap-3.5 mb-2 flex-wrap">
                          <h3 className="text-3xl md:text-4xl font-display font-black text-white tracking-tight uppercase italic">Vonixx</h3>
                          <div className="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full">
                            <div className="relative w-5 h-3.5 bg-emerald-600 rounded-sm overflow-hidden shadow-sm border border-white/10 select-none flex items-center justify-center">
                              <div className="absolute w-3 h-3 bg-yellow-400 rotate-45"></div>
                              <div className="absolute w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Brasil 🇧🇷</span>
                          </div>
                        </div>
                        <p className="text-zinc-400 font-medium text-base md:text-lg max-w-4xl leading-relaxed">
                          Referente profesional en detailing en Brasil y América Latina.
                        </p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {[
                        {
                          name: 'Sintra Pro',
                          desc: 'Limpiador concentrado bactericida para interiores. Elimina gérmenes, bacterias and malos olores. Apto para plásticos, alfombras, cuero y tela.'
                        },
                        {
                          name: 'Impact',
                          desc: 'Limpiador profesional de alta eficacia para llantas, pasaruedas y surfaces con suciedad extrema.'
                        }
                      ].map((prod, idx) => (
                        <div key={idx} className="p-6 rounded-[2rem] bg-white/[0.015] border border-white/[0.04] hover:border-emerald-500/20 hover:bg-white/[0.03] transition-all duration-300">
                          <h4 className="font-display font-black text-emerald-400 italic text-lg md:text-xl mb-2 tracking-tight">{prod.name}</h4>
                          <p className="text-zinc-400 text-sm leading-relaxed">{prod.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>

              {/* FAQ Section */}
              <div id="faq" className="mt-20 pb-20 border-t border-white/[0.03] pt-16">
                <div className="max-w-4xl mx-auto">
                  <SectionHeader kicker="Dudas" title="Preguntas <span class='text-emerald-500'>Frecuentes</span>" number="04" />
                  
                  <div className="mt-8 space-y-4">
                    {FAQ_ITEMS.map((faq, index) => {
                      const isOpen = openFaq === index;
                      return (
                        <div 
                          key={faq.id}
                          className={`rounded-2xl border-2 transition-all duration-300 overflow-hidden bg-zinc-900/60 ${
                            isOpen 
                              ? 'border-emerald-500 bg-zinc-900/90 shadow-[0_4px_25px_rgba(16,185,129,0.08)]' 
                              : 'border-white/10 hover:border-white/20'
                          }`}
                        >
                          <button
                            onClick={() => {
                              setOpenFaq(isOpen ? null : index);
                              if (!isOpen) {
                                metricsService.logAction('click_faq');
                              }
                            }}
                            className="w-full text-left p-5 md:p-6 flex justify-between items-center gap-4 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 font-display"
                          >
                            <span className={`text-base md:text-lg font-black tracking-tight transition-colors duration-300 ${
                              isOpen ? 'text-emerald-400' : 'text-white'
                            }`}>
                              {faq.question}
                            </span>
                            <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                              isOpen ? 'bg-emerald-500 text-night rotate-180 font-black' : 'bg-zinc-800 text-zinc-400'
                            }`}>
                              <ChevronDown className="w-5 h-5 stroke-[2.5]" />
                            </span>
                          </button>
                          
                          <AnimatePresence initial={false}>
                            {isOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: "easeInOut" }}
                              >
                                <div className="px-5 md:px-6 pb-6 pt-1 border-t border-white/[0.04] bg-black/15">
                                  <p className="text-zinc-100 font-bold text-sm md:text-base leading-relaxed">
                                    {faq.answer}
                                  </p>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Social Media CTA Section */}
              <div className="mt-20 pb-20 border-t border-white/[0.03] pt-16">
                <SectionHeader kicker="Galería" title="Nuestros <span class='text-emerald-500'>Resultados</span>" number="05" />

                {/* Dynamic Photo Gallery Carousel */}
                {dbPhotos.length > 0 && (
                  <div className="mt-12 mb-16 relative">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-6 font-semibold text-center">FOTOS REALES DE NUESTROS TRABAJOS RECIENTES</p>
                    
                    <div className="relative max-w-4xl mx-auto px-4 md:px-14">
                      {/* Left Arrow Button (Highly Notorious & Floating at the edges) */}
                      <button
                        onClick={handlePrevPhoto}
                        aria-label="Anterior imagen"
                        className="absolute left-0 md:-left-4 top-1/2 -translate-y-1/2 z-25 bg-emerald-500 hover:bg-emerald-400 active:scale-90 text-night p-4 md:p-5 rounded-full shadow-2xl shadow-emerald-500/40 hover:shadow-emerald-400/60 flex items-center justify-center transition-all border border-white/20 select-none group focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
                      >
                        <ChevronLeft className="w-6 h-6 md:w-8 md:h-8 stroke-[3.5px] group-hover:-translate-x-0.5 transition-transform" />
                      </button>

                      {/* Right Arrow Button (Highly Notorious & Floating at the edges) */}
                      <button
                        onClick={handleNextPhoto}
                        aria-label="Siguiente imagen"
                        className="absolute right-0 md:-right-4 top-1/2 -translate-y-1/2 z-25 bg-emerald-500 hover:bg-emerald-400 active:scale-90 text-night p-4 md:p-5 rounded-full shadow-2xl shadow-emerald-500/40 hover:shadow-emerald-400/60 flex items-center justify-center transition-all border border-white/20 select-none group focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
                      >
                        <ChevronRight className="w-6 h-6 md:w-8 md:h-8 stroke-[3.5px] group-hover:translate-x-0.5 transition-transform" />
                      </button>

                      <div className="overflow-hidden bg-zinc-900/60 border border-white/5 rounded-[2.5rem] hover:border-emerald-500/10 transition-all duration-300">
                        <div className="flex flex-col md:flex-row items-stretch min-h-[360px] md:min-h-[400px]">
                          {/* Image Panel */}
                          <div className="w-full md:w-3/5 h-64 md:h-auto overflow-hidden relative self-stretch flex-shrink-0">
                            <AnimatePresence mode="wait">
                              <motion.img 
                                key={dbPhotos[currentPhotoIndex]?.id || 'carousel-img'}
                                src={dbPhotos[currentPhotoIndex]?.url || ''} 
                                alt={dbPhotos[currentPhotoIndex]?.title || ''}
                                initial={{ opacity: 0, scale: 1.05 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.4 }}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </AnimatePresence>
                            <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-black/90 via-black/40 to-transparent" />
                          </div>

                          {/* Text / Stats Panel */}
                          <div className="w-full md:w-2/5 p-6 md:p-8 flex flex-col justify-between bg-zinc-950/45 relative z-10 self-stretch min-w-0">
                            <AnimatePresence mode="wait">
                              <motion.div
                                key={dbPhotos[currentPhotoIndex]?.id || 'carousel-text'}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                                className="flex flex-col h-full justify-between min-w-0"
                              >
                                <div>
                                  <div className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-2 font-display">
                                    Trabajo Realizado ({currentPhotoIndex + 1} de {dbPhotos.length})
                                  </div>
                                  <h4 className="font-display font-black italic text-lg md:text-2xl uppercase text-white mb-3 tracking-tight leading-tight">
                                    {dbPhotos[currentPhotoIndex]?.title}
                                  </h4>
                                  <p className="text-zinc-400 text-xs md:text-sm leading-relaxed font-semibold">
                                    {dbPhotos[currentPhotoIndex]?.description}
                                  </p>
                                </div>

                                <div className="mt-6 pt-4 border-t border-white/[0.04] flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                  <span>Detallado Premium</span>
                                  <span className="text-emerald-500 font-bold font-mono">OK ✓</span>
                                </div>
                              </motion.div>
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Pagination Indicators - Clickable dots */}
                    <div className="flex justify-center gap-2 mt-6">
                      {dbPhotos.map((photo, idx) => (
                        <button
                          key={photo.id + '_dot'}
                          onClick={() => setCurrentPhotoIndex(idx)}
                          className={`h-2.5 rounded-full transition-all duration-300 ${
                            idx === currentPhotoIndex 
                              ? 'w-8 bg-emerald-500' 
                              : 'w-2.5 bg-zinc-700 hover:bg-zinc-500'
                          }`}
                          aria-label={`Ir a imagen ${idx + 1}`}
                        />
                      ))}
                    </div>

                  </div>
                )}

                <div className="bg-zinc-900 shadow-2xl border border-white/5 rounded-[3rem] p-8 md:p-16 relative overflow-hidden">
                  <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />
                  
                  <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
                    <div>
                      <p className="text-zinc-400 text-lg md:text-xl font-medium mb-10 leading-relaxed">
                        No usamos fotos de catálogo. Te invitamos a ver nuestros <span className="text-white">trabajos reales</span>, videos del proceso y resultados finales en nuestras redes oficiales.
                      </p>
                      <div className="flex gap-12 mb-10">
                        <div className="flex flex-col">
                          <span className="text-4xl md:text-5xl font-display font-black text-emerald-500 italic tracking-tighter">+100</span>
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 mt-2">Autos Entregados</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4">
                      <a 
                        href="https://instagram.com/lys.lavados" 
                        target="_blank" 
                        rel="noreferrer"
                        className="w-full flex items-center justify-between p-6 bg-white/[0.03] hover:bg-emerald-500 hover:text-night border border-white/5 rounded-2xl transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <Instagram className="w-8 h-8" />
                          <span className="font-display font-black italic text-xl">INSTAGRAM</span>
                        </div>
                        <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                      </a>
                      <a 
                        href="https://facebook.com/lys.lavados" 
                        target="_blank" 
                        rel="noreferrer"
                        className="w-full flex items-center justify-between p-6 bg-white/[0.03] hover:bg-emerald-500 hover:text-night border border-white/5 rounded-2xl transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <Facebook className="w-8 h-8" />
                          <span className="font-display font-black italic text-xl">FACEBOOK</span>
                        </div>
                        <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Google Reviews Section */}
              <div className="mt-20 pb-20">
                <SectionHeader kicker="Reseñas" title="Opiniones en <span class='text-emerald-500'>Google</span>" number="06" />
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                  
                  {/* Summary / Rating Badge */}
                  <div className="bg-zinc-900 border border-white/5 rounded-[3rem] p-8 md:p-10 lg:sticky lg:top-24 flex flex-col items-center text-center relative overflow-hidden group hover:border-emerald-500/10 transition-all duration-300">
                    <div className="absolute -top-12 -left-12 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full" />
                    
                    {/* Google Icon Badge Custom SVG */}
                    <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center mb-6 shadow-xl relative group-hover:scale-105 transition-transform">
                      <svg className="w-8 h-8" viewBox="0 0 24 24">
                        <path
                          fill="#EA4335"
                          d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C18.155 1.583 15.435 1 12.24 1 5.485 1 0 6.485 0 13.2s5.485 12.2 12.24 12.2c7.055 0 11.75-4.96 11.75-11.95 0-.805-.085-1.415-.19-1.965H12.24z"
                        />
                      </svg>
                    </div>

                    <h3 className="font-display font-black text-2.5xl text-white mb-2 italic tracking-tight">LyS Lavados</h3>
                    
                    {/* Stars */}
                    <div className="flex items-center gap-1 mb-3">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} className="w-5 h-5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>

                    <div className="flex items-baseline gap-2 mb-8">
                      <span className="text-4xl font-display font-black text-white italic">5.0</span>
                    </div>

                    <div className="flex flex-col gap-3 w-full">
                      <a 
                        href="https://maps.google.com/?q=LyS+Lavados+Cipolletti,+Venezuela+1659" 
                        target="_blank" 
                        rel="noreferrer"
                        className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-500 hover:bg-emerald-400 text-night font-display font-black italic rounded-2xl transition-all shadow-lg shadow-emerald-500/10 active:scale-[0.98]"
                      >
                        DEJAR RESEÑA
                        <ArrowRight className="w-4 h-4 translate-y-[-0.5px]" />
                      </a>
                      
                      <a 
                        href="https://maps.google.com/?q=LyS+Lavados+Cipolletti,+Venezuela+1659" 
                        target="_blank" 
                        rel="noreferrer"
                        className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-display font-black italic rounded-2xl border border-white/10 transition-all active:scale-[0.98] text-sm"
                      >
                        VER TODAS EN GOOGLE
                      </a>
                    </div>
                  </div>

                  {/* Individual Reviews List */}
                  <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                      {
                        name: 'Maria Rosa SANSEVERINO',
                        avatar: 'MS',
                        role: 'Cliente verificado',
                        time: 'Hace 1 hora',
                        text: 'Siempre excelente servicio y atención. Soy cliente. Le llevo el auto en pésimas condiciones y lo deja como salido de la concesionaria. Muy recomendable',
                        highlight: 'lo deja como salido de la concesionaria'
                      },
                      {
                        name: 'romina riquelme',
                        avatar: 'RR',
                        role: 'Local Guide',
                        time: 'Hace 2 días',
                        text: 'Excelente trabajo, muy detallista y responsable. El auto estaba en muy malas condiciones y quedo como nuevo! Se noto la dedicación y compromiso con lo que hace....',
                        highlight: 'quedo como nuevo!'
                      },
                      {
                        name: 'miguel montenegro',
                        avatar: 'MM',
                        role: 'Cliente verificado',
                        time: 'Hace 3 días',
                        text: 'Excelente atención. Cordialidad, seriedad y compromiso. Recomendable...',
                        highlight: 'Excelente atención'
                      },
                      {
                        name: 'Mariela Retamal',
                        avatar: 'MR',
                        role: 'Local Guide',
                        time: 'Hace 4 días',
                        text: 'Impecable labor!! Lo súper recomiendo Excelentes productos, te cuidan el auto, al lavadero al cual lo llevaba antes calle Naciones Unidas frente al cementerio un desastre siempre algo me rompían del auto y los productos que utilizaban un desastre de muy mala calidad',
                        highlight: 'Impecable labor!! Lo súper recomiendo'
                      },
                      {
                        name: 'Monica Cifuentes',
                        avatar: 'MC',
                        role: 'Cliente verificado',
                        time: 'Hace 3 días',
                        text: 'Excelente trabajo!!! Prolijo, responsable LyS lLavados... Re lindo quedó mí auto... Es por ahí!!! Éxitos... 👍 👏 😍 ...',
                        highlight: 'Re lindo quedó mí auto'
                      },
                      {
                        name: 'Gabriela Figueroa',
                        avatar: 'GF',
                        role: 'Local Guide',
                        time: 'Hace 1 mes',
                        text: 'Excelente servicio, los autos quedaron impecables, muy buen trabajo Leandro. Gracias',
                        highlight: 'los autos quedaron impecables'
                      }
                    ].map((review, index) => (
                      <div 
                        key={index} 
                        className="bg-zinc-900 border border-white/5 rounded-3xl p-6 relative overflow-hidden group hover:border-emerald-500/20 transition-all duration-300 flex flex-col justify-between"
                      >
                        <div>
                          {/* User details */}
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-display font-black text-emerald-400 text-sm">
                                {review.avatar}
                              </div>
                              <div>
                                <h4 className="font-display font-bold text-white text-sm">{review.name}</h4>
                                <p className="text-[10px] font-semibold text-zinc-500 flex items-center gap-1.5 uppercase tracking-wider">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  {review.role}
                                </p>
                              </div>
                            </div>
                            
                            {/* Star Badge */}
                            <div className="flex items-center gap-0.5">
                              {[1,2,3,4,5].map((s) => (
                                <Star key={s} className="w-3 h-3 fill-amber-400 text-amber-400" />
                              ))}
                            </div>
                          </div>

                          <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                            "{review.text.split(review.highlight)[0]}
                            <span className="text-white font-medium bg-emerald-500/5 px-1 py-0.5 rounded border border-emerald-500/10">
                              {review.highlight}
                            </span>
                            {review.text.split(review.highlight)[1]}"
                          </p>
                        </div>

                        <div className="flex items-center justify-between mt-2 pt-4 border-t border-white/[0.03]">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                            {review.time}
                          </span>
                          
                          {/* Mini Google Logo G */}
                          <div className="opacity-35 group-hover:opacity-75 transition-opacity">
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                              <path
                                fill="#fff"
                                d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C18.155 1.583 15.435 1 12.24 1 5.485 1 0 6.485 0 13.2s5.485 12.2 12.24 12.2c7.055 0 11.75-4.96 11.75-11.95 0-.805-.085-1.415-.19-1.965H12.24z"
                              />
                            </svg>
                          </div>
                        </div>

                      </div>
                    ))}
                  </div>

                </div>
              </div>
            </section>


          </motion.div>

        ) : (
          <motion.div
            key="booking"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.5 }}
          >
            {/* Booking Flow */}
            <section id="booking-flow" className="px-5 md:px-12 py-10 md:py-20">
              <div className="max-w-6xl mx-auto">
                <button 
                  onClick={() => setView('home')}
                  className="group mb-12 flex items-center gap-3 text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-emerald-500 transition-all active:scale-95 py-2"
                >
                  <span className="w-8 h-8 rounded-full border border-zinc-800 flex items-center justify-center group-hover:border-emerald-500/50 group-hover:bg-emerald-500/10 transition-colors">
                    <ArrowRight className="w-4 h-4 rotate-180 transition-transform group-hover:-translate-x-1" />
                  </span>
                  Volver al Inicio
                </button>
                
                <SectionHeader kicker="Calculador" title="Personaliza tu <span class='text-emerald-500'>Cuidado</span>" number="01" />

                <div ref={step1Ref} className="mb-20 md:mb-32 scroll-mt-32">
                  <div className="flex flex-col mb-10 md:mb-16 relative">
                     <span className="text-emerald-500 font-display font-black italic text-6xl md:text-[10rem] leading-none mb-2 select-none opacity-[0.07] absolute -top-10 md:-top-20 -left-4 md:-left-12">01</span>
                     <div className="relative z-10">
                        <h3 className="text-2xl md:text-5xl font-display font-black uppercase tracking-tighter flex items-center gap-4 text-white">
                           <span className="bg-emerald-500 text-night px-5 py-2 rounded-2xl italic tracking-tighter shadow-[0_0_30px_rgba(16,185,129,0.3)]">1.</span>
                           SELECCIONA TU VEHÍCULO
                        </h3>
                        <div className="w-32 md:w-48 h-2 bg-emerald-500 mt-6 rounded-full" />
                        <p className="text-zinc-500 text-xs md:text-sm font-bold uppercase tracking-[0.2em] mt-4 ml-1">Elegí la categoría que mejor describa tu auto</p>
                     </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
                    {activeVehicles.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => handleVehicleSelect(v.id as VehicleType)}
                        className={`p-6 md:p-10 rounded-2xl md:rounded-3xl text-left transition-all relative overflow-hidden group ${
                          vehicle === v.id 
                          ? 'bg-emerald-500 text-night shadow-[0_15px_40px_rgba(16,185,129,0.2)]' 
                          : 'bg-zinc-900 border border-white/[0.04] hover:bg-zinc-800'
                        }`}
                      >
                        <div className="flex items-center gap-4 md:gap-6 relative z-10">
                          <span className="text-3xl md:text-5xl group-hover:scale-110 transition-transform">{v.icon}</span>
                          <div>
                            <div className="font-display font-black text-sm md:text-xl md:mb-1">{v.name}</div>
                            <div className={`text-[9px] md:text-[11px] font-black uppercase tracking-tighter opacity-60 leading-tight`}>
                              {v.examples.split(',')
                                .map(ex => ex.trim())
                                .sort(() => 0.5 - Math.random())
                                .slice(0, 8)
                                .join(', ')}...
                            </div>
                          </div>
                        </div>
                        {vehicle === v.id && (
                          <motion.div layoutId="v-pill" className="absolute top-4 right-4 md:top-6 md:right-6">
                             <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 opacity-90" />
                          </motion.div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stepper 2: Service */}
                <AnimatePresence>
                  {vehicle && (
                    <motion.div
                      ref={step2Ref}
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 80 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      className="overflow-hidden scroll-mt-32 pb-20"
                    >
                      <div className="flex flex-col mb-10 md:mb-16 relative">
                         <span className="text-emerald-500 font-display font-black italic text-6xl md:text-[10rem] leading-none mb-2 select-none opacity-[0.07] absolute -top-10 md:-top-20 -left-4 md:-left-12">02</span>
                         <div className="relative z-10">
                            <h3 className="text-2xl md:text-5xl font-display font-black uppercase tracking-tighter flex items-center gap-4 text-white">
                               <span className="bg-emerald-500 text-night px-5 py-2 rounded-2xl italic tracking-tighter shadow-[0_0_30px_rgba(16,185,129,0.3)]">2.</span>
                               ELIGE TU SERVICIO
                            </h3>
                            <div className="w-32 md:w-48 h-2 bg-emerald-500 mt-6 rounded-full" />
                            <p className="text-zinc-500 text-xs md:text-sm font-bold uppercase tracking-[0.2em] mt-4 ml-1">Selecciona el nivel de detalle que buscas</p>
                         </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 lg:gap-6">
                        {activeServices.map((s) => (
                          <motion.div
                            key={s.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            onClick={() => handleServiceSelect(s.id)}
                            className={`p-6 md:p-8 rounded-3xl cursor-pointer border-2 transition-all duration-300 relative group flex flex-col h-full ${
                              selectedService === s.id 
                              ? 'bg-zinc-950 border-emerald-500 shadow-[0_0_50px_rgba(16,185,129,0.25)] ring-2 ring-emerald-500/20 scale-[1.02] md:scale-[1.03]' 
                              : s.id === 'Full'
                                ? 'bg-zinc-900/90 border-emerald-500/30 hover:border-emerald-500/60 shadow-[0_4px_30px_rgba(16,185,129,0.06)] hover:scale-[1.01]'
                                : 'bg-zinc-900/40 border-white/[0.05] hover:border-white/10 hover:scale-[1.01]'
                            }`}
                          >
                            <div className="flex justify-between items-start mb-6">
                              <div className="flex flex-col gap-1 w-[calc(100%-32px)]">
                                 <div className={`text-[8px] md:text-[9px] font-black uppercase tracking-[0.4em] ${selectedService === s.id ? 'text-emerald-500' : s.id === 'Full' ? 'text-emerald-500/70' : 'text-zinc-600'}`}>{s.label}</div>
                                 <h4 className={`font-display font-black italic text-xl md:text-3xl ${selectedService === s.id ? 'text-emerald-400' : s.id === 'Full' ? 'text-emerald-400/90' : 'text-white'}`}>{s.name}</h4>
                              </div>
                              {/* Visual Radio/Checkmark Indicator */}
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-300 shrink-0 ${
                                selectedService === s.id 
                                  ? 'bg-emerald-500 border-emerald-500 text-night' 
                                  : s.id === 'Full'
                                    ? 'border-emerald-500/40 bg-zinc-950/50 group-hover:border-emerald-500/60'
                                    : 'border-white/10 bg-zinc-950/20 group-hover:border-white/20'
                              }`}>
                                {selectedService === s.id && (
                                  <svg className="w-3.5 h-3.5 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                  </svg>
                                )}
                              </div>
                            </div>
                            
                            <p className="text-[11px] md:text-sm text-zinc-400 leading-relaxed mb-6 font-medium">{s.description}</p>
                            
                            <div className="mt-auto flex flex-wrap gap-x-3 gap-y-2 pt-5 border-t border-white/[0.04]">
                              {s.features.map((f, i) => (
                                <div key={i} className="flex items-center gap-1 text-[8px] md:text-[10px] text-zinc-400 font-bold uppercase tracking-widest bg-white/[0.02] px-2 py-0.5 rounded-md border border-white/[0.02]">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  {f}
                                </div>
                              ))}
                            </div>

                            <div className="mt-4 text-lg md:text-2xl font-display font-black text-white self-end">
                              ${calculatePrice(s.id, vehicle).toLocaleString('es-AR')}
                            </div>

                            {s.isFeatured && (
                              <div className="absolute -top-3.5 left-6 bg-gradient-to-r from-emerald-500 to-teal-500 text-night px-3 py-1 rounded-full text-[8.5px] font-black uppercase tracking-[0.05em] shadow-[0_10px_20px_rgba(16,185,129,0.35)] flex items-center gap-1">
                                <span>✨</span> EL MÁS ELEGIDO • 93% DE CLIENTES
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Stepper 3: Availability */}
                <AnimatePresence>
                  {selectedService && (
                    <motion.div 
                      ref={step3Ref}
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 80 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      className="overflow-hidden scroll-mt-32 pb-20"
                    >
                      <div className="flex flex-col mb-10 md:mb-16 relative">
                         <span className="text-emerald-500 font-display font-black italic text-6xl md:text-[10rem] leading-none mb-2 select-none opacity-[0.07] absolute -top-10 md:-top-20 -left-4 md:-left-12">03</span>
                         <div className="relative z-10">
                            <h3 className="text-2xl md:text-5xl font-display font-black uppercase tracking-tighter flex items-center gap-4 text-white">
                               <span className="bg-emerald-500 text-night px-5 py-2 rounded-2xl italic tracking-tighter shadow-[0_0_30px_rgba(16,185,129,0.3)]">3.</span>
                               FECHA Y HORARIO
                            </h3>
                            <div className="w-32 md:w-48 h-2 bg-emerald-500 mt-6 rounded-full" />
                            <p className="text-zinc-500 text-xs md:text-sm font-bold uppercase tracking-[0.2em] mt-4 ml-1">Encontrá el momento perfecto para el cuidado de tu auto</p>
                         </div>
                      </div>
                      
                      <div className="flex flex-col gap-8">
                        {/* Horizontal Date Picker */}
                        <div className="overflow-x-auto pb-4 -mx-5 px-5 md:mx-0 md:px-0 no-scrollbar">
                          <div className="flex gap-3">
                            {isLoadingSlots ? (
                              Array.from({ length: 6 }).map((_, i) => (
                                <div 
                                  key={i} 
                                  className="flex-shrink-0 w-16 md:w-20 p-4 md:p-5 rounded-2xl border border-white/[0.05] bg-zinc-900/50 animate-pulse flex flex-col items-center gap-2"
                                >
                                  <div className="w-8 h-2 bg-white/10 rounded" />
                                  <div className="w-6 h-6 bg-white/10 rounded" />
                                </div>
                              ))
                            ) : (
                              availableDates.map(({ str, date, slotsCount }, i) => {
                                const isSelected = selectedDateStr === str;
                                const isFull = slotsCount === 0;
                                const isLow = slotsCount === 1;

                                return (
                                  <button
                                    key={i}
                                    disabled={isFull}
                                    onClick={() => { setSelectedDateStr(str); setSelectedTime(null); }}
                                    className={`flex-shrink-0 w-16 md:w-20 p-4 md:p-5 rounded-2xl border transition-all flex flex-col items-center gap-1 relative overflow-hidden ${
                                      isSelected 
                                      ? 'bg-emerald-500 border-emerald-400 text-night shadow-lg' 
                                      : isFull
                                        ? 'bg-zinc-900 border-white/[0.03] text-zinc-600 cursor-not-allowed'
                                        : 'bg-zinc-900 border-white/[0.05] text-zinc-500 hover:border-white/10'
                                    }`}
                                  >
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className={`text-[8px] md:text-[9px] font-black uppercase tracking-widest ${isSelected ? 'opacity-70' : 'opacity-40'}`}>
                                        {date.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')}
                                      </span>
                                      {(() => {
                                        const weather = weatherData[str];
                                        if (!weather || !weather.isRainy) return null;
                                        return <CloudRain className={`w-3 h-3 ${isSelected ? 'text-night/60' : 'text-blue-400'} animate-pulse`} />;
                                      })()}
                                    </div>
                                    <span className="text-lg md:text-xl font-display font-black leading-none">{date.getDate()}</span>
                                    
                                    {!isSelected && (
                                      <div className={`absolute bottom-2 w-1 h-1 rounded-full ${
                                        isFull 
                                          ? 'bg-rose-500' 
                                          : isLow 
                                            ? 'bg-amber-500 animate-pulse' 
                                            : 'bg-emerald-500'
                                      }`} />
                                    )}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>

                        {/* Time Slots */}
                        {selectedDateStr && (
                          <div className="space-y-6">
                            {weatherForSelected && weatherForSelected.isRainy && (
                              <motion.div 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-amber-500/10 border border-amber-500/20 p-6 rounded-2xl flex items-start gap-4 mb-4"
                              >
                                <div className="w-12 h-12 rounded-xl bg-amber-500 text-night flex items-center justify-center flex-shrink-0 animate-pulse">
                                  <Droplets className="w-6 h-6" />
                                </div>
                                <div>
                                  <h4 className="text-amber-500 font-display font-black italic text-lg uppercase tracking-tight">¡Ojo con el clima!</h4>
                                  <p className="text-zinc-400 text-xs font-medium leading-relaxed mt-1">
                                    Hay <span className="text-amber-400">probabilidad de lluvia</span> para este día. Si lavás el auto y llueve, recordá que no podemos garantizar que se mantenga limpio. ¡Te recomendamos chequear bien o elegir otro día!
                                  </p>
                                </div>
                              </motion.div>
                            )}

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {isLoadingSlots ? (
                              Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="p-4 md:p-6 rounded-2xl border border-white/[0.05] bg-zinc-900/50 animate-pulse h-16 md:h-20" />
                              ))
                            ) : availableTimes.length > 0 ? (
                              availableTimes.map((time) => {
                                const isSelected = selectedTime === time;
                                return (
                                  <button
                                    key={time}
                                    onClick={() => handleTimeSelect(time)}
                                    className={`p-4 md:p-6 rounded-2xl border font-display font-black text-sm md:text-xl flex items-center justify-center gap-2 transition-all ${
                                      isSelected 
                                      ? 'bg-emerald-500 border-emerald-400 text-night' 
                                      : 'bg-zinc-900 border-white/[0.05] text-white hover:bg-zinc-800'
                                    }`}
                                  >
                                    <Clock className="w-3.5 h-3.5 md:w-5 md:h-5 opacity-60" />
                                    {time}
                                  </button>
                                );
                              })
                            ) : (
                              <div className="col-span-full p-8 text-center text-zinc-500 font-medium">
                                <CalendarDays className="w-8 h-8 mx-auto mb-3 opacity-20" />
                                Lo sentimos, no hay turnos disponibles para este día.
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      </div>

                      {/* Stepper 4: Client Data */}
                      <AnimatePresence>
                        {selectedTime && (
                          <motion.div
                            ref={step4Ref}
                            initial={{ opacity: 0, height: 0, marginTop: 0 }}
                            animate={{ opacity: 1, height: 'auto', marginTop: 80 }}
                            className="overflow-hidden scroll-mt-32 pb-20"
                          >
                            <div className="flex flex-col mb-10 md:mb-16 relative">
                               <span className="text-emerald-500 font-display font-black italic text-6xl md:text-[10rem] leading-none mb-2 select-none opacity-[0.07] absolute -top-10 md:-top-20 -left-4 md:-left-12">04</span>
                               <div className="relative z-10">
                                  <h3 className="text-2xl md:text-5xl font-display font-black uppercase tracking-tighter flex items-center gap-4 text-white">
                                     <span className="bg-emerald-500 text-night px-5 py-2 rounded-2xl italic tracking-tighter shadow-[0_0_30px_rgba(16,185,129,0.3)]">4.</span>
                                     TUS DATOS
                                  </h3>
                                  <div className="w-32 md:w-48 h-2 bg-emerald-500 mt-6 rounded-full" />
                                  <p className="text-zinc-500 text-xs md:text-sm font-bold uppercase tracking-[0.2em] mt-4 ml-1">Confirma tu turno y nuestra ubicación para el servicio</p>
                               </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              <div className="space-y-3">
                                <label className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-zinc-200 ml-1 flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Tu Nombre y Apellido
                                </label>
                                <div className="relative group">
                                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-emerald-500 transition-colors" />
                                  <input 
                                    ref={nameInputRef}
                                    type="text" 
                                    value={clientName}
                                    onChange={(e) => setClientName(e.target.value)}
                                    placeholder="Ej: Juan Pérez"
                                    enterKeyHint="next"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        phoneInputRef.current?.focus();
                                      }
                                    }}
                                    className="w-full bg-zinc-900 border border-white/20 rounded-xl py-4.5 pl-12 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all font-semibold text-base md:text-lg shadow-inner"
                                  />
                                </div>
                              </div>

                              <div className="space-y-3">
                                <label className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-zinc-200 ml-1 flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Tu WhatsApp / Celular
                                </label>
                                <div className="relative group">
                                  <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-emerald-500 transition-colors" />
                                  <input 
                                    ref={phoneInputRef}
                                    type="tel" 
                                    value={clientPhone}
                                    onChange={(e) => setClientPhone(e.target.value)}
                                    placeholder="Ej: 2995123456"
                                    enterKeyHint="done"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        phoneInputRef.current?.blur();
                                        // Scroll to location checkbox smoothly so they can see and tap it easily
                                        setTimeout(() => {
                                          const element = document.getElementById('location-confirm-box');
                                          if (element) {
                                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          }
                                        }, 150);
                                      }
                                    }}
                                    className="w-full bg-zinc-900 border border-white/20 rounded-xl py-4.5 pl-12 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all font-semibold text-base md:text-lg shadow-inner"
                                  />
                                </div>
                              </div>

                              <div className="space-y-4 md:col-span-2">
                                <label className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-zinc-200 ml-1 flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Confirmar la Ubicación de entrega
                                </label>
                                <div className="space-y-4">
                                  {/* Location confirmation button placed ABOVE the map */}
                                  <div 
                                    id="location-confirm-box"
                                    onClick={() => setClientConfirmedLocation(!clientConfirmedLocation)}
                                    className={`p-6 rounded-2xl border-3 transition-all cursor-pointer flex items-center gap-5 group relative overflow-hidden ${
                                      clientConfirmedLocation 
                                      ? 'bg-emerald-500/15 border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.2)] scale-[1.01]' 
                                      : 'bg-zinc-900 border-zinc-700 hover:border-emerald-500 hover:bg-zinc-800/80 shadow-[0_0_20px_rgba(16,185,129,0.05)]'
                                    }`}
                                  >
                                    <div className={`shrink-0 w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all duration-300 ${
                                      clientConfirmedLocation 
                                      ? 'bg-emerald-500 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)] rotate-0 scale-110' 
                                      : 'border-emerald-500/50 bg-zinc-950 group-hover:border-emerald-500 animate-pulse rotate-[-3deg]'
                                    }`}>
                                      {clientConfirmedLocation ? (
                                        <CheckCircle2 className="w-7 h-7 text-night" />
                                      ) : (
                                        <div className="w-4 h-4 rounded-full bg-emerald-500 animate-ping" />
                                      )}
                                    </div>
                                    
                                    <div className="flex-1">
                                      <p className={`text-lg md:text-xl font-display font-black italic tracking-tight leading-none mb-1 transition-colors ${
                                        clientConfirmedLocation ? 'text-emerald-400' : 'text-zinc-100 group-hover:text-emerald-400'
                                      }`}>
                                        {clientConfirmedLocation ? 'Ubicación confirmada ✓' : 'Haz clic AQUÍ para confirmar ubicación'}
                                      </p>
                                      <p className={`text-xs font-semibold leading-tight transition-colors ${
                                        clientConfirmedLocation ? 'text-zinc-300' : 'text-zinc-400'
                                      }`}>
                                        Entiendo que debo traer mi vehículo a <span className="text-white underline decoration-emerald-500 decoration-2 font-bold">Venezuela 1659</span> (Cipolletti).
                                      </p>
                                    </div>

                                    {!clientConfirmedLocation && (
                                      <div className="absolute right-4 animate-bounce-horizontal hidden md:block">
                                        <ArrowRight className="w-6 h-6 text-emerald-500" />
                                      </div>
                                    )}
                                  </div>

                                  <div className="bg-red-500/10 border border-red-500/35 rounded-xl p-4 flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                      <span className="text-red-400 text-xs font-black italic">!</span>
                                    </div>
                                    <p className="text-xs text-zinc-300 font-semibold leading-relaxed">
                                      Por favor ten en cuenta: <span className="text-red-400 font-black uppercase tracking-tight">no realizo servicios a domicilio</span>. Los lavados se realizan únicamente trayendo el auto a la dirección indicada arriba.
                                    </p>
                                  </div>

                                  <div className="aspect-video w-full rounded-2xl overflow-hidden border border-white/10 grayscale-[0.2] contrast-[1.05] hover:grayscale-0 transition-all">
                                    <iframe 
                                      src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3102.13456789!2d-68.010!3d-38.932!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x960a3162383c9b7f%3A0xc6cb1c986c757c4c!2sVenezuela%201659%2C%20Cipolletti%2C%20R%C3%ADo%20Negro!5e0!3m2!1ses!2sar!4v1713965211234!5m2!1ses!2sar" 
                                      width="100%" 
                                      height="100%" 
                                      style={{ border: 0 }} 
                                      allowFullScreen={false} 
                                      loading="lazy" 
                                      referrerPolicy="no-referrer-when-downgrade"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Pricing Info Note */}
                <div className="mt-8 flex gap-3 p-3.5 bg-white/[0.015] rounded-xl border border-white/[0.03] text-[9px] md:text-[10px] text-zinc-600 italic">
                  <Info className="w-3.5 h-3.5 text-emerald-500/50 flex-shrink-0" />
                  <p>
                    SUV (+ $5k) y Pickups (+ $15k) ajustan por volumen exterior. Precios sujetos a variaciones poe estado del vehículo.
                  </p>
                </div>
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Socials / Footer */}
      <footer className="mt-20 border-t border-white/[0.05] bg-zinc-900/20 backdrop-blur-3xl px-6 md:px-12 py-12 md:py-20">
        <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-12 items-center text-center md:text-left">
          <div className="flex flex-col items-center md:items-start gap-4">
            <div 
              onClick={() => {
                setView('home');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center group cursor-pointer"
            >
              <img 
                src="./logo.png" 
                className="h-16 md:h-20 w-auto object-contain transition-transform group-hover:scale-105 duration-300" 
                alt="LyS Premium Detailing Logo" 
                referrerPolicy="no-referrer"
              />
            </div>
            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest max-w-[200px]">Estética Automotriz en Cipolletti. Venezuela 1659.</p>
          </div>

          <div className="flex flex-col gap-6">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500/80 mb-2">Seguinos</div>
            <div className="flex justify-center md:justify-start gap-8">
              <a href="https://instagram.com/lys.lavados" target="_blank" rel="noreferrer" className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors group">
                <Instagram className="w-6 h-6 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-black uppercase tracking-widest">Instagram</span>
              </a>
              <a href="https://facebook.com/lys.lavados" target="_blank" rel="noreferrer" className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors group">
                <Facebook className="w-6 h-6 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-black uppercase tracking-widest">Facebook</span>
              </a>
            </div>
          </div>

          <div className="flex flex-col items-center md:items-end gap-6 text-zinc-600">
             <div className="text-[9px] font-black uppercase tracking-[0.4em] text-zinc-700">© 2026 LyS Premium Services</div>
             <div className="flex gap-4 text-[8px] font-black uppercase tracking-widest">
               <span 
                 onClick={() => {
                   if (isAdminAuthenticated) {
                     setView('admin');
                   } else {
                     setShowPasswordPrompt(true);
                   }
                 }}
                 className="hover:text-emerald-500/50 cursor-pointer transition-colors opacity-30 hover:opacity-100"
               >
                 Admin
               </span>
               <span className="hover:text-emerald-500/50 cursor-pointer transition-colors">Privacidad</span>
               <span className="hover:text-emerald-500/50 cursor-pointer transition-colors">Términos</span>
             </div>
          </div>
        </div>
      </footer>

      {/* Admin Password Prompt */}
      <AnimatePresence>
        {showPasswordPrompt && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-night/90 backdrop-blur-3xl">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-white/10 p-8 rounded-3xl w-full max-w-xs shadow-2xl"
            >
              <h3 className="text-xl font-display font-black italic text-white mb-6">Acceso Admin</h3>
              <input 
                autoFocus
                type="password" 
                value={adminPassword}
                onChange={(e) => {
                  const val = e.target.value;
                  setAdminPassword(val);
                  if (val.toLowerCase() === 'lys') {
                    setIsAdminAuthenticated(true);
                    setShowPasswordPrompt(false);
                    setView('admin');
                    setAdminPassword('');
                  }
                }}
                placeholder="Contraseña"
                className="w-full bg-black/50 border border-white/10 rounded-xl py-4 text-center text-xl tracking-[0.2em] text-white focus:border-emerald-500 outline-none transition-all"
              />
              <button 
                onClick={() => setShowPasswordPrompt(false)}
                className="w-full mt-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white"
              >
                Cancelar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Price Indicator */}
      <AnimatePresence>
        {vehicle && selectedService && selectedDateStr && selectedTime && clientName && clientPhone && clientConfirmedLocation && !showConfirmation && !showSuccessModal && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="fixed bottom-4 left-4 right-4 z-[100] md:max-w-xl md:mx-auto"
          >
            <div className="bg-night/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-2xl shadow-emerald-500/10">
              <div className="flex flex-col">
                <div className="text-[8px] text-emerald-500 font-black uppercase tracking-widest mb-1 italic">
                  CONFIRMAR RESERVA
                </div>
                <div className="text-white text-xl font-display font-black">${currentPrice?.toLocaleString('es-AR')}</div>
              </div>
              <button
                onClick={() => setShowConfirmation(true)}
                className="bg-emerald-500 text-night px-6 py-3 rounded-xl font-display font-black text-xs uppercase tracking-widest hover:bg-emerald-400 transition-all flex items-center gap-2 shadow-xl shadow-emerald-500/20"
              >
                FINALIZAR <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmation && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-night/80 backdrop-blur-lg" 
              onClick={() => !isSubmitting && setShowConfirmation(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl"
            >
              <div className="p-8 md:p-12">
                <button 
                  onClick={() => setShowConfirmation(false)}
                  className="absolute top-8 right-8 text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>

                <div className="flex items-center gap-4 mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <ShieldCheck className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl md:text-3xl font-display font-black italic tracking-tighter text-white">¿Todo correcto?</h3>
                    <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mt-1">Revisa los detalles de tu turno</p>
                  </div>
                </div>

                <div className="space-y-4 mb-10">
                  <div className="flex justify-between items-center py-3 border-b border-white/[0.05]">
                    <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Servicio</span>
                    <span className="text-white font-display font-black italic">{activeServices.find(s => s.id === selectedService)?.name}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-white/[0.05]">
                    <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Vehículo</span>
                    <span className="text-white font-display font-black italic">{activeVehicles.find(v => v.id === vehicle)?.name}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-white/[0.05]">
                    <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Fecha</span>
                    <span className="text-emerald-500 font-display font-black italic">
                      {selectedDateStr && availableDates.find(d => d.str === selectedDateStr)?.date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-white/[0.05]">
                    <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Hora</span>
                    <span className="text-emerald-500 font-display font-black italic">{selectedTime}hs</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Inversión</span>
                    <span className="text-white text-2xl font-display font-black italic tracking-tighter">${currentPrice?.toLocaleString('es-AR')}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <button
                    disabled={isSubmitting}
                    onClick={handleFinalBooking}
                    className="w-full bg-emerald-500 text-night py-5 rounded-2xl font-display font-black italic text-xl tracking-tighter hover:bg-emerald-400 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group shadow-xl shadow-emerald-500/20"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <>CONFIRMAR Y ENVIAR <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" /></>
                    )}
                  </button>
                  <p className="text-[9px] text-center text-zinc-600 font-bold uppercase tracking-[0.2em]">
                    Se enviará un resumen por WhatsApp automáticamente
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccessModal && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-night/95 backdrop-blur-xl" 
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-emerald-500/30 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-emerald-950/40 text-center"
            >
              <div className="p-8 md:p-12 flex flex-col items-center">
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/35 flex items-center justify-center text-emerald-400 mb-6 animate-bounce">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                
                <h3 className="text-3xl font-display font-black italic tracking-tighter text-white mb-2">
                  ¡Turno Reservado!
                </h3>
                <p className="text-emerald-400 text-xs font-black uppercase tracking-widest mb-6">
                  Tu reserva se registró con éxito
                </p>

                <div className="w-full bg-black/45 rounded-2xl p-5 mb-8 text-left border border-white/[0.03] space-y-3">
                  <div className="flex justify-between">
                    <span className="text-zinc-500 text-[9px] font-black uppercase tracking-widest">Ubicación</span>
                    <span className="text-zinc-300 text-xs font-bold font-sans">Venezuela 1659</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500 text-[9px] font-black uppercase tracking-widest">Fecha</span>
                    <span className="text-emerald-400 text-xs font-black italic font-display">
                      {selectedDateStr && availableDates.find(d => d.str === selectedDateStr)?.date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500 text-[9px] font-black uppercase tracking-widest">Horario</span>
                    <span className="text-emerald-400 text-xs font-black italic font-display">{selectedTime}hs</span>
                  </div>
                </div>

                <p className="text-zinc-400 text-xs font-semibold leading-relaxed mb-8">
                  Ya podés cerrar esta ventana. Te redirigimos al inicio de la página para que puedas continuar navegando.
                </p>

                <button
                  onClick={() => {
                    setShowSuccessModal(false);
                    // Reset all inputs & return home
                    setVehicle(null);
                    setSelectedService(null);
                    setSelectedDateStr(null);
                    setSelectedTime(null);
                    setClientName('');
                    setClientPhone('');
                    setClientConfirmedLocation(false);
                    setView('home');
                  }}
                  className="w-full bg-emerald-500 text-night py-4 rounded-xl font-display font-black italic text-lg hover:bg-emerald-400 active:scale-[0.98] transition-all shadow-xl shadow-emerald-500/10"
                >
                  ENTENDIDO
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

