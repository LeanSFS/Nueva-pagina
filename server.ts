import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini client lazily
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
