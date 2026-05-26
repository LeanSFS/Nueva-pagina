/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Service } from './types.ts';

export const SERVICES: Service[] = [
  {
    id: 'Exterior',
    name: 'Lavado Exterior',
    label: 'Cuidado Superficial',
    description: 'Limpieza profunda de ruedas, llantas y pasaruedas. Lavado de contacto con PH neutro Koch Chemie Gentle Snow Foam, aplicación de sellador hidrofóbico Koch Chemie Protector Wax (efecto de repelencia al agua) y acondicionado con PSS Plast Star sin siliconas.',
    features: [
      'Llantas y Pasaruedas',
      'Gentle Snow Foam neutro',
      'Protector Wax (Efecto Lotus)',
      'Acondicionador PSS Plast Star',
      'Secado Técnico Microfibra'
    ]
  },
  {
    id: 'Interior',
    name: 'Detallado Interior',
    label: 'Limpieza de Cabina',
    description: 'Aspirado profundo, detallado de plásticos de consola, puertas, rejillas y grietas. Acondicionado premium con Koch Chemie Top Star: protección UV, acabado 100% mate natural original y efecto antiestático permanente que repele el polvo de las superficies.',
    features: [
      'Aspirado de Cabina',
      'Plásticos e Intersticios',
      'Acondicionador Top Star UV',
      'Acabado Mate Antiestático',
      'Vidrios sin Vetas'
    ]
  },
  {
    id: 'Full',
    name: 'Lavado Full',
    label: 'Recomendado',
    isFeatured: true,
    description: 'La máxima protección y limpieza. Combina el Detallado Interior con Koch Chemie Top Star y el Lavado Exterior Profundo que incluye sellador hidrofóbico Koch Chemie Protector Wax con hasta 3 meses de protección y acondicionador de plásticos externos PSS Plast Star.',
    features: [
      'Interior Detallado Top Star',
      'Exterior Profundo Protector Wax',
      'Protector UV Plásticos',
      'Sellado Hidrofóbico (3 meses)',
      'Acondicionado PSS Plast Star',
      'Acabado Original Mate'
    ]
  }
];

export const VEHICLES = [
  { id: 'auto', name: 'Auto Chico/Mediano', icon: '🚗', examples: 'Clio, Gol, 208, Cronos, Corolla, Cruze, Golf, Etios, Sandero, Focus, Fiesta, Ka, Mobi, Argo, Polo, Virtus, Vento, Bora' },
  { id: 'suv', name: 'SUV / Camioneta Chica', icon: '🚙', examples: 'Duster, Tracker, Strada, Saveiro, Compass, Kuga, Tucson, Creta, Cross, Renegade, HR-V, T-Cross, Nivus, Pulse, Territory' },
  { id: 'pickup', name: 'Pickup / Grande', icon: '🛻', examples: 'Hilux, Amarok, Ranger, Toro, S10, Frontier, Ram, SW4, Trailblazer, F-150, Alaska, Oroch' }
];

export const BASE_PRICES: Record<string, number> = {
  Exterior: 15000,
  Interior: 20000,
  Full: 35000
};

export const TYPE_EXTRA: Record<string, number> = {
  auto: 0,
  suv: 5000,
  pickup: 15000
};
