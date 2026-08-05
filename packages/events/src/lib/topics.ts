/**
 * Canonical Pub/Sub topic names (SAS §8). Each service owns its namespace.
 * Topic format: `{domain}.events`
 */
export const TOPICS = {
  identity: 'identity.events',
  wallet: 'wallet.events',
  ledger: 'ledger.events',
  transfer: 'transfer.events',
  payment: 'payment.events',
  settlement: 'settlement.events',
  notification: 'notification.events',
  fraud: 'fraud.events',
  audit: 'audit.events',
  webhook: 'webhook.events',
  analytics: 'analytics.events',
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];
