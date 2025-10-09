/**
 * Spot Light Trader Brand Theme Tokens
 * Consistent color system for glass-dark UI
 */

export const brand = {
  primary: '#F3AE3D',           // bulb gold
  primaryGlow: 'rgba(243,174,61,0.35)',
  textOnPrimary: '#101318',
  accent: '#6C8BFF',            // existing accent for links/highlights
} as const;

export const dark = {
  bg: '#0B0F14',
  bgElevated: '#161B22',
  bgGlass: 'rgba(22, 27, 34, 0.8)',
  border: 'rgba(255, 255, 255, 0.1)',
  text: '#E6EDF3',
  textMuted: '#8B949E',
} as const;

export const trading = {
  up: '#10b981',
  down: '#ef4444',
  neutral: '#6b7280',
} as const;

export type BrandTheme = typeof brand;
export type DarkTheme = typeof dark;
export type TradingTheme = typeof trading;
