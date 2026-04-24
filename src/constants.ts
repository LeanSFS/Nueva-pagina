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
    description: 'Limpieza profunda de ruedas, llantas y pasaruedas, más lavado completo de carrocería. Se aplica cera rápida para brillo y protección ligera.',
    features: [
      'Llantas y Pasaruedas',
      'Lavado Carrocería',
      'Cera Rápida Brillo',
      'Revividor Cubiertas',
      'Secado Técnico'
    ]
  },
  {
    id: 'Interior',
    name: 'Detallado Interior',
    label: 'Limpieza de Cabina',
    description: 'Aspirado profundo y detallado de plásticos, vidrios, rejillas y juntas para llegar a cada rincón. Protección con filtro UV sin brillo aceitoso.',
    features: [
      'Aspirado Profundo',
      'Plásticos e Intersticios',
      'Rejillas y Juntas',
      'Filtro UV Natural',
      'Vidrios sin Vetas'
    ]
  },
  {
    id: 'Full',
    name: 'Lavado Full',
    label: 'Recomendado',
    isFeatured: true,
    description: 'Limpieza completa. Interior detallado de plásticos y juntas + Exterior profundo con protección UV y cera de brillo. Sin terminaciones aceitosas.',
    features: [
      'Interior Detallado',
      'Exterior Profundo',
      'Protector UV Plásticos',
      'Cera de Alto Brillo',
      'Acabado Original (Mate)'
    ]
  }
];

export const VEHICLES = [
  { id: 'auto', name: 'Auto Chico/Mediano', icon: '🚗', examples: 'Clio, Gol, 208, Cronos, Corolla' },
  { id: 'suv', name: 'SUV / Utilitario', icon: '🚙', examples: 'Duster, Tracker, Strada, Kangoo' },
  { id: 'pickup', name: 'Pickup / Grande', icon: '🛻', examples: 'Hilux, Amarok, Ranger, Toro' }
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
