import { Currency, getCurrency, isCurrency } from './currency.js';

/**
 * A monetary value expressed in minor units (e.g. kobo for NGN, cents for USD).
 *
 * Financial values are NEVER stored or transmitted as floating-point numbers.
 * `Money(amount: 125000, currency: 'NGN')` represents ₦1,250.00.
 */
export class Money {
  readonly amount: number;
  readonly currency: Currency;

  private constructor(amount: number, currency: Currency) {
    if (!Number.isSafeInteger(amount)) {
      throw new Error(`Money amount must be a safe integer, got ${amount}`);
    }
    this.amount = amount;
    this.currency = currency;
  }

  /** Create from minor units (kobo/cents). This is the ONLY safe constructor. */
  static fromMinor(amount: number, currency: string): Money {
    if (!isCurrency(currency)) {
      throw new Error(`Unsupported currency: ${currency}`);
    }
    return new Money(amount, currency);
  }

  /** Create a zero balance for a currency. */
  static zero(currency: string): Money {
    return Money.fromMinor(0, currency);
  }

  /**
   * Create from major units (naira/dollars) as a whole number.
   * e.g. `fromMajor(1250, 'NGN')` → ₦1,250.00 (125000 kobo)
   */
  static fromMajor(amount: number, currency: string): Money {
    if (!isCurrency(currency)) {
      throw new Error(`Unsupported currency: ${currency}`);
    }
    const exponent = getCurrency(currency).minorUnitExponent;
    const minor = amount * 10 ** exponent;
    if (!Number.isSafeInteger(minor)) {
      throw new Error(
        `Amount ${amount} ${currency} exceeds safe integer range in minor units`,
      );
    }
    return new Money(minor, currency);
  }

  /** Assert both monies use the same currency. */
  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Currency mismatch: cannot operate on ${this.currency} and ${other.currency}`,
      );
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  negate(): Money {
    return new Money(-this.amount, this.currency);
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  isPositive(): boolean {
    return this.amount > 0;
  }

  isNegative(): boolean {
    return this.amount < 0;
  }

  /** Returns a number in major units. FOR DISPLAY ONLY — never use in arithmetic. */
  toMajor(): number {
    return this.amount / 10 ** getCurrency(this.currency).minorUnitExponent;
  }

  /** Minor units as a number. Use for API payloads. */
  toMinor(): number {
    return this.amount;
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  /** ISO 4217 currency code. */
  get code(): string {
    return this.currency;
  }

  toJSON(): { amount: number; currency: Currency } {
    return { amount: this.amount, currency: this.currency };
  }

  toString(): string {
    return `${this.currency} ${this.amount}`;
  }
}
