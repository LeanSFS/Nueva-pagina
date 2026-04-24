/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
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
  ChevronRight,
  Info,
  CalendarDays,
  User,
  Navigation as MapIcon,
  X,
  Loader2,
  Clock
} from 'lucide-react';
import { SERVICES, VEHICLES, BASE_PRICES, TYPE_EXTRA } from './constants.ts';
import { VehicleType, ServiceKey } from './types.ts';
import { fetchSlots, createBooking, TimeSlot } from './services/availabilityService.ts';

// --- Internal Components ---

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
      className="flex items-center gap-3 md:gap-4 group cursor-pointer"
    >
      <div className="w-auto h-9 md:h-11 px-2.5 md:px-3 bg-emerald-500 rounded-xl md:rounded-2xl flex items-center justify-center font-display font-black text-night text-base md:text-xl shadow-[0_0_24px_rgba(16,185,129,0.2)] group-hover:rotate-3 transition-transform">LyS</div>
      <div className="relative">
        <span className="font-display font-black text-base md:text-2xl uppercase tracking-[0.05em] text-white leading-none block">Lavados</span>
        <span className="absolute left-0 -bottom-2.5 md:-bottom-3 text-[6px] md:text-[8px] font-black uppercase tracking-[.4em] text-zinc-700 transition-colors group-hover:text-emerald-500/60 whitespace-nowrap">Premium Detailing</span>
      </div>
    </div>

    <div className="flex items-center gap-4 md:gap-16">
      <div className="flex items-center gap-6 md:gap-12 text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-zinc-500">
        <button 
          onClick={() => {
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

// --- Main App ---

export default function App() {
  const [view, setView] = useState<'home' | 'booking'>('home');
  const [vehicle, setVehicle] = useState<VehicleType | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceKey | null>(null);
  
  // Availability state
  const [slotsData, setSlotsData] = useState<TimeSlot[]>([]);
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null); // YYYY-MM-DD
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);

  // Client data
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientAddress, setClientAddress] = useState('');

  // Confirmation state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      setIsLoadingSlots(true);
      const data = await fetchSlots();
      setSlotsData(data);
      setIsLoadingSlots(false);
    }
    load();
  }, []);

  const availableDates = useMemo(() => {
    return slotsData.map(s => {
      const [y, m, d] = s.fecha.split('-').map(Number);
      return {
        str: s.fecha,
        date: new Date(y, m - 1, d)
      };
    });
  }, [slotsData]);

  const availableTimes = useMemo(() => {
    if (!selectedDateStr) return [];
    const dayData = slotsData.find(s => s.fecha === selectedDateStr);
    return dayData ? dayData.slots : [];
  }, [selectedDateStr, slotsData]);

  const currentPrice = useMemo(() => {
    if (!vehicle || !selectedService) return null;
    const base = BASE_PRICES[selectedService] || 0;
    const extra = TYPE_EXTRA[vehicle] || 0;
    return base + extra;
  }, [vehicle, selectedService]);

  const firstAvailableInfo = useMemo(() => {
    const firstDay = slotsData.find(s => (s.count || 0) > 0 || (s.slots && s.slots.length > 0));
    if (firstDay) {
      const [y, m, d] = firstDay.fecha.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
      const formatted = date.toLocaleDateString('es-AR', options);
      return {
        day: formatted.charAt(0).toUpperCase() + formatted.slice(1),
        times: (firstDay.slots || []).join(' / ')
      };
    }
    return { day: 'Próximamente', times: '' };
  }, [slotsData]);

  const handleFinalBooking = async () => {
    if (!selectedDateStr || !selectedTime || !vehicle || !selectedService || !clientName || !clientPhone || !clientAddress) return;

    setIsSubmitting(true);
    const result = await createBooking({
      fecha: selectedDateStr,
      hora: selectedTime,
      tipo: vehicle,
      servicio: `${selectedService} – $${currentPrice}`,
      nombre: clientName,
      telefono: clientPhone,
      direccion: clientAddress
    });

    if (result.ok) {
      // Generate WhatsApp msg
      const vehicleName = VEHICLES.find(v => v.id === vehicle)?.name;
      const serviceName = SERVICES.find(s => s.id === selectedService)?.name;
      const [y, m, d] = selectedDateStr.split('-');
      const formattedDate = `${d}/${m}/${y}`;

      const text = `*Nueva Reserva LyS Lavados*%0A%0A` +
        `*Servicio:* ${serviceName}%0A` +
        `*Vehículo:* ${vehicleName}%0A` +
        `*Fecha:* ${formattedDate}%0A` +
        `*Hora:* ${selectedTime}hs%0A%0A` +
        `*Cliente:* ${clientName}%0A` +
        `*Teléfono:* ${clientPhone}%0A` +
        `*Dirección:* ${clientAddress}%0A%0A` +
        `_¿Podrían confirmarme la disponibilidad?_`;

      window.open(`https://wa.me/2995760611?text=${text}`, '_blank');
      
      // Reset view or show success
      setView('home');
      setShowConfirmation(false);
      // Optional: reset state
    } else {
      alert('Error en la reserva: ' + (result.error || 'Intente nuevamente'));
    }
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen pt-10 md:pt-14 pb-24 overflow-x-hidden">
      <Navigation setView={setView} view={view} />
      
      <AnimatePresence mode="wait">
        {view === 'home' ? (
          <motion.div
            key="home"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.5 }}
          >
            {/* Hero Section */}
            <section className="relative px-6 md:px-12 pt-28 pb-12 md:py-48 overflow-hidden min-h-[90vh] flex items-center">
              {/* Ambient Lights */}
              <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[150px] -z-10 rounded-full animate-pulse" />
              <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[180px] -z-10 rounded-full animate-float" style={{ animationDelay: '-3s' }} />
              
              <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 md:gap-16 items-center">
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                >
                  <h1 className="text-5xl md:text-8xl font-display font-black leading-[0.9] tracking-tighter mb-8 bg-gradient-to-b from-white via-white to-zinc-500 bg-clip-text text-transparent">
                    Limpieza <br /> <span className="text-emerald-500 italic">Detallada</span> <br /> a domicilio.
                  </h1>
                  
                  <p className="text-zinc-400 text-sm md:text-xl leading-relaxed max-w-xl mb-10 text-balance font-medium">
                    Limpieza profunda exterior e interior. Detallado artesanal de plásticos, rejillas y juntas para un <span className="text-white">acabado original</span> sin dejar sensación grasa.
                  </p>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-6 mb-12">
                    <button 
                      onClick={() => setView('booking')}
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
                  <div className="aspect-[4/5] glass-card overflow-hidden relative shadow-[0_0_120px_rgba(0,0,0,0.8)] border-white/[0.1] rounded-[3rem] group">
                    <img 
                      src="https://images.unsplash.com/photo-1552519507-da3b142c6e3d?q=80&w=2000&auto=format&fit=crop" 
                      alt="Luxury Car Detail" 
                      className="w-full h-full object-cover scale-110 opacity-40 group-hover:scale-100 transition-all duration-[5s] grayscale group-hover:grayscale-0"
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
                    <div className="absolute top-12 left-1/2 -translate-x-1/2 w-px h-12 bg-gradient-to-b from-emerald-500 to-transparent opacity-50" />
                  </div>
                </motion.div>
              </div>
            </section>

            {/* Availability Banner */}
            <div className="px-5 md:px-12 mb-12">
              <div 
                onClick={() => setView('booking')}
                className="max-w-6xl mx-auto group relative p-6 md:p-10 rounded-[2rem] border border-white/[0.05] bg-zinc-900/40 backdrop-blur-3xl flex flex-col md:flex-row items-center justify-between cursor-pointer overflow-hidden transition-all hover:bg-zinc-800/60"
              >
                <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left mb-6 md:mb-0">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <CalendarDays className="w-8 h-8" />
                  </div>
                  <div>
                    <div className="inline-block px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-500 text-[8px] font-black uppercase tracking-[0.2em] mb-2">Próxima Disponibilidad</div>
                    <h3 className="text-2xl md:text-4xl font-display font-black italic tracking-tighter text-white">{firstAvailableInfo.day}</h3>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">
                      {firstAvailableInfo.times ? `Horarios: ${firstAvailableInfo.times}` : 'Consultar disponibilidad por WhatsApp'}
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
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12">
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
                      Limpieza profunda de ruedas, llantas y pasaruedas, más lavado completo de carrocería. Se aplica cera rápida para dar brillo y protección ligera, y revividor en cubiertas.
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
                        onClick={() => setView('booking')}
                        className="group/btn w-full bg-night text-white py-6 rounded-2xl font-display font-black italic text-xl tracking-tighter hover:scale-[1.02] flex items-center justify-center gap-4 transition-all"
                      >
                        RESERVAR EL LAVADO FULL <ArrowRight className="w-6 h-6 group-hover/btn:translate-x-2 transition-transform" />
                      </button>
                    </div>
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
                  className="mb-8 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-emerald-500 transition-colors"
                >
                  <ArrowRight className="w-4 h-4 rotate-180" /> Volver al Inicio
                </button>
                
                <SectionHeader kicker="Calculador" title="Personaliza tu <span class='text-emerald-500'>Cuidado</span>" number="01" />

                {/* Stepper 1: Vehicle */}
                <div className="mb-12 md:mb-14">
                  <h3 className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] mb-4 md:mb-6 flex items-center gap-4 text-zinc-500">
                    <div className="flex-1 h-px bg-white/[0.05]" />
                    <span className="flex-shrink-0">1. Tipo de vehículo</span>
                    <div className="flex-1 h-px bg-white/[0.05]" />
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
                    {VEHICLES.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setVehicle(v.id as VehicleType)}
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
                            <div className={`text-[9px] md:text-[11px] font-black uppercase tracking-tighter opacity-60`}>
                              {v.examples.split(',').slice(0, 2).join(', ')}
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
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 40 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      className="overflow-hidden"
                    >
                      <h3 className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] mb-4 md:mb-6 flex items-center gap-4 text-zinc-500">
                        <div className="flex-1 h-px bg-white/[0.05]" />
                        <span className="flex-shrink-0">2. Nivel de Servicio</span>
                        <div className="flex-1 h-px bg-white/[0.05]" />
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 lg:gap-6">
                        {SERVICES.map((s) => (
                          <motion.div
                            key={s.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            onClick={() => setSelectedService(s.id)}
                            className={`p-6 md:p-8 rounded-3xl cursor-pointer border-2 transition-all relative group flex flex-col h-full ${
                              selectedService === s.id 
                              ? 'bg-emerald-500/[0.03] border-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.1)] ring-1 ring-emerald-500/10' 
                              : 'bg-zinc-900/40 border-white/[0.05] hover:border-white/10'
                            }`}
                          >
                            <div className="flex justify-between items-start mb-6">
                              <div className="flex flex-col gap-1">
                                 <div className={`text-[8px] md:text-[9px] font-black uppercase tracking-[0.4em] ${selectedService === s.id ? 'text-emerald-500' : 'text-zinc-600'}`}>{s.label}</div>
                                 <h4 className={`font-display font-black italic text-xl md:text-3xl ${selectedService === s.id ? 'text-emerald-500' : 'text-white'}`}>{s.name}</h4>
                              </div>
                            </div>
                            
                            <p className="text-[11px] md:text-sm text-zinc-400 leading-relaxed mb-6 font-medium">{s.description}</p>
                            
                            <div className="mt-auto flex flex-wrap gap-x-3 gap-y-2 pt-5 border-t border-white/[0.04]">
                              {s.features.slice(0, 4).map((f, i) => (
                                <div key={i} className="flex items-center gap-1 text-[8px] md:text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                                  <div className="w-1 h-1 rounded-full bg-emerald-500/50" />
                                  {f}
                                </div>
                              ))}
                            </div>

                            <div className="mt-4 text-lg md:text-2xl font-display font-black text-white self-end">
                              ${(BASE_PRICES[s.id] + (TYPE_EXTRA[vehicle!] || 0)).toLocaleString('es-AR')}
                            </div>

                            {s.isFeatured && (
                              <div className="absolute -top-3 left-6 bg-emerald-500 text-night px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter shadow-xl">Recomendado</div>
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
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 56 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      className="overflow-hidden"
                    >
                      <h3 className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] mb-4 md:mb-6 flex items-center gap-4 text-zinc-500">
                        <div className="flex-1 h-px bg-white/[0.05]" />
                        <span className="flex-shrink-0">3. Fecha y Hora</span>
                        <div className="flex-1 h-px bg-white/[0.05]" />
                      </h3>
                      
                      <div className="flex flex-col gap-8">
                        {/* Horizontal Date Picker */}
                        <div className="overflow-x-auto pb-4 -mx-5 px-5 md:mx-0 md:px-0 no-scrollbar">
                          <div className="flex gap-3">
                            {availableDates.map(({ str, date }, i) => {
                              const isSelected = selectedDateStr === str;
                              return (
                                <button
                                  key={i}
                                  onClick={() => { setSelectedDateStr(str); setSelectedTime(null); }}
                                  className={`flex-shrink-0 w-16 md:w-20 p-4 md:p-5 rounded-2xl border transition-all flex flex-col items-center gap-1 ${
                                    isSelected 
                                    ? 'bg-emerald-500 border-emerald-400 text-night shadow-lg' 
                                    : 'bg-zinc-900 border-white/[0.05] text-zinc-500 hover:border-white/10'
                                  }`}
                                >
                                  <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest opacity-60">
                                    {date.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')}
                                  </span>
                                  <span className="text-lg md:text-xl font-display font-black">{date.getDate()}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Time Slots */}
                        {selectedDateStr && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {availableTimes.length > 0 ? (
                              availableTimes.map((time) => {
                                const isSelected = selectedTime === time;
                                return (
                                  <button
                                    key={time}
                                    onClick={() => setSelectedTime(time)}
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
                        )}
                      </div>

                      {/* Stepper 4: Client Data */}
                      <AnimatePresence>
                        {selectedTime && (
                          <motion.div
                            initial={{ opacity: 0, height: 0, marginTop: 0 }}
                            animate={{ opacity: 1, height: 'auto', marginTop: 56 }}
                            className="overflow-hidden"
                          >
                            <h3 className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] mb-4 md:mb-6 flex items-center gap-4 text-zinc-500">
                              <div className="flex-1 h-px bg-white/[0.05]" />
                              <span className="flex-shrink-0">4. Tus Datos</span>
                              <div className="flex-1 h-px bg-white/[0.05]" />
                            </h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Nombre y Apellido</label>
                                <div className="relative group">
                                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-emerald-500 transition-colors" />
                                  <input 
                                    type="text" 
                                    value={clientName}
                                    onChange={(e) => setClientName(e.target.value)}
                                    placeholder="Juan Pérez"
                                    className="w-full bg-zinc-900/50 border border-white/5 rounded-xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-all font-medium"
                                  />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Teléfono</label>
                                <div className="relative group">
                                  <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-emerald-500 transition-colors" />
                                  <input 
                                    type="tel" 
                                    value={clientPhone}
                                    onChange={(e) => setClientPhone(e.target.value)}
                                    placeholder="299..."
                                    className="w-full bg-zinc-900/50 border border-white/5 rounded-xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-all font-medium"
                                  />
                                </div>
                              </div>

                              <div className="space-y-2 md:col-span-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Dirección</label>
                                <div className="relative group">
                                  <MapIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-emerald-500 transition-colors" />
                                  <input 
                                    type="text" 
                                    value={clientAddress}
                                    onChange={(e) => setClientAddress(e.target.value)}
                                    placeholder="Calle y número, barrio"
                                    className="w-full bg-zinc-900/50 border border-white/5 rounded-xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-all font-medium"
                                  />
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
            <div className="flex items-center gap-3 group cursor-pointer">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-emerald-500 rounded-2xl flex items-center justify-center font-display font-black text-night text-xl md:text-2xl shadow-xl shadow-emerald-500/20 group-hover:rotate-12 transition-transform">L</div>
              <span className="font-display font-black text-xl md:text-3xl uppercase tracking-tighter text-white">LyS Lavados</span>
            </div>
            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest max-w-[200px]">Estética Automotriz a Domicilio. Cipolletti, Río Negro.</p>
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
               <span className="hover:text-emerald-500/50 cursor-pointer transition-colors">Privacidad</span>
               <span className="hover:text-emerald-500/50 cursor-pointer transition-colors">Términos</span>
             </div>
          </div>
        </div>
      </footer>

      {/* Floating Price Indicator */}
      <AnimatePresence>
        {vehicle && selectedService && selectedDateStr && selectedTime && clientName && clientPhone && clientAddress && (
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
                    <span className="text-white font-display font-black italic">{SERVICES.find(s => s.id === selectedService)?.name}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-white/[0.05]">
                    <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Vehículo</span>
                    <span className="text-white font-display font-black italic">{VEHICLES.find(v => v.id === vehicle)?.name}</span>
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
    </div>
  );
}

