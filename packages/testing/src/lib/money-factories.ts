import { Currency, Money } from '@atlas/shared';

/** Create a Money in minor units for tests. */
export function money(amount: number, currency = 'NGN'): Money {
  return Money.fromMinor(amount, currency);
}

/** Create a Money from major units for readability, e.g. naira(1250) → ₦1,250.00 */
export function naira(amount: number): Money {
  return Money.fromMajor(amount, 'NGN');
}

export function dollars(amount: number): Money {
  return Money.fromMajor(amount, 'USD');
}

export function currency(code: string): Currency {
  return code as Currency;
}
