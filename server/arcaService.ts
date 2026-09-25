import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { XMLParser } from 'fast-xml-parser';
import QRCode from 'qrcode';

const CERTS_DIR = path.join(process.cwd(), 'certs');
const CERT_FILE = path.join(CERTS_DIR, 'arca.crt');
const KEY_FILE = path.join(CERTS_DIR, 'arca.key');

if (!fs.existsSync(CERTS_DIR)) {
  fs.mkdirSync(CERTS_DIR, { recursive: true });
}

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: true
});

export interface ArcaCertInfo {
  hasCert: boolean;
  hasKey: boolean;
  cuit: string;
  subject: string;
  validUntil: string;
  validFrom: string;
  isExpired: boolean;
  environment: 'production' | 'homologacion';
}

export interface ArcaStatus {
  online: boolean;
  appServer: string;
  dbServer: string;
  authServer: string;
  environment: string;
  url: string;
  error?: string;
}

export interface EmitirFacturaParams {
  cuit: string;
  puntoVenta: number;
  tipoComprobante: number; // 11 = Factura C, 6 = Factura B, 1 = Factura A
  concepto: number; // 1 = Productos, 2 = Servicios, 3 = Productos y Servicios
  docTipo: number; // 99 = Consumidor Final / Sin Doc, 96 = DNI, 80 = CUIT
  docNro: string | number;
  total: number;
  clienteNombre: string;
  clienteEmail?: string;
  clienteTelefono?: string;
  descripcionServicio?: string;
  production?: boolean;
}

export interface EmitirFacturaResult {
  success: boolean;
  cae?: string;
  caeVto?: string;
  cbteNro?: number;
  puntoVenta?: number;
  tipoComprobante?: number;
  tipoComprobanteNombre?: string;
  fechaEmision?: string;
  total?: number;
  clienteNombre?: string;
  clienteDocTipo?: string;
  clienteDocNro?: string;
  qrUrl?: string;
  qrBase64?: string;
  resultado?: string;
  observaciones?: string[];
  error?: string;
}

