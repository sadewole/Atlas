import { baseConfigSchema, loadConfig } from '@atlas/config';

/** Load the base config from a clean test environment. */
export function testConfig(source: Record<string, unknown> = {}) {
  return loadConfig(baseConfigSchema, {
    NODE_ENV: 'test',
    SERVICE_NAME: 'test-service',
    ...source,
  });
}

/** A test-friendly base config object with defaults applied. */
export function defaultTestConfig() {
  return {
    NODE_ENV: 'test',
    SERVICE_NAME: 'test-service',
    LOG_LEVEL: 'silent',
    LOG_PRETTY: false,
    PORT: 0,
  };
}
