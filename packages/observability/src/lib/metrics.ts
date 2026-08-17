import { metrics } from '@opentelemetry/api';

/**
 * Get (or lazily create) a Meter for a service.
 *
 * Use this to record business metrics alongside the auto-instrumented RED
 * metrics. Meters are cached by name, so calling this repeatedly is cheap.
 *
 * ```ts
 * const meter = getMeter('ledger-service');
 * const journals = meter.createCounter('ledger.journals.posted');
 * journals.add(1);
 * ```
 */
export function getMeter(name: string) {
  return metrics.getMeter(name);
}
