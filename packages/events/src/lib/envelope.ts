import { newId } from '@atlas/shared';

/**
 * The standard event envelope every Atlas event carries (SAS §10).
 *
 * ```json
 * {
 *   "eventId": "uuid",
 *   "eventType": "TransferCompleted",
 *   "eventVersion": 1,
 *   "occurredAt": "2026-07-30T12:00:00Z",
 *   "correlationId": "uuid",
 *   "causationId": "uuid",
 *   "producer": "transfer-service",
 *   "tenantId": "tenant_123",
 *   "data": {}
 * }
 * ```
 */
export interface EventEnvelope<TData = unknown> {
  /** Globally unique identifier for this event occurrence. */
  eventId: string;
  /** Business fact, e.g. "TransferCompleted". Verbs are fine; commands are not. */
  eventType: string;
  /** Schema version of `data`. Additive changes bump MINOR, breaking changes MINOR+ new type. */
  eventVersion: number;
  /** ISO 8601 timestamp of when the business event occurred. */
  occurredAt: string;
  /** Ties this event to the original business workflow (request). */
  correlationId: string;
  /** The eventId that directly triggered this one, if any. */
  causationId?: string;
  /** Service that published the event, e.g. "transfer-service". */
  producer: string;
  /** Tenant (organization) this event belongs to. */
  tenantId?: string;
  /** Business payload. */
  data: TData;
}

export interface EventEnvelopeOptions<TData> {
  eventType: string;
  eventVersion?: number;
  data: TData;
  correlationId: string;
  causationId?: string;
  producer: string;
  tenantId?: string;
  /** Override the auto-generated id (used for replay/dedup tests). */
  eventId?: string;
  /** Override the timestamp (used for testing). */
  occurredAt?: string;
}

/** Build a well-formed event envelope. */
export function createEnvelope<TData>(
  options: EventEnvelopeOptions<TData>,
): EventEnvelope<TData> {
  return {
    eventId: options.eventId ?? newId(),
    eventType: options.eventType,
    eventVersion: options.eventVersion ?? 1,
    occurredAt: options.occurredAt ?? new Date().toISOString(),
    correlationId: options.correlationId,
    causationId: options.causationId,
    producer: options.producer,
    tenantId: options.tenantId,
    data: options.data,
  };
}
