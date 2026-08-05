import { describe, expect, it } from 'vitest';
import { extractTimestamp, isUuid, isUuidV7, newId } from './uuid.js';

describe('newId', () => {
  it('generates a UUIDv7', () => {
    const id = newId();
    expect(isUuidV7(id)).toBe(true);
  });

  it('generates unique ids', () => {
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
  });
});

describe('isUuid', () => {
  it('accepts valid uuids of any version', () => {
    expect(isUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isUuid(newId())).toBe(true);
  });

  it('rejects non-uuids', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});

describe('isUuidV7', () => {
  it('rejects a v4 uuid', () => {
    expect(isUuidV7('123e4567-e89b-12d3-a456-426614174000')).toBe(false);
  });
});

describe('extractTimestamp', () => {
  it('recovers the embedded timestamp', () => {
    const now = Date.now();
    const id = newId();
    const ts = extractTimestamp(id);
    expect(Math.abs(ts - now)).toBeLessThan(1000);
  });
});
