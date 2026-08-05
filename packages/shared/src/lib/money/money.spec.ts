import { describe, expect, it } from 'vitest';
import { Money } from './money.js';

describe('Money', () => {
  describe('construction', () => {
    it('creates from minor units', () => {
      const money = Money.fromMinor(125000, 'NGN');
      expect(money.amount).toBe(125000);
      expect(money.currency).toBe('NGN');
    });

    it('creates from major units using the currency exponent', () => {
      expect(Money.fromMajor(1250, 'NGN').amount).toBe(125000);
      expect(Money.fromMajor(10, 'USD').amount).toBe(1000);
      expect(Money.fromMajor(5, 'XOF').amount).toBe(5); // 0 minor units
    });

    it('rejects unsupported currencies', () => {
      expect(() => Money.fromMinor(100, 'ABC')).toThrow('Unsupported currency');
    });

    it('rejects non-integer amounts', () => {
      expect(() => Money.fromMinor(100.5, 'NGN')).toThrow(
        'must be a safe integer',
      );
    });

    it('rejects amounts that overflow safe integers', () => {
      expect(() => Money.fromMajor(Number.MAX_SAFE_INTEGER, 'NGN')).toThrow(
        'exceeds safe integer range',
      );
    });
  });

  describe('arithmetic', () => {
    it('adds monies of the same currency', () => {
      const a = Money.fromMinor(1000, 'NGN');
      const b = Money.fromMinor(2000, 'NGN');
      expect(a.add(b).amount).toBe(3000);
    });

    it('subtracts monies of the same currency', () => {
      const a = Money.fromMinor(2000, 'NGN');
      const b = Money.fromMinor(500, 'NGN');
      expect(a.subtract(b).amount).toBe(1500);
    });

    it('rejects cross-currency arithmetic', () => {
      const a = Money.fromMinor(1000, 'NGN');
      const b = Money.fromMinor(1000, 'USD');
      expect(() => a.add(b)).toThrow('Currency mismatch');
      expect(() => a.subtract(b)).toThrow('Currency mismatch');
    });

    it('negates', () => {
      expect(Money.fromMinor(500, 'NGN').negate().amount).toBe(-500);
    });
  });

  describe('predicates', () => {
    it('checks zero/positive/negative', () => {
      expect(Money.zero('NGN').isZero()).toBe(true);
      expect(Money.fromMinor(1, 'NGN').isPositive()).toBe(true);
      expect(Money.fromMinor(-1, 'NGN').isNegative()).toBe(true);
    });
  });

  describe('conversion & equality', () => {
    it('converts to major units for display', () => {
      expect(Money.fromMinor(125000, 'NGN').toMajor()).toBe(1250);
    });

    it('compares for equality', () => {
      const a = Money.fromMinor(1000, 'NGN');
      const b = Money.fromMinor(1000, 'NGN');
      const c = Money.fromMinor(1000, 'USD');
      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
    });

    it('serializes to the standard JSON shape', () => {
      expect(Money.fromMinor(125000, 'NGN').toJSON()).toEqual({
        amount: 125000,
        currency: 'NGN',
      });
    });
  });
});