function formatDateWsaa(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const offset = -3; // Argentina UTC-3
  const d = new Date(date.getTime() + (date.getTimezoneOffset() + offset * 60) * 60000);
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${YYYY}-${MM}-${DD}T${hh}:${mm}:${ss}-03:00`;
}

function formatDateAfip(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const YYYY = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const DD = pad(date.getDate());
  return `${YYYY}${MM}${DD}`;
}

export class ArcaService {
  private static tokenCache: {
    [env: string]: {
      token: string;
      sign: string;
      expirationTime: Date;
    };
  } = {};

  static getWsfeUrl(production: boolean): string {
    return production
      ? 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
      : 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx';
  }

  static getWsaaUrl(production: boolean): string {
    return production
      ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
      : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms';
  }

  /**
   * Reads certificate and key metadata
   */
  static getCertInfo(): ArcaCertInfo {
    const hasCert = fs.existsSync(CERT_FILE);
    const hasKey = fs.existsSync(KEY_FILE);

    if (!hasCert) {
      return {
        hasCert: false,
        hasKey,
        cuit: '',
        subject: '',
        validUntil: '',
        validFrom: '',
        isExpired: false,
        environment: 'production'
      };
    }

    try {
      const output = execSync(`openssl x509 -in "${CERT_FILE}" -noout -subject -dates`, {
        encoding: 'utf8'
      });

      const subjectMatch = output.match(/subject=(.+)/);
      const notBeforeMatch = output.match(/notBefore=(.+)/);
      const notAfterMatch = output.match(/notAfter=(.+)/);

      const subject = subjectMatch ? subjectMatch[1].trim() : '';
      const validFrom = notBeforeMatch ? notBeforeMatch[1].trim() : '';
      const validUntil = notAfterMatch ? notAfterMatch[1].trim() : '';

      // Extract CUIT if present in subject (e.g. CUIT 20411564550)
      const cuitMatch = subject.match(/CUIT\s*(\d{11})/i) || subject.match(/(\d{11})/);
      const cuit = cuitMatch ? cuitMatch[1] : '';

      const isExpired = validUntil ? new Date(validUntil).getTime() < Date.now() : false;

      return {
        hasCert: true,
        hasKey,
        cuit,
        subject,
        validUntil,
        validFrom,
        isExpired,
        environment: 'production'
      };
    } catch (e: any) {
      console.warn('Error reading certificate info:', e.message);
      return {
        hasCert: true,
        hasKey,
        cuit: '',
        subject: 'Certificado instalado (error al parsear openssl)',
        validUntil: '',
        validFrom: '',
        isExpired: false,
        environment: 'production'
      };
    }
  }

  /**
   * Save Certificate and Private Key PEM strings
   */
  static saveCertificates(certPem: string, keyPem: string) {
    if (!fs.existsSync(CERTS_DIR)) {
      fs.mkdirSync(CERTS_DIR, { recursive: true });
    }

    if (certPem) {
      fs.writeFileSync(CERT_FILE, certPem.trim() + '\n', 'utf8');
    }
    if (keyPem) {
      fs.writeFileSync(KEY_FILE, keyPem.trim() + '\n', 'utf8');
    }

    // Invalidate cached tokens
    this.tokenCache = {};
    const tokenPath = path.join(CERTS_DIR, 'arca_token.json');
    if (fs.existsSync(tokenPath)) {
      try { fs.unlinkSync(tokenPath); } catch {}
    }
  }

  /**
   * Generate RSA 2048 private key and CSR for ARCA in 1 click
   */
  static generateCsr(cuit: string, razonSocial: string): { keyPem: string; csrPem: string } {
    if (!fs.existsSync(CERTS_DIR)) {
      fs.mkdirSync(CERTS_DIR, { recursive: true });
    }

    const cleanCuit = cuit.replace(/\D/g, '') || '20411564550';
    const aliasName = 'LyS';
    const csrFile = path.join(CERTS_DIR, `pedido_arca_${cleanCuit}.csr`);

    // 1. Generate private key
    execSync(`openssl genrsa -out "${KEY_FILE}" 2048`);

    // 2. Generate Certificate Signing Request (CSR) with exact AFIP format (CN=LyS)
    const subj = `/C=AR/O=${aliasName}/CN=${aliasName}/serialNumber=CUIT ${cleanCuit}`;
    execSync(`openssl req -new -key "${KEY_FILE}" -subj "${subj}" -out "${csrFile}"`);

    const keyPem = fs.readFileSync(KEY_FILE, 'utf8');
    const csrPem = fs.readFileSync(csrFile, 'utf8');

    // Also copy to public/pedido_arca.csr so it can be directly downloaded
    const publicCsr = path.join(process.cwd(), 'public', 'pedido_arca.csr');
    fs.writeFileSync(publicCsr, csrPem, 'utf8');

    return { keyPem, csrPem };
  }

  /**
   * Check ARCA Server Status via FEDummy
   */
  static async checkStatus(production: boolean = true): Promise<ArcaStatus> {
    const url = this.getWsfeUrl(production);
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FEDummy xmlns="http://ar.gov.afip.dif.FEV1/" />
  </soap:Body>
</soap:Envelope>`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FEDummy'
        },
        body: soapBody
      });

      const xmlText = await res.text();
      const parsed = parser.parse(xmlText);
      const dummyResult = parsed?.Envelope?.Body?.FEDummyResponse?.FEDummyResult;

      return {
        online: res.ok && dummyResult?.AppServer === 'OK',
        appServer: dummyResult?.AppServer || 'Desconocido',
        dbServer: dummyResult?.DbServer || 'Desconocido',
        authServer: dummyResult?.AuthServer || 'Desconocido',
        environment: production ? 'Producción (ARCA Oficial)' : 'Homologación (Pruebas)',
        url
      };
    } catch (e: any) {
      return {
        online: false,
        appServer: 'Error',
        dbServer: 'Error',
        authServer: 'Error',
        environment: production ? 'Producción' : 'Homologación',
        url,
        error: e.message || 'No se pudo conectar a los servidores de ARCA'
      };
    }
  }

  /**
   * Authenticate with WSAA (Ticket de Acceso: Token + Sign)
   */
  static async getAuth(production: boolean = true): Promise<{ token: string; sign: string }> {
    const envKey = production ? 'prod' : 'homo';
    const cached = this.tokenCache[envKey];

    // Check memory cache (keep 15min margin)
    if (cached && cached.expirationTime.getTime() - Date.now() > 15 * 60 * 1000) {
      return { token: cached.token, sign: cached.sign };
    }

    // Check disk cache
    const diskCachePath = path.join(CERTS_DIR, `arca_token_${envKey}.json`);
    if (fs.existsSync(diskCachePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(diskCachePath, 'utf8'));
        const expDate = new Date(data.expirationTime);
        if (expDate.getTime() - Date.now() > 15 * 60 * 1000) {
          this.tokenCache[envKey] = {
            token: data.token,
            sign: data.sign,
            expirationTime: expDate
          };
          return { token: data.token, sign: data.sign };
        }
      } catch {}
    }

    // Ensure cert and key exist
    if (!fs.existsSync(CERT_FILE) || !fs.existsSync(KEY_FILE)) {
      throw new Error('Certificado o Clave Privada de ARCA no instalados en el servidor. Cárgalos desde el panel de Facturación.');
    }

    // 1. Build TRA (Ticket Request Access) XML
    const now = new Date();
    const genTime = formatDateWsaa(new Date(now.getTime() - 10 * 60 * 1000));
    const expTime = formatDateWsaa(new Date(now.getTime() + 10 * 60 * 1000));
    const uniqueId = Math.floor(Date.now() / 1000);

    const traXml = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${genTime}</generationTime>
    <expirationTime>${expTime}</expirationTime>
  </header>
  <service>wsfe</service>
