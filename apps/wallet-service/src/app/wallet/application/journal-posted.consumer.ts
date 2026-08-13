import { EventEnvelope } from '@atlas/events';
import { Injectable, Logger } from '@nestjs/common';
import { WalletRepository } from '../infrastructure/wallet-repository.js';

interface JournalPostedData {
  journalId: string;
  reference: string;
  currency: string;
  totalAmount: number;
  postings: Array<{
    accountId: string;
    direction: 'debit' | 'credit';
    amount: number;
  }>;
}

/**
 * Consumes `JournalPosted` events from the ledger and syncs this service's
 * wallet projections. This is the "ledger leads, wallet reacts" pattern.
 *
 * Idempotency: Pub/Sub is at-least-once, so the same event may arrive more
 * than once. We dedupe by `eventId` so a redelivery can't double-apply a
 * posting.
 */
@Injectable()
export class JournalPostedConsumer {
  private readonly logger = new Logger(JournalPostedConsumer.name);
  private readonly seenEventIds = new Set<string>();

  constructor(private readonly repository: WalletRepository) {}

  /** Handle a JournalPosted envelope. Returns the number of wallets updated. */
  async handle(event: EventEnvelope<unknown>): Promise<number> {
    const data = event.data as JournalPostedData;
    if (this.seenEventIds.has(event.eventId)) {
      this.logger.debug(`Ignoring duplicate event ${event.eventId}`);
      return 0;
    }
    this.seenEventIds.add(event.eventId);
    // Cap memory: keep only recent ids (eventId is time-ordered UUIDv7).
    if (this.seenEventIds.size > 1000) {
      this.seenEventIds.clear();
    }

    let updated = 0;
    for (const posting of data.postings ?? []) {
      const wallet = await this.repository.findWalletByLedgerAccountId(
        posting.accountId,
      );
      if (!wallet) continue; // not our wallet's account

      const applied = await this.repository.applyLedgerPosting(
        wallet.id,
        posting.direction,
        posting.amount,
      );
      if (applied) updated += 1;
    }

    if (updated > 0) {
      this.logger.log(
        `JournalPosted ${event.eventId}: synced ${updated} wallet(s)`,
      );
    }
    return updated;
  }
}
