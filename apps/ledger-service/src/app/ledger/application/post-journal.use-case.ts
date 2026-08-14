import { Currency, Money, newId } from '@atlas/shared';
import { createEnvelope } from '@atlas/events';
import { Injectable, Logger } from '@nestjs/common';
import { Account, Journal, Posting } from '../domain/index.js';
import { LedgerRepository } from '../infrastructure/ledger-repository.js';
import {
  AccountClosedError,
  AccountNotFoundError,
} from '../domain/index.js';

export interface PostingCommand {
  accountId: string;
  direction: 'debit' | 'credit';
  /** Amount in minor units (kobo/cents). */
  amount: number;
}

export interface PostJournalCommand {
  reference: string;
  description?: string;
  currency: Currency;
  postings: PostingCommand[];
}

export interface PostJournalResult {
  journalId: string;
  reference: string;
}

/**
 * The heart of the ledger: post a balanced journal.
 *
 * Flow: idempotency check → load accounts → build Journal aggregate
 * (validates ≥2 postings, single currency, debits == credits) → persist
 * atomically with the balance projection → publish JournalPosted.
 *
 * The aggregate validation happens BEFORE any write, so an unbalanced journal
 * never touches the database.
 */
@Injectable()
export class PostJournalUseCase {
  private readonly logger = new Logger(PostJournalUseCase.name);

  constructor(private readonly repository: LedgerRepository) {}

  async execute(command: PostJournalCommand): Promise<PostJournalResult> {
    // Idempotency: a retried reference returns the original result.
    const existing = await this.repository.findJournalByReference(
      command.reference,
    );
    if (existing) {
      this.logger.debug(
        `Idempotent replay of journal ${command.reference} (${existing.id})`,
      );
      return { journalId: existing.id, reference: existing.reference };
    }

    // Load and validate every referenced account before building the journal.
    const accountIds = [...new Set(command.postings.map((p) => p.accountId))];
    const accountsById = new Map<string, Account>(
      (await this.repository.findAccountsByIds(accountIds)).map((a) => [
        a.id,
        a,
      ]),
    );
    for (const id of accountIds) {
      const account = accountsById.get(id);
      if (!account) throw new AccountNotFoundError(id);
      if (!account.isActive) throw new AccountClosedError(account.accountCode);
    }

    // Build the journal — the aggregate enforces the financial invariants.
    const journal = new Journal({
      id: newId(),
      reference: command.reference,
      description: command.description,
      currency: command.currency,
      status: 'posted',
      postings: command.postings.map(
        (p) =>
          new Posting({
            accountId: p.accountId,
            direction: p.direction,
            amount: Money.fromMinor(p.amount, command.currency),
          }),
      ),
    });

    // Build the event envelope BEFORE persisting so its eventId is written to
    // the outbox atomically with the journal.
    const envelope = createEnvelope({
      eventType: 'JournalPosted',
      eventVersion: 1,
      producer: 'ledger-service',
      correlationId: 'ledger:' + journal.id,
      data: {
        journalId: journal.id,
        reference: journal.reference,
        currency: journal.currency,
        totalAmount: journal.totalAmount.amount,
        postings: journal.postings.map((p) => ({
          accountId: p.accountId,
          direction: p.direction,
          amount: p.amount.amount,
        })),
      },
    });

    // Persist journal + postings + projection + OUTBOX EVENT atomically.
    await this.repository.postJournal(
      {
        id: journal.id,
        reference: journal.reference,
        description: journal.description,
        currency: journal.currency,
        status: 'posted',
        postings: journal.postings.map((p) => ({
          accountId: p.accountId,
          direction: p.direction,
          amount: p.amount.amount,
          currency: p.amount.currency,
        })),
      },
      accountsById,
      {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        payload: JSON.stringify(envelope),
      },
    );

    return { journalId: journal.id, reference: journal.reference };
  }
}
