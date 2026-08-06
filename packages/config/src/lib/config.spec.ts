import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { baseConfigSchema } from './schema.js';
import { ConfigValidationError, loadConfig } from './loader.js';

describe('baseConfigSchema', () => {
  it('applies defaults for an empty environment', () => {
    const config = baseConfigSchema.parse({});
    expect(config.NODE_ENV).toBe('development');
    expect(config.SERVICE_NAME).toBe('atlas');
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.LOG_PRETTY).toBe(false);
    expect(config.PORT).toBe(3000);
  });

  it('coerces LOG_PRETTY and PORT from strings', () => {
    const config = baseConfigSchema.parse({
      LOG_PRETTY: 'true',
      PORT: '8080',
    });
    expect(config.LOG_PRETTY).toBe(true);
    expect(config.PORT).toBe(8080);
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() => baseConfigSchema.parse({ NODE_ENV: 'dev' })).toThrow();
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => baseConfigSchema.parse({ PORT: 'abc' })).toThrow();
  });

  it('rejects an invalid LOG_LEVEL', () => {
    expect(() => baseConfigSchema.parse({ LOG_LEVEL: 'verbose' })).toThrow();
  });
});

describe('loadConfig', () => {
  const schema = baseConfigSchema.extend({
    DATABASE_URL: z.string().min(1),
    FEATURE_FLAG: z.string().default('off'),
  });

  it('returns a fully typed config', () => {
    const config = loadConfig(schema, {
      NODE_ENV: 'production',
      SERVICE_NAME: 'ledger',
      DATABASE_URL: 'postgres://localhost:5432/ledger',
    });
    expect(config.SERVICE_NAME).toBe('ledger');
    expect(config.NODE_ENV).toBe('production');
    expect(config.DATABASE_URL).toBe('postgres://localhost:5432/ledger');
    expect(config.FEATURE_FLAG).toBe('off');
  });

  it('fails fast with a helpful error when fields are missing', () => {
    expect.assertions(3);
    try {
      loadConfig(schema, {});
    } catch (err) {
      const error = err as ConfigValidationError;
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect(error.message).toContain('Invalid environment configuration');
      expect(error.message).toContain('DATABASE_URL');
    }
  });

  it('lists every failing field', () => {
    expect.assertions(2);
    try {
      loadConfig(schema, { NODE_ENV: 'dev', DATABASE_URL: '' });
    } catch (err) {
      const error = err as ConfigValidationError;
      expect(error.message).toContain('DATABASE_URL');
      expect(error.message).toContain('NODE_ENV');
    }
  });

  it('defaults the source to process.env', () => {
    const config = loadConfig(baseConfigSchema);
    expect(config.NODE_ENV).toBeDefined();
  });
});