</loginTicketRequest>`;

    const tmpXml = path.join(CERTS_DIR, `tra_${uniqueId}.xml`);
    const tmpCms = path.join(CERTS_DIR, `tra_${uniqueId}.cms`);

    fs.writeFileSync(tmpXml, traXml, 'utf8');

    let cmsBase64 = '';
    try {
      // 2. Sign XML using OpenSSL CMS PKCS#7
      try {
        execSync(`openssl cms -sign -in "${tmpXml}" -signer "${CERT_FILE}" -inkey "${KEY_FILE}" -nodetach -outform DER -out "${tmpCms}"`, {
          stdio: 'pipe'
        });
      } catch (signErr: any) {
        const errText = signErr?.stderr?.toString() || signErr?.message || '';
        if (errText.includes('key values mismatch') || errText.includes('private key does not match certificate')) {
          throw new Error('El Certificado (.crt) subido no coincide con la Clave Privada actual. Para solucionarlo: 1) Descarga el archivo "pedido_arca.csr" de la web, 2) Súbelo en ARCA ("Administración de Certificados Digitales") para que te otorgue el .crt correspondiente, 3) Sube ese nuevo .crt aquí.');
        }
        throw new Error(`Error firmando solicitud para ARCA: ${errText || signErr.message}`);
      }

      const cmsDer = fs.readFileSync(tmpCms);
      cmsBase64 = cmsDer.toString('base64');
    } finally {
      try { fs.unlinkSync(tmpXml); } catch {}
      try { fs.unlinkSync(tmpCms); } catch {}
    }

    // 3. Call WSAA SOAP endpoint
    const wsaaUrl = this.getWsaaUrl(production);
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cmsBase64}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

    const wsaaRes = await fetch(wsaaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': ''
      },
      body: soapEnvelope
    });

    const wsaaText = await wsaaRes.text();

    if (!wsaaRes.ok || wsaaText.includes('faultstring')) {
      const faultParsed = parser.parse(wsaaText);
      const faultStr = faultParsed?.Envelope?.Body?.Fault?.faultstring || wsaaText;
      throw new Error(`Error de autenticación ARCA (WSAA): ${faultStr}`);
    }

    // Parse WSAA response containing loginTicketResponse
    const parsedEnvelope = parser.parse(wsaaText);
    const loginCmsReturn = parsedEnvelope?.Envelope?.Body?.loginCmsResponse?.loginCmsReturn;

    if (!loginCmsReturn) {
      throw new Error('Respuesta inválida de WSAA ARCA.');
    }

    const parsedTicket = parser.parse(loginCmsReturn);
    const token = parsedTicket?.loginTicketResponse?.credentials?.token;
    const sign = parsedTicket?.loginTicketResponse?.credentials?.sign;
    const expirationStr = parsedTicket?.loginTicketResponse?.header?.expirationTime;

    if (!token || !sign) {
      throw new Error('No se pudo extraer Token y Sign de la respuesta de ARCA.');
    }

    const expirationTime = expirationStr ? new Date(expirationStr) : new Date(Date.now() + 11 * 3600 * 1000);

    // Save to memory cache & disk
    this.tokenCache[envKey] = { token, sign, expirationTime };
    try {
      fs.writeFileSync(diskCachePath, JSON.stringify({ token, sign, expirationTime }), 'utf8');
    } catch {}

    return { token, sign };
  }

  /**
   * Get Last Authorized Invoice Number (FECompUltimoAutorizado)
   */
  static async getLastVoucher(
    cuit: string,
    puntoVenta: number = 2,
    tipoComprobante: number = 11, // 11 = Factura C
    production: boolean = true
  ): Promise<number> {
    const cleanCuit = cuit.replace(/\D/g, '');
    const { token, sign } = await this.getAuth(production);
    const wsfeUrl = this.getWsfeUrl(production);

    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FECompUltimoAutorizado xmlns="http://ar.gov.afip.dif.FEV1/">
      <Auth>
        <Token>${token}</Token>
        <Sign>${sign}</Sign>
        <Cuit>${cleanCuit}</Cuit>
      </Auth>
      <PtoVta>${puntoVenta}</PtoVta>
      <CbteTipo>${tipoComprobante}</CbteTipo>
    </FECompUltimoAutorizado>
  </soap:Body>
</soap:Envelope>`;

    const res = await fetch(wsfeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado'
      },
      body: soapBody
    });

    const text = await res.text();
    const parsed = parser.parse(text);
    const result = parsed?.Envelope?.Body?.FECompUltimoAutorizadoResponse?.FECompUltimoAutorizadoResult;

    if (result?.Errors) {
      const err = result.Errors?.Err;
      const errMsg = Array.isArray(err) ? err.map((e: any) => e.Msg).join('. ') : (err?.Msg || 'Error al consultar comprobante');
      throw new Error(errMsg);
    }

    return Number(result?.CbteNro) || 0;
  }

  /**
   * Emit Electronic Invoice (FECAESolicitar)
   */
  static async emitirFactura(params: EmitirFacturaParams): Promise<EmitirFacturaResult> {
    const production = params.production !== false;
    const cleanCuit = String(params.cuit).replace(/\D/g, '');
    const puntoVenta = Number(params.puntoVenta) || 2;
    const tipoComprobante = Number(params.tipoComprobante) || 11; // 11 = Factura C
    const concepto = Number(params.concepto) || 2; // 2 = Servicios
    const docTipo = Number(params.docTipo) || 99; // 99 = Consumidor Final
    const rawDocNro = String(params.docNro || '0').replace(/\D/g, '');
    const docNro = (docTipo === 99 || !rawDocNro) ? 0 : Number(rawDocNro);
    const total = Number(params.total);

    if (total <= 0) {
      throw new Error('El monto total a facturar debe ser mayor a cero.');
    }

    // 1. Get Auth Token & Sign
    const { token, sign } = await this.getAuth(production);

    // 2. Query last voucher to calculate next voucher number
    const lastCbte = await this.getLastVoucher(cleanCuit, puntoVenta, tipoComprobante, production);
    const nextCbte = lastCbte + 1;

    // 3. Format dates (YYYYMMDD)
    const today = new Date();
    const todayStr = formatDateAfip(today);

    // For services (concepto = 2 or 3), ARCA requires FchServDesde, FchServHasta, FchVtoPago
    const isServicio = concepto === 2 || concepto === 3;
    const fchServDesde = isServicio ? todayStr : '';
    const fchServHasta = isServicio ? todayStr : '';
    const fchVtoPago = isServicio ? todayStr : '';

    // Factura C (Monotributo) has 0 IVA
    const isFacturaC = tipoComprobante === 11;
    const impNeto = total;
    const impIVA = 0;

    // 4. Build FECAESolicitar SOAP XML
    const wsfeUrl = this.getWsfeUrl(production);
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FECAESolicitar xmlns="http://ar.gov.afip.dif.FEV1/">
      <Auth>
        <Token>${token}</Token>
        <Sign>${sign}</Sign>
        <Cuit>${cleanCuit}</Cuit>
      </Auth>
      <FeCAEReq>
        <FeCabReq>
          <CantReg>1</CantReg>
          <PtoVta>${puntoVenta}</PtoVta>
          <CbteTipo>${tipoComprobante}</CbteTipo>
        </FeCabReq>
        <FeDetReq>
          <FECAEDetRequest>
            <Concepto>${concepto}</Concepto>
            <DocTipo>${docTipo}</DocTipo>
            <DocNro>${docNro}</DocNro>
            <CbteDesde>${nextCbte}</CbteDesde>
            <CbteHasta>${nextCbte}</CbteHasta>
            <CbteFch>${todayStr}</CbteFch>
            <ImpTotal>${total.toFixed(2)}</ImpTotal>
            <ImpTotConc>0.00</ImpTotConc>
            <ImpNeto>${impNeto.toFixed(2)}</ImpNeto>
            <ImpOpEx>0.00</ImpOpEx>
            <ImpTrib>0.00</ImpTrib>
            <ImpIVA>${impIVA.toFixed(2)}</ImpIVA>
            ${isServicio ? `<FchServDesde>${fchServDesde}</FchServDesde>
            <FchServHasta>${fchServHasta}</FchServHasta>
            <FchVtoPago>${fchVtoPago}</FchVtoPago>` : ''}
            <MonId>PES</MonId>
            <MonCotiz>1</MonCotiz>
          </FECAEDetRequest>
        </FeDetReq>
      </FeCAEReq>
    </FECAESolicitar>
  </soap:Body>
</soap:Envelope>`;

    const res = await fetch(wsfeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECAESolicitar'
      },
      body: soapBody
    });

    const text = await res.text();
    const parsed = parser.parse(text);
    const caeResult = parsed?.Envelope?.Body?.FECAESolicitarResponse?.FECAESolicitarResult;

    if (!caeResult) {
      throw new Error('No se recibió respuesta válida del Web Service de ARCA.');
    }

    if (caeResult.Errors) {
      const err = caeResult.Errors?.Err;
      const errMsg = Array.isArray(err) ? err.map((e: any) => e.Msg).join('. ') : (err?.Msg || 'Error al solicitar CAE');
      throw new Error(errMsg);
    }

    const detResp = caeResult?.FeDetResp?.FECAEDetResponse;
    const resultado = detResp?.Resultado || caeResult?.FeCabResp?.Resultado;

    if (resultado === 'R') {
      const obs = detResp?.Observaciones?.Obs;
      const obsMsg = Array.isArray(obs) ? obs.map((o: any) => o.Msg).join('. ') : (obs?.Msg || 'Comprobante rechazado por ARCA');
      throw new Error(`Rechazado por ARCA: ${obsMsg}`);
    }

    const cae = String(detResp?.CAE || '');
    const caeVto = String(detResp?.CAEFchVto || '');

    if (!cae) {
      throw new Error('ARCA aprobó pero no devolvió el CAE.');
    }

    // 5. Generate Official ARCA QR Code
    // URL format: https://www.afip.gob.ar/fe/qr/?p=BASE64_JSON
    const qrData = {
      ver: 1,
      fecha: `${todayStr.substring(0, 4)}-${todayStr.substring(4, 6)}-${todayStr.substring(6, 8)}`,
      cuit: Number(cleanCuit),
      ptoVta: puntoVenta,
      tipoCmp: tipoComprobante,
      nroCmp: nextCbte,
      importe: total,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: docTipo,
      nroDocRec: docNro,
      tipoCodAut: 'E',
      codAut: Number(cae)
    };

    const qrJsonBase64 = Buffer.from(JSON.stringify(qrData)).toString('base64');
    const qrUrl = `https://www.afip.gob.ar/fe/qr/?p=${qrJsonBase64}`;

    let qrBase64 = '';
    try {
      qrBase64 = await QRCode.toDataURL(qrUrl, {
        margin: 1,
        width: 250,
        color: { dark: '#000000', light: '#ffffff' }
      });
    } catch {}

    const tipoNombre = tipoComprobante === 11 ? 'FACTURA C' : tipoComprobante === 6 ? 'FACTURA B' : 'FACTURA A';

    return {
      success: true,
      cae,
      caeVto,
      cbteNro: nextCbte,
      puntoVenta,
      tipoComprobante,
      tipoComprobanteNombre: tipoNombre,
      fechaEmision: `${todayStr.substring(6, 8)}/${todayStr.substring(4, 6)}/${todayStr.substring(0, 4)}`,
      total,
      clienteNombre: params.clienteNombre || 'Consumidor Final',
      clienteDocTipo: docTipo === 96 ? 'DNI' : docTipo === 80 ? 'CUIT' : 'Consumidor Final',
      clienteDocNro: String(docNro),
      qrUrl,
      qrBase64,
      resultado: 'Aprobado'
    };
  }
}
