import { ConflictError } from '@atlas/shared';
import { Wallet } from '../domain/index.js';
import { WalletRepository } from '../infrastructure/wallet-repository.js';

/** Internal sentinel: the version guard failed; roll back and retry. */
class VersionConflictError extends Error {
  constructor() {
    super('WALLET_VERSION_CONFLICT');
    this.name = 'VersionConflictError';
  }
}

/**
 * Run a wallet mutation inside a single transaction with optimistic locking.
 *
 * The callback receives the current Wallet AND the transaction client, so any
 * side effects it writes (e.g. a reservation) commit or roll back together
 * with the version-guarded wallet update.
 *
 * When the version guard fails we THROW (not return), which makes drizzle
 * roll the transaction back — a normal return would COMMIT the side effect
 * even though the wallet update didn't apply. The sentinel is caught here and
 * the whole transaction retries with fresh state.
 */
export async function withWalletLock(
  repo: WalletRepository,
  walletId: string,
  fn: (
    wallet: Wallet,
    tx: Parameters<Parameters<typeof repo.transaction>[0]>[0],
  ) => Promise<Wallet | null>,
  maxRetries = 5,
): Promise<Wallet | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await repo.transaction(async (tx) => {
        const wallet = await repo.findWalletById(walletId, tx);
        if (!wallet) return null;

        const next = await fn(wallet, tx);
        if (next === null) return null;

        const applied = await repo.updateWalletWithLock(
          next,
          wallet.version + 1,
          tx,
        );
        if (!applied) {
          // roll back the side effects, then signal retry
          throw new VersionConflictError();
        }
        return next;
      });
      return result;
    } catch (err) {
      if (err instanceof VersionConflictError) continue; // retry
      throw err; // genuine failure (domain error, DB error)
    }
  }

  throw new ConflictError(
    'WALLET_CONCURRENT_UPDATE',
    `Wallet ${walletId} changed too many times while updating`,
  );
}
