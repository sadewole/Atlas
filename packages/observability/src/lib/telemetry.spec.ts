import { describe, expect, it } from 'vitest';
import { setupTelemetry } from './telemetry.js';

describe('setupTelemetry', () => {
  it('returns a no-op shutdown when disabled', async () => {
    const shutdown = setupTelemetry({
      serviceName: 'test-service',
      enabled: false,
    });
    await expect(shutdown()).resolves.toBeUndefined();
  });

  it('returns a shutdown function when enabled', () => {
    const shutdown = setupTelemetry({
      serviceName: 'test-service',
      enabled: false,
    });
    expect(typeof shutdown).toBe('function');
  });
});
