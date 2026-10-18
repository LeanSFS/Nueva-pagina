import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { ArcaService } from "./server/arcaService.ts";

import fs from "fs";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Enable CORS for custom domain frontend calls
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Persistent Schedule Overrides Store (for unblocked days/slots across all clients)
const SCHEDULE_OVERRIDES_FILE = path.join(process.cwd(), "data", "schedule_overrides.json");

function getScheduleOverrides(): { unblockedDays: string[]; unblockedSlots: string[] } {
  try {
    if (fs.existsSync(SCHEDULE_OVERRIDES_FILE)) {
      const data = JSON.parse(fs.readFileSync(SCHEDULE_OVERRIDES_FILE, "utf-8"));
      return {
        unblockedDays: Array.isArray(data.unblockedDays) ? data.unblockedDays : [],
        unblockedSlots: Array.isArray(data.unblockedSlots) ? data.unblockedSlots : []
      };
    }
  } catch (err) {
    console.error("Error reading schedule overrides:", err);
  }
  return { unblockedDays: [], unblockedSlots: [] };
}

function saveScheduleOverrides(overrides: { unblockedDays: string[]; unblockedSlots: string[] }) {
  try {
    const dir = path.dirname(SCHEDULE_OVERRIDES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SCHEDULE_OVERRIDES_FILE, JSON.stringify(overrides, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving schedule overrides:", err);
  }
}

app.get("/api/schedule/overrides", (_req, res) => {
  return res.json(getScheduleOverrides());
});

app.post("/api/schedule/unblock-day", (req, res) => {
  const { fecha } = req.body;
  if (!fecha || typeof fecha !== "string") {
    return res.status(400).json({ error: "fecha is required" });
  }
  const current = getScheduleOverrides();
  const unblockedDays = new Set(current.unblockedDays);
  unblockedDays.add(fecha);
  const unblockedSlots = current.unblockedSlots.filter(s => !s.startsWith(`${fecha}_`));
  const updated = {
    unblockedDays: Array.from(unblockedDays),
    unblockedSlots
  };
  saveScheduleOverrides(updated);
  return res.json({ success: true, overrides: updated });
});

app.post("/api/schedule/unblock-slot", (req, res) => {
  const { fecha, hora } = req.body;
  if (!fecha || !hora) {
    return res.status(400).json({ error: "fecha and hora are required" });
  }
  const slotKey = `${fecha}_${hora}`;
  const current = getScheduleOverrides();
  const unblockedSlots = new Set(current.unblockedSlots);
  unblockedSlots.add(slotKey);
  const updated = {
    unblockedDays: current.unblockedDays,
    unblockedSlots: Array.from(unblockedSlots)
  };
  saveScheduleOverrides(updated);
  return res.json({ success: true, overrides: updated });
});

app.post("/api/schedule/block-day", (req, res) => {
  const { fecha } = req.body;
  if (!fecha) return res.status(400).json({ error: "fecha is required" });
  const current = getScheduleOverrides();
  const updated = {
    unblockedDays: current.unblockedDays.filter(d => d !== fecha),
    unblockedSlots: current.unblockedSlots.filter(s => !s.startsWith(`${fecha}_`))
  };
  saveScheduleOverrides(updated);
  return res.json({ success: true, overrides: updated });
});

app.post("/api/schedule/block-slot", (req, res) => {
  const { fecha, hora } = req.body;
  if (!fecha || !hora) return res.status(400).json({ error: "fecha and hora are required" });
  const slotKey = `${fecha}_${hora}`;
  const current = getScheduleOverrides();
  const updated = {
    unblockedDays: current.unblockedDays,
    unblockedSlots: current.unblockedSlots.filter(s => s !== slotKey)
  };
  saveScheduleOverrides(updated);
  return res.json({ success: true, overrides: updated });
});

// Persistent Server Bookings & Taken Slots Store (Bulletproof against Firebase Quota Exceeded)
const BOOKINGS_FILE = path.join(process.cwd(), "data", "bookings.json");
const TAKEN_SLOTS_FILE = path.join(process.cwd(), "data", "taken_slots.json");

interface ServerBooking {
  id: string;
  fecha: string;
  hora: string;
  tipo: string;
  servicio: string;
  nombre: string;
  telefono: string;
  direccion: string;
  estado: string;
  blockedSlots?: string[];
  modalidad?: string;
  recargoDomicilio?: number;
  precioTotal?: number;
  indicacionesDomicilio?: string;
  cumpleRequisitosDomicilio?: boolean;
  createdAt?: string;
}

interface ServerTakenSlot {
  id: string;
  fecha: string;
  hora: string;
  isBlocked: boolean;
}

function getServerBookings(): ServerBooking[] {
  try {
    if (fs.existsSync(BOOKINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(BOOKINGS_FILE, "utf-8"));
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.error("Error reading bookings file:", err);
  }
  return [];
}

function saveServerBookings(bookings: ServerBooking[]) {
  try {
    const dir = path.dirname(BOOKINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving bookings file:", err);
  }
}

function getServerTakenSlots(): ServerTakenSlot[] {
  try {
    if (fs.existsSync(TAKEN_SLOTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TAKEN_SLOTS_FILE, "utf-8"));
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.error("Error reading taken_slots file:", err);
  }
  return [];
}

function saveServerTakenSlots(slots: ServerTakenSlot[]) {
  try {
    const dir = path.dirname(TAKEN_SLOTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TAKEN_SLOTS_FILE, JSON.stringify(slots, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving taken_slots file:", err);
  }
}

app.get("/api/bookings", (_req, res) => {
  return res.json(getServerBookings());
});

app.get("/api/taken_slots", (_req, res) => {
  return res.json(getServerTakenSlots());
});

app.post("/api/bookings", (req, res) => {
  const booking: ServerBooking = req.body;
  if (!booking || !booking.id || !booking.fecha || !booking.hora) {
    return res.status(400).json({ error: "Invalid booking data: id, fecha, hora required" });
  }
  const isBlocked = Boolean(req.body.isBlocked);
  const bookings = getServerBookings();
  const existingIdx = bookings.findIndex(b => b.id === booking.id);
  if (existingIdx >= 0) {
    bookings[existingIdx] = { ...bookings[existingIdx], ...booking };
  } else {
    bookings.push({ ...booking, createdAt: booking.createdAt || new Date().toISOString() });
  }
  saveServerBookings(bookings);

  // Synchronize taken_slots
  const hoursToBlock = booking.blockedSlots && booking.blockedSlots.length > 0
    ? booking.blockedSlots
    : [booking.hora];
  
  const takenSlots = getServerTakenSlots();
  for (const h of hoursToBlock) {
    const sId = `${booking.fecha}_${h}`;
    const slotIdx = takenSlots.findIndex(s => s.id === sId);
    const newSlot: ServerTakenSlot = {
      id: sId,
      fecha: booking.fecha,
      hora: h,
      isBlocked: isBlocked || booking.nombre?.includes('BLOQUEADO') || booking.tipo === 'BLOQUEO'
    };
    if (slotIdx >= 0) {
      takenSlots[slotIdx] = newSlot;
    } else {
      takenSlots.push(newSlot);
    }
  }
  saveServerTakenSlots(takenSlots);

  return res.json({ success: true, booking });
});

app.delete("/api/bookings/:id", (req, res) => {
  const { id } = req.params;
  const bookings = getServerBookings();
  const target = bookings.find(b => b.id === id);
  const updatedBookings = bookings.filter(b => b.id !== id);
  saveServerBookings(updatedBookings);

  if (target) {
    const hoursToBlock = target.blockedSlots && target.blockedSlots.length > 0 ? target.blockedSlots : [target.hora];
    const hoursSet = new Set(hoursToBlock.map(h => `${target.fecha}_${h}`));
    const takenSlots = getServerTakenSlots();
    const updatedSlots = takenSlots.filter(s => !hoursSet.has(s.id));
    saveServerTakenSlots(updatedSlots);
  }

  return res.json({ success: true });
});

app.get("/api/taken-slots", (_req, res) => {
  return res.json(getServerTakenSlots());
});

app.post("/api/taken-slots", (req, res) => {
  const { slots } = req.body;
  if (!Array.isArray(slots)) {
    return res.status(400).json({ error: "slots array is required" });
  }
  const current = getServerTakenSlots();
  const map = new Map(current.map(s => [s.id, s]));
  for (const s of slots) {
    if (s && s.id && s.fecha && s.hora) {
      map.set(s.id, s);
    }
  }
  const updated = Array.from(map.values());
  saveServerTakenSlots(updated);
  return res.json({ success: true, count: updated.length });
});

let genAiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!genAiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY process environment variable is required.");
    }
    genAiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return genAiClient;
}

// Admin Assistant Endpoint
app.post("/api/admin/assistant", async (req, res) => {
  try {
    const { prompt, context } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "El comando de voz o texto es requerido." });
    }

    const todayStr = new Date().toISOString().split("T")[0];

    const systemInstruction = `
Eres el Asistente Inteligente oficial del Panel de Administración de "LyS Lavados", un centro de detailing y lavados automotrices en Cipolletti.
Tu rol es interpretar comandos en español del usuario para ejecutar acciones en la Caja (registro de ingresos y gastos), la Agenda (turnos y bloqueos), la consulta de totales/saldos, precios o navegación.

Fecha de hoy en Argentina: ${todayStr}.

REGLAS DE MONTO Y FORMATO:
- "40mil", "40k", "$40.000", "cuarenta mil" -> monto_ars: 40000.
- "15mil" -> 15000. "100k" -> 100000.
- "hoy" -> fecha: "${todayStr}".
- "ayer" -> calcular fecha de ayer (YYYY-MM-DD).
- "mañana" -> calcular fecha de mañana (YYYY-MM-DD).

ACCIONES DISPONIBLES:
1. "ADD_MOVEMENT":
   Para agregar un ingreso o gasto a la caja.
   payload: {
     "tipo": "Ingreso" | "Gasto",
     "concepto": string,
     "monto_ars": number,
     "categoria": "Lavado" | "Detailing" | "Insumos" | "Servicios" | "General" | "Servicios Fijos",
     "medio": "Efectivo" | "Transferencia" | "Mercado Pago" | "Tarjeta",
     "estado": "Pagado" | "Pendiente",
     "fecha": "YYYY-MM-DD",
     "cliente": string (opcional)
   }

2. "BLOCK_SLOT":
   Para bloquear una hora o día en la agenda.
   payload: {
     "fecha": "YYYY-MM-DD",
     "hora": "HH:MM" (ej: "14:00"),
     "motivo": string (ej: "Bloqueado por mantenimiento")
   }

3. "UNBLOCK_SLOT":
   Para liberar un turno bloqueado.
   payload: {
     "fecha": "YYYY-MM-DD",
     "hora": "HH:MM"
   }

4. "NAVIGATE_TAB":
   Para cambiar de vista en el panel admin.
   payload: {
     "tab": "agenda" | "caja" | "catalog" | "gallery" | "stats" | "metrics"
   }

5. "QUERY_SUMMARY":
   Para responder preguntas sobre caja, estadísticas, precios o información del taller.
   payload: {
     "text": string (Respuesta detallada y clara en español)
   }

6. "UPDATE_SERVICE_PRICE":
   Para cambiar el precio de un servicio.
   payload: {
     "serviceName": string,
     "newPrice": number
   }

FORMATO DE SALIDA RIGUROSO (JSON):
Debes responder ÚNICAMENTE con un JSON válido con esta estructura:
{
  "action": "ADD_MOVEMENT" | "BLOCK_SLOT" | "UNBLOCK_SLOT" | "NAVIGATE_TAB" | "QUERY_SUMMARY" | "UPDATE_SERVICE_PRICE" | "UNKNOWN",
  "payload": object,
  "message": string (Resumen amigable y corto de la acción realizada, máximo 15 palabras, ej: "✅ Registrado ingreso de $40.000 por Lavado Full en Caja."),
  "suggestedTab": "caja" | "agenda" | "catalog" | "stats" | "gallery"
}

Contexto actual enviado por el cliente: ${JSON.stringify(context || {})}
`;

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text || "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch (err) {
      parsed = {
        action: "UNKNOWN",
        message: "No pude interpretar la instrucción adecuadamente.",
        payload: { text: responseText }
      };
    }

    return res.json(parsed);
  } catch (error: any) {
    console.error("Error in /api/admin/assistant:", error);
    return res.status(500).json({ 
      error: error.message || "Error al procesar el comando con la IA." 
    });
  }
});

