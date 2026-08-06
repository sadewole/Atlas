import { describe, expect, it } from 'vitest';
import {
  createCursorPage,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  normalizeLimit,
} from './pagination.js';

describe('normalizeLimit', () => {
  it('defaults when absent', () => {
    expect(normalizeLimit(undefined)).toBe(DEFAULT_LIMIT);
  });

  it('clamps to the max', () => {
    expect(normalizeLimit(1000)).toBe(MAX_LIMIT);
  });

  it('falls back for invalid values', () => {
    expect(normalizeLimit(0)).toBe(DEFAULT_LIMIT);
    expect(normalizeLimit(NaN)).toBe(DEFAULT_LIMIT);
  });
});

describe('createCursorPage', () => {
  it('slices the extra probe row and emits a cursor', () => {
    const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const page = createCursorPage(items, true, (i) => i.id);
    expect(page.data).toEqual([{ id: '1' }, { id: '2' }]);
    expect(page.page.hasMore).toBe(true);
    expect(page.page.nextCursor).toBe('2');
  });

  it('returns all items without a cursor on the last page', () => {
    const items = [{ id: '1' }, { id: '2' }];
    const page = createCursorPage(items, false, (i) => i.id);
    expect(page.data).toHaveLength(2);
    expect(page.page.hasMore).toBe(false);
    expect(page.page.nextCursor).toBeUndefined();
  });

  it('handles an empty page', () => {
    const page = createCursorPage<{ id: string }>([], false, (i) => i.id);
    expect(page.data).toEqual([]);
    expect(page.page.hasMore).toBe(false);
  });
});
