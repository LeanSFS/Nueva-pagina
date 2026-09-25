import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  FileText, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Download, 
  Upload, 
  Key, 
  Send, 
  Printer, 
  Search, 
  ExternalLink, 
  Check, 
  HelpCircle,
  Clock,
  Building,
  DollarSign,
  User,
  Phone,
  QrCode as QrIcon,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import { firestoreService, Movement, Booking } from '../services/firestoreService.ts';
import { ArcaConfig, ArcaFacturaRecord } from '../types.ts';

interface AdminArcaFacturacionProps {
  movements?: Movement[];
  bookings?: Booking[];
  onRefreshMovements?: () => Promise<void> | void;
}

export default function AdminArcaFacturacion({
  movements = [],
  bookings = [],
  onRefreshMovements
}: AdminArcaFacturacionProps) {
  // Config state
  const [config, setConfig] = useState<ArcaConfig>({
    cuit: '20411564550',
    razonSocial: 'LyS Lavados',
    puntoVenta: 2,
    tipoComprobanteDefault: 11,
    conceptoDefault: 2,
    domicilioComercial: 'Venezuela 1659, Cipolletti, Río Negro',
    inicioActividades: '01/01/2024',
    condicionIva: 'Responsable Monotributo',
    production: true
  });

  // Certificate info from backend
  const [certInfo, setCertInfo] = useState<{
    hasCert: boolean;
    hasKey: boolean;
    cuit: string;
    subject: string;
    validUntil: string;
    validFrom: string;
    isExpired: boolean;
  }>({
    hasCert: false,
    hasKey: false,
    cuit: '',
    subject: '',
    validUntil: '',
    validFrom: '',
    isExpired: false
  });

  // Server status
  const [serverStatus, setServerStatus] = useState<{
    online: boolean;
    appServer: string;
    dbServer: string;
    authServer: string;
  } | null>(null);

  const [loadingStatus, setLoadingStatus] = useState(false);
  const [testingAuth, setTestingAuth] = useState(false);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Cert upload / paste modal or drawer
  const [showCertEditor, setShowCertEditor] = useState(false);
  const [certInput, setCertInput] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [savingCerts, setSavingCerts] = useState(false);
  const [generatingCsr, setGeneratingCsr] = useState(false);
  const [csrMessage, setCsrMessage] = useState<string | null>(null);

  // Last Voucher
  const [lastVoucher, setLastVoucher] = useState<number | null>(null);
  const [loadingLastVoucher, setLoadingLastVoucher] = useState(false);

  // Invoicing form
  const [formInvoice, setFormInvoice] = useState({
    clienteNombre: '',
    clienteDocTipo: '99', // 99 = Consumidor Final, 96 = DNI, 80 = CUIT
    clienteDocNro: '',
    clienteTelefono: '',
    montoTotal: '',
    concepto: 'Servicio de Estética y Lavado Automotor',
    tipoComprobante: 11, // Factura C
    puntoVenta: 2
  });

  const [isSubmittingInvoice, setIsSubmittingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceSuccess, setInvoiceSuccess] = useState<ArcaFacturaRecord | null>(null);

  // History
  const [facturas, setFacturas] = useState<ArcaFacturaRecord[]>([]);
  const [loadingFacturas, setLoadingFacturas] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  // Selected Factura for full printable receipt view
  const [selectedFactura, setSelectedFactura] = useState<ArcaFacturaRecord | null>(null);

  // Tutorial / Instructions accordion
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    // 1. Load config from Firestore
    try {
      const savedConfig = await firestoreService.getArcaConfig();
      setConfig(savedConfig);
      setFormInvoice(prev => ({
        ...prev,
        puntoVenta: savedConfig.puntoVenta || 2,
        tipoComprobante: savedConfig.tipoComprobanteDefault || 11
      }));
    } catch (e) {
      console.error('Error loading ARCA config:', e);
    }

    // 2. Load cert info from backend
    await checkCertInfo();

    // 3. Check ARCA server status
    await checkArcaStatus();

    // 4. Load Facturas
    await loadFacturas();
  };

  const checkCertInfo = async () => {
    try {
      const res = await fetch('/api/arca/cert-info');
      if (res.ok) {
        const data = await res.json();
        setCertInfo(data);
      }
    } catch (e) {
      console.warn('Error checking cert info:', e);
    }
  };

  const checkArcaStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch(`/api/arca/status?production=${config.production}`);
      if (res.ok) {
        const data = await res.json();
        setServerStatus({
          online: data.online,
          appServer: data.appServer,
          dbServer: data.dbServer,
          authServer: data.authServer
        });
      }
    } catch (e) {
      console.warn('Error checking ARCA status:', e);
    } finally {
      setLoadingStatus(false);
    }
  };

  const testAuthAndVoucher = async () => {
    setTestingAuth(true);
    setAuthError(null);
    setAuthSuccess(null);
    try {
      const res = await fetch('/api/arca/test-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ production: config.production })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al autenticar con ARCA (WSAA).');
      }

      setAuthSuccess('¡Autenticación WSAA exitosa! ARCA autorizó el Ticket de Acceso.');

      // Also query last voucher
      await fetchLastVoucher();
    } catch (e: any) {
      setAuthError(e.message || 'Error de conexión con ARCA.');
    } finally {
      setTestingAuth(false);
    }
  };

  const fetchLastVoucher = async () => {
    setLoadingLastVoucher(true);
    try {
      const res = await fetch(`/api/arca/ultimo-comprobante?cuit=${config.cuit}&puntoVenta=${config.puntoVenta}&tipoComprobante=${formInvoice.tipoComprobante}&production=${config.production}`);
      if (res.ok) {
        const data = await res.json();
        setLastVoucher(data.ultimoComprobante);
      }
    } catch (e) {
      console.warn('Error fetching last voucher:', e);
    } finally {
      setLoadingLastVoucher(false);
    }
  };

  const handleSaveCerts = async () => {
    if (!certInput.trim() && !keyInput.trim()) {
      alert('Por favor ingrese el contenido del certificado o de la clave privada.');
      return;
    }

    setSavingCerts(true);
    try {
      const res = await fetch('/api/arca/save-certs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certPem: certInput.trim(),
          keyPem: keyInput.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCertInfo(data.info);
        setShowCertEditor(false);
        setCertInput('');
        setKeyInput('');
        setAuthSuccess('¡Certificado guardado con éxito! Puedes probar la conexión ahora.');
      } else {
        alert(data.error || 'Error al guardar certificados.');
      }
    } catch (e: any) {
      alert(e.message || 'Error de red al guardar certificados.');
    } finally {
      setSavingCerts(false);
    }
  };

  const handleGenerateCsr = async () => {
    setGeneratingCsr(true);
    setCsrMessage(null);
    try {
      const res = await fetch('/api/arca/generate-csr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuit: config.cuit,
          razonSocial: config.razonSocial
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCsrMessage(`¡CSR y Clave Privada generados con éxito para CUIT ${data.cuit}!`);
        await checkCertInfo();
      } else {
        alert(data.error || 'Error al generar CSR.');
      }
    } catch (e: any) {
      alert(e.message || 'Error al generar pedido CSR.');
    } finally {
      setGeneratingCsr(false);
    }
  };

  const handleFileCertUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setCertInput(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleFileKeyUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setKeyInput(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  const loadFacturas = async () => {
    setLoadingFacturas(true);
    try {
      const data = await firestoreService.getArcaFacturas();
      setFacturas(data);
    } catch (e) {
      console.error('Error loading ARCA facturas:', e);
    } finally {
      setLoadingFacturas(false);
    }
  };

  const handleEmitirFactura = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvoiceError(null);
    setInvoiceSuccess(null);

    const totalNum = Number(formInvoice.montoTotal);
    if (!totalNum || totalNum <= 0) {
      setInvoiceError('El monto total debe ser mayor a $0.');
      return;
    }

    if (formInvoice.clienteDocTipo !== '99' && !formInvoice.clienteDocNro.trim()) {
      setInvoiceError('Debes ingresar el número de documento del cliente.');
      return;
    }

    setIsSubmittingInvoice(true);

    try {
      const res = await fetch('/api/arca/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuit: config.cuit,
          puntoVenta: formInvoice.puntoVenta,
          tipoComprobante: formInvoice.tipoComprobante,
          concepto: 2, // Servicios
          docTipo: Number(formInvoice.clienteDocTipo),
          docNro: formInvoice.clienteDocTipo === '99' ? '0' : formInvoice.clienteDocNro.trim(),
          total: totalNum,
          clienteNombre: formInvoice.clienteNombre.trim() || 'Consumidor Final',
          clienteTelefono: formInvoice.clienteTelefono.trim(),
          descripcionServicio: formInvoice.concepto,
          production: config.production
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo emitir la factura en ARCA.');
      }

      // Record in Firestore
      const newFactura: ArcaFacturaRecord = {
        id: `arca_${data.puntoVenta}_${data.tipoComprobante}_${data.cbteNro}`,
        cae: data.cae,
        caeVto: data.caeVto,
        cbteNro: data.cbteNro,
        puntoVenta: data.puntoVenta,
        tipoComprobante: data.tipoComprobante,
        tipoComprobanteNombre: data.tipoComprobanteNombre || 'FACTURA C',
        fechaEmision: data.fechaEmision || new Date().toLocaleDateString('es-AR'),
        fechaIso: new Date().toISOString().split('T')[0],
        total: totalNum,
        clienteNombre: formInvoice.clienteNombre.trim() || 'Consumidor Final',
        clienteDocTipo: formInvoice.clienteDocTipo === '96' ? 'DNI' : formInvoice.clienteDocTipo === '80' ? 'CUIT' : 'Consumidor Final',
        clienteDocNro: formInvoice.clienteDocNro.trim() || '0',
        clienteTelefono: formInvoice.clienteTelefono.trim(),
        conceptoDescripcion: formInvoice.concepto,
        qrUrl: data.qrUrl,
        qrBase64: data.qrBase64,
        createdAt: new Date().toISOString()
      };

      await firestoreService.saveArcaFactura(newFactura);
      setFacturas(prev => [newFactura, ...prev]);
      setInvoiceSuccess(newFactura);
      setSelectedFactura(newFactura);

      // Reset form fields
      setFormInvoice(prev => ({
        ...prev,
        clienteNombre: '',
        clienteDocNro: '',
        clienteTelefono: '',
        montoTotal: '',
        concepto: 'Servicio de Estética y Lavado Automotor'
      }));

      // Refresh last voucher counter
      fetchLastVoucher();
    } catch (err: any) {
      setInvoiceError(err.message || 'Error al emitir factura en ARCA.');
    } finally {
      setIsSubmittingInvoice(false);
    }
  };

  const handleSendWhatsApp = (factura: ArcaFacturaRecord) => {
    let cleanPhone = (factura.clienteTelefono || '').replace(/\D/g, '');
    if (cleanPhone && !cleanPhone.startsWith('549') && !cleanPhone.startsWith('54')) {
      cleanPhone = `549${cleanPhone}`;
    }

    const text = `¡Hola ${factura.clienteNombre}! 🚗✨ Te compartimos el comprobante oficial de tu servicio en LyS Lavados.\n\n` +
      `📄 *${factura.tipoComprobanteNombre} Nº ${String(factura.puntoVenta).padStart(4, '0')}-${String(factura.cbteNro).padStart(8, '0')}*\n` +
      `💰 *Monto Total:* $${factura.total.toLocaleString('es-AR')}\n` +
      `🛡️ *CAE Oficial ARCA:* ${factura.cae} (Vto: ${factura.caeVto})\n` +
      `📅 *Fecha:* ${factura.fechaEmision}\n\n` +
      `🔍 Puedes verificar este comprobante directamente en la web de ARCA escaneando el código QR oficial.\n\n` +
      `¡Muchas gracias por confiar en LyS Lavados!`;

    const targetUrl = cleanPhone 
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;

    window.open(targetUrl, '_blank');
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const filteredFacturas = useMemo(() => {
    if (!searchFilter.trim()) return facturas;
    const q = searchFilter.toLowerCase();
    return facturas.filter(f => 
      f.clienteNombre.toLowerCase().includes(q) ||
      String(f.cbteNro).includes(q) ||
      f.cae.includes(q) ||
      String(f.total).includes(q)
    );
  }, [facturas, searchFilter]);

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-900 border border-emerald-500/20 rounded-2xl md:rounded-[2.5rem] p-6 md:p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                API Oficial ARCA (Ex AFIP) Directa y Gratuita
              </span>
              <span className="bg-white/5 border border-white/10 text-zinc-400 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                0% Costo Intermediarios
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-display font-black italic text-white tracking-tight">
              FACTURACIÓN ELECTRÓNICA ARCA
            </h2>
            <p className="text-zinc-400 text-xs md:text-sm max-w-2xl leading-relaxed">
              Emisión directa de Facturas C y B con <strong className="text-white">CAE oficial</strong> en tiempo real mediante los Web Services de ARCA (WSAA y WSFE). Comprobantes oficiales con código QR reglamentario y envío instantáneo a WhatsApp.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={checkArcaStatus}
              disabled={loadingStatus}
              className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-white/10 flex items-center gap-2 transition-all cursor-pointer"
              title="Comprobar servidores ARCA"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin text-emerald-400' : ''}`} />
              <span>Servidores ARCA: {serverStatus?.online ? '🟢 ONLINE' : serverStatus ? '🔴 ERROR' : 'Consultar'}</span>
            </button>

            <button
              onClick={testAuthAndVoucher}
              disabled={testingAuth}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{testingAuth ? 'Autenticando...' : 'Probar Conexión ARCA'}</span>
            </button>
          </div>
        </div>

        {/* Feedback alerts */}
        {authSuccess && (
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="font-semibold">{authSuccess}</span>
            {lastVoucher !== null && (
              <span className="ml-auto font-mono bg-emerald-500/20 px-2 py-0.5 rounded text-[11px] text-emerald-300">
                Última Factura C Nº: {lastVoucher} (Próxima: {lastVoucher + 1})
              </span>
            )}
          </div>
        )}

        {authError && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{authError}</span>
          </div>
        )}
      </div>

      {/* SECCIÓN 1: CERTIFICADO DIGITAL Y CONFIGURACIÓN ARCA */}
      <div className="bg-zinc-900 border border-white/5 rounded-2xl md:rounded-[2.5rem] p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Certificado Digital X.509 de ARCA</h3>
              <p className="text-zinc-500 text-xs">Clave criptográfica requerida por ARCA para firmar digitalmente cada factura con CAE.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTutorial(!showTutorial)}
              className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Instrucciones ARCA</span>
              {showTutorial ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => setShowCertEditor(!showCertEditor)}
              className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{certInfo.hasCert ? 'Reemplazar Certificado' : 'Cargar Certificado (.crt)'}</span>
            </button>
          </div>
        </div>

        {/* Certificate Status Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-950/60 p-4 rounded-xl border border-white/5">
            <div className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1">Estado de Certificado</div>
            <div className="flex items-center gap-2">
              {certInfo.hasCert ? (
                <span className="text-emerald-400 font-bold text-sm flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Instalado en Servidor
                </span>
              ) : (
                <span className="text-amber-400 font-bold text-sm flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-400" /> Pendiente de Carga
                </span>
              )}
            </div>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-xl border border-white/5">
            <div className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1">Clave Privada RSA</div>
            <div className="flex items-center gap-2">
              {certInfo.hasKey ? (
                <span className="text-emerald-400 font-bold text-sm flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Generada y Activa
                </span>
              ) : (
                <span className="text-zinc-500 font-bold text-sm">No instalada</span>
              )}
            </div>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-xl border border-white/5">
            <div className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1">CUIT Emisor</div>
            <div className="text-white font-mono font-bold text-sm">
              {config.cuit ? `${config.cuit.slice(0, 2)}-${config.cuit.slice(2, 10)}-${config.cuit.slice(10)}` : '20-41156455-0'}
            </div>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-xl border border-white/5">
            <div className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1">Punto de Venta Oficial</div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-mono font-bold text-sm">
                Pto. Venta: {String(config.puntoVenta).padStart(4, '0')} (Factura C)
              </span>
              <button
                type="button"
                onClick={async () => {
                  const nuevo = prompt('Ingresa el número de Punto de Venta de ARCA (ej: 2):', String(config.puntoVenta));
                  if (nuevo && !isNaN(Number(nuevo))) {
                    const nro = Number(nuevo);
                    const updated = { ...config, puntoVenta: nro };
                    setConfig(updated);
                    setFormInvoice(prev => ({ ...prev, puntoVenta: nro }));
                    await firestoreService.saveArcaConfig(updated);
                    fetchLastVoucher();
                  }
                }}
                className="text-[10px] bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white px-2 py-0.5 rounded cursor-pointer transition-all"
              >
                Cambiar
              </button>
            </div>
          </div>
        </div>

        {/* Tutorial / Steps collapse */}
        {showTutorial && (
          <div className="bg-slate-950 border border-emerald-500/20 rounded-xl p-5 space-y-4 animate-fade-in">
            <h4 className="font-bold text-sm text-emerald-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Configuración obligatoria en ARCA (ex AFIP) para facturar:
            </h4>
            <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
              <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-1">
                <div className="font-bold text-white flex items-center gap-1.5 text-xs">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-black inline-flex items-center justify-center text-[11px]">1</span>
                  Dar de alta el Punto de Venta para Web Services (Punto 2)
                </div>
                <p className="text-zinc-400 text-[11px] pl-6.5">
                  En el portal de ARCA entra a <strong className="text-zinc-200">&quot;Administración de puntos de venta y domicilios&quot;</strong> &gt; A/B/M de puntos de venta &gt; <em>Agregar</em>:
                  <br />• Número: <strong className="text-emerald-400">2</strong>
                  <br />• Sistema: <strong className="text-emerald-400">Factura Electrónica - Web Services</strong> (RECE para aplicativo y/o web service).
                  <br />• Domicilio: Venezuela 1659, Cipolletti.
                </p>
              </div>

              <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-1">
                <div className="font-bold text-white flex items-center gap-1.5 text-xs">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-black inline-flex items-center justify-center text-[11px]">2</span>
                  Vincular el Alias del Certificado al Servicio de Factura Electrónica (WSFE)
                </div>
                <p className="text-zinc-400 text-[11px] pl-6.5">
                  En el portal de ARCA entra a <strong className="text-zinc-200">&quot;Administrador de Relaciones de Clave Fiscal&quot;</strong>:
                  <br />• Clic en <strong className="text-white">Nueva Relación</strong> &gt; <strong className="text-white">Buscar Servicio</strong>.
                  <br />• Elige <strong className="text-white">ARCA / AFIP</strong> &gt; <strong className="text-white">Web Services</strong> &gt; <strong className="text-emerald-400">Factura Electrónica (WSFE)</strong>.
                  <br />• En <em>Representante</em> haz clic en <em>Buscar</em> y selecciona el <strong className="text-emerald-400">Alias del Certificado</strong> que creaste.
                  <br />• Clic en <em>Confirmar</em>.
                </p>
              </div>

              <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-1">
                <div className="font-bold text-white flex items-center gap-1.5 text-xs">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-black inline-flex items-center justify-center text-[11px]">3</span>
                  Cargar el Certificado (.crt) aquí
                </div>
                <p className="text-zinc-400 text-[11px] pl-6.5">
                  Haz clic en <strong className="text-emerald-400">&quot;Cargar Certificado (.crt)&quot;</strong> arriba y sube el archivo <code className="text-emerald-300 font-mono">.crt</code> que te entregó ARCA. Luego haz clic en <strong className="text-white">&quot;Probar Conexión ARCA&quot;</strong> ¡y listo!
                </p>
              </div>
            </div>
            
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={handleGenerateCsr}
                disabled={generatingCsr}
                className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg border border-white/10 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                <span>{generatingCsr ? 'Generando...' : 'Generar Nuevo Pedido CSR'}</span>
              </button>

              <a
                href="/pedido_arca.csr"
                download="pedido_arca.csr"
                className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar .csr</span>
              </a>

              <a
                href="/pedido_arca.req"
                download="pedido_arca.req"
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 text-xs font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all"
                title="Formato alternativo .req para AFIP"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar .req</span>
              </a>

              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch('/pedido_arca.csr');
                    const text = await res.text();
                    await navigator.clipboard.writeText(text);
                    alert('¡Texto del CSR copiado al portapapeles!');
                  } catch (e) {
                    alert('Error al copiar texto del CSR.');
                  }
                }}
                className="text-xs text-zinc-400 hover:text-white px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-all"
              >
                Copiar Texto del CSR
              </button>

              {csrMessage && <span className="text-xs text-emerald-400 font-bold">{csrMessage}</span>}
            </div>
          </div>
        )}

        {/* Certificate Editor Drawer / Form */}
        {showCertEditor && (
          <div className="bg-slate-950 border border-emerald-500/30 rounded-2xl p-6 space-y-5 animate-fade-in">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h4 className="font-bold text-sm text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-400" /> Carga de Certificado Digital (.crt) y Clave (.key)
              </h4>
              <button 
                onClick={() => setShowCertEditor(false)}
                className="text-zinc-500 hover:text-white p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Sube directamente tu archivo <code className="text-emerald-400 font-mono">.crt</code> otorgado por ARCA (o pega su texto). Si ya generaste la clave privada con el botón de CSR, solo necesitas subir el certificado <code className="text-emerald-400 font-mono">.crt</code>.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase text-zinc-300 flex items-center justify-between">
                  <span>1. Certificado Digital (.crt / .pem)</span>
                  <label className="text-emerald-400 hover:underline text-[10px] cursor-pointer flex items-center gap-1 font-normal">
                    <Upload className="w-3 h-3 inline" /> Seleccionar Archivo .crt
                    <input type="file" accept=".crt,.pem,.cer,.txt" onChange={handleFileCertUpload} className="hidden" />
                  </label>
                </label>
                <textarea
                  value={certInput}
                  onChange={e => setCertInput(e.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;MIID... (Pega aquí el contenido de tu certificado .crt)&#10;-----END CERTIFICATE-----"
                  rows={5}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl p-3 text-xs font-mono text-zinc-300 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase text-zinc-300 flex items-center justify-between">
                  <span>2. Clave Privada (.key) {certInfo.hasKey && <span className="text-emerald-400 font-normal">(Ya instalada en el servidor)</span>}</span>
                  <label className="text-emerald-400 hover:underline text-[10px] cursor-pointer flex items-center gap-1 font-normal">
                    <Upload className="w-3 h-3 inline" /> Seleccionar Archivo .key
                    <input type="file" accept=".key,.pem,.txt" onChange={handleFileKeyUpload} className="hidden" />
                  </label>
                </label>
                <textarea
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  placeholder={certInfo.hasKey ? "Clave privada ya configurada en el servidor (opcional ingresar otra)" : "-----BEGIN RSA PRIVATE KEY-----&#10;MIIE... (Pega aquí el contenido de tu clave .key)&#10;-----END RSA PRIVATE KEY-----"}
                  rows={5}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl p-3 text-xs font-mono text-zinc-300 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCertEditor(false)}
                className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-white/5 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveCerts}
                disabled={savingCerts}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{savingCerts ? 'Guardando...' : 'Guardar e Instalar Certificado'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECCIÓN 2: EMISIÓN RÁPIDA DE FACTURA ARCA */}
      <div className="bg-zinc-900 border border-white/5 rounded-2xl md:rounded-[2.5rem] p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h3 className="font-bold text-lg text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" /> Emitir Factura Electrónica ARCA (1 Clic)
            </h3>
            <p className="text-zinc-500 text-xs">Generación instantánea ante ARCA con obtención automática de CAE y generación de código QR oficial.</p>
          </div>
          
          <div className="text-right hidden sm:block">
            <span className="text-xs text-zinc-500 font-mono">Punto Venta: {String(formInvoice.puntoVenta).padStart(4, '0')}</span>
          </div>
        </div>

        {/* Quick autofill from movements */}
        {movements.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 text-xs">
            <span className="text-zinc-500 font-bold uppercase text-[10px] tracking-wider shrink-0">Autocompletar de Caja:</span>
            {movements.filter(m => m.tipo === 'Ingreso').slice(0, 4).map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setFormInvoice(prev => ({
                    ...prev,
                    clienteNombre: m.cliente || 'Consumidor Final',
                    montoTotal: String(m.monto_ars || ''),
                    concepto: m.concepto || 'Servicio de Estética y Lavado Automotor'
                  }));
                }}
                className="bg-slate-950 hover:bg-zinc-800 text-zinc-300 border border-white/5 px-3 py-1.5 rounded-lg shrink-0 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <DollarSign className="w-3 h-3 text-emerald-400" />
                <span>{m.concepto.slice(0, 20)} (${Number(m.monto_ars).toLocaleString('es-AR')})</span>
              </button>
            ))}
          </div>
        )}

        {invoiceError && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{invoiceError}</span>
          </div>
        )}

        <form onSubmit={handleEmitirFactura} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">Tipo de Factura</label>
            <select
              value={formInvoice.tipoComprobante}
              onChange={e => setFormInvoice({ ...formInvoice, tipoComprobante: Number(e.target.value) })}
              className="w-full bg-slate-950 border border-emerald-500/20 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              <option value={11}>Factura C (Monotributo - Recomendada)</option>
              <option value={6}>Factura B (Resp. Inscripto a Consumidor Final)</option>
              <option value={1}>Factura A (Resp. Inscripto a Empresa)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">Cliente / Razón Social</label>
            <input
              type="text"
              value={formInvoice.clienteNombre}
              onChange={e => setFormInvoice({ ...formInvoice, clienteNombre: e.target.value })}
              placeholder="Consumidor Final"
              className="w-full bg-slate-950 border border-emerald-500/20 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">Documento Fiscal</label>
            <div className="flex gap-2">
              <select
                value={formInvoice.clienteDocTipo}
                onChange={e => setFormInvoice({ ...formInvoice, clienteDocTipo: e.target.value })}
                className="w-1/3 bg-slate-950 border border-emerald-500/20 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="99">Sin Doc (CF)</option>
                <option value="96">DNI</option>
                <option value="80">CUIT</option>
              </select>
              <input
                type="text"
                disabled={formInvoice.clienteDocTipo === '99'}
                value={formInvoice.clienteDocNro}
                onChange={e => setFormInvoice({ ...formInvoice, clienteDocNro: e.target.value })}
                placeholder={formInvoice.clienteDocTipo === '99' ? 'Consumidor Final' : 'Nº Documento'}
                className="w-2/3 bg-slate-950 border border-emerald-500/20 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500 disabled:opacity-40"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">Monto Total ($ ARS)</label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-zinc-500 font-bold">$</span>
              <input
                type="number"
                step="0.01"
                required
                value={formInvoice.montoTotal}
                onChange={e => setFormInvoice({ ...formInvoice, montoTotal: e.target.value })}
                placeholder="0.00"
                className="w-full bg-slate-950 border border-emerald-500/20 rounded-xl p-3 pl-8 text-sm text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">Concepto / Descripción del Servicio</label>
            <input
              type="text"
              value={formInvoice.concepto}
              onChange={e => setFormInvoice({ ...formInvoice, concepto: e.target.value })}
              placeholder="Servicio de Estética y Lavado Automotor"
              className="w-full bg-slate-950 border border-emerald-500/20 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">WhatsApp Cliente (Opcional)</label>
            <input
              type="text"
              value={formInvoice.clienteTelefono}
              onChange={e => setFormInvoice({ ...formInvoice, clienteTelefono: e.target.value })}
              placeholder="Ej: 2991234567"
              className="w-full bg-slate-950 border border-emerald-500/20 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={isSubmittingInvoice}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black italic text-base py-3 px-6 rounded-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 h-[46px]"
            >
              {isSubmittingInvoice ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Emitiendo en ARCA...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>⚡ EMITIR FACTURA</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* SECCIÓN 3: HISTORIAL DE FACTURAS EMITIDAS */}
      <div className="bg-zinc-900 border border-white/5 rounded-2xl md:rounded-[2.5rem] p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <h3 className="font-bold text-lg text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" /> Registro de Facturas Emitidas
            </h3>
            <p className="text-zinc-500 text-xs">Comprobantes oficiales registrados ante ARCA con CAE y código QR reglamentario.</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
              <input
                type="text"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                placeholder="Buscar cliente, CAE o número..."
                className="bg-slate-950 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 w-48 sm:w-64"
              />
            </div>

            <button
              onClick={loadFacturas}
              className="p-2 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-xl transition-all cursor-pointer"
              title="Recargar facturas"
            >
              <RefreshCw className={`w-4 h-4 ${loadingFacturas ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        {filteredFacturas.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 space-y-2">
            <FileText className="w-12 h-12 mx-auto text-zinc-700 stroke-1" />
            <p className="font-bold text-sm text-zinc-400">No hay facturas registradas.</p>
            <p className="text-xs text-zinc-600 max-w-sm mx-auto">
              Al emitir tu primera factura desde el formulario de arriba, aparecerá aquí con su CAE oficial y comprobante imprimible.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-slate-950/60 text-zinc-500 uppercase font-black tracking-wider text-[10px] border-b border-white/5">
                <tr>
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4">Comprobante</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Monto</th>
                  <th className="py-3 px-4">CAE ARCA</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredFacturas.map((fact) => (
                  <tr key={fact.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-zinc-400">{fact.fechaEmision}</td>
                    <td className="py-3.5 px-4 font-mono font-bold text-white">
                      <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[11px] border border-emerald-500/20">
                        {fact.tipoComprobanteNombre} Nº {String(fact.puntoVenta).padStart(4, '0')}-{String(fact.cbteNro).padStart(8, '0')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{fact.clienteNombre}</div>
                      <div className="text-[10px] text-zinc-500">{fact.conceptoDescripcion}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 text-sm">
                      ${fact.total.toLocaleString('es-AR')}
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      <div className="text-zinc-200 font-bold">{fact.cae}</div>
                      <div className="text-[10px] text-zinc-500">Vto: {fact.caeVto}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => setSelectedFactura(fact)}
                        className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer"
                      >
                        <Printer className="w-3 h-3 text-emerald-400" />
                        <span>Ver Factura</span>
                      </button>

                      <button
                        onClick={() => handleSendWhatsApp(fact)}
                        className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer"
                      >
                        <Send className="w-3 h-3" />
                        <span>WhatsApp</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL COMPROBANTE OFICIAL ARCA (PRINT / VIEW) */}
      {selectedFactura && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-950 border border-white/10 rounded-2xl md:rounded-3xl max-w-2xl w-full p-6 md:p-8 space-y-6 shadow-2xl relative my-8">
            {/* Modal actions bar */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4 print:hidden">
              <div className="flex items-center gap-2">
                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase px-2.5 py-1 rounded-full border border-emerald-500/30">
                  Comprobante Oficial Aprobado por ARCA
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintReceipt}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir</span>
                </button>
                <button
                  onClick={() => handleSendWhatsApp(selectedFactura)}
                  className="bg-white/10 hover:bg-white/20 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-emerald-400" />
                  <span>WhatsApp</span>
                </button>
                <button
                  onClick={() => setSelectedFactura(null)}
                  className="text-zinc-400 hover:text-white p-1 rounded cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* PRINTABLE RECEIPT TEMPLATE */}
            <div id="printable-arca-receipt" className="bg-white text-black p-6 md:p-8 rounded-xl font-sans text-xs space-y-6 border border-zinc-200">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 border-b-2 border-black pb-4 relative">
                <div className="col-span-5 space-y-1">
                  <h1 className="text-xl font-black tracking-tight">{config.razonSocial}</h1>
                  <p className="text-[10px] text-zinc-600">Estética Automotriz y Lavado Artesanal</p>
                  <p className="text-[10px] text-zinc-700">{config.domicilioComercial}</p>
                  <p className="text-[10px] font-bold">Condición IVA: {config.condicionIva}</p>
                </div>

                {/* Center Badge "C" */}
                <div className="col-span-2 flex flex-col items-center justify-center border border-black rounded p-1">
                  <span className="text-3xl font-black">C</span>
                  <span className="text-[8px] font-bold uppercase tracking-wider">CÓD. 011</span>
                </div>

                <div className="col-span-5 text-right space-y-1">
                  <h2 className="text-base font-black uppercase">{selectedFactura.tipoComprobanteNombre}</h2>
                  <p className="font-mono text-xs font-bold">
                    Punto de Venta: {String(selectedFactura.puntoVenta).padStart(4, '0')} Comp. Nro: {String(selectedFactura.cbteNro).padStart(8, '0')}
                  </p>
                  <p className="text-[10px]">Fecha de Emisión: <strong>{selectedFactura.fechaEmision}</strong></p>
                  <p className="text-[10px] font-mono">CUIT Emisor: <strong>20-41156455-0</strong></p>
                </div>
              </div>

              {/* Client details */}
              <div className="bg-zinc-100 p-3 rounded space-y-1 border border-zinc-200 text-[11px]">
                <div className="grid grid-cols-2 gap-2">
                  <div><strong>Cliente / Razón Social:</strong> {selectedFactura.clienteNombre}</div>
                  <div><strong>Condición IVA:</strong> Consumidor Final</div>
                  <div><strong>Documento:</strong> {selectedFactura.clienteDocTipo}: {selectedFactura.clienteDocNro}</div>
                  <div><strong>Condición de Venta:</strong> Contado / Efectivo / Transferencia</div>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <table className="w-full text-left text-xs border border-zinc-300">
                  <thead className="bg-zinc-100 border-b border-zinc-300 font-bold text-[10px] uppercase">
                    <tr>
                      <th className="p-2">Descripción del Servicio</th>
                      <th className="p-2 text-center">Cant.</th>
                      <th className="p-2 text-right">Precio Unit.</th>
                      <th className="p-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-zinc-200">
                      <td className="p-2 font-medium">{selectedFactura.conceptoDescripcion}</td>
                      <td className="p-2 text-center">1</td>
                      <td className="p-2 text-right font-mono">${selectedFactura.total.toLocaleString('es-AR')}</td>
                      <td className="p-2 text-right font-mono font-bold">${selectedFactura.total.toLocaleString('es-AR')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Total */}
              <div className="flex justify-end border-t border-black pt-2">
                <div className="text-right space-y-1">
                  <div className="text-sm font-black flex items-center gap-6 justify-between">
                    <span>TOTAL A PAGAR:</span>
                    <span className="font-mono text-base">${selectedFactura.total.toLocaleString('es-AR')}</span>
                  </div>
                </div>
              </div>

              {/* ARCA Official Footer with QR and CAE */}
              <div className="border-t-2 border-black pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {selectedFactura.qrBase64 && (
                    <img 
                      src={selectedFactura.qrBase64} 
                      alt="Código QR ARCA" 
                      className="w-24 h-24 border border-zinc-300 p-1 rounded" 
                    />
                  )}
                  <div className="space-y-1 text-[10px]">
                    <div className="font-black text-xs text-zinc-900 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 inline" /> Comprobante Autorizado por ARCA
                    </div>
                    <p className="text-zinc-600">Escanea el código QR con cualquier celular para validar la autenticidad fiscal de este comprobante.</p>
                  </div>
                </div>

                <div className="text-right space-y-1 font-mono text-[11px] bg-zinc-50 p-2.5 rounded border border-zinc-200">
                  <div><strong>CAE Oficial:</strong> <span className="text-black font-black text-xs">{selectedFactura.cae}</span></div>
                  <div><strong>Fecha de Vto. CAE:</strong> {selectedFactura.caeVto}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