// ==========================================
// ARCA (EX AFIP) FREE DIRECT INTEGRATION
// ==========================================

// 1. Get ARCA Server status (FEDummy)
app.get("/api/arca/status", async (req, res) => {
  try {
    const isProd = req.query.production !== "false";
    const status = await ArcaService.checkStatus(isProd);
    return res.json(status);
  } catch (error: any) {
    return res.status(500).json({ online: false, error: error.message });
  }
});

// 2. Get Certificate & Key status
app.get("/api/arca/cert-info", (req, res) => {
  try {
    const info = ArcaService.getCertInfo();
    return res.json(info);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Save Certificate and/or Private Key
app.post("/api/arca/save-certs", (req, res) => {
  try {
    const { certPem, keyPem } = req.body;
    if (!certPem && !keyPem) {
      return res.status(400).json({ error: "Debe proveer al menos el certificado o la clave privada." });
    }
    ArcaService.saveCertificates(certPem || "", keyPem || "");
    const info = ArcaService.getCertInfo();
    return res.json({ success: true, info, message: "Certificados guardados con éxito en el servidor." });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. Generate fresh RSA 2048 key and CSR
app.post("/api/arca/generate-csr", (req, res) => {
  try {
    const { cuit, razonSocial } = req.body;
    const cleanCuit = String(cuit || "20411564550").replace(/\D/g, "");
    const cleanRazon = String(razonSocial || "LyS Lavados");
    const result = ArcaService.generateCsr(cleanCuit, cleanRazon);
    return res.json({
      success: true,
      cuit: cleanCuit,
      razonSocial: cleanRazon,
      csrPem: result.csrPem,
      downloadUrl: "/pedido_arca.csr",
      message: "CSR y Clave Privada generados con éxito."
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 5. Test WSAA Authentication (Token & Sign)
app.post("/api/arca/test-auth", async (req, res) => {
  try {
    const isProd = req.body.production !== false;
    const auth = await ArcaService.getAuth(isProd);
    return res.json({
      success: true,
      message: "¡Autenticación con ARCA (WSAA) exitosa! Token y Sign obtenidos.",
      auth: {
        hasToken: !!auth.token,
        hasSign: !!auth.sign
      }
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error.message || "Error al autenticar con ARCA."
    });
  }
});

// 6. Get Last Voucher
app.get("/api/arca/ultimo-comprobante", async (req, res) => {
  try {
    const cuit = String(req.query.cuit || "20411564550");
    const puntoVenta = Number(req.query.puntoVenta || 2);
    const tipoComprobante = Number(req.query.tipoComprobante || 11);
    const isProd = req.query.production !== "false";

    const lastVoucher = await ArcaService.getLastVoucher(cuit, puntoVenta, tipoComprobante, isProd);
    return res.json({
      success: true,
      puntoVenta,
      tipoComprobante,
      ultimoComprobante: lastVoucher,
      proximoComprobante: lastVoucher + 1
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error.message || "Error al consultar último comprobante en ARCA."
    });
  }
});

// 7. Emit Electronic Invoice directly with ARCA
app.post("/api/arca/emitir", async (req, res) => {
  try {
    const {
      cuit,
      puntoVenta,
      tipoComprobante,
      concepto,
      docTipo,
      docNro,
      total,
      clienteNombre,
      clienteEmail,
      clienteTelefono,
      descripcionServicio,
      production
    } = req.body;

    const result = await ArcaService.emitirFactura({
      cuit: cuit || "20411564550",
      puntoVenta: Number(puntoVenta || 2),
      tipoComprobante: Number(tipoComprobante || 11),
      concepto: Number(concepto || 2),
      docTipo: Number(docTipo || 99),
      docNro: docNro || "0",
      total: Number(total),
      clienteNombre: clienteNombre || "Consumidor Final",
      clienteEmail,
      clienteTelefono,
      descripcionServicio,
      production: production !== false
    });

    return res.json(result);
  } catch (error: any) {
    console.error("Error emitiendo factura ARCA:", error);
    return res.status(400).json({
      success: false,
      error: error.message || "Error al procesar la factura con ARCA."
    });
  }
});

// 8. Facturas Persistence Endpoints
app.get("/api/arca/facturas", (req, res) => {
  try {
    const facturas = ArcaService.getSavedFacturas();
    return res.json({ success: true, facturas });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/arca/facturas", (req, res) => {
  try {
    const factura = req.body;
    if (!factura || !factura.id) {
      return res.status(400).json({ success: false, error: "Factura requerida." });
    }
    ArcaService.saveFacturaRecord(factura);
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// 9. Sync Past Vouchers directly from AFIP / ARCA
app.post("/api/arca/sync-vouchers", async (req, res) => {
  try {
    const cuit = String(req.body.cuit || "20411564550");
    const puntoVenta = Number(req.body.puntoVenta || 2);
    const tipoComprobante = Number(req.body.tipoComprobante || 11);
    const isProd = req.body.production !== false;

    const result = await ArcaService.syncVouchersFromAfip(cuit, puntoVenta, tipoComprobante, isProd);
    return res.json({ success: true, ...result });
  } catch (e: any) {
    console.error("Error syncing vouchers from AFIP:", e);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// AI / LLMs and SEO Knowledge Endpoints
app.get("/llms.txt", (req, res) => {
  const filePath = path.join(process.cwd(), "public", "llms.txt");
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.sendFile(filePath);
});

app.get("/llms-full.txt", (req, res) => {
  const filePath = path.join(process.cwd(), "public", "llms-full.txt");
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.sendFile(filePath);
});

app.get("/robots.txt", (req, res) => {
  const filePath = path.join(process.cwd(), "public", "robots.txt");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.sendFile(filePath);
});

app.get("/sitemap.xml", (req, res) => {
  const filePath = path.join(process.cwd(), "public", "sitemap.xml");
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.sendFile(filePath);
});

// JSON Knowledge base for AI Search / Agents
app.get("/api/knowledge", (req, res) => {
  res.json({
    business_name: "LyS Lavados • Estética Vehicular de Autor",
    tagline: "Detailing artesanal y cuidado meticuloso en Cipolletti",
    address: {
      street: "Venezuela 1659",
      city: "Cipolletti",
      province: "Río Negro",
      country: "Argentina",
      postal_code: "8324",
      at_home_service: false,
      note: "No realizamos servicios a domicilio; todos los trabajos se realizan en taller particular equipado en Venezuela 1659."
    },
    booking_url: "https://lyslavados.com/turnoexpress",
    website: "https://lyslavados.com",
    social: {
      instagram: "https://instagram.com/lys.lavados",
      facebook: "https://facebook.com/lys.lavados"
    },
    payment_methods: ["Efectivo", "Transferencia Bancaria", "Mercado Pago"],
    services: [
      {
        id: "lavado_exterior",
        name: "Lavado Exterior",
        description: "Lavado artesanal con espuma pH neutro, llantas, pasaruedas, secado técnico sin rayas y sellador hidrofóbico.",
        duration_minutes: 90,
        prices_ars: { auto: 15000, suv: 20000, pickup: 30000 }
      },
      {
        id: "detallado_interior",
        name: "Detallado Interior",
        description: "Aspirado profundo, pincelado de ventilaciones y consola, protector UV sin siliconas grasosas.",
        duration_minutes: 90,
        prices_ars: { auto: 20000, suv: 25000, pickup: 30000 }
      },
      {
        id: "limpieza_techo",
        name: "Limpieza de Techo",
        description: "Remoción de manchas con espuma seca cuidando el adhesivo original.",
        duration_minutes: 60,
        prices_ars: { auto: 10000, suv: 12000, pickup: 15000 }
      },
      {
        id: "tapizados_tela",
        name: "Limpieza de Tapizados de Tela",
        description: "Inyección y extracción profunda de manchas, suciedad y desinfección total de butacas.",
        duration_minutes: 90,
        prices_ars: { auto: 40000, suv: 45000, pickup: 50000 }
      },
      {
        id: "tapizados_cuero",
        name: "Tratamiento de Cuero",
        description: "Limpieza suave y nutrición humectante contra grietas y resequedad.",
        duration_minutes: 60,
        prices_ars: { auto: 15000, suv: 18000, pickup: 20000 }
      }
    ],
    packs: [
      { id: "full", name: "Pack Full", includes: ["Lavado Exterior", "Detallado Interior"] },
      { id: "interior_tela", name: "Pack Interior Tela", includes: ["Detallado Interior", "Limpieza de Techo", "Tapizados de Tela"] },
      { id: "interior_cuero", name: "Pack Interior Cuero", includes: ["Detallado Interior", "Limpieza de Techo", "Tratamiento de Cuero"] }
    ]
  });
});

// Vite middleware for dev / static for prod
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

setupServer();
