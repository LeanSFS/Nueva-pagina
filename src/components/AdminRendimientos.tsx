import React, { useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
  BarChart3
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

interface Booking {
  id: string;
  fecha: string;
  hora: string;
  nombre: string;
  telefono: string;
  tipo: string;
  servicio: string;
  estado?: string;
  direccion?: string;
}

interface Movement {
  id: string;
  fecha: string;
  tipo: string;
  categoria: string;
  monto_ars: number;
}

export default function AdminRendimientos({ bookings, movements }: { bookings: Booking[], movements: Movement[] }) {
  
  const stats = useMemo(() => {
    // 1. Caja Stats
    let totalIngresos = 0;
    let totalGastos = 0;
    let totalServiciosCount = 0;
    const ingresosPorMes: Record<string, number> = {};
    const gastosPorMes: Record<string, number> = {};
    const serviciosPorMes: Record<string, number> = {};

    movements.forEach(m => {
      const mes = m.fecha.substring(0, 7); // YYYY-MM
      if (m.tipo && m.tipo.toLowerCase() === 'ingreso') {
        totalIngresos += m.monto_ars;
        ingresosPorMes[mes] = (ingresosPorMes[mes] || 0) + m.monto_ars;
        totalServiciosCount++;
        serviciosPorMes[mes] = (serviciosPorMes[mes] || 0) + 1;
      } else if (m.tipo && m.tipo.toLowerCase() === 'gasto') {
        totalGastos += m.monto_ars;
        gastosPorMes[mes] = (gastosPorMes[mes] || 0) + m.monto_ars;
      }
    });

    // 2. Booking Stats (Solo para servicios actuales)
    const serviciosCount: Record<string, number> = {};
    const estadosCount: Record<string, number> = {};

    bookings.forEach(b => {
      const srv = b.servicio || 'Otros';
      const est = b.estado || 'pendiente';
      serviciosCount[srv] = (serviciosCount[srv] || 0) + 1;
      estadosCount[est] = (estadosCount[est] || 0) + 1;
    });

    // Formatear para charts
    const meses = Array.from(new Set([...Object.keys(ingresosPorMes), ...Object.keys(gastosPorMes)])).sort();
    const historyData = meses.map(m => ({
      name: m,
      ingresos: ingresosPorMes[m] || 0,
      gastos: gastosPorMes[m] || 0,
      neto: (ingresosPorMes[m] || 0) - (gastosPorMes[m] || 0),
      turnos: serviciosPorMes[m] || 0
    }));

    const serviceData = Object.entries(serviciosCount)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return {
      totalIngresos,
      totalGastos,
      neto: totalIngresos - totalGastos,
      totalServicios: totalServiciosCount,
      historyData,
      serviceData,
      estadosCount
    };
  }, [bookings, movements]);

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="space-y-8 pb-20">
      {/* Resumen Superior */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Ingresos Totales', value: `$${stats.totalIngresos.toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Gastos Totales', value: `$${stats.totalGastos.toLocaleString()}`, icon: TrendingDown, color: 'text-rose-500', bg: 'bg-rose-500/10' },
          { label: 'Neto / Ganancia', value: `$${stats.neto.toLocaleString()}`, icon: DollarSign, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Servicios (Est.)', value: stats.totalServicios, icon: Calendar, color: 'text-amber-500', bg: 'bg-amber-500/10' }
        ].map((item, i) => (
          <div key={i} className="bg-zinc-900 border border-white/5 p-6 rounded-3xl relative overflow-hidden">
             <div className="relative z-10">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">{item.label}</p>
                <h4 className={`text-2xl font-display font-black italic ${item.color}`}>{item.value}</h4>
             </div>
             <item.icon className={`absolute -right-2 -bottom-2 w-20 h-20 opacity-5 ${item.color}`} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Gráfico de Ingresos vs Gastos */}
        <div className="bg-zinc-900 border border-white/5 rounded-3xl p-8">
           <h3 className="text-xs font-black uppercase tracking-widest text-white mb-8 flex items-center gap-2">
             <BarChart3 className="w-4 h-4 text-emerald-500" /> Evolución Financiera
           </h3>
           <div className="h-[350px] w-full min-w-0 relative">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                 <AreaChart data={stats.historyData}>
                    <defs>
                      <linearGradient id="colorNeto" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#71717a', fontSize: 10 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#71717a', fontSize: 10 }}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}
                      itemStyle={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 900 }}
                    />
                    <Area type="monotone" dataKey="neto" stroke="#10b981" fillOpacity={1} fill="url(#colorNeto)" strokeWidth={3} />
                    <Area type="monotone" dataKey="gastos" stroke="#ef4444" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
                 </AreaChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>

      {/* Tabla de Rendimiento por Mes */}
      <div className="bg-zinc-900 border border-white/5 rounded-3xl overflow-hidden">
         <div className="p-6 border-b border-white/5">
            <h3 className="text-xs font-black text-white uppercase tracking-widest">Resumen Mensual Detallado</h3>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead className="bg-black/20 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                  <tr>
                     <th className="p-4">Mes</th>
                     <th className="p-4 text-right">Ingresos</th>
                     <th className="p-4 text-right">Gastos</th>
                     <th className="p-4 text-right">Ganancia</th>
                     <th className="p-4 text-center">Servicios</th>
                     <th className="p-4 text-center">Rendimiento</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-white/[0.02]">
                  {[...stats.historyData].reverse().map((row, i) => (
                     <tr key={i} className="hover:bg-white/[0.01] transition-colors">
                        <td className="p-4 font-bold text-zinc-300">{row.name}</td>
                        <td className="p-4 text-right text-sm font-mono text-emerald-500">${row.ingresos.toLocaleString()}</td>
                        <td className="p-4 text-right text-sm font-mono text-rose-500">${row.gastos.toLocaleString()}</td>
                        <td className={`p-4 text-right text-sm font-mono font-black ${row.neto >= 0 ? 'text-white' : 'text-red-500'}`}>
                           ${row.neto.toLocaleString()}
                        </td>
                        <td className="p-4 text-center text-zinc-400 font-display font-black italic">{row.turnos}</td>
                        <td className="p-4 text-center">
                           <div className="w-24 h-1.5 bg-white/5 rounded-full mx-auto overflow-hidden">
                              <div 
                                className={`h-full ${row.neto >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} 
                                style={{ width: `${Math.min(100, (Math.max(0, row.neto) / (Math.max(...stats.historyData.map(h => h.neto)) || 1)) * 100)}%` }} 
                              />
                           </div>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
}
