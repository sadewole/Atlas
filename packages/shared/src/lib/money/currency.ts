export const SUPPORTED_CURRENCIES = [
  'NGN',
  'USD',
  'EUR',
  'GBP',
  'KES',
  'GHS',
  'ZAR',
  'XOF',
  'XAF',
] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export interface CurrencyInfo {
  code: Currency;
  name: string;
  /**
   * Number of decimal places in the minor unit.
   * NGN has 2 (kobo), USD has 2 (cents), JPY would have 0 (none).
   */
  minorUnitExponent: number;
  symbol: string;
}

export const CURRENCIES: Record<Currency, CurrencyInfo> = {
  NGN: { code: 'NGN', name: 'Nigerian Naira', minorUnitExponent: 2, symbol: '₦' },
  USD: { code: 'USD', name: 'US Dollar', minorUnitExponent: 2, symbol: '$' },
  EUR: { code: 'EUR', name: 'Euro', minorUnitExponent: 2, symbol: '€' },
  GBP: { code: 'GBP', name: 'British Pound', minorUnitExponent: 2, symbol: '£' },
  KES: { code: 'KES', name: 'Kenyan Shilling', minorUnitExponent: 2, symbol: 'KSh' },
  GHS: { code: 'GHS', name: 'Ghanaian Cedi', minorUnitExponent: 2, symbol: 'GH₵' },
  ZAR: { code: 'ZAR', name: 'South African Rand', minorUnitExponent: 2, symbol: 'R' },
  XOF: { code: 'XOF', name: 'West African CFA Franc', minorUnitExponent: 0, symbol: 'CFA' },
  XAF: { code: 'XAF', name: 'Central African CFA Franc', minorUnitExponent: 0, symbol: 'CFA' },
};

export function isCurrency(value: string): value is Currency {
  return value in CURRENCIES;
}

export function getCurrency(code: string): CurrencyInfo {
  if (!isCurrency(code)) {
    throw new Error(`Unsupported currency: ${code}`);
  }
  return CURRENCIES[code];
}
