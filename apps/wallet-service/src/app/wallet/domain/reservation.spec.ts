import { newId } from '@atlas/shared';
import { Reservation } from './reservation.js';

function makeReservation(overrides: Partial<ConstructorParameters<typeof Reservation>[0]> = {}): Reservation {
  return new Reservation({
    id: newId(),
    walletId: newId(),
    reference: `ref-${newId()}`,
    amount: 10000,
    currency: 'NGN',
    ...overrides,
  });
}

describe('Reservation lifecycle', () => {
  it('starts PENDING', () => {
    const r = makeReservation();
    expect(r.status).toBe('PENDING');
    expect(r.isPending).toBe(true);
  });

  it('captures', () => {
    const r = makeReservation();
    expect(r.capture().status).toBe('CAPTURED');
  });

  it('releases', () => {
    const r = makeReservation();
    expect(r.release().status).toBe('RELEASED');
  });

  it('expires', () => {
    const r = makeReservation();
    expect(r.expire().status).toBe('EXPIRED');
  });

  it('cannot capture an already-captured reservation', () => {
    const r = makeReservation().capture();
    expect(() => r.capture()).toThrow();
  });

  it('cannot release an already-released reservation', () => {
    const r = makeReservation().release();
    expect(() => r.release()).toThrow();
  });

  it('cannot capture an expired reservation', () => {
    const r = makeReservation({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(r.isExpired()).toBe(true);
    expect(() => r.capture()).toThrow();
  });

  it('is not expired when no expiry is set', () => {
    expect(makeReservation().isExpired()).toBe(false);
  });
});
