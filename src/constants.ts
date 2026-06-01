/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Service } from './types.ts';

export const SERVICES: Service[] = [
  {
    id: 'Exterior',
    name: 'Lavado Exterior',
    label: 'Opción 1 • Brillo Básico',
    description: 'Limpieza profunda de carrocería, ruedas, llantas y pasaruedas. Lavado manual de contacto con PH neutro Koch Chemie Gentle Snow Foam, secado técnico libre de rayas y acondicionado de cubiertas con PSS Plast Star sin siliconas.',
    features: [
      'Llantas y Pasaruedas',
      'Gentle Snow Foam neutro',
      'Acondicionador PSS de Cubiertas',
      'Secado Técnico Seguro'
    ]
  },
  {
    id: 'Interior',
    name: 'Detallado Interior',
    label: 'Opción 2 • Cabina Premium',
    description: 'Aspirado profundo completo, detallado de plásticos de consola, paneles de puertas, rejillas de ventilación y grietas. Acondicionado de plásticos internos con Koch Chemie Top Star (protección UV y efecto antiestático).',
    features: [
      'Aspirado Detallado',
      'Limpieza de Consola y Paneles',
      'Koch Chemie Top Star UV',
      'Repelente de Polvo',
      'Vidrios sin Vetas'
    ]
  },
  {
    id: 'Full',
    name: 'Lavado Full',
    label: 'Opción 3 • Máxima Protección',
    isFeatured: true,
    description: 'El tratamiento definitivo que combina el Detallado de Cabina premium (con Top Star) con un Lavado de Carrocería de la más alta gama. Incluye la aplicación del sellador hidrofóbico Koch Chemie Protector Wax que brinda protección de hasta 3 meses, brillo extremo "efecto lotus" de autolimpieza y acondicionado exterior PSS Plast Star.',
    features: [
      'Detallado Interior Premium',
      'Lavado de Carrocería Completo',
      'Sellador Hydro Protector Wax',
      'Efecto Lotus Autolimpiante',
      'Protección de Pintura (3 Meses)',
      'Acondicionador PSS Plast Star',
      'Vidrios Internos y Externos'
    ]
  }
];

export const VEHICLES = [
  { id: 'auto', name: 'Auto Chico/Mediano', icon: '🚗', examples: 'Clio, Gol, 208, Cronos, Corolla, Cruze, Golf, Etios, Sandero, Focus, Fiesta, Ka, Mobi, Argo, Polo, Virtus, Vento, Bora' },
  { id: 'suv', name: 'SUV / Camioneta Chica', icon: '🚙', examples: 'Duster, Tracker, Strada, Saveiro, Compass, Kuga, Tucson, Creta, Cross, Renegade, HR-V, T-Cross, Nivus, Pulse, Territory' },
  { id: 'pickup', name: 'Pickup / Grande', icon: '🛻', examples: 'Hilux, Amarok, Ranger, Toro, S10, Frontier, Ram, SW4, Trailblazer, F-150, Alaska, Oroch' }
];

export const BASE_PRICES: Record<string, number> = {
  Exterior: 20000,
  Interior: 25000,
  Full: 40000
};

export const TYPE_EXTRA: Record<string, number> = {
  auto: 0,
  suv: 5000,
  pickup: 15000
};
