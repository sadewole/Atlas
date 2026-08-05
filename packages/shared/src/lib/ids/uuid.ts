import { v7 as uuidv7 } from 'uuid';

export const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Generate a UUIDv7 — time-ordered, globally unique, database-locality-friendly.
 * Used for all externally visible resource IDs (per API Standards).
 */
export function newId(): string {
  return uuidv7();
}

/** Validate that a value is a well-formed UUID (any version). */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/** Validate that a value is specifically a UUIDv7. */
export function isUuidV7(value: string): boolean {
  return UUID_V7_PATTERN.test(value);
}

/** Extract the embedded timestamp (ms since Unix epoch) from a UUIDv7. */
export function extractTimestamp(id: string): number {
  const hex = id.replace(/-/g, '').slice(0, 12);
  return parseInt(hex, 16);
}
