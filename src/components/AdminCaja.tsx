import React, { useState, useEffect, useMemo } from 'react';
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
  BarChart3 as BarChartIcon
} from 'lucide-react';
import AdminAgenda from './AdminAgenda.tsx';
import AdminRendimientos from './AdminRendimientos.tsx';

const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyDd--FDaQPnqG_LQ4MzLuRmIQc99Y0WK1Axpwh3Tc4GX1DLCHn77XTr2-wBZUVCuVO/exec';
const CATS_INGRESO = ['Lavado', 'Extra', 'Propina', 'Otros'];
const CATS_GASTO = ['Insumos', 'Herramientas', 'Mantenimiento', 'Publicidad', 'Impuestos', 'Otros'];

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
  concepto: string;
  monto_ars: number;
  medio: string;
  estado: string;
  factura: string;
  cliente: string;
  notas: string;
}

export default function AdminCaja({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'agenda' | 'caja' | 'stats'>('agenda');
  const [allMovements, setAllMovements] = useState<Movement[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const initialRange = useMemo(() => {
    const d = new Date();
    const ymd = (date: Date) => date.toISOString().split('T')[0];
    return {
      from: ymd(new Date(d.getFullYear(), d.getMonth(), 1)),
      to: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0))
    };
  }, []);

  const [filterFrom, setFilterFrom] = useState(initialRange.from);
  const [filterTo, setFilterTo] = useState(initialRange.to);
  const [filterTipo, setFilterTipo] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterMedio, setFilterMedio] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('');

  // Filtrado local para la tabla de Caja
  const filteredRows = useMemo(() => {
    return allMovements.filter(m => {
      if (filterFrom && m.fecha < filterFrom) return false;
      if (filterTo && m.fecha > filterTo) return false;
      if (filterTipo && m.tipo?.toLowerCase() !== filterTipo.toLowerCase()) return false;
      if (filterEstado && m.estado?.toLowerCase() !== filterEstado.toLowerCase()) return false;
      if (filterMedio && m.medio?.toLowerCase() !== filterMedio.toLowerCase()) return false;
      if (filterCategoria && m.categoria !== filterCategoria) return false;
      return true;
    });
  }, [allMovements, filterFrom, filterTo, filterTipo, filterEstado, filterMedio, filterCategoria]);

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
    notas: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [altaSuccess, setAltaSuccess] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);

  // Delete modal
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${WEBAPP_URL}?action=caja_list&t=${Date.now()}`);
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || 'Error al cargar datos');
      
      const sorted = (data.rows || []).sort((a: any, b: any) => (b.fecha || '').localeCompare(a.fecha || ''));
      setAllMovements(sorted);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchBookings = async () => {
    try {
      const response = await fetch(`${WEBAPP_URL}?action=list&t=${Date.now()}`);
      const data = await response.json();
      if (data.ok) setBookings(data.rows || []);
    } catch (e) {
      console.error('Error fetching bookings:', e);
    }
  };

  useEffect(() => {
    fetchRows();
    fetchBookings();
  }, []);

  const handleAdd = async () => {
    if (!newMovement.concepto || !newMovement.monto) {
      setError('Complete concepto y monto');
      return;
    }
    setSubmitting(true);
    setAltaSuccess(false);
    try {
      const params = new URLSearchParams({
        action: 'caja_add',
        ...newMovement,
        tipo: newMovement.tipo.toLowerCase(),
        medio: newMovement.medio.toLowerCase(),
        estado: newMovement.estado.toLowerCase()
      });
      const response = await fetch(`${WEBAPP_URL}?${params.toString()}`);
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || 'Error al agregar');
      
      setAltaSuccess(true);
      setNewMovement({
        ...newMovement,
        concepto: '',
        monto: '',
        factura: '',
        notas: ''
      });
      fetchRows();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editForm) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'caja_update',
        id: editingId!,
        ...editForm,
        tipo: editForm.tipo.toLowerCase(),
        medio: editForm.medio.toLowerCase(),
        estado: editForm.estado.toLowerCase()
      });
      const response = await fetch(`${WEBAPP_URL}?${params.toString()}`);
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || 'Error al actualizar');
      
      setEditingId(null);
      fetchRows();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setLoading(true);
    try {
      const response = await fetch(`${WEBAPP_URL}?action=caja_delete&id=${deletingId}`);
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || 'Error al borrar');
      
      setDeletingId(null);
      fetchRows();
    } catch (err: any) {
      setError(err.message);
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

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12">
          <button onClick={onBack} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Salir del Panel</span>
          </button>
          
          <div className="flex bg-zinc-900/50 p-1 rounded-2xl border border-white/5">
            <button 
              onClick={() => setActiveTab('agenda')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'agenda' ? 'bg-emerald-500 text-night shadow-lg' : 'text-zinc-500 hover:text-white'}`}
            >
              <LayoutDashboard className="w-4 h-4" /> Agenda
            </button>
            <button 
              onClick={() => setActiveTab('caja')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'caja' ? 'bg-emerald-500 text-night shadow-lg' : 'text-zinc-500 hover:text-white'}`}
            >
              <Wallet className="w-4 h-4" /> Caja
            </button>
            <button 
              onClick={() => setActiveTab('stats')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'stats' ? 'bg-emerald-500 text-night shadow-lg' : 'text-zinc-500 hover:text-white'}`}
            >
              <BarChartIcon className="w-4 h-4" /> Rendimientos
            </button>
          </div>
          
          <h1 className="text-xl md:text-2xl font-display font-black italic tracking-tighter hidden md:block">LyS Lavados <span className="text-emerald-500">Admin</span></h1>
        </div>

        {activeTab === 'agenda' ? (
          <AdminAgenda 
            customerVisits={customersMap}
          />
        ) : activeTab === 'stats' ? (
          <AdminRendimientos bookings={bookings} movements={allMovements} />
        ) : (
          <>
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

        {/* Quick Filters */}
        <div className="bg-zinc-900 border border-white/5 p-6 rounded-3xl mb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-2">Desde</label>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-2">Hasta</label>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none" />
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
          </div>
          
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {['Hoy', 'Ayer', 'Semana', 'Mes', 'Todo'].map(r => (
                <button 
                  key={r}
                  onClick={() => setRange(r.toLowerCase() as any)}
                  className="px-4 py-2 rounded-xl bg-slate-950 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:border-emerald-500 transition-colors"
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={fetchRows} className="flex items-center gap-2 bg-emerald-500 text-night px-6 py-2 rounded-xl font-display font-black italic text-sm hover:bg-emerald-400 transition-all">
                <Search className="w-4 h-4" /> BUSCAR
              </button>
              <button onClick={exportCSV} className="flex items-center gap-2 bg-zinc-800 text-white px-4 py-2 rounded-xl font-display font-black italic text-sm hover:bg-zinc-700 transition-all">
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
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Cliente / Factura</label>
              <input value={newMovement.cliente} onChange={e => setNewMovement({...newMovement, cliente: e.target.value})} placeholder="Cliente opcional" className="w-full bg-slate-950 border border-emerald-500/10 rounded-xl p-3 text-sm" />
            </div>
          </div>
          <div className="mt-8 flex items-center justify-end gap-6">
            {altaSuccess && <p className="text-emerald-500 font-black text-xs uppercase tracking-widest animate-fade-in">¡Agregado con éxito!</p>}
            <button 
              disabled={submitting}
              onClick={handleAdd}
              className="bg-emerald-500 text-night px-12 py-4 rounded-2xl font-display font-black italic text-lg hover:bg-emerald-400 transition-all disabled:opacity-50"
            >
              {submitting ? 'CARGANDO...' : 'CARGAR MOVIMIENTO'}
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
                  <th className="px-6 py-5">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => (
                  <React.Fragment key={r.id}>
                    <tr className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-medium">{r.fecha}</td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-black uppercase tracking-tighter px-2 py-1 rounded-md ${r.tipo?.toLowerCase() === 'ingreso' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                          {r.tipo}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-zinc-400">{r.categoria}</td>
                      <td className="px-6 py-4 font-display font-black italic truncate max-w-[150px]">{r.concepto}</td>
                      <td className="px-6 py-4 font-display font-black">{fmt(r.monto_ars)}</td>
                      <td className="px-6 py-4 text-zinc-400 text-xs">{r.medio}</td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-black uppercase tracking-tighter ${r.estado?.toLowerCase() === 'pagado' ? 'text-emerald-500' : 'text-amber-500 animate-pulse'}`}>
                          {r.estado}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setEditingId(editingId === r.id ? null : r.id);
                              setEditForm(r);
                            }}
                            className="p-2 bg-white/5 rounded-lg hover:bg-emerald-500 hover:text-night transition-all"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setDeletingId(r.id)}
                            className="p-2 bg-white/5 rounded-lg hover:bg-red-500 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editingId === r.id && (
                      <tr className="bg-white/[0.03]">
                        <td colSpan={8} className="p-8">
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
                            <button onClick={() => setEditingId(null)} className="px-6 py-2 rounded-xl text-xs font-black uppercase text-zinc-500 hover:text-white">Cancelar</button>
                            <button onClick={handleUpdate} className="px-8 py-2 rounded-xl bg-emerald-500 text-night text-xs font-black uppercase italic tracking-tighter">Guardar Cambios</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {!filteredRows.length && !loading && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-zinc-500 italic">No se encontraron movimientos para este periodo</td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-zinc-500 italic">Cargando datos...</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )}
      </div>

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
    </div>
  );
}
