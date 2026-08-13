import { newId } from '@atlas/shared';
import { Transfer } from './transfer.js';

function makeTransfer(overrides: Partial<ConstructorParameters<typeof Transfer>[0]> = {}): Transfer {
  return new Transfer({
    id: newId(),
    reference: 'TX-1',
    type: 'INTERNAL',
    sourceWalletId: newId(),
    destinationWalletId: newId(),
    currency: 'NGN',
    amount: 25000,
    idempotencyKey: 'idem-1',
    ...overrides,
  });
}

describe('Transfer', () => {
  it('starts CREATED', () => {
    expect(makeTransfer().status).toBe('CREATED');
  });

  it('rejects a non-positive amount', () => {
    expect(() => makeTransfer({ amount: 0 })).toThrow();
  });

  it('walks the happy path through the state machine', () => {
    const t = makeTransfer();
    const path = ['VALIDATING', 'RESERVING', 'RESERVED', 'POSTING', 'SETTLING', 'COMPLETED'];
    let current = t;
    for (const s of path) {
      current = current.withStatus(s as Transfer['status']);
      expect(current.status).toBe(s);
    }
  });

  it('rejects an illegal transition', () => {
    const t = makeTransfer();
    expect(() => t.withStatus('COMPLETED')).toThrow();
  });

  it('rejects transitions out of a terminal state', () => {
    const completed = makeTransfer()
      .withStatus('VALIDATING')
      .withStatus('RESERVING')
      .withStatus('RESERVED')
      .withStatus('POSTING')
      .withStatus('SETTLING')
      .withStatus('COMPLETED');
    expect(() => completed.withStatus('FAILED')).toThrow();
    expect(() => completed.withStatus('VALIDATING')).toThrow();
  });

  it('can compensate from POSTING', () => {
    // walk forward to POSTING via legal transitions
    const posting = makeTransfer()
      .withStatus('VALIDATING')
      .withStatus('RESERVING')
      .withStatus('RESERVED')
      .withStatus('POSTING');
    expect(posting.status).toBe('POSTING');
    expect(posting.withStatus('COMPENSATING').status).toBe('COMPENSATING');
  });

  it('treats COMPLETED / FAILED as inactive', () => {
    const completed = makeTransfer()
      .withStatus('VALIDATING')
      .withStatus('RESERVING')
      .withStatus('RESERVED')
      .withStatus('POSTING')
      .withStatus('SETTLING')
      .withStatus('COMPLETED');
    const failed = makeTransfer().withStatus('FAILED');
    expect(completed.isActive).toBe(false);
    expect(failed.isActive).toBe(false);
    expect(makeTransfer().isActive).toBe(true);
  });
});
