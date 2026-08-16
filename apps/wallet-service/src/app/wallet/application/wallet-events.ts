import { createEnvelope, type EventEnvelope } from '@atlas/events';
import { WalletStatus, type Reservation } from '../domain/index.js';
import type { Wallet } from '../domain/index.js';

/** Canonical wallet event types (wallet.events topic). */
export const WALLET_EVENTS = {
  created: 'WalletCreated',
  statusChanged: 'WalletStatusChanged',
  fundsReserved: 'FundsReserved',
  reservationCaptured: 'ReservationCaptured',
  reservationReleased: 'ReservationReleased',
  reservationExpired: 'ReservationExpired',
} as const;

export type WalletEventType = (typeof WALLET_EVENTS)[keyof typeof WALLET_EVENTS];

interface OutboxEnvelope {
  eventId: string;
  eventType: string;
  payload: string;
}

const PRODUCER = 'wallet-service';

/** Build the WalletCreated envelope + outbox row payload. */
export function walletCreatedEnvelope(
  wallet: Wallet,
  correlationId: string,
): OutboxEnvelope {
  const envelope = createEnvelope({
    eventType: WALLET_EVENTS.created,
    eventVersion: 1,
    producer: PRODUCER,
    correlationId,
    data: {
      walletId: wallet.id,
      walletNumber: wallet.walletNumber,
      ownerId: wallet.ownerId,
      ownerType: wallet.ownerType,
      type: wallet.type,
      currency: wallet.currency,
      status: wallet.status,
      ledgerAccountId: wallet.ledgerAccountId,
    },
  });
  return toOutbox(envelope);
}

/** Build the WalletStatusChanged envelope (covers freeze/activate/suspend/close). */
export function walletStatusChangedEnvelope(
  wallet: Wallet,
  previousStatus: WalletStatus,
  correlationId: string,
): OutboxEnvelope {
  const envelope = createEnvelope({
    eventType: WALLET_EVENTS.statusChanged,
    eventVersion: 1,
    producer: PRODUCER,
    correlationId,
    data: {
      walletId: wallet.id,
      previousStatus,
      status: wallet.status,
    },
  });
  return toOutbox(envelope);
}

/** Build the FundsReserved envelope. */
export function fundsReservedEnvelope(
  reservation: Reservation,
  correlationId: string,
): OutboxEnvelope {
  const envelope = createEnvelope({
    eventType: WALLET_EVENTS.fundsReserved,
    eventVersion: 1,
    producer: PRODUCER,
    correlationId,
    data: {
      reservationId: reservation.id,
      walletId: reservation.walletId,
      reference: reservation.reference,
      amount: reservation.amount,
      currency: reservation.currency,
      status: reservation.status,
      reason: reservation.reason,
      expiresAt: reservation.expiresAt,
    },
  });
  return toOutbox(envelope);
}

/** Build a reservation terminal event envelope (captured / released / expired). */
export function reservationTerminalEnvelope(
  eventType: 'ReservationCaptured' | 'ReservationReleased' | 'ReservationExpired',
  reservation: Reservation,
  correlationId: string,
): OutboxEnvelope {
  const envelope = createEnvelope({
    eventType,
    eventVersion: 1,
    producer: PRODUCER,
    correlationId,
    data: {
      reservationId: reservation.id,
      walletId: reservation.walletId,
      amount: reservation.amount,
      status: reservation.status,
    },
  });
  return toOutbox(envelope);
}

function toOutbox(envelope: EventEnvelope): OutboxEnvelope {
  return {
    eventId: envelope.eventId,
    eventType: envelope.eventType,
    payload: JSON.stringify(envelope),
  };
}
