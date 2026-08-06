import { loadConfig } from '@atlas/config';
import { postgresConfigSchema, toConnectionConfig } from './postgres-config.js';

describe('postgresConfigSchema', () => {
  it('applies local development defaults', () => {
    const config = loadConfig(postgresConfigSchema, {});
    expect(config.POSTGRES_HOST).toBe('localhost');
    expect(config.POSTGRES_PORT).toBe(5432);
    expect(config.POSTGRES_USER).toBe('atlas');
    expect(config.POSTGRES_DB).toBe('atlas');
    expect(config.POSTGRES_SSL).toBe(false);
    expect(config.POSTGRES_POOL_MAX).toBe(10);
  });

  it('coerces numeric and boolean values', () => {
    const config = loadConfig(postgresConfigSchema, {
      POSTGRES_PORT: '5544',
      POSTGRES_SSL: 'true',
      POSTGRES_POOL_MAX: '25',
    });
    expect(config.POSTGRES_PORT).toBe(5544);
    expect(config.POSTGRES_SSL).toBe(true);
    expect(config.POSTGRES_POOL_MAX).toBe(25);
  });

  it('rejects an invalid port', () => {
    expect(() =>
      loadConfig(postgresConfigSchema, { POSTGRES_PORT: 'not-a-number' }),
    ).toThrow(/POSTGRES_PORT/);
  });
});

describe('toConnectionConfig', () => {
  it('maps validated config to the connection shape', () => {
    const config = loadConfig(postgresConfigSchema, {
      POSTGRES_HOST: 'db.internal',
      POSTGRES_SSL: 'true',
    });
    expect(toConnectionConfig(config)).toEqual({
      host: 'db.internal',
      port: 5432,
      user: 'atlas',
      password: 'atlas',
      database: 'atlas',
      max: 10,
      ssl: true,
    });
  });
});
