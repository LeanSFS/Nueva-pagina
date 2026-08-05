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

