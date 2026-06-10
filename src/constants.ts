/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Service } from './types.ts';

export const SERVICES: Service[] = [
  {
    id: 'lavado_exterior',
    name: 'Lavado Exterior',
    label: 'Carrocería de Precisión • Brillo',
    description: 'Limpieza meticulosa de carrocería, ruedas, llantas y pasaruedas. Lavado manual con espuma activa de pH neutro, secado por soplado libre de rayas y sellado spray hidrofóbico con brillo prolongado.',
    features: [
      'Llantas y Pasaruedas',
      'Gentle Snow Foam neutro',
      'Secado Técnico sin Rayas',
      'Cera rápida protectora'
    ],
    basePrice: 15000,
    prices: {
      auto: 15000,
      suv: 20000,
      pickup: 30000
    },
    duration: 60
  },
  {
    id: 'detallado_interior',
    name: 'Detallado Interior',
    label: 'Habitáculo Libre de Polvo • Antibacterial',
    description: 'Aspirado profundo de butacas, alfombras y baúl. Detallado artesanal de consola, rejillas de ventilación, plásticos y acondicionador con protección UV y acabado mate original.',
    features: [
      'Aspirado Ultra-Detallado',
      'Limpieza de Consola y Grietas',
      'Protector UV de plásticos',
      'Acondicionador sin silicona',
      'Vidrios sin marcas'
    ],
    basePrice: 20000,
    prices: {
      auto: 20000,
      suv: 25000,
      pickup: 30000
    },
    duration: 60
  },
  {
    id: 'limpieza_techo',
    name: 'Limpieza de Techo',
    label: 'Tratamiento Artesanal • Sin Hundimiento',
    description: 'Remoción cuidadosa de manchas de suciedad, hollín e impurezas del revestimiento de techo. Limpieza manual controlada mediante espumas secas para resguardar el adhesivo y evitar desprendimientos.',
    features: [
      'Tratamiento de manchas',
      'Espuma seca controlada',
      'Remoción de hollín',
      'Cuidado del pegamento'
    ],
    basePrice: 10000,
    prices: {
      auto: 10000,
      suv: 12000,
      pickup: 15000
    },
    duration: 60
  },
  {
    id: 'tapizados_tela',
    name: 'Tapizados de Tela',
    label: 'Extracción Profunda • Lavado Químico',
    description: 'Inyección y extracción de alto poder en butacas de tela. Desinfecta fibras, remueve manchas profundas del uso, halos de agua, derrames de líquidos y neutraliza olores de raíz.',
    features: [
      'Inyección y Extracción',
      'Eliminación de manchas',
      'Desinfección de ácaros',
      'Neutralizador de olores'
    ],
    basePrice: 40000,
    prices: {
      auto: 40000,
      suv: 45000,
      pickup: 50000
    },
    duration: 120
  },
  {
    id: 'tapizados_cuero',
    name: 'Tapizados de Cuero',
    label: 'Nutrición Humectante • Protección Mate',
    description: 'Lavado suave con cepillo de cerdas naturales para remover oleosidad del roce. Nutrición intensiva con cremas humectantes orgánicas para evitar grietas, resequedad y rigidez.',
    features: [
      'Limpieza suave de poros',
      'Crema humectante premium',
      'Prevención de grietas',
      'Terminación mate original'
    ],
    basePrice: 15000,
    prices: {
      auto: 15000,
      suv: 18000,
      pickup: 20000
    },
    duration: 60
  },
  {
    id: 'tratamiento_vidrios',
    name: 'Tratamiento de Vidrios',
    label: 'Descontaminación • Hidrofóbico y Antiempaño',
    description: 'Pulido leve para remover marcas de lluvia ácida y sarro. Aplicación de sellador repelente de agua por fuera (mejora visibilidad bajo la lluvia) y revestimiento antiempañante por dentro.',
    features: [
      'Repelente de agua externo',
      'Antiempañante interno',
      'Elimina sarro y lluvia ácida',
      'Visibilidad segura'
    ],
    basePrice: 10000,
    prices: {
      auto: 10000,
      suv: 12000,
      pickup: 15000
    },
    duration: 60
  }
];

export const VEHICLES = [
  { id: 'auto', name: 'Auto Chico/Mediano', icon: '🚗', examples: 'Clio, Gol, 208, Cronos, Corolla, Cruze, Golf, Etios, Sandero, Focus, Fiesta, Ka, Mobi, Argo, Polo, Virtus, Vento, Bora' },
  { id: 'suv', name: 'SUV / Camioneta Chica', icon: '🚙', examples: 'Duster, Tracker, Strada, Saveiro, Compass, Kuga, Tucson, Creta, Cross, Renegade, HR-V, T-Cross, Nivus, Pulse, Territory' },
  { id: 'pickup', name: 'Pickup / Grande', icon: '🛻', examples: 'Hilux, Amarok, Ranger, Toro, S10, Frontier, Ram, SW4, Trailblazer, F-150, Alaska, Oroch' }
];

export const BASE_PRICES: Record<string, number> = {
  lavado_exterior: 15000,
  detallado_interior: 20000,
  limpieza_techo: 10000,
  tapizados_tela: 40000,
  tapizados_cuero: 15000,
  tratamiento_vidrios: 10000
};

export const TYPE_EXTRA: Record<string, number> = {
  auto: 0,
  suv: 5000,
  pickup: 15000
};
