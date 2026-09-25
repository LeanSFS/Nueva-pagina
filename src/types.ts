/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type VehicleType = 'auto' | 'suv' | 'pickup';

export type ServiceKey = string;

export interface Service {
  id: ServiceKey;
  name: string;
  label: string;
  description: string;
  features: string[];
  isFeatured?: boolean;
  basePrice?: number;
  prices?: {
    auto: number;
    suv: number;
    pickup: number;
  };
  duration?: number; // duration in minutes
  isHidden?: boolean;
}

export interface PricingTier {
  [key: string]: number;
}

export interface PricingMap {
  auto: PricingTier;
  suv: PricingTier;
  pickup: PricingTier;
}

export interface ArcaConfig {
  cuit: string;
  razonSocial: string;
  puntoVenta: number;
  tipoComprobanteDefault: number; // 11 = Factura C, 6 = Factura B, 1 = Factura A
  conceptoDefault: number; // 2 = Servicios
  domicilioComercial: string;
  inicioActividades: string;
  condicionIva: string; // 'Responsable Monotributo'
  production: boolean;
}

export interface ArcaFacturaRecord {
  id: string;
  cae: string;
  caeVto: string;
  cbteNro: number;
  puntoVenta: number;
  tipoComprobante: number;
  tipoComprobanteNombre: string;
  fechaEmision: string; // DD/MM/YYYY
  fechaIso: string; // YYYY-MM-DD
  total: number;
  clienteNombre: string;
  clienteDocTipo: string;
  clienteDocNro: string;
  clienteTelefono?: string;
  conceptoDescripcion: string;
  qrUrl?: string;
  qrBase64?: string;
  createdAt: string;
  bookingId?: string;
  movementId?: string;
}

